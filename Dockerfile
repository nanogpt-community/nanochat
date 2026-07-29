FROM oven/bun:canary AS builder

WORKDIR /app

# Copy dependency files first for better caching
COPY package.json bun.lock ./

# Install all dependencies (including dev) with frozen lockfile
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install

# Copy local build-time assets that are imported by the app
COPY icons ./icons

# Copy source code
COPY . .

ENV NODE_ENV=production

# Build-only placeholders, set inline on the RUN rather than via ARG/ENV.
#
# They are needed because `bun run build` imports server modules, and two of them
# validate configuration at module load:
#   BETTER_AUTH_SECRET - better-auth refuses to initialise with its default secret
#                        while NODE_ENV=production, and $lib/auth is reachable.
#   DATABASE_URL       - src/lib/db/index.ts throws if it is unset. Never connected to.
#
# Neither value is used at runtime: BETTER_AUTH_SECRET is read through
# $env/dynamic/private and DATABASE_URL through process.env, both resolved when the
# container starts from the operator's real environment.
#
# Inline keeps them out of the image entirely — no ENV layer, nothing in
# `docker history` or `docker inspect`, and no --build-arg through which a real
# secret could be passed in by mistake. That is also what silences BuildKit's
# SecretsUsedInArgOrEnv warning, by removing the cause rather than the symptom.
# BETTER_AUTH_BASE_URL, previously declared here, was referenced nowhere in the
# codebase at all; the app reads BETTER_AUTH_URL, at runtime.
RUN BETTER_AUTH_SECRET=build-time-placeholder-never-used-at-runtime \
    DATABASE_URL=postgres://build:build@localhost:5432/build \
    bun run build

# Production image
FROM oven/bun:canary

# Install poppler-utils for PDF text extraction
RUN apt-get update && apt-get install -y poppler-utils && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy only necessary files from builder
COPY --from=builder /app/build ./build
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/bun.lock ./bun.lock
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder /app/src/lib/db/schema.ts ./src/lib/db/schema.ts

# Install production dependencies only with frozen lockfile
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --production

# Ensure data directory exists
RUN mkdir -p data

EXPOSE 3000

ENV PORT=3000
ENV HOST=0.0.0.0
ENV NODE_ENV=production

CMD ["sh", "-c", "bun run db:migrate && bun build/index.js"]
