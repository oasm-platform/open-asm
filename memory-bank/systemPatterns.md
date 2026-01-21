# System Patterns

## System Architecture

### Distributed Architecture Pattern

OASM uses a **distributed microservices architecture** with three main components:

```
┌─────────────────────────────────────────────────────────────┐
│                     User Interface Layer                     │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                    Web Console (React)                │  │
│  │  - Dashboard & Monitoring                            │  │
│  │  - Asset Management                                  │  │
│  │  - Vulnerability Tracking                            │  │
│  │  - Workflow Configuration                            │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ REST API
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Business Logic Layer                      │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                 Core API (NestJS)                     │  │
│  │  - Authentication & Authorization                     │  │
│  │  - Asset Discovery & Management                       │  │
│  │  - Vulnerability Assessment                           │  │
│  │  - Job Orchestration (BullMQ)                         │  │
│  │  - MCP Server for AI Integration                      │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────┼─────────┐
                    │         │         │
                    ▼         ▼         ▼
          ┌─────────────┐ ┌──────┐ ┌──────────┐
          │   Database  │ │ Redis│ │   gRPC   │
          │  (PostgreSQL)│ │Cache │ │  Workers │
          └─────────────┘ └──────┘ └──────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Execution Layer                           │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Distributed Workers (Bun)                │  │
│  │  - Security Tool Integration                         │  │
│  │  - Asset Discovery                                   │  │
│  │  - Vulnerability Scanning                            │  │
│  │  - Technology Detection                              │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Key Architectural Decisions

1. **Separation of Concerns**
   - **Console**: Pure UI layer, no business logic
   - **Core API**: Central business logic and data orchestration
   - **Workers**: Stateless, scalable execution units

2. **Communication Patterns**
   - **Console ↔ API**: REST/HTTP for user interactions
   - **API ↔ Workers**: gRPC for high-performance job dispatching
   - **API ↔ Database**: TypeORM for data persistence
   - **API ↔ Redis**: BullMQ for job queues and caching
   - **API ↔ AI Assistants**: MCP protocol for natural language queries

3. **Data Flow Pattern**
   ```
   User Action → Console → API → Job Queue → Worker → Results → API → Database
                                                              ↓
                                                       Console (Real-time updates via SSE)
   ```

## Design Patterns in Use

### 1. Repository Pattern (Core API)

**Location**: `core-api/src/common/repositories/`

**Purpose**: Abstract database operations from business logic

**Example**:
```typescript
// AssetRepository.ts
@Injectable()
export class AssetRepository {
  constructor(
    @InjectRepository(Asset)
    private readonly repository: Repository<Asset>,
  ) {}

