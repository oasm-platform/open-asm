# 🎯 Open-Attack Surface Management (OASM)

Open-source platform for cybersecurity Attack Surface Management. Built to help security teams identify, monitor, and manage external assets and potential security exposures across their digital infrastructure.

## ✨ Core Features

- **🎯 Asset Management**: Auto-discovery, classification, tracking & inventory
- **👥 Auth & Authorization**: User management, RBAC, API keys & sessions  
- **⚙️ Job Management**: Scheduling, queuing, monitoring & history
- **🎯 Target Management**: Define, group, validate & monitor scan targets
- **🤖 Worker Management**: Distributed workers with auto-scaling & health monitoring
- **🏢 Workspace Management**: Multi-tenant isolation with team collaboration
- **🔧 Security Tools**: Integrated Subfinder, DNSX, HTTPX & Naabu

## 🏗️ System Architecture

- **🖥️ Core API** (NestJS + TypeScript + Better Auth + PostgreSQL): RESTful endpoints, job orchestration, data persistence & worker coordination
- **🌐 Console** (React + TypeScript + Vite): Modern UI with real-time monitoring, data visualization & asset management  
- **⚡ Workers** (Bun + TypeScript): High-performance distributed scanning with horizontal scalability

## 🔧 Worker Types & Tools

| Worker Type | Tool | Description | Purpose |
|-------------|------|-------------|---------|
| **🔍 Subdomain** | Subfinder | Passive subdomain enumeration | Discover hidden subdomains |
| **🌐 DNS** | DNSX | DNS resolution and validation | Validate and resolve domains |
| **🔗 HTTP** | HTTPX | HTTP/HTTPS service analysis | Identify web services and technologies |
| **🔌 Port** | Naabu | Network port scanning | Discover exposed services and entry points |

## 🚀 Quick Start

### Prerequisites
- **Node.js** v18+
- **Bun** runtime (latest)
- **PostgreSQL** v12+
- **Docker & Docker Compose** (optional)

### 🐳 Docker Deployment (Recommended)
```bash
# Clone repository
git clone https://github.com/oasm-platform/open-asm.git
cd open-asm

# Configure environment
cp core-api/example.env core-api/.env
cp worker/example.env worker/.env

# Edit configuration
nano core-api/.env
nano worker/.env

# Start all services
task docker-compose
```

### 💻 Development Setup
```bash
# Install dependencies
npm run install

# Start all services
task dev

# Or run individually:
task api:dev     # API server
task console:dev # Web console
task worker:dev  # Worker processes
```

## 📁 Project Structure
```
open-asm/
├── 🖥️ core-api/           # NestJS API server
│   ├── src/               # Source code
│   ├── example.env        # Environment template
│   └── package.json
├── 🌐 console/            # React web interface
│   ├── src/               # React components
│   ├── public/            # Static assets
│   └── package.json
├── ⚡ worker/             # Bun-based workers
│   ├── services/          # Worker services
│   ├── tools/             # Security tools integration
│   ├── example.env        # Worker environment
│   └── package.json
├── 📚 open-api/           # Auto-generated API docs
├── 🐳 docker-compose.yml  # Container orchestration
├── ⚙️ taskfile.yml        # Task automation
└── 📖 README.md           # Documentation
```

## 🔗 Access Points

| Service | URL | Description |
|---------|-----|-------------|
| **🌐 Web Console** | `http://localhost:5173` | Main web interface |
| **📚 API Docs** | `http://localhost:6276/api/docs` | Swagger UI documentation |
| **🔐 Auth Docs** | `http://localhost:6276/api/auth/docs` | Authentication endpoints |
| **📋 OpenAPI Spec** | `http://localhost:6276/api/docs-json` | OpenAPI specification |

## ⚙️ Configuration

### Core API (.env)
```env
# Config database
POSTGRES_HOST=localhost
POSTGRES_USERNAME=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_PORT=5432
POSTGRES_DB=open_asm
POSTGRES_SSL=false

# API 
PORT=6276
OASM_ADMIN_TOKEN=change_me
```

### Console (.env)
```env
# API Connection
VITE_API_URL=http://localhost:6276
```

### Worker (.env)
```env
# API Connection
API=http://localhost:6276
API_KEY=change_me

# Worker Configuration
MAX_JOBS=10
```

## 🤝 Contributing

1. **🍴 Fork** the repository
2. **🌿 Create** feature branch: `git checkout -b feature/amazing-feature`
3. **💾 Commit** changes: `git commit -m 'Add amazing feature'`
4. **📤 Push** to branch: `git push origin feature/amazing-feature`
5. **🔄 Open** Pull Request


## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

---

**⭐ If you find Open-ASM useful, please star us on GitHub!**

**🛡️ Built for security teams, by security professionals.**
