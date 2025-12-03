# AI Agents Coding Rules and Guidelines for Open-ASM

## Code Quality Standards

### ESLint Rules

- No explicit `any` types (warn in regular code, off in tests)
- No floating promises: `error`
- No unsafe arguments: `off` (for tests only)
- Consistent type imports: `error`
- No console.log: `error`
- Strict equality: `always`
- Semi-colons required
- Single quotes for strings
- Object curly spacing required
- No eval: `error`
- No new Function: `error`

### Prettier Rules

- Single quotes: `true`
- Trailing commas: `all`
- Tab width: `2`
- End of line: `auto`

### Testing Standards

- 80%+ coverage target for business logic
- Unit tests and E2E tests
- Separate ESLint config for test files (relaxed rules for testing)

## How to Start for Different AI Agents

### 1. Code Review Agent

**How to start**:

- Check configuration files: `core-api/eslint.config.mjs`, `console/.prettierrc`
- Review TypeScript configuration in `tsconfig.json` files
- Evaluate code following ESLint and Prettier rules
- Focus on type safety and consistent patterns

**Key files**:

```
core-api/eslint.config.mjs
console/.prettierrc
tsconfig.json
```

### 2. Security Analysis Agent

**How to start**:

- Review authentication modules: `core-api/src/modules/auth/`
- Check guards and middleware: `core-api/src/common/guards/`
- Examine API keys management: `core-api/src/modules/apikeys/`
- Review MCP security: `core-api/src/mcp/`

**Key files**:

```
core-api/src/modules/auth/
core-api/src/common/guards/
core-api/src/modules/apikeys/
core-api/src/mcp/
console/src/utils/authClient.ts
```

### 3. Performance Optimization Agent

**How to start**:

- Review database queries: `core-api/src/database/`
- Check job processing: `core-api/src/modules/jobs-registry/`
- Analyze worker services: `worker/services/`
- Examine Redis caching: `core-api/src/services/redis/`

**Key files**:

```
core-api/src/database/
core-api/src/modules/jobs-registry/
core-api/src/services/redis/
worker/services/
```

### 4. UI/UX Enhancement Agent

**How to start**:

- Follow Prettier configuration: `console/.prettierrc`
- Review React components: `console/src/components/`
- Check UI components: `console/src/components/ui/`
- Maintain accessibility standards

**Key files**:

```
console/.prettierrc
console/src/components/
console/src/components/ui/
console/src/App.css
```

### 5. Integration Agent

**How to start**:

- Review MCP implementation: `core-api/src/mcp/`
- Check tools integration: `core-api/src/modules/tools/`
- Examine data adapters: `core-api/src/modules/data-adapter/`
- Follow API structure: `core-api/src/common/dtos/`

**Key files**:

```
core-api/src/mcp/
core-api/src/modules/tools/
core-api/src/modules/data-adapter/
core-api/src/common/dtos/
```

### 6. Documentation Agent

**How to start**:

- Review existing docs: `README.md`, `DEVELOPER_GUIDE.md`
- Check API documentation: `core-api/src/common/doc/`
- Follow ESLint comments rules
- Maintain JSDoc for public APIs

**Key files**:

```
README.md
DEVELOPER_GUIDE.md
core-api/src/common/doc/
```

### 7. Testing Agent

**How to start**:

- Review test structure: `core-api/test/`
- Follow testing ESLint rules
- Focus on business logic coverage (80%+)
- Maintain separate test configurations

**Key files**:

```
core-api/test/
core-api/eslint.config.mjs
```

## Development Workflow

### Environment Setup

```bash
# Install dependencies
cd core-api && npm install
cd ../console && npm install
cd ../worker && npm install

# Run with Docker Compose
docker-compose up
```

### Best Practices

- Follow conventional commits
- Use TypeScript strict mode
- Apply SOLID principles
- Write tests for business logic (80%+ coverage)
- Use async/await for asynchronous operations
- Follow ESLint and Prettier configurations
- Maintain consistent code style
- Document public APIs and complex logic
