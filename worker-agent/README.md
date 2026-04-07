# Worker Agent

A high-performance Rust worker agent with gRPC communication and dynamic tool management.

## Features

- **Dynamic Tool Management**: Automatically downloads and verifies tools from backend manifest
- **SHA-256 Integrity**: Verifies tool binaries before execution
- **Concurrent Job Processing**: Uses Tokio for async job handling
- **Heartbeat**: Maintains connection with backend
- **Graceful Shutdown**: Waits for jobs to complete before exiting

## Architecture

### Layer 1: Core API & Orchestration
- `GrpcClient`: Connection management and authentication
- `JobPoller`: Polls jobs from the backend
- `Heartbeat`: Periodic alive checks
- `ToolManifestFetcher`: Fetches tool manifest

### Layer 2: Dynamic Execution
- `ToolManager`: Downloads, verifies, and caches tools
- `JobProcessor`: Executes tools via `tokio::process::Command`

## Usage

```bash
# Basic usage
./worker-agent --api-url http://localhost:6276 --api-key YOUR_API_KEY

# With custom settings
./worker-agent --api-url http://localhost:6276 --api-key YOUR_API_KEY --max-concurrent-jobs 10 --manifest-check-interval 600
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `API_URL` | Backend API URL | `http://localhost:6276` |
| `API_KEY` | Authentication key | Required |
| `MAX_CONCURRENT_JOBS` | Max parallel jobs | 5 |
| `MANIFEST_CHECK_INTERVAL` | Tool sync interval (seconds) | 300 |
| `TOOLS_DIR` | Local tools directory | `./tools` |
| `HEARTBEAT_INTERVAL` | Heartbeat interval (seconds) | 5 |

## Docker

```bash
# Build
docker build -t worker-agent:latest worker-agent/

# Run
docker run -d \
  --name worker-agent \
  -e API_URL=http://core-api:6276 \
  -e API_KEY=your-api-key \
  worker-agent:latest
```

## Tool Manifest API

The agent expects the backend to provide a tool manifest at `/api/tools/manifest`:

```json
{
  "tools": [
    {
      "name": "nmap",
      "url": "https://example.com/tools/nmap",
      "sha256": "abc123...",
      "executable_name": "nmap"
    }
  ]
}
```
