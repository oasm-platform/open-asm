<p align="center">
  <img src="core-api/public/images/logo.png" alt="OASM Logo" width="150" />
</p>

<h1 align="center">Open Attack Surface Management (OASM)</h1>

<p align="center">
  <a href="https://github.com/oasm-platform/open-asm/releases"><img src="https://img.shields.io/github/v/release/oasm-platform/open-asm?style=for-the-badge&labelColor=black&color=black&logo=github&logoColor=2fc414" alt="Latest Release"></a>
  <a href="https://github.com/oasm-platform/open-asm/actions/workflows/build-nightly.yml"><img src="https://img.shields.io/github/actions/workflow/status/oasm-platform/open-asm/build-nightly.yml?style=for-the-badge&label=CI&labelColor=black&color=black&logo=githubactions&logoColor=2088FF" alt="CI"></a>
  <a href="https://hub.docker.com/r/oasm/oasm-api"><img src="https://img.shields.io/docker/pulls/oasm/oasm-api?style=for-the-badge&logo=docker&labelColor=black&color=black&logoColor=2496ED" alt="Docker Pulls"></a>
  <a href="https://discord.gg/fWqbNHXR8H"><img src="https://img.shields.io/badge/discord-black?style=for-the-badge&logo=discord&labelColor=black&color=black&logoColor=5865F2" alt="Discord"></a>
  <a href="https://www.linkedin.com/company/oasm-platform"><img src="https://custom-icon-badges.demolab.com/badge/LinkedIn-black?style=for-the-badge&logo=linkedin-white&logoColor=0A66C2&labelColor=black&color=black" alt="LinkedIn"></a>
  <a href="https://x.com/OasmPlatform"><img src="https://img.shields.io/static/v1?label=&message=@OasmPlatform&color=black&style=for-the-badge&logo=x&labelColor=black&logoColor=white" alt="X"></a>
  <a href="https://docs.oasm.dev"><img src="https://img.shields.io/badge/documentation--2fc414?style=for-the-badge&logo=gitbook&labelColor=black&color=black&logoColor=2fc414" alt="Documentation"></a>
</p>

AI-powered, open-source Attack Surface Management platform. Discover, monitor, and secure your digital infrastructure — from assets to exposures — backed by distributed scanning, real-time monitoring, and AI-driven analytics.

<p align="center">
  <a href="#features">Features</a> •
  <a href="#system-architecture">System Architecture</a> •
  <a href="#connectors">Connectors</a> •
  <a href="#installation">Installation</a> •
  <a href="#developer-guide">Developer Guide</a> •
  <a href="#screenshots">Screenshots</a>
</p>

## Features

