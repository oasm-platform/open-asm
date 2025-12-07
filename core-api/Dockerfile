## https://dawchihliou.github.io/articles/the-last-dockerfile-you-need-for-nestjs

FROM node:22-alpine AS base
RUN apk add --no-cache curl && npm install -g bun@1.3

# Build stage
FROM base AS builder

WORKDIR /app

COPY . .
RUN bun install
RUN bun run build
# Copy proto files before cleaning
RUN mkdir -p /tmp/proto && cp -r src/proto/* /tmp/proto/
# Clean bun cache and remove unused files
RUN bun pm cache clean && rm -rf src test

# Production stage
FROM base

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /tmp/proto ./proto

EXPOSE 6276

CMD ["node", "dist/main.js"]
