#!/bin/bash
set -e

if [ -z "${WORKER_API_KEY}" ]; then
    echo "ERROR: WORKER_API_KEY environment variable is required"
    echo "Example: docker run -e WORKER_API_KEY=your_key ..."
    exit 1
fi

exec /app/oasm-worker \
    --api-key "${WORKER_API_KEY}" \
    --max-concurrency "${WORKER_MAX_CONCURRENCY:-10}" \
    --grpc-host "${WORKER_GRPC_HOST:-localhost}" \
    --grpc-port "${WORKER_GRPC_PORT:-16276}" \
    --tool-path "${WORKER_TOOL_PATH:-oasm-tools}"
