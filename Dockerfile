FROM oven/bun:1 AS builder

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

# Set environment variables for build
ENV NODE_ENV=production

# Build the application
RUN bun run build

# Production image
FROM oven/bun:1

WORKDIR /app

# Copy built artifacts and dependencies
COPY --from=builder /app/build ./build
COPY --from=builder /app/package.json ./package.json

# Copy node_modules (production only) - actually adapter-node bundles deps usually, checking...
# SvelteKit adapter-node creates a standalone build but requires deps in node_modules for some things unless bundled.
# To be safe, let's copy node_modules from builder or reinstall prod deps.
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3000

ENV PORT=3000
ENV HOST=0.0.0.0
# Ensure data directory exists
RUN mkdir -p data

CMD ["bun", "build/index.js"]
