# ALCS - AI Agent Installation and Operation Guide

**Document Version:** 1.0
**Target Audience:** AI Agents (Claude Code, Gemini CLI, GitHub Copilot, etc.)
**Purpose:** Enable zero-touch autonomous installation and operation

---

## Quick Start (For AI Agents)

This repository is designed for **agent-first deployment**. You can install and configure the entire system autonomously using these commands:

```bash
# 1. Clone repository
git clone https://github.com/YOUR_ORG/alcs.git
cd alcs

# 2. Run autonomous bootstrap
./bootstrap.sh

# 3. Verify installation
python3 verify_install.py --verbose

# 4. Start the MCP server
npm run mcp
```

**Expected Duration:** 5-10 minutes (depending on network speed and system resources)

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Installation Workflow](#installation-workflow)
3. [Project Structure](#project-structure)
4. [Configuration](#configuration)
5. [Testing](#testing)
6. [Troubleshooting](#troubleshooting)
7. [Common Failure Patterns](#common-failure-patterns)
8. [Self-Healing Procedures](#self-healing-procedures)
9. [Verification Checkpoints](#verification-checkpoints)
10. [Production Deployment](#production-deployment)

---

## Prerequisites

### System Requirements

- **OS:** Linux (Ubuntu 20.04+, Debian 11+), macOS 12+
- **CPU:** 4+ cores recommended (8+ for optimal performance)
- **RAM:** 16GB minimum (32GB recommended for large models)
- **Disk:** 50GB free space (models require 20-40GB)
- **Network:** Stable internet for initial setup

### Required Software

**Auto-installed by bootstrap.sh:**
- Node.js v18+ (installed via nvm if not present)
- npm v9+
- SQLite 3
- Build tools (gcc, make, etc.)

**Must be installed separately:**
- **Ollama** (LLM server): https://ollama.com/download
  - Agent Alpha model: `ollama pull qwen2.5-coder:32b`
  - Agent Beta model: `ollama pull deepseek-r1:14b`

### Optional Software

- Git (for cloning repository)
- Python 3.8+ (for verification script)
- Docker (for containerized deployment)

---

## Installation Workflow

### Phase 1: System Detection and Preparation

```bash
./bootstrap.sh
```

**What happens:**
1. Detects OS and architecture
2. Installs system dependencies (if sudo available)
3. Installs Node.js via nvm (if needed)
4. Creates log file: `bootstrap.log`

**Flags:**
- `--skip-system-deps`: Skip OS package installation (if no sudo)
- `--dev`: Install development dependencies
- `--help`: Show usage information

**Idempotency:** Safe to run multiple times. Will skip steps that are already complete.

### Phase 2: Project Dependencies

**Auto-executed by bootstrap.sh:**
```bash
npm install
```

**Installed packages:**
- TypeScript compiler
- Prisma ORM + SQLite adapter
- MCP SDK
- Testing frameworks
- All project dependencies from package.json

### Phase 3: Database Setup

**Auto-executed by bootstrap.sh:**
```bash
# 1. Create .env from .env.example (if not exists)
cp .env.example .env

# 2. Generate Prisma client
npx prisma generate

# 3. Run database migrations
npx prisma migrate dev --name init
```

**Database file:** `./prisma/dev.db` (SQLite)

### Phase 4: Build

**Auto-executed by bootstrap.sh:**
```bash
npm run build
```

**Output:** `dist/` directory with compiled JavaScript

### Phase 5: Verification

**After bootstrap completes:**
```bash
python3 verify_install.py --verbose
```

**Checks performed:**
- ✓ Project structure
- ✓ Node.js and npm versions
- ✓ Dependencies installed
- ✓ TypeScript compilation
- ✓ Database schema
- ✓ Ollama server accessibility
- ✓ Required models availability
- ✓ Configuration validity
- ✓ File permissions

**Exit codes:**
- `0`: All checks passed, ready for production
- `1`: Critical failures detected, see output for fixes

---

## Project Structure

```
alcs/
├── bootstrap.sh              # ← START HERE: Main installation orchestrator
├── verify_install.py         # Verification and smoke testing
├── AGENT_INSTRUCTIONS.md     # ← YOU ARE HERE: This file
├── README.md                 # Human-readable overview
├── .env.example              # Environment template
├── .env                      # Your configuration (create from .env.example)
│
├── src/                      # TypeScript source code
│   ├── orchestrator.ts       # Main workflow coordinator
│   ├── sessionManager.ts     # Session persistence
│   ├── stateMachine.ts       # State transitions
│   ├── loopGuard.ts          # Infinite loop prevention
│   │
│   ├── agents/               # LLM agent implementations
│   │   ├── agentAlpha.ts     # Code generator
│   │   └── agentBeta.ts      # Code reviewer/critic
│   │
│   ├── mcp/                  # Model Context Protocol server
│   │   ├── server.ts         # stdio MCP server
│   │   ├── sse-server.ts     # SSE MCP server variant
│   │   └── tools.ts          # Tool handlers registry
│   │
│   ├── tools/                # Individual MCP tool implementations
│   │   ├── executeTaskSpec.ts
│   │   ├── runCriticReview.ts
│   │   ├── reviseCode.ts
│   │   ├── getProjectStatus.ts
│   │   └── ...
│   │
│   ├── services/             # Core services
│   │   ├── databaseService.ts
│   │   ├── configService.ts
│   │   ├── loggerService.ts
│   │   └── ...
│   │
│   ├── providers/            # LLM provider adapters
│   │   ├── ollamaProvider.ts
│   │   ├── anthropicProvider.ts
│   │   └── openaiProvider.ts
│   │
│   └── types/                # TypeScript type definitions
│       └── mcp.ts
│
├── dist/                     # Compiled JavaScript (generated by npm run build)
│
├── prisma/                   # Database schema and migrations
│   ├── schema.prisma         # Prisma schema definition
│   ├── migrations/           # Database migration history
│   └── dev.db                # SQLite database file (generated)
│
├── tests/                    # Test suites
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
├── docs/                     # Additional documentation
│   ├── technical-specification.md
│   ├── architecture-overview.md
│   └── api-documentation.md
│
├── config.json               # Runtime configuration
├── package.json              # npm dependencies and scripts
├── tsconfig.json             # TypeScript compiler configuration
├── prisma.config.ts          # Prisma 7.x configuration
└── bootstrap.log             # Installation log (generated)
```

### Key Files for AI Agents

| File | Purpose | When to Use |
|------|---------|-------------|
| `bootstrap.sh` | Full system setup | First-time installation |
| `verify_install.py` | Smoke testing | After any changes, pre-deployment |
| `.env` | Configuration | Customize LLM endpoints, models |
| `config.json` | Runtime settings | Adjust quality thresholds, timeouts |
| `bootstrap.log` | Installation log | Debugging failed installations |

---

## Configuration

### Environment Variables (.env)

**Critical Variables:**

```bash
# Database
DATABASE_URL="file:./prisma/dev.db"

# LLM Server
OLLAMA_BASE_URL="http://localhost:11434"

# Agent Models
AGENT_ALPHA_MODEL="qwen2.5-coder:32b"
AGENT_BETA_MODEL="deepseek-r1:14b"

# Session Settings
DEFAULT_MAX_ITERATIONS=5
DEFAULT_QUALITY_THRESHOLD=85
TASK_TIMEOUT_MINUTES=30
```

**Full reference:** See `.env.example`

### Runtime Configuration (config.json)

```json
{
  "deployment_mode": "workstation",
  "quality_threshold": 85,
  "max_iterations": 5,
  "alpha": {
    "endpoint": {
      "type": "ollama",
      "base_url": "http://localhost:11434",
      "model": "qwen2.5-coder:32b"
    }
  },
  "beta": {
    "endpoint": {
      "type": "ollama",
      "base_url": "http://localhost:11434",
      "model": "deepseek-r1:14b"
    }
  }
}
```

### Ollama Model Setup

**Required models:**

```bash
# Agent Alpha (Code Generator) - ~20GB
ollama pull qwen2.5-coder:32b

# Agent Beta (Code Reviewer) - ~8GB
ollama pull deepseek-r1:14b
```

**Verify models:**
```bash
ollama list
```

**Test Ollama API:**
```bash
curl http://localhost:11434/api/tags
```

---

## Testing

### Verification Script (Recommended)

```bash
# Quick check
python3 verify_install.py

# Detailed output
python3 verify_install.py --verbose

# Check specific component
# (Not yet implemented, but planned)
# python3 verify_install.py --check database
```

### Manual Testing

```bash
# 1. Test TypeScript compilation
npm run build

# 2. Test database connection
npx prisma studio

# 3. Test MCP server
npm run mcp &
# In another terminal:
echo '{"method": "tools/list"}' | nc localhost 3100

# 4. Run unit tests
npm test

# 5. Run integration tests
npm run test:integration

# 6. Run end-to-end test
npm run test:e2e
```

### Smoke Test (Autonomous)

```bash
# Run orchestrator test
npx tsx /tmp/test-orchestrator-workflow.ts
```

---

## Troubleshooting

### Decision Tree for AI Agents

```
Installation Failed?
├─ bootstrap.sh failed
│  ├─ Check bootstrap.log
│  ├─ Run with --skip-system-deps if no sudo
│  └─ Install Node.js manually if nvm fails
│
├─ npm install failed
│  ├─ Check internet connection
│  ├─ Clear cache: npm cache clean --force
│  └─ Delete node_modules and retry
│
├─ npm run build failed
│  ├─ Check TypeScript errors in output
│  ├─ Verify all dependencies installed
│  └─ Check tsconfig.json is present
│
├─ Database migration failed
│  ├─ Check write permissions on prisma/
│  ├─ Delete prisma/dev.db and retry
│  └─ Verify DATABASE_URL in .env
│
└─ Ollama check failed
   ├─ Install Ollama from https://ollama.com
   ├─ Start Ollama: ollama serve
   └─ Pull required models
```

---

## Common Failure Patterns

### 1. "Node.js not found" or version too old

**Symptoms:**
```
bash: node: command not found
```

**Fix:**
```bash
# Install nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Load nvm
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Install Node.js LTS
nvm install --lts
nvm use --lts

# Re-run bootstrap
./bootstrap.sh
```

### 2. "Permission denied" errors

**Symptoms:**
```
EACCES: permission denied, mkdir '/usr/local/lib/node_modules'
```

**Fix:**
```bash
# Use nvm instead of system Node.js
# OR
# Fix npm permissions (not recommended)
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
export PATH=~/.npm-global/bin:$PATH
```

### 3. "Prisma Client generation failed"

**Symptoms:**
```
Error: Using engine type "client" requires either "adapter" or "accelerateUrl"
```

**Fix:**
```bash
# Ensure Prisma adapter is installed
npm install @prisma/adapter-better-sqlite3 better-sqlite3 @types/better-sqlite3

# Regenerate client
npx prisma generate

# If still fails, check prisma/schema.prisma provider is "sqlite"
```

### 4. "Database migration failed"

**Symptoms:**
```
Error: P1001: Can't reach database server
```

**Fix:**
```bash
# For SQLite: Check file permissions
ls -la prisma/
chmod -R u+w prisma/

# Remove old database and start fresh
rm prisma/dev.db
npx prisma migrate dev --name init
```

### 5. "Ollama server not accessible"

**Symptoms:**
```
✗ Ollama server: Not accessible at http://localhost:11434
```

**Fix:**
```bash
# Install Ollama
# macOS:
brew install ollama

# Linux:
curl -fsSL https://ollama.com/install.sh | sh

# Start Ollama server
ollama serve

# Pull models
ollama pull qwen2.5-coder:32b
ollama pull deepseek-r1:14b

# Verify
curl http://localhost:11434/api/tags
```

### 6. "TypeScript compilation errors"

**Symptoms:**
```
error TS2345: Argument of type 'X' is not assignable to parameter of type 'Y'
```

**Fix:**
```bash
# Update dependencies
npm install

# Clean build
rm -rf dist/
npm run build

# If errors persist, check:
cat tsconfig.json  # Verify configuration
npm list typescript  # Check TypeScript version
```

---

## Self-Healing Procedures

### Automatic Recovery Strategies

**The bootstrap script is idempotent:** You can run it multiple times safely.

```bash
# Complete reset and reinstall
./bootstrap.sh

# Or manual step-by-step recovery:

# 1. Clean node_modules
rm -rf node_modules/
rm package-lock.json
npm install

# 2. Clean build artifacts
rm -rf dist/
npm run build

# 3. Reset database
rm prisma/dev.db
npx prisma migrate dev --name init

# 4. Verify
python3 verify_install.py --verbose
```

### Health Check Script (For Continuous Operation)

```bash
# Create health check script
cat > health_check.sh <<'EOF'
#!/bin/bash
set -e

# Check Ollama
curl -sf http://localhost:11434/api/tags > /dev/null || exit 1

# Check database
test -f prisma/dev.db || exit 1

# Check build artifacts
test -f dist/orchestrator.js || exit 1

echo "All systems operational"
EOF

chmod +x health_check.sh

# Run health check
./health_check.sh
```

---

## Verification Checkpoints

### Pre-Deployment Checklist

**Critical (Must Pass):**
- [ ] `./bootstrap.sh` completes without errors
- [ ] `python3 verify_install.py` exits with code 0
- [ ] `npm run build` succeeds
- [ ] `prisma/dev.db` exists and is readable
- [ ] Ollama server responds at configured URL
- [ ] Both required models are pulled

**Recommended (Should Pass):**
- [ ] `npm test` passes all unit tests
- [ ] `npm run test:integration` passes
- [ ] Orchestrator workflow test completes
- [ ] Logs show no critical errors

**Optional (Nice to Have):**
- [ ] Documentation reviewed
- [ ] .env customized for production
- [ ] Monitoring enabled
- [ ] Backup strategy configured

### Post-Deployment Validation

```bash
# 1. Start MCP server
npm run mcp &
MCP_PID=$!

# 2. Wait for startup
sleep 5

# 3. Test health endpoint
curl http://localhost:3100/health || echo "Health check failed"

# 4. Test tool listing
echo '{"jsonrpc": "2.0", "method": "tools/list", "id": 1}' | \
  nc localhost 3100

# 5. Stop server
kill $MCP_PID
```

---

## Production Deployment

### Workstation Mode (Current Setup)

**Characteristics:**
- Single machine
- Local Ollama server
- SQLite database
- Suitable for: Development, testing, single-user use

**Deployment:**
```bash
# Already configured by bootstrap.sh
npm run mcp
```

### Server Mode (Multi-User)

**Upgrade path:**

1. **Switch to PostgreSQL:**
   ```bash
   # Update prisma/schema.prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }

   # Update .env
   DATABASE_URL="postgresql://user:pass@localhost:5432/alcs"

   # Migrate
   npx prisma migrate dev
   ```

2. **Configure remote Ollama:**
   ```bash
   # In .env
   OLLAMA_BASE_URL="http://ollama-server:11434"
   ```

3. **Add authentication:**
   ```bash
   # Generate JWT secret
   openssl rand -base64 32 > .jwt_secret

   # In .env
   JWT_SECRET=$(cat .jwt_secret)
   MCP_REQUIRE_AUTH="true"
   ```

### Distributed Mode (High Scale)

**Requirements:**
- Load balancer
- Shared PostgreSQL database
- Multiple Ollama worker nodes
- Redis for session caching

**See:** `docs/distributed-deployment.md` (coming soon)

---

## Autonomous Operation Protocol

### For AI Agents: Decision Flow

```python
# Pseudo-code for autonomous agents

def install_alcs(repo_url):
    # 1. Clone
    run_command(f"git clone {repo_url}")
    os.chdir("alcs")

    # 2. Bootstrap
    result = run_command("./bootstrap.sh")
    if result.exit_code != 0:
        log("Bootstrap failed, analyzing...")
        analyze_bootstrap_log()
        apply_fixes()
        run_command("./bootstrap.sh")  # Retry

    # 3. Verify
    result = run_command("python3 verify_install.py --verbose")
    if result.exit_code != 0:
        log("Verification failed, analyzing...")
        parse_verification_output(result.stdout)
        apply_recommended_fixes()
        run_command("python3 verify_install.py --verbose")  # Retry

    # 4. Final check
    if all_checks_passed():
        return "Installation successful, ready for production"
    else:
        return "Installation incomplete, escalating to human"

def apply_fixes():
    """Apply common fixes based on error patterns"""
    if "node: command not found" in errors:
        install_nodejs()
    if "Ollama server not accessible" in errors:
        start_ollama()
    if "Database migration failed" in errors:
        reset_database()
    # ... more patterns
```

### Error Recovery Levels

**Level 1: Automatic (Agent handles)**
- Missing dependencies → `npm install`
- Stale build → `npm run build`
- Missing .env → Copy from .env.example

**Level 2: Semi-Automatic (Agent prompts for input)**
- Ollama not installed → Provide installation command
- Models not downloaded → Provide pull commands
- Configuration mismatch → Request clarification

**Level 3: Manual (Escalate to human)**
- Compilation errors in source code
- Network/firewall blocking Ollama
- Insufficient system resources
- Corrupted dependencies

---

## Monitoring and Logging

### Log Files

- `bootstrap.log`: Installation process log
- `logs/alcs.log`: Application runtime log (if configured)
- `prisma/query.log`: Database query log (if enabled)

### Key Metrics to Monitor

```bash
# Database size
du -h prisma/dev.db

# Active sessions
sqlite3 prisma/dev.db "SELECT COUNT(*) FROM Session;"

# Recent errors
grep ERROR bootstrap.log | tail -20

# Build artifacts size
du -sh dist/
```

---

## Quick Reference Card

### Essential Commands

```bash
# Install
./bootstrap.sh

# Verify
python3 verify_install.py --verbose

# Build
npm run build

# Test
npm test

# Start
npm run mcp

# Reset
rm -rf node_modules/ dist/ prisma/dev.db
./bootstrap.sh
```

### Emergency Recovery

```bash
# Full reset (nuclear option)
git clean -fdx  # WARNING: Deletes all untracked files
./bootstrap.sh
```

### Health Status

```bash
# Quick health check
curl http://localhost:11434/api/tags && \
test -f dist/orchestrator.js && \
test -f prisma/dev.db && \
echo "✓ System healthy"
```

---

## Support and Escalation

### When to Escalate to Human

- Bootstrap fails after 3 attempts with different flags
- Verification shows >5 critical failures
- System requirements not met (RAM, disk space)
- Network issues prevent Ollama/npm access
- Core files corrupted (package.json, tsconfig.json)

### Information to Collect for Escalation

```bash
# System info
uname -a
node --version
npm --version

# Logs
tail -100 bootstrap.log

# Verification output
python3 verify_install.py --verbose > verify_output.txt

# Error context
npm run build 2>&1 | tee build_errors.txt
```

---

## Appendix: Advanced Topics

### Custom Model Configuration

```bash
# Use different models in .env
AGENT_ALPHA_MODEL="codellama:34b"
AGENT_BETA_MODEL="llama3:70b"

# Pull custom models
ollama pull codellama:34b
ollama pull llama3:70b
```

### Remote Ollama Server

```bash
# In .env
OLLAMA_BASE_URL="http://192.168.1.100:11434"

# Verify connectivity
curl http://192.168.1.100:11434/api/tags
```

### Performance Tuning

```json
// In config.json
{
  "quality_threshold": 90,  // Higher = more iterations
  "max_iterations": 3,      // Lower = faster convergence
  "task_timeout_minutes": 15  // Shorter timeout
}
```

---

**End of Agent Instructions**

For human-readable documentation, see [README.md](README.md)
For technical specifications, see [docs/technical-specification.md](docs/technical-specification.md)
