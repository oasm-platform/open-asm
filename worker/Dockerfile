FROM golang:1.25 AS tools-base

WORKDIR /app

RUN apt-get update && apt-get install -y libpcap-dev && \
    go install github.com/go-task/task/v3/cmd/task@latest

FROM tools-base AS tools

WORKDIR /app

COPY taskfile.yml .

RUN --mount=type=cache,target=/go/pkg/mod \
		--mount=type=cache,target=/root/.cache/go-build \
    task tools

FROM node:22-alpine AS base
RUN apk add --no-cache curl nmap && npm install -g bun@1.3

FROM base AS builder

WORKDIR /app
# Set to production environment
ENV NODE_ENV production

COPY . .
RUN bun install
RUN bun build index.ts --outdir dist
# Clean bun cache and remove unused files
RUN bun pm cache clean && rm -rf src test

FROM base AS runner
# Set to production environment
ENV NODE_ENV production

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/bun.lock ./bun.lock
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

COPY --from=tools /go/bin /usr/local/bin/
ENV PATH="/usr/local/bin:$PATH"

CMD ["bun", "dist/index.js"]
