# Dual-Agent Local Coding Service

> **🤖 AI Agent?** Jump to [Quick Start for AI Agents](#quick-start-for-ai-agents) for autonomous installation.

---

## Quick Start for AI Agents

**This repository supports zero-touch installation for AI agents.** If you are Claude Code, Gemini CLI, GitHub Copilot, or another LLM-based agent, follow these commands for autonomous deployment:

```bash
# 1. Clone repository
git clone https://github.com/YOUR_ORG/alcs.git
cd alcs

# 2. Run autonomous bootstrap (handles all dependencies, database, build)
./bootstrap.sh

# 3. Verify installation (comprehensive smoke test)
python3 verify_install.py --verbose

# 4. Configure Ollama models (if not already installed)
ollama pull qwen2.5-coder:32b  # Agent Alpha (code generator)
ollama pull deepseek-r1:14b     # Agent Beta (code reviewer)

# 5. Start the MCP server
npm run mcp
```

**Installation time:** ~5-10 minutes | **Disk space:** ~50GB (models included)

### For Detailed Agent Instructions

See **[AGENT_INSTRUCTIONS.md](AGENT_INSTRUCTIONS.md)** for:
- Complete troubleshooting decision trees
- Self-healing procedures for common failures
- Verification checkpoints and health checks
- Configuration reference and tuning guide

### System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| **OS** | Ubuntu 20.04+ / macOS 12+ | Ubuntu 22.04 / macOS 13+ |
| **CPU** | 4 cores | 8+ cores |
| **RAM** | 16 GB | 32 GB |
| **Storage** | 50 GB free | 100 GB SSD |
| **Network** | Stable internet for setup | - |

### What Gets Installed

- ✅ Node.js v18+ (via nvm if needed)
- ✅ npm dependencies (TypeScript, Prisma, etc.)
- ✅ SQLite database with schema
- ✅ Prisma 7.x ORM with SQLite adapter
- ✅ Compiled JavaScript in `dist/`
- ✅ MCP server ready to run

### Environment Variables

Copy `.env.example` to `.env` (done automatically by bootstrap) and customize:

```bash
# Database
DATABASE_URL="file:./prisma/dev.db"

# Ollama LLM Server
OLLAMA_BASE_URL="http://localhost:11434"

# Agent Models
AGENT_ALPHA_MODEL="qwen2.5-coder:32b"  # Code generator
AGENT_BETA_MODEL="deepseek-r1:14b"      # Code reviewer

# Session Configuration
DEFAULT_MAX_ITERATIONS=5
DEFAULT_QUALITY_THRESHOLD=85
TASK_TIMEOUT_MINUTES=30
```

**Full reference:** See [.env.example](.env.example)

### Troubleshooting Quick Guide

| Issue | Solution |
|-------|----------|
| `node: command not found` | Run: `./bootstrap.sh` (installs Node.js via nvm) |
| `Ollama server not accessible` | Install: https://ollama.com/download |
| `Database migration failed` | Run: `rm prisma/dev.db && npx prisma migrate dev --name init` |
| `npm install failed` | Clear cache: `npm cache clean --force && npm install` |
| `Permission denied` | Check: `chmod +x bootstrap.sh verify_install.py` |

**For exhaustive troubleshooting:** See [AGENT_INSTRUCTIONS.md](AGENT_INSTRUCTIONS.md#troubleshooting)

### Manual Installation (If Bootstrap Fails)

```bash
# 1. Install Node.js v18+
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.nvm/nvm.sh
nvm install --lts

# 2. Install dependencies
npm install

# 3. Setup database
cp .env.example .env
npx prisma generate
npx prisma migrate dev --name init

# 4. Build project
npm run build

# 5. Verify
python3 verify_install.py --verbose
```

---

## 1. Project Overview

This project implements a **Dual-Agent Local Coding Service** exposed via the Model Context Protocol (MCP). The system is designed to enable high-reasoning proprietary models (e.g., Claude, Gemini, Copilot) to delegate complex coding tasks to specialized, fine-tuned, and cost-efficient local language models running on consumer-grade hardware.

The core of the system is a review-revise loop between two agents:
-   **Agent Alpha (Code Generator):** Generates code based on a task specification.
-   **Agent Beta (Reviewer/Validator):** Reviews Agent Alpha's output, provides feedback, and calculates a quality score.

This architecture leverages the reasoning capabilities of large cloud-based AI while taking advantage of the privacy, speed, and cost-efficiency of local LLM inference for compute-intensive tasks.

## 2. Features

-   **Dual-Agent Architecture:** Separates code generation and review for higher quality output.
-   **MCP Toolset:** Exposes a rich set of tools for controlling the development loop, managing context, and configuring the system.
-   **Pluggable LLM Providers:** Easily configure different local LLM providers (Ollama, LM Studio) or API providers (OpenRouter) at runtime.
-   **State Machine:** Manages the session lifecycle through a well-defined state machine (IDLE, GENERATING, REVIEWING, etc.).
-   **Loop Termination:** Includes robust logic to prevent infinite loops through iteration caps, timeouts, stagnation detection, and content oscillation detection.
-   **Dynamic Configuration:** Supports runtime configuration of LLM endpoints and system prompts.
-   **Extensive Unit & Integration Tests:** A comprehensive test suite ensures the reliability of all components.

## 3. Architecture

The system uses a three-layer architecture:

1.  **Orchestration Layer:** High-level AI clients (e.g., Gemini CLI, Claude Code) that initiate and manage tasks.
2.  **MCP Server Layer:** A TypeScript-based bridge that exposes the toolset, manages state, and coordinates the agents.
3.  **Execution Layer:** Comprises Agent Alpha and Agent Beta, which run on local hardware and perform the core generation and review tasks.

## 4. Getting Started

### Prerequisites

-   [Node.js](https://nodejs.org/) (v18 or higher recommended)
-   [npm](https://www.npmjs.com/) (usually comes with Node.js)
-   A local LLM provider like [Ollama](https://ollama.ai/) or [LM Studio](https://lmstudio.ai/) running and serving a model.

### Installation

1.  Clone the repository:
    ```bash
    git clone <repository-url>
    cd alcs
    ```
2.  Install the dependencies:
    ```bash
    npm install
    ```

### Configuration

1.  Rename the `config.json.example` file to `config.json` (or create a new one).
2.  Modify `config.json` to match your local setup.

**Example `config.json`:**
```json
{
  "deployment_mode": "workstation",
  "max_concurrent_requests": 5,
  "endpoints": {
    "alpha": {
      "type": "ollama",
      "base_url": "http://localhost:11434",
      "model": "codellama"
    },
    "beta": {
      "type": "openrouter",
      "base_url": "https://openrouter.ai/api/v1",
      "model": "google/gemini-pro",
      "api_key": "YOUR_OPENROUTER_API_KEY"
    }
  },
  "system_prompts": {
    "alpha": {
      "base_prompt": "You are Agent Alpha, an expert software engineer..."
    },
    "beta": {
      "base_prompt": "You are Agent Beta, an expert code reviewer..."
    }
  },
  "policies_path": "./policies",
  "log_path": "./logs/alcs.log",
  "log_level": "info"
}
```

## 5. Usage

This project is a library of tools and services. The main entry point for an orchestrator would be to import and use the MCP tools.

**Conceptual Example:**
```typescript
import { execute_task_spec } from './src/tools/executeTaskSpec';
import { run_critic_review } from './src/tools/runCriticReview';
import { StateMachine } from './src/stateMachine';

async function main() {
  // 1. Start a task
  const { session_id } = await execute_task_spec({ spec: { ... } });

  // 2. Run the review-revise loop
  // ... orchestrator logic to call agents, run reviews, check LoopGuard ...

  // 3. Handoff the final artifact
  // ...
}
```

## 6. Testing

The project includes a comprehensive suite of unit and integration tests. To run all tests:
```bash
npm test
```
To run tests for a specific file:
```bash
npm test -- tests/path/to/your/test.test.ts
```

## 7. Production Deployment

ALCS includes comprehensive production readiness features for secure, scalable, and observable deployments.

### Production Features

- **Authentication**: API key and JWT-based authentication with permission controls
- **Rate Limiting**: Token bucket algorithm with configurable limits per endpoint
- **Input Validation**: Schema-based validation with security scanning (SQL injection, XSS, path traversal)
- **Response Caching**: In-memory caching with TTL support for improved performance
- **Monitoring**: Prometheus metrics and Grafana dashboards for observability
- **Logging**: Structured JSON logging with correlation IDs
- **Health Checks**: Liveness, readiness, and startup probes for Kubernetes
- **High Availability**: Multi-replica deployment with autoscaling (HPA)

### Deployment Options

**Kubernetes (Recommended for Production):**
```bash
# Quick start
cd k8s
kubectl apply -k .

# See k8s/README.md for detailed instructions
```

**Docker Compose:**
```bash
# Quick start
docker-compose up -d

# See docker/README.md for detailed instructions
```

### Documentation

**Deployment & Operations:**
- [Production Deployment Guide](docs/PRODUCTION-DEPLOYMENT.md) - Complete deployment guide for all environments
- [Operations Runbook](docs/OPERATIONS-RUNBOOK.md) - Day-to-day operations and incident response
- [Kubernetes README](k8s/README.md) - Kubernetes-specific deployment instructions

**Security:**
- [Security Hardening Guide](docs/SECURITY-HARDENING.md) - Comprehensive security best practices
- [Authentication Guide](docs/AUTHENTICATION.md) - API key and JWT authentication setup
- [Input Validation Guide](docs/INPUT-VALIDATION.md) - Input validation and security protections

**Monitoring & Performance:**
- [Monitoring & Alerting Guide](docs/MONITORING-ALERTING.md) - Prometheus, Grafana, and alerting setup
- [Rate Limiting Guide](docs/RATE-LIMITING.md) - Rate limiting configuration and usage
- [Caching Guide](docs/CACHING.md) - Response caching for performance optimization

### Quick Configuration

**Generate Secrets:**
```bash
# Generate API key
npm run auth:generate-api-key

# Generate JWT secret
npm run auth:generate-jwt-secret

# Generate JWT token for testing
npm run auth:generate-jwt-token admin
```

**Environment Variables:**
```bash
# Copy example environment file
cp .env.example .env.production

# Edit with production values
# - ENABLE_AUTHENTICATION=true
# - API_KEY=<generated-api-key>
# - JWT_SECRET=<generated-jwt-secret>
# - ENABLE_RATE_LIMITING=true
# - DATABASE_URL=<production-database-url>
```

**Health Check:**
```bash
# Check service health
curl https://alcs.example.com/health

# Check metrics
curl https://alcs.example.com/metrics
```

## 8. Project Structure

```
/
├── src/
│   ├── agents/         # Agent Alpha and Agent Beta logic
│   ├── handlers/       # State handlers (e.g., escalation)
│   ├── providers/      # Connectors for LLM providers (Ollama, etc.)
│   ├── services/       # Core services (config, logger, scoring)
│   ├── tools/          # MCP tools exposed to the orchestrator
│   ├── types/          # TypeScript type definitions
│   ├── utils/          # Utility functions (retry, detectors)
│   ├── loopGuard.ts    # Loop termination logic
│   ├── sessionManager.ts # In-memory session store
│   └── stateMachine.ts # Core state machine
├── tests/
│   ├── agents/
│   ├── handlers/
│   ├── integration/
│   ├── providers/
│   ├── services/
│   ├── tools/
│   └── utils/
├── config.json         # Main configuration file
├── package.json
└── tsconfig.json
```
