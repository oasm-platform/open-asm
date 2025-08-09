# 🎯 Open Attack Surface Management (OASM)

Open-source platform for cybersecurity Attack Surface Management. Built to help security teams identify, monitor, and manage external assets and potential security exposures across their digital infrastructure.

## Table of Contents

- [Core Features](#core-features)
- [System Architecture](#system-architecture)
- [Worker Types & Built-in Tools](#worker-types--built-in-tools)
- [Developer Guide](#developer-guide)
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
- Security Tools: Integrated Subfinder, DNSX, HTTPX, Naabu & Nuclei

## System Architecture

- Core API (NestJS + TypeScript + Better Auth + PostgreSQL): RESTful endpoints, job orchestration, data persistence & worker coordination
- Console (React + TypeScript + Vite): Modern UI with real-time monitoring, data visualization & asset management
- Workers (Bun + TypeScript): High-performance distributed scanning with horizontal scalability

## Worker Types & Built-in Tools

| Worker Type   | Tool      | Description                   | Purpose                                    |
| ------------- | --------- | ----------------------------- | ------------------------------------------ |
| Subdomain     | Subfinder | Passive subdomain enumeration | Discover hidden subdomains                 |
| DNS           | DNSX      | DNS resolution and validation | Validate and resolve domains               |
| HTTP          | HTTPX     | HTTP/HTTPS service analysis   | Identify web services and technologies     |
| Port          | Naabu     | Network port scanning         | Discover exposed services and entry points |
| Vulnerability | Nuclei    | Vulnerability scanning        | Scan for security vulnerabilities          |

## Developer Guide

For detailed instructions on setting up your development environment, running services, and contributing, please refer to our dedicated [Developer Guide](DEVELOPER_GUIDE.md).

## License

MIT License - see [LICENSE](LICENSE) file for details.

---

**⭐ If you find Open-ASM useful, please star us on GitHub!**

**🛡️ Built for security teams, by security professionals.**
