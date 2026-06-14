FROM node:22-alpine AS base
RUN apk add --no-cache curl

# Build stage
FROM base AS builder

ARG APP_VERSION
ENV APP_VERSION=$APP_VERSION
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

WORKDIR /app

COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
RUN mkdir -p /tmp/proto && cp -r src/proto/* /tmp/proto/
RUN mkdir -p /tmp/reports-templates && cp -r src/modules/reports/templates/* /tmp/reports-templates/
RUN rm -rf src test node_modules/.cache

# Production stage
FROM base

ARG APP_VERSION
ENV APP_VERSION=$APP_VERSION

RUN apk add --no-cache \
  chromium \
  nss \
  freetype \
  harfbuzz \
  ttf-freefont \
  udev \
  libx11 \
  libxcb \
  libxcomposite \
  libxcursor \
  libxdamage \
  libxext \
  libxfixes \
  libxi \
  libxrandr \
  libxrender \
  libxtst \
  ca-certificates \
  fontconfig \
  dbus

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /tmp/proto ./proto
COPY --from=builder /tmp/reports-templates ./dist/modules/reports/templates


EXPOSE 6276

CMD ["node", "dist/main.js"]
