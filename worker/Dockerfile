FROM golang:1.24 AS tools

WORKDIR /app

# Cài các dependency cần thiết cho các tool ProjectDiscovery
RUN apt-get update && apt-get install -y libpcap-dev

# Cài các công cụ Go phổ biến
RUN go install github.com/projectdiscovery/httpx/cmd/httpx@v1.7.1 && \
	go install github.com/projectdiscovery/subfinder/v2/cmd/subfinder@v2.8.0 && \
	go install github.com/projectdiscovery/nuclei/v3/cmd/nuclei@v3.4.7 && \
	go install github.com/projectdiscovery/dnsx/cmd/dnsx@v1.2.2 && \
	go install github.com/projectdiscovery/naabu/v2/cmd/naabu@v2.3.5

FROM oven/bun:1.2 AS base
RUN apt-get update && apt-get install -y \
    curl

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

COPY --from=tools /go/bin/subfinder /usr/local/bin/
COPY --from=tools /go/bin/dnsx /usr/local/bin/
COPY --from=tools /go/bin/http_scraper /usr/local/bin/
COPY --from=tools /go/bin/naabu /usr/local/bin/
ENV PATH="/usr/local/bin:$PATH"

CMD ["bun", "dist/index.js"]
