FROM golang:1.25-alpine AS tools-base

WORKDIR /app

RUN apk add --no-cache gcc musl-dev libpcap-dev nmap

FROM tools-base AS tools

WORKDIR /app

COPY taskfile.yml .

RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    go install github.com/go-task/task/v3/cmd/task@latest && \
    task tools

FROM node:22-alpine AS base
RUN apk add --no-cache curl nmap && npm install -g bun

FROM base AS builder

WORKDIR /app
# Set to production environment
ENV NODE_ENV=production

COPY . .
RUN bun install
RUN bun build index.ts --outdir dist --target bun
# Clean bun cache and remove unused files
RUN bun pm cache clean && rm -rf src test

FROM base AS runner
# Set to production environment
ENV NODE_ENV=production

WORKDIR /app

# Install Chrome for Puppeteer
RUN apk add --no-cache chromium

# Tell Puppeteer to skip installing Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/bun.lock ./bun.lock
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

COPY --from=tools /go/bin /usr/local/bin/
COPY --from=tools /root/.pdtm/go/bin /usr/local/bin/
ENV PATH="/usr/local/bin:$PATH"

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/bin/sh", "/entrypoint.sh"]
CMD ["bun", "dist/index.js"]
