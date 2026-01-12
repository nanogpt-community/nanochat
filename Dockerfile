FROM oven/bun:1 AS builder

WORKDIR /app

# Copy dependency files first for better caching
COPY package.json bun.lock ./

# Install all dependencies (including dev) with frozen lockfile
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install
# Copy source code
COPY . .

# Build arguments for environment variables needed during build
ARG BETTER_AUTH_SECRET=build-time-secret-change-in-production
ARG BETTER_AUTH_BASE_URL=http://localhost:3000

# Set environment variables for build
ENV NODE_ENV=production
ENV BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET}
ENV BETTER_AUTH_BASE_URL=${BETTER_AUTH_BASE_URL}

# Build the application
RUN bun run build

# Production image
FROM oven/bun:1

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

CMD ["sh", "-c", "bun run db:push --force && bun build/index.js"]
