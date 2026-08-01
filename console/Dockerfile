FROM node:26-alpine AS base
RUN apk add --no-cache curl bash
RUN npm install -g corepack && corepack enable && corepack prepare pnpm@10.33.2 --activate
ENV PNPM_HOME=/root/.local/share/pnpm
ENV PATH=$PNPM_HOME:$PATH

# Build stage
FROM base AS builder

WORKDIR /app

# Copy workspace config first for dependency resolution
COPY pnpm-workspace.yaml .npmrc package.json pnpm-lock.yaml ./
COPY console/package.json ./console/
COPY core-api/package.json ./core-api/

RUN pnpm install --frozen-lockfile

# Copy full source
COPY console/ ./console

ENV NODE_ENV production
ENV VITE_API_URL=APP_VITE_API_URL

RUN pnpm --filter console run build && \
  rm -rf console/node_modules/.cache

# Nginx runtime stage
FROM nginx:stable-alpine

COPY --from=builder /app/console/dist /usr/share/nginx/html
COPY console/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
