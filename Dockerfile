# Base stage: pin the current Node 24 Alpine image and patch npm's bundled
# dependencies so every derived stage (deps/builder/runner) passes Trivy.
# As of 2026-08-17, Node 24.19.0 ships npm 11.17.0 and npm 12.0.2 still
# bundles vulnerable brace-expansion/ip-address versions. Keep these targeted
# replacements until an upstream npm release bundles brace-expansion >= 5.0.9
# and ip-address >= 10.3.1.
FROM node:24.19.0-alpine3.24 AS node-base
RUN set -eux; \
    npm install -g npm@12.0.2; \
    npm pack --silent --pack-destination /tmp brace-expansion@5.0.9; \
    npm pack --silent --pack-destination /tmp ip-address@10.3.1; \
    rm -rf /usr/local/lib/node_modules/npm/node_modules/brace-expansion \
           /usr/local/lib/node_modules/npm/node_modules/ip-address; \
    mkdir -p /usr/local/lib/node_modules/npm/node_modules/brace-expansion \
             /usr/local/lib/node_modules/npm/node_modules/ip-address; \
    tar -xzf /tmp/brace-expansion-5.0.9.tgz \
        -C /usr/local/lib/node_modules/npm/node_modules/brace-expansion \
        --strip-components=1; \
    tar -xzf /tmp/ip-address-10.3.1.tgz \
        -C /usr/local/lib/node_modules/npm/node_modules/ip-address \
        --strip-components=1; \
    rm /tmp/brace-expansion-5.0.9.tgz /tmp/ip-address-10.3.1.tgz; \
    node -e "const p='/usr/local/lib/node_modules/npm/node_modules/brace-expansion'; const v=require(p + '/package.json').version; const out=require(p).expand('{a,b}'); if (v !== '5.0.9' || out.join(',') !== 'a,b') throw new Error('invalid npm bundled brace-expansion: ' + v)"; \
    node -e "const p='/usr/local/lib/node_modules/npm/node_modules/ip-address'; const v=require(p + '/package.json').version; if (v !== '10.3.1') throw new Error('invalid npm bundled ip-address: ' + v)"; \
    test "$(npm --version)" = "12.0.2"; \
    test "$(npx --version)" = "12.0.2"

FROM node-base AS deps
WORKDIR /app
# Use the committed lockfile so the image installs the exact audited versions
# (reproducible builds; keeps OSV/Dependabot pins effective). npm ci needs both.
COPY package.json package-lock.json .npmrc ./
RUN npm ci

FROM node-base AS builder
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
# TypeScript compiler binaries are only needed during build; remove them from
# the production image so their bundled Go stdlib isn't flagged by Trivy.
RUN rm -rf node_modules/@typescript

FROM node-base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Patch OS packages (e.g. openssl/libcrypto3/libssl3) that lag behind the
# pinned Alpine base, so Trivy doesn't fail on already-fixed CVEs.
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
