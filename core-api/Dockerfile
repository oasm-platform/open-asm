FROM node:26-alpine AS base
RUN apk add --no-cache curl
RUN npm install -g corepack && corepack enable && corepack prepare pnpm@10.33.2 --activate
ENV PNPM_HOME=/root/.local/share/pnpm
ENV PATH=$PNPM_HOME:$PATH

# Build stage — native platform (QEMU-free) for pnpm install + build
FROM --platform=$BUILDPLATFORM node:26-alpine AS builder

ARG APP_VERSION
ENV APP_VERSION=$APP_VERSION

RUN npm install -g corepack && corepack enable && corepack prepare pnpm@10.33.2 --activate
ENV PNPM_HOME=/root/.local/share/pnpm
ENV PATH=$PNPM_HOME:$PATH

WORKDIR /app

# Copy workspace config first for dependency resolution
COPY pnpm-workspace.yaml .npmrc package.json pnpm-lock.yaml ./
COPY core-api/package.json ./core-api/
COPY console/package.json ./console/

RUN pnpm install --frozen-lockfile

# Copy full source
COPY core-api/ ./core-api

RUN pnpm --filter core-api run build && \
  pnpm deploy --legacy --filter core-api --prod /prod/core-api && \
  mkdir -p /prod/core-api/proto && \
  cp -r core-api/src/proto/* /prod/core-api/proto/ 2>/dev/null || true && \
  rm -rf core-api/node_modules/.cache

# Production stage
FROM base

ARG APP_VERSION
ENV APP_VERSION=$APP_VERSION

WORKDIR /app

COPY --from=builder /prod/core-api/package.json ./package.json
COPY --from=builder /prod/core-api/node_modules ./node_modules
COPY --from=builder /prod/core-api/dist ./dist
COPY --from=builder /prod/core-api/public ./public
COPY --from=builder /prod/core-api/proto ./proto

EXPOSE 6276

CMD ["node", "dist/main.js"]
