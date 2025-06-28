# Open-ASM

Open-ASM is an open-source platform for cybersecurity Attack Surface Management (ASM). Built to help security teams identify, monitor, and manage external assets and exposure.

## Project Architecture

The Open-ASM project is divided into three main components:

### 1. Core API (NestJS)

Central API built on NestJS, providing RESTful endpoints and data management:

- User authentication and authorization
- Job management and task distribution to workers
- Data storage and querying from PostgreSQL database
- Automatic API documentation with Swagger

### 2. Console (React + TypeScript + Vite)

Web user interface built with React, TypeScript, and Vite:

- Modern interface with Material UI
- Routing with React Router
- Rapid development with Vite HMR

### 3. Worker (Bun)

Workers run scanning and information gathering tasks:

- Built on Bun runtime for high performance
- Support for different worker types (subdomains, httpx, ports)
- Process jobs from queue and report results back to Core API

## Installation and Development

### Requirements

- Node.js (latest version)
- Bun runtime
- PostgreSQL
- Docker and Docker Compose (optional)

### Installing Dependencies

```bash
# Install dependencies for all components
npm run install
```

### Development

```bash
# Run all components in development mode
task dev

# Or run each component separately
task api:dev
task console:dev
task worker:dev
```

### Building

```bash
# Build all components
task build
```

### Deployment with Docker

```bash
# Create .env files from examples
cp core-api/example.env core-api/.env
cp worker/example.env worker/.env

# Edit .env files according to your configuration

# Start containers
task docker-compose
```

## Project Structure

```
├── core-api/            # Central API (NestJS)
├── console/             # User interface (React)
├── worker/              # Job processing workers (Bun)
├── open-api/            # Auto-generated OpenAPI documentation
├── docker-compose.yml   # Docker Compose configuration
└── taskfile.yml         # Task Runner configuration file
```

## Workers

The project supports three main types of workers:

1. **Subdomains Worker**: Scans and detects subdomains
2. **HTTPX Worker**: Checks and analyzes HTTP/HTTPS services
3. **Ports Worker**: Scans and detects open ports

Each worker can be scaled independently in a Docker environment.

## Contributing

We welcome all contributions! Please refer to the [contribution guidelines](https://github.com/oasm-platform/open-asm/issues) for more details.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.