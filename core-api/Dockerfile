## https://dawchihliou.github.io/articles/the-last-dockerfile-you-need-for-nestjs

FROM oven/bun:1.3 AS base
RUN apt-get update && apt-get install -y curl

# Build stage
FROM base AS builder

WORKDIR /app

COPY . .
RUN bun install
RUN bun run build
# Clean bun cache and remove unused files
RUN bun pm cache clean && rm -rf src test

# Production stage
FROM base

WORKDIR /app

COPY --from=builder /app/dist ./dist

EXPOSE 6276

CMD ["node", "dist/main.js"]