  async findWithRelations(id: string): Promise<Asset> {
    return this.repository.findOne({
      where: { id },
      relations: ['vulnerabilities', 'technologies', 'workspace'],
    });
  }
}
```

### 2. Service Layer Pattern (Core API)

**Location**: `core-api/src/modules/*/services/`

**Purpose**: Encapsulate business logic and orchestrate repositories

**Example**:
```typescript
// AssetService.ts
@Injectable()
export class AssetService {
  constructor(
    private readonly assetRepository: AssetRepository,
    private readonly vulnerabilityService: VulnerabilityService,
  ) {}

  async discoverAssets(workspaceId: string, targets: string[]) {
    // Business logic for asset discovery
    const assets = await this.assetRepository.findByTargets(targets);
    await this.vulnerabilityService.scanAssets(assets);
    return assets;
  }
}
```

### 3. Module Pattern (NestJS)

**Location**: `core-api/src/modules/`

**Purpose**: Feature encapsulation with controllers, services, and entities

**Example Structure**:
```
modules/
├── assets/
│   ├── assets.controller.ts
│   ├── assets.service.ts
│   ├── assets.module.ts
│   └── entities/
│       └── asset.entity.ts
├── vulnerabilities/
│   ├── vulnerabilities.controller.ts
│   ├── vulnerabilities.service.ts
│   ├── vulnerabilities.module.ts
│   └── entities/
│       └── vulnerability.entity.ts
└── auth/
    ├── auth.controller.ts
    ├── auth.service.ts
    ├── auth.module.ts
    └── guards/
        └── auth.guard.ts
```

### 4. Hook Pattern (React Console)

**Location**: `console/src/hooks/`

**Purpose**: Reusable state and logic management for React components

**Example**:
```typescript
// use-assistant.ts
export const useAssistant = () => {
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  
  const sendMessage = async (content: string) => {
    // MCP integration logic
    const response = await mcpClient.query(content);
    setMessages(prev => [...prev, { content, response }]);
  };

  return { messages, sendMessage };
};
```

### 5. Worker Pattern (Bun Workers)

**Location**: `worker/services/`

**Purpose**: Stateless execution of security scanning tasks

**Example**:
```typescript
// services/scanner.ts
export class ScannerService {
  async scanTarget(target: string): Promise<ScanResult> {
    // Execute security tools
    const results = await Promise.all([
      this.runNuclei(target),
      this.runSubfinder(target),
      this.runNaabu(target),
    ]);
    
    return this.aggregateResults(results);
  }
}
```

### 6. MCP Integration Pattern

**Location**: `core-api/src/mcp/`

**Purpose**: Enable AI assistants to query and interact with OASM data

**Example**:
```typescript
// mcp.tools.ts
export const mcpTools = [
  {
    name: 'get-assets',
    description: 'Get assets for a workspace',
    inputSchema: z.object({
      workspaceId: z.string(),
      filters: z.object({}).optional(),
    }),
    handler: async (params) => {
      return assetService.getAssets(params.workspaceId, params.filters);
    },
  },
];
```

## Critical Implementation Paths

### 1. Asset Discovery Workflow

```
1. User configures scan targets (domains/IP ranges)
2. API creates job in BullMQ queue
3. Worker picks up job via gRPC
4. Worker executes discovery tools (subfinder, naabu, etc.)
5. Worker sends results back via gRPC
6. API processes and stores results in PostgreSQL
7. API triggers vulnerability scan for new assets
8. Real-time updates sent to Console via SSE
```

**Key Files**:
- `core-api/src/modules/jobs-registry/` - Job orchestration
- `worker/services/discovery.ts` - Discovery execution
- `core-api/src/mcp/mcp.tools.ts` - MCP tool definitions

### 2. Vulnerability Assessment Flow

```
1. Asset discovered or scheduled scan triggered
2. API creates vulnerability scan job
3. Worker executes scanning tools (nuclei, etc.)
4. Results parsed and normalized
5. Risk scoring applied
6. Vulnerabilities stored with remediation guidance
7. Notifications sent to users
8. Dashboard updated in real-time
```

**Key Files**:
- `core-api/src/modules/vulnerabilities/` - Vulnerability management
- `worker/services/vulnerability-scanner.ts` - Scanning logic
- `console/src/pages/vulnerabilities/` - UI for vulnerability tracking

### 3. AI Assistant Integration

```
1. AI assistant connects via MCP protocol
2. Queries available tools and capabilities
3. User asks natural language question
4. MCP server validates and processes request
5. Core API fetches relevant data
6. Results formatted for AI consumption
7. AI generates insights and recommendations
```

**Key Files**:
- `core-api/src/mcp/` - MCP server implementation
- `core-api/src/mcp/mcp.tools.ts` - Tool definitions
- `core-api/src/mcp/mcp.service.ts` - Service layer

### 4. Real-time Monitoring

```
1. WebSocket/SSE connection established
2. Client subscribes to workspace events
3. API publishes events on job completion, discoveries, etc.
4. Console updates dashboard in real-time
5. Notifications displayed to user
```

**Key Files**:
- `console/src/hooks/use-sse.ts` - SSE client
- `console/src/hooks/use-notification-stream.ts` - Notification handling
- `core-api/src/services/notification.service.ts` - Event publishing

## Data Flow Patterns

### 1. Command Pattern (Job Processing)

**Use**: Asynchronous task execution

**Implementation**:
```typescript
// Job creation
const job = await queue.add('scan-asset', {
  assetId: asset.id,
  scanType: 'vulnerability',
});

// Job processing
worker.process('scan-asset', async (job) => {
  const result = await scanner.scan(job.data.assetId);
  return result;
});
```

### 2. Event Pattern (Real-time Updates)

**Use**: Decoupled communication between services

**Implementation**:
```typescript
// Event emission
eventEmitter.emit('asset.discovered', { asset, workspaceId });

// Event handling
eventEmitter.on('asset.discovered', (data) => {
  notificationService.sendToWorkspace(data.workspaceId, {
    type: 'ASSET_DISCOVERED',
    data: data.asset,
  });
});
```

### 3. Strategy Pattern (Tool Integration)

**Use**: Pluggable security tool implementations

**Implementation**:
```typescript
interface ScanStrategy {
  scan(target: string): Promise<ScanResult>;
}

class NucleiStrategy implements ScanStrategy {
  async scan(target: string): Promise<ScanResult> {
    // Nuclei-specific implementation
  }
}

class CustomToolStrategy implements ScanStrategy {
  async scan(target: string): Promise<ScanResult> {
    // Custom tool implementation
  }
}
```

### 4. Factory Pattern (Worker Creation)

**Use**: Dynamic worker instantiation based on task type

**Implementation**:
```typescript
class WorkerFactory {
  static createWorker(type: WorkerType): Worker {
    switch (type) {
      case 'discovery':
        return new DiscoveryWorker();
      case 'vulnerability':
        return new VulnerabilityWorker();
      case 'technology':
        return new TechnologyWorker();
    }
  }
}
```

## Security Patterns

### 1. Defense in Depth

- **Network Layer**: Docker network isolation
- **Application Layer**: Input validation, rate limiting
- **Data Layer**: Encryption at rest, parameterized queries
- **Access Layer**: Role-based access control (RBAC)

### 2. Zero Trust Architecture

- Every request authenticated and authorized
- No implicit trust based on network location
- Continuous verification of identity and permissions

### 3. Secure by Default

- Default deny-all for new features
- Explicit permission grants required
- Secure defaults in configuration

## Performance Patterns

### 1. Caching Strategy

**Redis Usage**:
- Session storage
- Job queue management (BullMQ)
- Frequently accessed data (asset lists, user preferences)
- Rate limiting counters

**Implementation**:
```typescript
// Cache decorator
@Injectable()
export class AssetService {
  @CacheKey('assets')
  @CacheTTL(300) // 5 minutes
  async getAssets(workspaceId: string) {
    return this.assetRepository.findByWorkspace(workspaceId);
  }
}
```

### 2. Connection Pooling

**PostgreSQL**: TypeORM connection pooling
- Default pool size: 10 connections
- Automatic connection management
- Connection reuse for performance

### 3. Async Processing

**BullMQ Queues**:
- Separate queues for different job types
- Priority queues for critical tasks
- Rate limiting to prevent overload
- Retry logic with exponential backoff

### 4. Horizontal Scaling

**Worker Scaling**:
- Stateless workers can be scaled horizontally
- Docker Compose for local development
- Kubernetes-ready for production
- Auto-scaling based on queue depth

## Testing Patterns

### 1. Test Pyramid

```
    ┌─────────────┐
    │   E2E Tests │  (5%)
    └─────────────┘
    ┌─────────────┐
    │Integration  │  (15%)
    └─────────────┘
    ┌─────────────┐
    │ Unit Tests  │  (80%)
    └─────────────┘
```

### 2. Mocking Strategy

**Core API**:
- Jest mocks for external services
- In-memory database for E2E tests
- Mock repositories for unit tests

**Console**:
- MSW (Mock Service Worker) for API mocking
- Vitest for component testing
- React Testing Library for user interactions

### 3. Test Data Management

- Factory functions for test data
- Database fixtures for E2E tests
- Faker.js for realistic test data

## Deployment Patterns

### 1. Container Orchestration

**Docker Compose** (Development):
```yaml
services:
  api:
    build: ./core-api
    ports: ["3000:3000"]
  
  console:
    build: ./console
    ports: ["5173:5173"]
  
  postgres:
    image: postgres:15
    ports: ["5432:5432"]
  
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
  
  worker:
    build: ./worker
    depends_on: [api, redis]
```

### 2. Environment Configuration

**Pattern**: Environment-based configuration
- `.env` files for local development
- Environment variables for production
- Configuration validation on startup

### 3. Health Checks

**Implementation**:
```typescript
// Health check endpoint
@Controller('health')
export class HealthController {
  @Get()
  async healthCheck() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      services: {
        database: await this.dbHealth(),
        redis: await this.redisHealth(),
      },
    };
  }
}
```

## Monitoring & Observability

### 1. Logging Pattern

**Structured Logging**:
```typescript
logger.log({
  event: 'asset.discovered',
  assetId: asset.id,
  workspaceId: workspaceId,
  timestamp: new Date().toISOString(),
});
```

### 2. Metrics Collection

**Key Metrics**:
- Job processing time
- Asset discovery rate
- Vulnerability detection rate
- API response times
- Error rates by endpoint

### 3. Tracing

**Distributed Tracing**:
- Request ID propagation
- Span creation for critical paths
- Correlation across services

## Evolution Patterns

### 1. Feature Flags

**Use**: Gradual feature rollout
```typescript
if (featureFlags.isEnabled('new-scanning-engine')) {
  return newEngine.scan(target);
} else {
  return legacyEngine.scan(target);
}
```

### 2. API Versioning

**Strategy**: URL-based versioning
```
/api/v1/assets
/api/v2/assets
```

### 3. Database Migrations

**Tool**: TypeORM migrations
- Version-controlled schema changes
- Rollback capability
- Automated in CI/CD

## Integration Patterns

### 1. Webhook Integration

**Use**: External system notifications
```typescript
// Webhook configuration
const webhook = {
  url: 'https://example.com/webhook',
  events: ['asset.discovered', 'vulnerability.found'],
  secret: 'webhook-secret',
};

// Event trigger
webhookService.trigger(webhook, event);
```

### 2. SIEM Integration

**Pattern**: Standard log formats
- CEF (Common Event Format)
- JSON structured logging
- Real-time event streaming

### 3. Ticketing System Integration

**Use**: Automated issue tracking
```typescript
// Create ticket in external system
const ticket = await ticketingService.create({
  title: vulnerability.title,
  description: vulnerability.description,
  priority: vulnerability.riskScore,
  assignee: vulnerability.assignedTo,
});
```

## Best Practices Summary

1. **Single Responsibility**: Each module/service has one clear purpose
2. **Dependency Injection**: Loose coupling through DI (NestJS)
3. **Immutable Data**: Prefer immutability in state management
4. **Async/Await**: Consistent use of async patterns
5. **Error Handling**: Comprehensive error handling with proper logging
6. **Type Safety**: Strict TypeScript usage throughout
7. **Documentation**: JSDoc for public APIs, inline comments for complex logic
8. **Testing**: High coverage with meaningful tests
9. **Security**: Defense in depth, secure by default
10. **Performance**: Caching, connection pooling, async processing