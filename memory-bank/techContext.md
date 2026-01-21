# Technology Context

## Technologies Used

### Core API (NestJS)

#### Framework & Runtime
- **NestJS v11**: Progressive Node.js framework for building efficient, scalable server-side applications
- **TypeScript v5.9**: Strongly typed JavaScript superset
- **Node.js v18+**: Runtime environment

#### Key Dependencies
- **@nestjs/* packages**: Core framework modules (common, core, microservices, etc.)
- **TypeORM v0.3.28**: ORM for PostgreSQL with TypeScript support
- **PostgreSQL v8.16.0**: Primary relational database
- **BullMQ v5.65.1**: Job queue system for distributed task processing
- **ioredis v5.8.2**: Redis client for caching and session management
- **Better Auth v1.4.7**: Authentication and authorization
- **@modelcontextprotocol/sdk v1.25.2**: MCP SDK for AI assistant integration
- **@rekog/mcp-nest v1.8.4**: NestJS MCP integration
- **Zod v3.25.76**: Schema validation and type inference
- **class-validator v0.14.3**: DTO validation decorators
- **@nestjs/swagger v11.2.3**: OpenAPI/Swagger documentation
- **@grpc/grpc-js v1.14.2**: gRPC client for worker communication
- **axios v1.13.2**: HTTP client
- **rxjs v7.8.2**: Reactive programming library

#### Development Tools
- **@nestjs/cli v11.0.14**: CLI for NestJS development
- **ESLint v9.39.1**: Linting with TypeScript ESLint
- **Prettier v3.7.4**: Code formatting
- **Jest v29.7.0**: Testing framework
- **ts-jest v29.4.6**: TypeScript preprocessor for Jest
- **supertest v7.1.4**: HTTP assertions for E2E tests

### Console (React)

#### Framework & Runtime
- **React v19.1.0**: UI library
- **Vite v6.4.1**: Build tool and dev server
- **TypeScript v5.8.3**: Type checking
- **React Router v7.6.2**: Client-side routing

#### UI & Styling
- **Tailwind CSS v4.1.11**: Utility-first CSS framework
- **@tailwindcss/vite v4.1.11**: Vite plugin for Tailwind
- **Radix UI components**: Headless UI primitives
  - `@radix-ui/react-accordion`
  - `@radix-ui/react-dialog`
  - `@radix-ui/react-dropdown-menu`
  - `@radix-ui/react-tabs`
  - And more...
- **Lucide React v0.545.0**: Icon library
- **Framer Motion v12.23.12**: Animation library
- **Sonner v2.0.6**: Toast notifications

#### State Management & Data
- **@tanstack/react-query v5.81.5**: Server state management
- **@tanstack/react-table v8.21.3**: Table component
- **@tanstack/react-virtual v3.13.12**: Virtualized lists
- **React Hook Form v7.59.0**: Form management
- **@hookform/resolvers v5.1.1**: Zod integration for React Hook Form
- **Zod v3.25.67**: Schema validation

#### Code Editor & Visualization
- **@uiw/react-codemirror v4.25.1**: Code editor component
- **@uiw/codemirror-theme-tokyo-night v4.25.1**: Editor theme
- **@codemirror/lang-yaml v6.1.2**: YAML language support
- **@xyflow/react v12.9.2**: Workflow visualization (React Flow)
- **Recharts v2.15.4**: Charting library
- **react-markdown v10.1.0**: Markdown rendering
- **remark-gfm v4.0.1**: GitHub Flavored Markdown

#### Utilities
- **Axios v1.12.2**: HTTP client
- **Date-fns v4.1.0**: Date manipulation
- **Dayjs v1.11.13**: Alternative date library
- **UUID v13.0.0**: UUID generation
- **QS v6.14.1**: Query string parsing
- **Next-themes v0.4.6**: Theme management (dark/light mode)
- **React-hotkeys-hook v5.1.0**: Keyboard shortcuts
- **React-leaflet v5.0.0**: Map components

#### Development Tools
- **ESLint v9.25.0**: Linting
- **TypeScript ESLint v8.30.1**: TypeScript linting
- **Vite v6.4.1**: Build tool
- **@vitejs/plugin-react v4.4.1**: React plugin for Vite
- **Orval v7.17.0**: API client generation from OpenAPI specs
- **Husky v9.1.7**: Git hooks

### Worker (Bun)

#### Runtime & Language
- **Bun v1.x**: Fast JavaScript runtime (all-in-one)
- **TypeScript**: Type checking

#### Key Dependencies
- **Axios v1.12.2**: HTTP client
- **Puppeteer v24.35.0**: Headless browser automation
- **EventSource Parser v3.0.2**: SSE parsing
- **Node-color-log v12.0.1**: Colored console logging

#### Development Tools
- **@types/bun**: TypeScript definitions for Bun
- **TypeScript v5**: Peer dependency

### Infrastructure & Tooling

#### Containerization
- **Docker v24+**: Container runtime
- **Docker Compose v2+**: Multi-container orchestration
- **PostgreSQL v15**: Database container
- **Redis v7-alpine**: Cache container

#### Task Automation
- **Taskfile v3.x**: Task runner (Go-based)
- **Husky v9.1.7**: Git hooks for pre-commit/pre-push

#### Version Control
- **Git**: Source control
- **GitHub**: Repository hosting
- **GitHub Actions**: CI/CD pipeline

#### Security Scanning
- **Trivy**: Container vulnerability scanner

## Development Setup

### Prerequisites

1. **Task (taskfile)**
   ```bash
   # Windows (via Scoop)
   scoop install task
   
   # macOS (via Homebrew)
   brew install go-task/tap/go-task
   
   # Linux
   sudo snap install task --classic
   ```

2. **Node.js v18+**
   ```bash
   # Download from https://nodejs.org/
   # Or use nvm
   nvm install 18
   nvm use 18
   ```

3. **Bun Runtime**
   ```bash
   # Install Bun
   curl -fsSL https://bun.sh/install | bash
   
   # Verify installation
   bun --version
   ```

4. **PostgreSQL v12+**
   ```bash
   # Option 1: Docker (recommended for development)
   docker run --name postgres -e POSTGRES_PASSWORD=password -p 5432:5432 -d postgres:15
   
   # Option 2: Install locally
   # macOS: brew install postgresql
   # Ubuntu: sudo apt-get install postgresql
   # Windows: Download from postgresql.org
   ```

5. **Docker & Docker Compose** (Optional but recommended)
   ```bash
   # Install Docker Desktop
   # https://www.docker.com/products/docker-desktop/
   ```

### Quick Start

#### Option 1: Using Task (Recommended)

```bash
# Clone the repository
git clone https://github.com/oasm-platform/open-asm.git
cd open-asm

# Initialize development environment
task init

# Start all services
task dev

# Or start services individually
task api:dev      # Core API only
task console:dev  # Console only
task worker:dev   # Workers only
```

#### Option 2: Manual Setup

```bash
# Clone the repository
git clone https://github.com/oasm-platform/open-asm.git
cd open-asm

# Setup Core API
cd core-api
cp example.env .env
npm install
npm run start:dev

# Setup Console (in new terminal)
cd ../console
cp example.env .env
npm install
npm run dev

# Setup Worker (in new terminal)
cd ../worker
cp example.env .env
bun install
bun run dev
```

#### Option 3: Docker Compose

```bash
# Clone the repository
git clone https://github.com/oasm-platform/open-asm.git
cd open-asm

# Copy environment files
cp core-api/example.env core-api/.env
cp console/example.env console/.env
cp worker/example.env worker/.env

# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Environment Configuration

#### Core API (.env)
```env
# Database
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=oasm
DATABASE_USER=postgres
DATABASE_PASSWORD=password

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Authentication
BETTER_AUTH_SECRET=your-secret-key
BETTER_AUTH_URL=http://localhost:3000

# Server
PORT=3000
NODE_ENV=development

# gRPC
GRPC_PORT=50051
```

#### Console (.env)
```env
VITE_API_URL=http://localhost:3000
VITE_MCP_URL=ws://localhost:3000/mcp
```

#### Worker (.env)
```env
CORE_API_URL=http://localhost:3000
WORKER_TYPE=discovery
```

### Development Commands

#### Core API
```bash
# Development
npm run start:dev

# Build
npm run build

# Production
npm run start:prod

# Testing
npm run test          # Unit tests
npm run test:watch    # Watch mode
npm run test:cov      # Coverage
npm run test:e2e      # E2E tests

# Code quality
npm run lint          # Linting
npm run format        # Formatting

# Protobuf generation
npm run proto:generate
```

#### Console
```bash
# Development
npm run dev

# Build
npm run build

# Preview production build
npm run preview

# Linting
npm run lint

# API client generation
npm run gen:api
```

#### Worker
```bash
# Development
bun run dev

# Build
bun run build
```

## Development Workflow

### Code Quality Standards

#### ESLint Rules (Core API & Console)
- **No explicit `any` types**: Use proper types instead
- **No floating promises**: Always await or handle promises
- **Strict equality**: Use `===` and `!==`
- **Single quotes**: For strings
- **Semicolons**: Required
- **No console.log**: Use logger instead
- **Consistent type imports**: Error on inconsistency

#### Prettier Configuration
- **Tab width**: 2 spaces
- **Single quotes**: true
- **Trailing commas**: all
- **End of line**: auto

#### TypeScript Configuration
- **Strict mode**: Enabled
- **No implicit any**: Enabled
- **Strict null checks**: Enabled
- **ES target**: ES2020
- **Module**: ESNext

### Testing Strategy

#### Core API (Jest)
```bash
# Unit tests
npm run test

# Watch mode
npm run test:watch

# Coverage
npm run test:cov

# E2E tests
npm run test:e2e
```

**Coverage Target**: 80%+ for business logic

#### Console (Vitest)
```bash
# Run tests
npm run test

# Watch mode
npm run test -- --watch

# Coverage
npm run test -- --coverage
```

### Git Workflow

#### Branch Strategy
- **main**: Production-ready code
- **develop**: Development branch
- **feature/***: Feature branches
- **bugfix/***: Bug fix branches
- **hotfix/***: Emergency fixes

#### Commit Convention
```
feat: Add new feature
fix: Fix a bug
docs: Documentation changes
style: Code style changes (formatting, etc.)
refactor: Code refactoring
test: Adding tests
chore: Build/dependency changes
```

### CI/CD Pipeline (GitHub Actions)

#### Workflows
1. **Build & Test**: Run on every push/PR
   - Lint code
   - Run tests
   - Build artifacts

2. **Nightly Build**: Daily builds
   - Run full test suite
   - Security scanning
   - Docker image build

3. **Release**: On tag push
   - Build production images
   - Push to Docker Hub
   - Create GitHub release

## Key Configuration Files

### Core API
- **tsconfig.json**: TypeScript configuration
- **nest-cli.json**: NestJS CLI configuration
- **eslint.config.mjs**: ESLint rules
- **jest.config.ts**: Jest testing configuration

### Console
- **tsconfig.json**: TypeScript configuration
- **tsconfig.app.json**: App-specific TS config
- **tsconfig.node.json**: Node-specific TS config
- **vite.config.ts**: Vite build configuration
- **eslint.config.js**: ESLint rules
- **.prettierrc**: Prettier configuration

### Worker
- **tsconfig.json**: TypeScript configuration
- **bunfig.toml**: Bun configuration (if needed)

## Performance Considerations

### Database Optimization
- **Connection pooling**: TypeORM manages connections efficiently
- **Indexing**: Proper indexes on frequently queried columns
- **Query optimization**: Use relations wisely, avoid N+1 queries
- **Caching**: Redis for frequently accessed data

### API Performance
- **Response caching**: Redis for API responses
- **Pagination**: Always paginate large datasets
- **Compression**: Enable gzip compression
- **Rate limiting**: Prevent abuse

### Worker Performance
- **Horizontal scaling**: Stateless workers can be scaled
- **Queue management**: BullMQ for job distribution
- **Resource limits**: Set CPU/memory limits per worker
- **Connection pooling**: Reuse database connections

## Security Best Practices

### Authentication & Authorization
- **Better Auth**: Modern authentication with OAuth2/OIDC support
- **JWT tokens**: Short-lived access tokens
- **Refresh tokens**: Secure refresh mechanism
- **Role-based access**: Granular permissions

### Data Security
- **Encryption at rest**: PostgreSQL encryption
- **TLS/SSL**: HTTPS for all communications
- **Input validation**: Zod and class-validator
- **SQL injection prevention**: TypeORM parameterized queries

### API Security
- **Rate limiting**: Prevent DDoS attacks
- **CORS**: Proper CORS configuration
- **Helmet**: Security headers
- **Request validation**: Strict input validation

### Secrets Management
- **Environment variables**: Never commit secrets
- **Docker secrets**: For production deployments
- **Vault integration**: For enterprise deployments (future)

## Debugging & Troubleshooting

### Core API Debugging
```bash
# Start with debug mode
npm run start:debug

# Attach debugger
# VS Code: Use launch.json configuration
# Chrome DevTools: chrome://inspect
```

### Console Debugging
```bash
# Vite dev server with HMR
npm run dev

# Browser DevTools
# React DevTools extension
# Redux DevTools (if using Redux)
```

### Worker Debugging
```bash
# Bun debug mode
bun --inspect run dev

# Chrome DevTools for Bun
# chrome://inspect
```

### Common Issues

#### Database Connection Issues
```bash
# Check PostgreSQL status
docker ps | grep postgres

# Check logs
docker logs postgres

# Verify connection
psql -h localhost -U postgres -d oasm
```

#### Redis Connection Issues
```bash
# Check Redis status
docker ps | grep redis

# Check logs
docker logs redis

# Test connection
redis-cli ping
```

#### Port Conflicts
```bash
# Check port usage
netstat -ano | findstr :3000  # Windows
lsof -i :3000                 # Linux/macOS

# Kill process
taskkill /PID <PID> /F        # Windows
kill -9 <PID>                 # Linux/macOS
```

## Future Technology Considerations

### Near Term (3-6 months)
- **GraphQL**: For more flexible API queries
- **WebSockets**: Real-time bidirectional communication
- **Message brokers**: RabbitMQ/Kafka for advanced queuing
- **Search engine**: Elasticsearch for advanced search

### Medium Term (6-12 months)
- **Kubernetes**: Production orchestration
- **Service mesh**: Istio/Linkerd for microservices
- **Observability**: OpenTelemetry for tracing
- **ML/AI**: Machine learning for anomaly detection

### Long Term (12+ months)
- **Serverless**: AWS Lambda/Google Cloud Functions
- **Edge computing**: Cloudflare Workers for global distribution
- **Blockchain**: Immutable audit trails
- **Quantum-resistant crypto**: Future-proof security