- **Asset Discovery & Management** — Automatically discover and manage internet-facing assets (IPs, ports, services, technologies) as a continuously updated inventory.
- **Vulnerability Assessment** — Detect vulnerabilities and misconfigurations with issue tracking, risk analysis, and remediation guidance.
- **Technology Detection** — Identify frameworks, platforms, and services running on discovered assets.
- **Groups & Targeted Scanning** — Organize assets into groups with custom tool configurations and execution schedules for focused scans.
- **Distributed Scanning Engine** — Horizontally scalable workers with a high-performance scanning engine and fault-tolerant job distribution.
- **Tool Integration** — Pluggable security-tool connectors (nuclei, subfinder, httpx, naabu, dnsx, and more) sourced from the separate [oasm-connectors](https://github.com/oasm-platform/oasm-connectors) repository, plus an extensible SDK for custom tools.
- **Workflow Automation** — Automated scan scheduling, alerts, and remediation workflows.
- **Real-time Monitoring** — Live notifications and a statistics dashboard fed by a streaming event channel.
- **Search & Analytics** — Full-text search, asset filtering, risk trend analysis, and reporting.
- **Integrations** — Connect Slack, Telegram, and Webhooks for event-driven security alerts.
- **AI Assistant Integration** — MCP server enabling AI assistants (OpenAI, Anthropic, Google) to query and analyze asset data via natural language.
- **Geo-IP Enrichment** — Automatic IP geolocation enrichment for discovered assets.
- **File Storage** — S3-compatible object storage for scan artifacts and reports.
- **Multi-workspace** — Isolated environments for different organizations, projects, or environments.

## System Architecture

The system runs on a distributed architecture consisting of:

* A web console for user interaction, asset management, and real-time monitoring.
* A core API service responsible for business logic, data persistence, and job orchestration.
* A queue and caching layer enabling asynchronous job distribution, rate limiting, and system decoupling.
* Distributed workers that execute high-performance scanning tasks, designed for horizontal auto-scaling and fault tolerance.
* A relational database for persistent storage of assets, scan results, and system state.
* S3-compatible object storage for scan artifacts and reports.
* A Geo-IP proxy service for automatic IP geolocation enrichment.
* An MCP (Model Context Protocol) server that provides structured context to AI systems.
* Integration with AI/LLM components for intelligent querying, analysis, and automation over collected asset data.

```mermaid
graph TD
    %% Actors & External
    User[User / Security Team]
    AI[AI Assistant / LLM]
    Internet[Internet / Attack Surface]

    %% Core Components
    subgraph "OASM Platform"
        Console[Web Console]
        API[Core API Service]
        DB[(Database)]
        Queue[(Queue & Cache)]
        MCP[MCP Server]
        Storage[(Object Storage)]
        GeoIP[Geo-IP Proxy]

        subgraph "Execution Plane"
            W1[Worker 1]
            W2[Worker 2]
            WN[Worker N]
        end
    end

    %% Relationships
    User -->|Manage & Monitor| Console
    Console <-->|REST API| API

    API <-->|Persist Data| DB
    API <-->|Queue / Cache| Queue
    API <-->|Store Artifacts| Storage
    API <-->|IP Enrichment| GeoIP

    %% Job Flow
    API <-->|Jobs| W1
    API <-->|Jobs| W2
    API <-->|Jobs| WN

    %% Scan
    W1 -->|Scan| Internet
    W2 -->|Scan| Internet
    WN -->|Scan| Internet

    %% AI Flow
    AI <-->|Query Context| MCP
    MCP <-->|Fetch Asset Data| API
```

## Connectors

Scanning tools are not hard-wired into this repository. They live in a companion repository, [oasm-connectors](https://github.com/oasm-platform/oasm-connectors), which ships each tool as an isolated Docker image wrapping a small Go SDK adapter. Open ASM consumes that catalog as data: it reads the connector manifest, resolves the image for a requested tool, and lets the worker run it on demand.

```mermaid
flowchart LR
    MAN["oasm-connectors<br/>manifest.json"] -->|"task sync-connectors"| CORE[Core API]
    CORE -->|"ExecutionCommand: image + inputs"| WK[Worker]
    WK -->|"pull connector image"| DR[Docker Runtime]
    DR --> CT[Connector container]
    CT -.->|"stream findings"| WK
    WK -.->|"persist findings"| CORE
```

How the two repositories fit together:

1. **Catalog** — `oasm-connectors` aggregates every `<category>/<connector>/manifest.yaml` into a single `manifest.json` (built by its `combine-manifest` command). Each entry declares the connector's image, capabilities, inputs schema, and resource defaults.
2. **Sync** — `task sync-connectors` pulls that manifest into `core-api/resources/connectors/manifest.json`, so the platform always knows which connectors exist and what each one accepts.
3. **Dispatch** — for a scan, Core resolves the connector image from the manifest, validates the inputs against the connector's schema, and hands the worker an execution command carrying the image reference and the resolved inputs.
4. **Execution** — the worker pulls the image and starts the container, passing the inputs through.
5. **Findings** — inside the container the SDK adapter runs the wrapped tool and streams findings back to the worker, which persists them through Core into the asset inventory.

Because connectors are versioned images referenced by the manifest, adding or upgrading a tool never requires an Open ASM release — you publish the connector in [oasm-connectors](https://github.com/oasm-platform/oasm-connectors) and re-sync the manifest (see that repository's README for the connector contract, SDK adapter interface, and Dockerfile pattern).

## Screenshots

![Dashboard](docs/images/dashboard.png)

![Assets1](docs/images/assets_1.png)

![Assets2](docs/images/assets_2.png)

![Technologies](docs/images/technologies.png)

![Vulnerabilities1](docs/images/vulnerabilities_1.png)

![Vulnerabilities2](docs/images/vulnerabilities_2.png)

![Tools](docs/images/tools.png)

![Workers](docs/images/workers.png)

![McpConnect](docs/images/mcp.png)

![JobRegistry](docs/images/job_registry.png)

![Integrations1](docs/images/integrations_1.png)

![Integrations2](docs/images/integrations_2.png)

![Agent1](docs/images/agent_1.png)

![Agent2](docs/images/agent_2.png)

## Installation

### Docker (Recommended)

To quickly get started with OASM using Docker:

1. Clone the repository:

   ```bash
   git clone https://github.com/oasm-platform/open-asm.git
   cd open-asm
   ```

2. Copy the example environment files:

   ```bash
   cp core-api/example.env core-api/.env
   cp console/example.env console/.env
   cp worker/example.env worker/.env
   ```

3. Pull the connector catalog:

   ```bash
   task sync-connectors
   ```

4. Start the services:

   ```bash
   docker compose up -d --build
   ```

This will launch the entire system, including the console, core API, workers, database, queue, Geo-IP proxy, and object storage. Access the console at `http://localhost:3000`.

### Pre-built Images

You can also use pre-built images from Docker Hub:

```bash
docker compose -f docker-compose.yml up -d
```

Images: `oasm/oasm-console`, `oasm/oasm-api`, `oasm/oasm-worker`

## Developer Guide

For detailed instructions on setting up your development environment, running services, and contributing, please refer to our dedicated [Developer Guide](DEVELOPER_GUIDE.md).

### Quick Start

```bash
# Install all dependencies and worker tools
task init

# Start API + Console dev servers
task dev

# Run workers locally
task worker:dev
```

### Key Commands

```bash
task test            # Run API tests
task lint            # Lint API + Console
task build           # Build all services
task docker-compose  # Start full stack with Docker
task sync-connectors # Refresh the connector catalog from oasm-connectors
task gen-api         # Regenerate console API client
task proto           # Regenerate gRPC stubs
task migration:run   # Run database migrations
```
