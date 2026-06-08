FROM node:22-alpine AS deps
WORKDIR /app
# Use the committed lockfile so the image installs the exact audited versions
# (reproducible builds; keeps OSV/Dependabot pins effective). npm ci needs both.
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# .next is owned by node so `next start` can write its runtime cache; the rest
# stays read-only (root-owned, world-readable) for the unprivileged user.
COPY --from=builder --chown=node:node /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig.json ./tsconfig.json
# Drop root: run the app as the built-in unprivileged `node` user.
USER node
EXPOSE 3000
CMD ["sh", "-c", "npx prisma db push --accept-data-loss && npm run start"]
