FROM oven/bun:1.1.13 as builder

WORKDIR /app

RUN apt-get update && \
    apt-get install -y \
    git curl unzip gcc g++ make \
    libpcap-dev \
    && curl -LO https://golang.org/dl/go1.21.3.linux-amd64.tar.gz \
    && tar -C /usr/local -xzf go1.21.3.linux-amd64.tar.gz \
    && ln -s /usr/local/go/bin/go /usr/bin/go \
    && go install -v github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest \
    && go install -v github.com/projectdiscovery/dnsx/cmd/dnsx@latest \
    && go install -v github.com/projectdiscovery/httpx/cmd/httpx@latest \
    && go install -v github.com/projectdiscovery/naabu/v2/cmd/naabu@latest \
    && rm -rf /usr/local/go && rm -f go1.21.3.linux-amd64.tar.gz

COPY . .
RUN bun install
RUN bun build index.ts --outdir dist

FROM oven/bun:1.1.13 as runner

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/bun.lockb ./bun.lockb
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

COPY --from=builder /root/go/bin /usr/local/bin
ENV PATH="/usr/local/bin:$PATH"

CMD ["bun", "dist/index.js"]
