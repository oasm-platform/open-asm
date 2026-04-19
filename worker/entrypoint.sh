#!/bin/sh
set -e

echo "========================================"
echo "  OASM Worker - Attack Surface Manager"
echo "========================================"

# Validate required environment variables
if [ -z "${WORKER_API_KEY}" ]; then
    echo "ERROR: WORKER_API_KEY environment variable is required"
    echo "Example: docker run -e WORKER_API_KEY=your_key ..."
    exit 1
fi

echo "Configuration:"
echo "  API Key: ${WORKER_API_KEY:0:8}..."
echo "  Max Concurrency: ${WORKER_MAX_CONCURRENCY:-10}"
echo "  gRPC Host: ${WORKER_GRPC_HOST:-localhost}"
echo "  gRPC Port: ${WORKER_GRPC_PORT:-16276}"
echo "  Tool Path: ${WORKER_TOOL_PATH:-oasm-tools}"
echo "========================================"

# Run worker with flags (explicit flags for clarity)
exec /app/oasm-worker \
    --api-key "${WORKER_API_KEY}" \
    --max-concurrency "${WORKER_MAX_CONCURRENCY:-10}" \
    --grpc-host "${WORKER_GRPC_HOST:-localhost}" \
    --grpc-port "${WORKER_GRPC_PORT:-16276}" \
    --tool-path "${WORKER_TOOL_PATH:-oasm-tools}"
