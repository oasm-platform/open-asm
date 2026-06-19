FROM node:22-alpine AS base
RUN apk add --no-cache curl

# Build stage
FROM base AS builder

ARG APP_VERSION
ENV APP_VERSION=$APP_VERSION

WORKDIR /app

COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
RUN mkdir -p /tmp/proto && cp -r src/proto/* /tmp/proto/
RUN rm -rf src test node_modules/.cache

# Production stage
FROM base

ARG APP_VERSION
ENV APP_VERSION=$APP_VERSION

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /tmp/proto ./proto


EXPOSE 6276

CMD ["node", "dist/main.js"]
