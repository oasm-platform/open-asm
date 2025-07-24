## https://dawchihliou.github.io/articles/the-last-dockerfile-you-need-for-nestjs
FROM node:22-alpine AS base
# add the missing shared libraries from alpine base image
RUN apk add --no-cache libc6-compat curl

# Build stage
FROM base AS builder

WORKDIR /app

COPY ./core-api/package*.json ./
RUN npm install

COPY ./core-api ./
RUN npm run build

# Production stage
FROM base

WORKDIR /app

COPY ./core-api/package*.json ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist

EXPOSE 6276

CMD ["node", "dist/main.js"]
