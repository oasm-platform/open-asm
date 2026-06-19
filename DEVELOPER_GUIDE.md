# Developer Guide for Open Attack Surface Management (OASM)

This guide provides detailed instructions for setting up your local development environment, running the services, and contributing to the OASM project.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Project Structure](#project-structure)
- [Initialize Developer Environment](#initialize-developer-environment)
- [Running Services](#running-services)
  - [Core API](#core-api)
  - [Console (Web Interface)](#console-web-interface)
  - [Workers](#workers)
  - [All Services with Task](#all-services-with-task)
- [Database Setup](#database-setup)
- [Database Migration](#database-migration)
- [Development Conventions](#development-conventions)
  - [Code Style](#code-style)
  - [Testing](#testing)
- [Using Docker Compose](#using-docker-compose)
- [Contributing](#contributing)

## Prerequisites

Before you begin, ensure you have the following installed:

- **Task (taskfile)** - [Installation Guide](https://taskfile.dev/#/installation)
- **Node.js v22+** - [Installation Guide](https://nodejs.org/en/download/package-manager)
- **Go 1.26+** - [Installation Guide](https://go.dev/doc/install)
- **PostgreSQL v17+** (with pgvector extension)
- **Docker & Docker Compose** (recommended for database and full stack)

## Project Structure

The project is organized into several key directories:

```
open-asm/
├── core-api/           # NestJS API server
│   ├── src/            # Source code
│   ├── example.env     # Environment template
│   └── package.json
├── console/            # React web interface
│   ├── src/            # React components
│   ├── public/         # Static assets
│   └── package.json
├── worker/             # Go-based scanning workers
│   ├── cmd/            # CLI and App entry points
│   ├── internal/       # Business logic
│   ├── scripts/        # Install scripts (install.ps1, install.sh)
│   ├── go.mod          # Go module definition
│   └── .example.env    # Environment template
├── grpc-client/        # Generated gRPC stubs (Go + TypeScript)
├── .open-api/          # Auto-generated API docs
├── docker-compose.yml  # Container orchestration
├── taskfile.yml        # Task automation
└── README.md           # Documentation
```

## Initialize Developer Environment

To set up your local development environment, run the following command:

```bash
task init
```

This command will:

- Copy example environment files (`.env`) for `core-api`, `console`, and `worker`.
- Install project dependencies using `npm` (managed by the task for each workspace).
- Install Go dependencies for the worker.
- Install worker security tools (nuclei, subfinder, httpx, naabu, dnsx) into `worker/oasm-tools/`.

After running `task init`, you can start all services using `task dev` or run them individually as described below.

## Running Services

### All Services with Task

To start the API and Console development servers simultaneously:

```bash
task dev
```

This starts:
- Core API at `http://localhost:6276`
- Console at `http://localhost:5173` (Vite dev server)

### Core API

```bash
task api:dev
```

Or directly:

```bash
cd core-api && npm run start:dev
```

The API runs on port `6276` with gRPC server on port `16276`.

### Console (Web Interface)

```bash
task console:dev
```

Or directly:

```bash
cd console && npm run dev
```

### Workers

To run workers locally in CLI mode:

```bash
task worker:dev
```

With custom parameters:

```bash
task worker:dev replicas=3 maxJobs=10 apiKey=<your-api-key> network=<target-network>
```

To run workers in app mode (env-driven):

```bash
task worker:dev-app
```

## Database Setup

The `task init` command does not automatically start a PostgreSQL container. You can either:

1. Use Docker Compose to start PostgreSQL:

   ```bash
   docker compose up postgres -d
   ```

2. Use your own PostgreSQL instance and update `core-api/.env` accordingly.

The database uses PostgreSQL 17 with the pgvector extension for vector operations.

## Database Migration

This section explains how to manage database migrations using the taskfile.

### Overview

Database migrations are managed using TypeORM. The migration scripts are defined in `core-api/taskfile.yml` and can be executed using the task commands.

### Running Migrations

#### Run all pending migrations

This command executes all pending database migrations:

```bash
task migration:run
```

This will:

- Connect to the PostgreSQL database
- Check for pending migrations in the `migrations` table
- Run all new migrations that haven't been applied yet

#### Generate a new migration

To generate a new migration with a custom name:

```bash
task migration:generate MIGRATION_NAME=YourMigrationName
```

For example:

```bash
task migration:generate MIGRATION_NAME=AddUserTable
```

This will create a new migration file in `core-api/src/database/migrations/`.

#### Revert the last migration

To rollback the most recently executed migration:

```bash
task migration:revert
```

**Note:** This will only revert one migration at a time. Repeat if needed.

### Using Docker Compose for Migrations

If you prefer to run migrations using Docker (useful when not running PostgreSQL locally):

```bash
docker compose up migration
```

This will:

1. Start the PostgreSQL container (if not running)
2. Run the migration service
3. Execute all pending migrations
4. Automatically remove the migration container after completion
5. Start the core-api service after migrations complete

### Migration with Docker - Manual Run

To run migration container manually and keep it for debugging:

```bash
docker compose run --rm migration
```

The `--rm` flag ensures the container is removed after it stops.

## Development Conventions

### Code Style

- **Core API (NestJS):** Uses ESLint and Prettier for code formatting and linting.
  ```bash
  task api:lint
  ```
- **Console (React):** Uses ESLint and Prettier.
  ```bash
  task console:lint
  ```
- **Workers (Go):** Uses `go fmt` and `go vet`.
  ```bash
  task worker:format
  task worker:lint
  ```

### Testing

- **Core API:** Uses Jest for testing.
  ```bash
  task api:test           # Unit tests
  cd core-api && npm run test:watch    # Watch mode
  cd core-api && npm run test:e2e      # End-to-end tests
  ```

- **Console:** Uses Vitest for unit tests and Playwright for e2e tests.
  ```bash
  task console:test       # Unit tests
  cd console && npm run e2e           # E2E tests
  ```

- **Workers:** Uses Go testing.
  ```bash
  task worker:test
  ```

### API Client Generation

After making changes to the API contract, regenerate the console API client:

```bash
task gen-api
```

This uses orval to generate TanStack Query hooks from the OpenAPI spec.

### gRPC Stub Generation

After modifying proto files, regenerate gRPC stubs:

```bash
task proto
```

This generates Go and TypeScript stubs into `grpc-client/`.

## Using Docker Compose

To run the entire stack using Docker Compose:

```bash
task docker-compose
```

This starts:
- Console (port 3000)
- Core API (port 6276, gRPC port 16276)
- 3 Worker instances
- PostgreSQL with pgvector (port 5432)
- Redis (port 6379)
- Geo-IP proxy (port 4360)
- Rustfs S3 storage (port 9000)

## Contributing

We welcome contributions! Please follow these steps:

1. Fork the repository.
2. Create a feature branch: `git checkout -b feature/amazing-feature`.
3. Make your changes and commit them following [Conventional Commits](https://www.conventionalcommits.org/):
   ```bash
   git commit -m 'feat(scope): add amazing feature'
   ```
4. Push to the branch: `git push origin feature/amazing-feature`.
5. Open a Pull Request.

Please ensure your code adheres to the project's coding standards and passes all tests before submitting a PR.
