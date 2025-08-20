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
- [Development Conventions](#development-conventions)
  - [Code Style](#code-style)
  - [Testing](#testing)
- [Using Docker Compose](#using-docker-compose)
- [Contributing](#contributing)

## Prerequisites

Before you begin, ensure you have the following installed:

- **Task (taskfile)** - [Installation Guide](https://taskfile.dev/#/installation)
- **Node.js v18+** - [Installation Guide](https://nodejs.org/en/download/package-manager)
- **Bun runtime (latest)** - [Installation Guide](https://bun.sh/docs/installation)
- **PostgreSQL v12+**
- **Docker & Docker Compose (optional but recommended for database)**

## Project Structure

The project is organized into several key directories:

```
open-asm/
├── core-api/           # NestJS API server
│   ├── src/               # Source code
│   ├── example.env        # Environment template
│   └── package.json
├── console/            # React web interface
│   ├── src/               # React components
│   ├── public/            # Static assets
│   └── package.json
├── worker/             # Bun-based workers
│   ├── services/          # Worker services
│   ├── tools/             # Security tools integration
│   ├── example.env        # Worker environment
│   └── package.json
├── open-api/           # Auto-generated API docs
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
- Start a PostgreSQL Docker container named `open-asm-postgres` (requires Docker).

After running `task init`, you can start all services using `task dev` or run them individually as described below.

### All Services with Task

To start all services (API, Console) simultaneously, use the task command from the root directory:

```bash
task dev
```

### Run workers locally

To run workers locally, use the task command from the root directory:

```bash
task worker:dev
```

## Database Setup

The `task init` command automatically starts a PostgreSQL container using Docker. The database connection details are configured in `core-api/.env`.

If you prefer to use your own PostgreSQL instance, update the `core-api/.env` file accordingly.

## Development Conventions

### Code Style

- **Core API (NestJS):** Uses ESLint and Prettier for code formatting and linting. Currently, you need to run `npm run lint` and `npm run format` directly from the `core-api` directory. Consider creating a task to wrap these commands for convenience.
- **Console (React):** Uses ESLint and Prettier. Currently, you need to run `npm run lint` directly from the `console` directory. Consider creating a task to wrap this command for convenience.
- **Workers (Bun):** Likely follows standard TypeScript conventions. You may need to run linting/formatting commands directly from the `worker` directory.

### Testing

- **Core API:** Uses Jest for testing. Currently, you need to run the following commands directly from the `core-api` directory:
  - Run unit tests: `npm run test`
  - Run tests in watch mode: `npm run test:watch`
  - Run end-to-end tests: `npm run test:e2e`
    Consider creating tasks to wrap these commands for convenience.

## Using Docker Compose

To run the entire stack, including the database, using Docker Compose:

```bash
task docker-compose
```

This command uses `docker-compose.yml` to orchestrate containers.

## Contributing

We welcome contributions! Please follow these steps:

1. Fork the repository.
2. Create a feature branch: `git checkout -b feature/amazing-feature`.
3. Make your changes and commit them: `git commit -m 'Add amazing feature'`.
4. Push to the branch: `git push origin feature/amazing-feature`.
5. Open a Pull Request.

Please ensure your code adheres to the project's coding standards and passes all tests before submitting a PR.
