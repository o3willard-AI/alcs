# ALCS Quick Setup Guide

Fast-track guide to get ALCS running in minutes.

## Prerequisites

- Node.js ≥18
- Docker ≥20.10
- PostgreSQL ≥13
- 8GB RAM, 10GB disk space

## Installation (5 minutes)

### 1. Clone and Install

```bash
git clone https://github.com/your-org/alcs.git
cd alcs
npm install
```

### 2. Database Setup

```bash
# Create .env file
cat > .env << EOF
DATABASE_URL="postgresql://user:pass@localhost:5432/alcs"
ANTHROPIC_API_KEY="your-key-here"
EOF

# Run migrations
npx prisma migrate deploy
npx prisma generate
```

### 3. Install Analysis Tools

```bash
# All languages (recommended)
./scripts/install-analysis-tools.sh --all

# Or specific languages
./scripts/install-analysis-tools.sh --python --javascript
```

### 4. Build Docker Images

```bash
./scripts/build-test-images.sh --all
```

### 5. Verify Installation

```bash
./scripts/verify-installation.sh --full
```

### 6. Start Server

```bash
npm start
```

## Quick Commands

| Task | Command |
|------|---------|
| Run tests | `npm test` |
| Build project | `npm run build` |
| Start MCP server | `npm start` |
| Verify tools | `./scripts/verify-installation.sh --quick` |
| Check logs | `tail -f logs/alcs.log` |
| Database GUI | `npx prisma studio` |

## Minimal Setup (Python only)

For testing ALCS with Python support only:

```bash
git clone https://github.com/your-org/alcs.git
cd alcs
npm install

# Setup database
npx prisma migrate deploy && npx prisma generate

# Install Python tools only
./scripts/install-analysis-tools.sh --python

# Build Python image only
./scripts/build-test-images.sh --python

# Verify
./scripts/verify-installation.sh --tools

# Start
npm start
```

## Troubleshooting Quick Fixes

| Problem | Solution |
|---------|----------|
| Docker permission denied | `sudo usermod -aG docker $USER && newgrp docker` |
| pytest not found | `echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc && source ~/.bashrc` |
| Database connection error | `sudo systemctl start postgresql` |
| Build fails | `./scripts/build-test-images.sh --all --no-cache` |

## Next Steps

- Read [INSTALLATION.md](./INSTALLATION.md) for detailed setup
- Review [ARCHITECTURE.md](./ARCHITECTURE.md) to understand the system
- Try [examples/](../examples/) for sample tasks
- Configure agents in [AGENT-CONFIGURATION.md](./AGENT-CONFIGURATION.md)

## Support

- Issues: https://github.com/your-org/alcs/issues
- Docs: [docs/README.md](./README.md)
