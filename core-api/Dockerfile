FROM node:26-alpine AS base
RUN apk add --no-cache curl
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME/bin:$PATH"
RUN npm install -g corepack && corepack enable

# Build stage
FROM base AS builder

ARG APP_VERSION
ENV APP_VERSION=$APP_VERSION

WORKDIR /app

# Copy root workspace config and core-api package.json
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY core-api/package.json ./core-api/package.json

# Install all dependencies (including devDependencies for build)
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# Copy core-api source code
COPY core-api/ ./core-api/

WORKDIR /app/core-api

RUN pnpm run build
RUN mkdir -p /tmp/proto && cp -r src/proto/* /tmp/proto/
RUN rm -rf src test node_modules/.cache

# Production stage
FROM base

ARG APP_VERSION
ENV APP_VERSION=$APP_VERSION

WORKDIR /app/core-api

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/core-api/dist ./dist
COPY --from=builder /app/core-api/public ./public
COPY --from=builder /tmp/proto ./proto

EXPOSE 6276

CMD ["node", "dist/main.js"]
