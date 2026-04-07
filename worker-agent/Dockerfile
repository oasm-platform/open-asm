# Build stage
FROM rust:1.75-bookworm AS builder

WORKDIR /build

COPY Cargo.toml Cargo.lock ./
COPY src ./src

RUN cargo build --release

# Runtime stage
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /build/target/release/worker-agent /app/

RUN mkdir -p /app/tools

ENV RUST_LOG=info

ENTRYPOINT ["/app/worker-agent"]
CMD ["start"]
