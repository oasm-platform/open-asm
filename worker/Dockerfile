# Stage 1: Build
FROM golang:1.26-alpine AS builder

WORKDIR /app

# Install git for go mod download
RUN apk add --no-cache git ca-certificates

# Copy go mod files first (for better layer caching)
COPY go.mod go.sum ./

# Download dependencies
RUN go mod download

# Copy source code
COPY . .

# Build static binary with optimizations
RUN CGO_ENABLED=0 GOOS=linux go build \
    -ldflags='-w -s -extldflags "-static"' \
    -o oasm-worker ./cmd/oasm-worker

# Stage 2: Runtime
FROM alpine:3.20

WORKDIR /app

# Install ca-certificates for TLS, bash, and chromium for browser tasks
RUN apk add --no-cache ca-certificates bash chromium nss freetype harfbuzz ttf-freefont

# Copy binary and entrypoint from builder
COPY --from=builder /app/oasm-worker .
COPY entrypoint.sh /app/entrypoint.sh

# Make entrypoint executable
RUN chmod +x /app/entrypoint.sh

# Create non-root user for security
RUN addgroup -g 1000 -S worker && \
    adduser -u 1000 -S worker -G worker

# Create tool directory and change ownership
RUN mkdir -p /app/oasm-tools && \
    chown -R worker:worker /app

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

# Metadata
LABEL org.opencontainers.image.title="OASM Worker"
LABEL org.opencontainers.image.description="Attack Surface Management worker agent"
LABEL org.opencontainers.image.vendor="OASM Platform"

# Entrypoint - automatically starts worker with environment configuration
ENTRYPOINT ["/bin/bash", "/app/entrypoint.sh"]
