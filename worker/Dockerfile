# Build stage
FROM rust:1.81-slim as builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*

# Copy source code
COPY . .

# Build for release
RUN cargo build --release

# Runtime stage
FROM debian:bookworm-slim

WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y ca-certificates curl && rm -rf /var/lib/apt/lists/*

# Copy the binary from builder
COPY --from=builder /app/target/release/worker /app/worker

# Create tools cache directory
RUN mkdir -p /app/tools-cache

# Set environment variables
ENV RUST_LOG=info
ENV TOOLS_CACHE_DIR=/app/tools-cache

# Run the worker
ENTRYPOINT ["/app/worker"]
