# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
# openssl: the Prisma query engine needs it at runtime. libc6-compat: shims the glibc
# symbols some prebuilt binaries expect on musl.
RUN apk add --no-cache openssl libc6-compat
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
# Pin pnpm to the repo's version so the container doesn't pull a newer pnpm whose default
# supply-chain gate (minimumReleaseAge) rejects a freshly-published, already-reviewed lockfile.
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# The prisma schema is needed for the client that postinstall/generate expects.
COPY prisma ./prisma
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# The app ships no static assets, so the repo has no public/; create it so the runner's
# standalone copy of /app/public always succeeds.
RUN mkdir -p public
# A syntactically valid but unreachable URL: Prisma/Next only need it present at build
# time — no DB connection is made while collecting page data.
ENV DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build?schema=public"
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
RUN pnpm exec prisma generate
RUN pnpm build

FROM base AS migrator
# `migrate deploy` needs only the Prisma CLI + the musl schema engine, not @prisma/client.
# pnpm's symlinked store doesn't survive a selective COPY into the lean runner, so install a
# flat node_modules with npm here. Keep PRISMA_VERSION in step with the lockfile's prisma.
ARG PRISMA_VERSION=6.19.3
WORKDIR /migrate
COPY prisma ./prisma
RUN npm install --no-save --omit=dev prisma@${PRISMA_VERSION}

FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs

# Next standalone server + static assets + public/. The standalone bundle already contains a
# traced node_modules with @prisma/client and the linux-musl query engine.
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Schema + migrations and the self-contained CLI, both consumed by the migrate Job via /migrate.
COPY --from=builder /app/prisma ./prisma
COPY --from=migrator /migrate /migrate

USER nextjs
EXPOSE 3000

# The migrate Job overrides this to run `prisma migrate deploy` from /migrate.
CMD ["node", "server.js"]
