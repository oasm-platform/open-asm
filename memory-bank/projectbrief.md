# Project Brief: Open Attack Surface Management (OASM)

## Overview

Open Attack Surface Management (OASM) is an open-source cybersecurity platform designed to help security teams identify, monitor, and manage external assets and potential security exposures across their digital infrastructure.

## Core Requirements

### System Architecture
- **Distributed Architecture**: Three main components - Core API, Console (Web Interface), and Distributed Workers
- **Database**: PostgreSQL for data persistence
- **Authentication**: Better Auth for user authentication
- **Message Queue**: BullMQ for job orchestration
- **Cache**: Redis for caching and session management
- **MCP Server**: Model Context Protocol integration for AI assistant support

### Key Features
1. **Asset Discovery & Management**
   - Comprehensive discovery of internet-facing assets (domains, subdomains, IP addresses, web services)
   - Asset grouping and multi-workspace organization
   - Real-time inventory updates

2. **Vulnerability Assessment**
   - Continuous scanning for vulnerabilities and misconfigurations
   - Advanced issue tracking with risk analysis and prioritization
   - Remediation guidance

3. **Technology Detection**
   - Automated identification of technologies, frameworks, and services
   - Technology stack insights and security implications

4. **Distributed Scanning Engine**
   - High-performance distributed workers with auto-scaling
   - Job orchestration and registry system
   - Parallel processing capabilities

5. **Tool Integration**
   - Extensible framework for security scanning tools
   - Custom tool configurations
   - Automated execution pipelines

6. **AI Assistant Integration**
   - MCP server for natural language queries
   - Asset data access through AI assistants
   - Security analysis assistance

7. **Workflow Automation**
   - Configurable scanning schedules
   - Alert responses and remediation processes
   - Template-based security operations

8. **Real-time Monitoring & Notifications**
   - Continuous asset change monitoring
   - Instant notifications for discoveries and vulnerabilities
   - Statistics dashboard with trend analysis

9. **Advanced Search & Analytics**
   - Powerful search across all asset data
   - Filtering and faceting capabilities
   - Attack surface metrics and compliance reporting

## Technology Stack

### Core API (NestJS)
- **Framework**: NestJS v11
- **Language**: TypeScript
- **Database**: PostgreSQL with TypeORM
- **Authentication**: Better Auth
- **Message Queue**: BullMQ
- **Cache**: Redis (ioredis)
- **MCP**: @modelcontextprotocol/sdk, @rekog/mcp-nest
- **gRPC**: For worker communication
- **Validation**: Zod, class-validator
- **Documentation**: Swagger/OpenAPI

### Console (React)
- **Framework**: React v19
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **State Management**: React Query (TanStack Query)
- **Routing**: React Router
- **UI Components**: Radix UI
- **Charts**: Recharts
- **Forms**: React Hook Form + Zod
- **Code Editor**: CodeMirror
- **Workflow Visualization**: React Flow

### Worker (Bun)
- **Runtime**: Bun
- **Language**: TypeScript
- **Browser Automation**: Puppeteer
- **HTTP Client**: Axios
- **Logging**: node-color-log

### Infrastructure
- **Containerization**: Docker & Docker Compose
- **Task Automation**: Taskfile
- **Git Hooks**: Husky
- **Linting**: ESLint
- **Formatting**: Prettier
- **Testing**: Jest (Core API), Vitest (Console)

## Development Workflow

### Setup
1. Clone repository
2. Run `task init` to initialize environment
3. Start services with `task dev` or individually
4. Database is automatically provisioned via Docker

### Code Quality
- **ESLint Rules**: No explicit `any`, no floating promises, strict equality, single quotes
- **Prettier**: 2 spaces, trailing commas, single quotes
- **Testing**: 80%+ coverage target for business logic
- **Type Safety**: Strict TypeScript mode

### Services
- **Core API**: Port 3000 (default)
- **Console**: Port 5173 (Vite dev server)
- **Database**: PostgreSQL on port 5432
- **Redis**: For caching and queues
- **Workers**: Distributed scanning tasks

## Project Structure

```
open-asm/
├── core-api/           # NestJS API server
│   ├── src/
│   │   ├── modules/    # Feature modules (auth, assets, vulnerabilities, etc.)
│   │   ├── common/     # Shared utilities, guards, decorators
│   │   ├── database/   # Database configuration and migrations
│   │   ├── mcp/        # MCP server implementation
│   │   ├── services/   # Business services
│   │   └── types/      # TypeScript types
│   └── test/           # Unit and E2E tests
├── console/            # React web interface
│   ├── src/
│   │   ├── components/ # React components
│   │   ├── pages/      # Route pages
│   │   ├── hooks/      # Custom React hooks
│   │   ├── services/   # API clients
│   │   └── utils/      # Utility functions
│   └── public/         # Static assets
├── worker/             # Bun-based workers
│   ├── services/       # Worker services
│   ├── tools/          # Security tool integrations
│   └── tool/           # Tool execution handlers
├── docs/               # Documentation and images
├── .open-api/          # Auto-generated API docs
└── docker-compose.yml  # Container orchestration
```

## Key Integration Points

1. **Core API ↔ Workers**: gRPC communication for job dispatching and result reporting
2. **Core API ↔ Database**: TypeORM for data persistence
3. **Core API ↔ Redis**: BullMQ for job queues and caching
4. **Console ↔ Core API**: REST API for all operations
5. **MCP Server ↔ Core API**: Query asset data and provide insights to AI assistants
6. **Workers ↔ Internet**: Scanning and discovery operations

## Security Considerations

- Authentication via Better Auth
- API key management for tool integrations
- Input validation using Zod and class-validator
- Secure gRPC communication
- Rate limiting and request throttling
- Error handling without exposing implementation details

## Testing Strategy

- **Core API**: Jest for unit and E2E tests
- **Console**: Vitest for component testing
- **Coverage Target**: 80%+ for business logic
- **Test Types**: Unit tests, integration tests, E2E tests
- **CI/CD**: Automated testing in GitHub Actions

## Deployment

- **Docker Compose**: Full stack deployment
- **Container Registry**: Docker Hub (oasm/oasm-api)
- **CI/CD**: GitHub Actions for build and release
- **Security Scanning**: Trivy for vulnerability scanning

## Documentation

- **README.md**: Project overview and quick start
- **DEVELOPER_GUIDE.md**: Detailed development setup
- **AGENTS.md**: AI agent guidelines and workflows
- **API Documentation**: Auto-generated via Swagger
- **Memory Bank**: Context preservation for AI assistants