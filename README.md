# 🎯 Open Attack Surface Management (OASM)

Open-source platform for cybersecurity Attack Surface Management. Built to help security teams identify, monitor, and manage external assets and potential security exposures across their digital infrastructure.

## Table of Contents

- [Core Features](#core-features)
- [System Architecture](#system-architecture)
- [Worker Types & Tools](#worker-types--tools)
- [Installation](#installation)
  - [Prerequisites](#prerequisites)
  - [Developer Guide](#developer-guide)
    - [Project Structure](#project-structure)
    - [Initialize Developer Environment](#initialize-developer-environment)
- [Access Points](#access-points)
- [Contributing](#contributing)
- [License](#license)

## Core Features

- Asset Management: Auto-discovery, classification, tracking & inventory
- Auth & Authorization: User management, RBAC, API keys & sessions
- Job Management: Scheduling, queuing, monitoring & history
- Target Management: Define, group, validate & monitor scan targets
- Worker Management: Distributed workers with auto-scaling & health monitoring
- Workspace Management: Multi-tenant isolation with team collaboration
- Security Tools: Integrated Subfinder, DNSX, HTTPX & Naabu

## System Architecture

- Core API (NestJS + TypeScript + Better Auth + PostgreSQL): RESTful endpoints, job orchestration, data persistence & worker coordination
- Console (React + TypeScript + Vite): Modern UI with real-time monitoring, data visualization & asset management
- Workers (Bun + TypeScript): High-performance distributed scanning with horizontal scalability

## Worker Types & Tools

| Worker Type | Tool      | Description                   | Purpose                                    |
| ----------- | --------- | ----------------------------- | ------------------------------------------ |
| Subdomain   | Subfinder | Passive subdomain enumeration | Discover hidden subdomains                 |
| DNS         | DNSX      | DNS resolution and validation | Validate and resolve domains               |
| HTTP        | HTTPX     | HTTP/HTTPS service analysis   | Identify web services and technologies     |
| Port        | Naabu     | Network port scanning         | Discover exposed services and entry points |

## Installation

### Prerequisites

- Task (taskfile) - [Installation Guide](https://taskfile.dev/#/installation)
- Node.js v18+ - [Installation Guide](https://nodejs.org/en/download/package-manager)
- Bun runtime (latest) - [Installation Guide](https://bun.sh/docs/installation)
- PostgreSQL v12+
- Docker & Docker Compose (optional)

## Developer Guide

### Project Structure

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

### Initialize Developer Environment

To set up your local development environment, run the following command:

```bash
task init
```

This command will:

- Install project dependencies.
- Copy example environment files (`.env`) for `core-api` and `worker`.
- Generate API documentation.
- Prepare the database.

After running `task init`, you can start all services using `task dev` or run them individually as described below.

## Access Points

| Service      | URL                                   | Description              |
| ------------ | ------------------------------------- | ------------------------ |
| Web Console  | `http://localhost:5173`               | Main web interface       |
| API Docs     | `http://localhost:6276/api/docs`      | Swagger UI documentation |
| Auth Docs    | `http://localhost:6276/api/auth/docs` | Authentication endpoints |
| OpenAPI Spec | `http://localhost:6276/api/docs-json` | OpenAPI specification    |

## Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open Pull Request

## License

MIT License - see [LICENSE](LICENSE) file for details.

---

**⭐ If you find Open-ASM useful, please star us on GitHub!**

**🛡️ Built for security teams, by security professionals.**
