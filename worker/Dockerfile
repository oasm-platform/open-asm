# Stage 1: Build — always runs on the native build platform for fast cross-compilation
FROM --platform=$BUILDPLATFORM golang:1.26-alpine AS builder

ARG TARGETARCH

WORKDIR /app

# Install git for go mod download
RUN apk add --no-cache git ca-certificates

# Copy go mod files first (for better layer caching)
COPY go.mod go.sum ./

# Download dependencies
RUN go mod download

# Copy source code
COPY . .

# Cross-compile for the target architecture; CGO_ENABLED=0 makes this dependency-free
RUN CGO_ENABLED=0 GOOS=linux GOARCH=$TARGETARCH go build \
    -ldflags='-w -s -extldflags "-static"' \
    -o oasm-worker ./cmd/app

# Stage 2: Runtime
FROM debian:bookworm-slim

WORKDIR /app

# Install ca-certificates for TLS, bash, libpcap for naabu
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    bash \
    libpcap0.8 \
    curl \
    iputils-ping \
    dnsutils \
    libglib2.0-0 \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libxshmfence1 \
    libcairo2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libx11-xcb1 \
    libx11-6 \
    libxcb1 \
    && rm -rf /var/lib/apt/lists/*

# Create tool directory
RUN mkdir -p /app/oasm-tools

# Copy binary from builder
COPY --from=builder /app/oasm-worker .

# Create non-root user for security
RUN groupadd -g 1000 worker && \
    useradd -u 1000 -g worker -s /bin/bash -m worker

# Change ownership of app directory
RUN chown -R worker:worker /app

USER worker

# Default environment variables (override at runtime with -e)
# Required:
#   WORKER_API_KEY - Your worker authentication key
# Optional:
#   WORKER_MAX_CONCURRENCY - Max concurrent tasks (default: 10)
#   WORKER_GRPC_HOST - gRPC server host (default: localhost)
#   WORKER_GRPC_PORT - gRPC server port (default: 16276)
#   WORKER_TOOL_PATH - Tool path (default: oasm-tools)
ENV WORKER_MAX_CONCURRENCY=10
ENV WORKER_GRPC_HOST=localhost
ENV WORKER_GRPC_PORT=16276
ENV WORKER_TOOL_PATH=oasm-tools
ENV AGENT_BROWSER_NO_SANDBOX=1

# Metadata
LABEL org.opencontainers.image.title="OASM Worker"
LABEL org.opencontainers.image.description="Attack Surface Management worker agent"
LABEL org.opencontainers.image.vendor="OASM Platform"

# Entrypoint
ENTRYPOINT ["/app/oasm-worker"]
