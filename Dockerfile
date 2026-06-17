FROM node:22-alpine AS deps
WORKDIR /app
# Use the committed lockfile so the image installs the exact audited versions
# (reproducible builds; keeps OSV/Dependabot pins effective). npm ci needs both.
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# Sentry release + source-map upload happen during `next build` (withSentryConfig).
# SENTRY_RELEASE is not secret, so it's a plain build-arg/env. The auth token is
# mounted as a BuildKit secret on the build step only, so it never lands in any
# image layer. Both are optional — without them the build still succeeds, just
# without uploaded source maps.
ARG SENTRY_RELEASE
ENV SENTRY_RELEASE=$SENTRY_RELEASE
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN --mount=type=secret,id=sentry_auth_token \
    SENTRY_AUTH_TOKEN="$(cat /run/secrets/sentry_auth_token 2>/dev/null || true)" \
    npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Patch OS packages (e.g. openssl/libcrypto3/libssl3) that lag behind the
# node:22-alpine tag, so Trivy doesn't fail on already-fixed CVEs.
RUN apk upgrade --no-cache
# .next is owned by node so `next start` can write its runtime cache; the rest
# stays read-only (root-owned, world-readable) for the unprivileged user.
COPY --from=builder --chown=node:node /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/src ./src
# Maintenance scripts (encryption rotation/backfill, etc.) run via `tsx` in the
# running container, e.g. `docker compose run --rm app npm run encryption:images`.
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/tsconfig.json ./tsconfig.json
# Drop root: run the app as the built-in unprivileged `node` user.
USER node
EXPOSE 3000
CMD ["sh", "-c", "npx prisma db push --accept-data-loss && npm run start"]
