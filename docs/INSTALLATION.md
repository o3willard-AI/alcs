# ALCS Installation Guide

Complete guide for installing and setting up the Dual-Agent Local Coding Service (ALCS) with all test frameworks and static analysis tools.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Installation Methods](#installation-methods)
  - [Method 1: Automated Installation (Recommended)](#method-1-automated-installation-recommended)
  - [Method 2: Docker Images](#method-2-docker-images)
  - [Method 3: Manual Installation](#method-3-manual-installation)
- [Verification](#verification)
- [Configuration](#configuration)
- [Troubleshooting](#troubleshooting)
- [Development Setup](#development-setup)

---

## Prerequisites

### System Requirements

- **Operating System**: Linux (Debian/Ubuntu/RedHat) or macOS
- **Memory**: Minimum 4GB RAM (8GB recommended)
- **Disk Space**: Minimum 10GB free space
- **Network**: Internet connection for downloading dependencies

### Required Software

- **Node.js**: Version 18 or higher
- **npm**: Version 9 or higher
- **Docker**: Version 20.10 or higher (for sandboxed test execution)
- **Git**: For cloning the repository

---

## Quick Start

For users who want to get up and running quickly:

```bash
# 1. Clone the repository
git clone https://github.com/your-org/alcs.git
cd alcs

# 2. Install Node.js dependencies
npm install

# 3. Set up the database
npx prisma migrate deploy
npx prisma generate

# 4. Install analysis tools (all languages)
./scripts/install-analysis-tools.sh --all

# 5. Build Docker test runner images
./scripts/build-test-images.sh --all

# 6. Verify installation
./scripts/verify-installation.sh --full

# 7. Run tests to ensure everything works
npm test

# 8. Start the MCP server
npm start
```

---

## Installation Methods

### Method 1: Automated Installation (Recommended)

The automated installation script installs all test frameworks and analysis tools for all supported languages.

#### Install All Tools

```bash
./scripts/install-analysis-tools.sh --all
```

This installs:
- Python 3 with pytest, pytest-cov, pylint, bandit, flake8
- Node.js 20 with Jest, ESLint, TypeScript
- Go 1.21 with native test tools
- Java 17 with Maven and JUnit
- Docker with proper security configuration

#### Install Specific Language Tools

Install only the tools you need:

```bash
# Python only
./scripts/install-analysis-tools.sh --python

# JavaScript/TypeScript only
./scripts/install-analysis-tools.sh --javascript

# Go only
./scripts/install-analysis-tools.sh --go

# Java only
./scripts/install-analysis-tools.sh --java

# Docker only
./scripts/install-analysis-tools.sh --docker
```

#### Verify Installation

```bash
# Quick check (command availability only)
./scripts/install-analysis-tools.sh --verify

# OR use the comprehensive verification script
./scripts/verify-installation.sh --quick
```

---

### Method 2: Docker Images

Docker images provide pre-configured environments with all test frameworks installed. This is the recommended approach for production deployments.

#### Build All Images

```bash
./scripts/build-test-images.sh --all
```

This builds:
- `alcs/test-runner-python:latest` - Python test environment
- `alcs/test-runner-node:latest` - Node.js test environment
- `alcs/test-runner-go:latest` - Go test environment
- `alcs/test-runner-java:latest` - Java test environment

#### Build Specific Images

```bash
# Build Python image only
./scripts/build-test-images.sh --python

# Build Node.js image only
./scripts/build-test-images.sh --node

# Build Go image only
./scripts/build-test-images.sh --go

# Build Java image only
./scripts/build-test-images.sh --java
```

#### Build Options

```bash
# Build without cache (clean build)
./scripts/build-test-images.sh --all --no-cache

# Build in parallel (faster but more resource-intensive)
./scripts/build-test-images.sh --all --parallel

# Build and push to registry
./scripts/build-test-images.sh --all --push
```

#### Using Docker Compose

For orchestrated setup with all services:

```bash
cd docker

# Start all services
docker-compose --profile all up -d

# Start specific service
docker-compose --profile python up -d

# View running containers
docker-compose ps

# Stop all services
docker-compose down
```

---

### Method 3: Manual Installation

For users who prefer manual installation or need custom configurations.

#### Python Tools

```bash
# Install Python 3
sudo apt-get update
sudo apt-get install -y python3 python3-pip python3-venv

# Install test frameworks
python3 -m pip install --user pytest pytest-cov

# Install static analyzers
python3 -m pip install --user pylint bandit flake8
```

#### Node.js Tools

```bash
# Install Node.js 20 (Debian/Ubuntu)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install test frameworks globally
npm install -g jest eslint typescript
```

#### Go Tools

```bash
# Download and install Go 1.21
wget https://go.dev/dl/go1.21.5.linux-amd64.tar.gz
sudo rm -rf /usr/local/go
sudo tar -C /usr/local -xzf go1.21.5.linux-amd64.tar.gz

# Add to PATH
echo 'export PATH=$PATH:/usr/local/go/bin' >> ~/.bashrc
source ~/.bashrc
```

#### Java Tools

```bash
# Install JDK (Debian/Ubuntu)
sudo apt-get update
sudo apt-get install -y default-jdk

# Install Maven
sudo apt-get install -y maven
```

#### Docker

```bash
# Install Docker (Debian/Ubuntu)
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add user to docker group
sudo usermod -aG docker $USER

# Log out and back in for group membership to take effect
```

---

## Verification

### Comprehensive Verification

Run the full verification suite with functional tests:

```bash
./scripts/verify-installation.sh --full
```

This checks:
- Command availability for all tools
- Version compatibility
- Functional tests for each framework
- Docker image availability and functionality

### Quick Verification

For a faster check without functional tests:

```bash
./scripts/verify-installation.sh --quick
```

### Selective Verification

```bash
# Verify tools only (no Docker)
./scripts/verify-installation.sh --tools

# Verify Docker only
./scripts/verify-installation.sh --docker
```

### Expected Output

A successful verification will show:

```
===== Verification Summary =====

Total checks: 32
Passed: 32
Failed: 0
Duration: 15 seconds

[✓] All verification checks passed!

Your ALCS installation is ready to use.
```

---

## Configuration

### Database Setup

ALCS uses PostgreSQL with Prisma ORM.

1. **Install PostgreSQL** (if not already installed):

```bash
# Debian/Ubuntu
sudo apt-get install -y postgresql postgresql-contrib

# macOS
brew install postgresql
```

2. **Create database**:

```bash
sudo -u postgres psql
CREATE DATABASE alcs;
CREATE USER alcs_user WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE alcs TO alcs_user;
\q
```

3. **Configure environment**:

Create a `.env` file in the project root:

```env
DATABASE_URL="postgresql://alcs_user:your_secure_password@localhost:5432/alcs"
NODE_ENV=development
LOG_LEVEL=info
```

4. **Run migrations**:

```bash
npx prisma migrate deploy
npx prisma generate
```

### MCP Server Configuration

The MCP server can be configured via environment variables or `config/default.json`.

#### Environment Variables

```bash
# Server settings
export MCP_SERVER_NAME="alcs"
export MCP_SERVER_VERSION="1.0.0"

# Agent settings
export AGENT_ALPHA_PROVIDER="anthropic"
export AGENT_ALPHA_MODEL="claude-sonnet-3-5-20241022"
export AGENT_BETA_PROVIDER="anthropic"
export AGENT_BETA_MODEL="claude-sonnet-3-5-20241022"

# API keys
export ANTHROPIC_API_KEY="your-api-key-here"
```

#### Configuration File

Edit `config/default.json`:

```json
{
  "default_quality_threshold": 80,
  "max_iterations": 5,
  "task_timeout_minutes": 30,
  "test_execution": {
    "timeout_seconds": 300,
    "memory_limit_mb": 512,
    "cpu_limit": 1.0,
    "enable_network": false
  }
}
```

---

## Troubleshooting

### Common Issues

#### Docker Permission Denied

**Problem**: `permission denied while trying to connect to the Docker daemon socket`

**Solution**:
```bash
# Add user to docker group
sudo usermod -aG docker $USER

# Log out and back in, or run:
newgrp docker
```

#### Python Tools Not Found

**Problem**: `pytest: command not found` after installation

**Solution**:
```bash
# Ensure ~/.local/bin is in PATH
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

#### Node.js Global Packages Not Found

**Problem**: `jest: command not found` after global installation

**Solution**:
```bash
# Check npm global bin directory
npm config get prefix

# Add to PATH if needed
echo 'export PATH="$(npm config get prefix)/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

#### Go Not in PATH

**Problem**: `go: command not found` after installation

**Solution**:
```bash
# Add Go to PATH
echo 'export PATH=$PATH:/usr/local/go/bin' >> ~/.bashrc
source ~/.bashrc
```

#### Docker Images Build Fails

**Problem**: Docker build fails with network or timeout errors

**Solution**:
```bash
# Build without cache
./scripts/build-test-images.sh --all --no-cache

# Or build sequentially instead of parallel
./scripts/build-test-images.sh --all
```

#### Database Connection Fails

**Problem**: `Error: Can't reach database server`

**Solution**:
```bash
# Check PostgreSQL is running
sudo systemctl status postgresql

# Start if not running
sudo systemctl start postgresql

# Verify connection string in .env
cat .env | grep DATABASE_URL
```

### Getting Help

If you encounter issues not covered here:

1. Check the [GitHub Issues](https://github.com/your-org/alcs/issues)
2. Review the logs in `logs/alcs.log`
3. Run verification with verbose output: `LOG_LEVEL=debug ./scripts/verify-installation.sh --full`
4. Open a new issue with:
   - Your OS and version
   - Output of verification script
   - Relevant log excerpts
   - Steps to reproduce

---

## Development Setup

For developers contributing to ALCS:

### Install Development Dependencies

```bash
# Install Node.js dependencies including dev tools
npm install

# Install pre-commit hooks
npm run prepare
```

### Run Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test -- tests/services/testRunnerService.test.ts
```

### Build Project

```bash
# Compile TypeScript
npm run build

# Watch mode for development
npm run build:watch
```

### Database Development

```bash
# Create new migration
npx prisma migrate dev --name your_migration_name

# Reset database (caution: deletes all data)
npx prisma migrate reset

# Open Prisma Studio (GUI for database)
npx prisma studio
```

### Docker Development

```bash
# Build development images
./scripts/build-test-images.sh --all --no-cache

# Test specific image
docker run -it --rm alcs/test-runner-python:latest /bin/bash

# Clean up unused images
docker image prune -a
```

### Code Quality

```bash
# Run linter
npm run lint

# Fix linting issues
npm run lint:fix

# Format code
npm run format
```

---

## Next Steps

After successful installation:

1. **Review the Architecture**: Read [ARCHITECTURE.md](./ARCHITECTURE.md) to understand the system design
2. **Try the Examples**: Check [examples/](../examples/) for sample task specifications
3. **Configure Agents**: Set up your LLM providers in [AGENT-CONFIGURATION.md](./AGENT-CONFIGURATION.md)
4. **Start Coding**: Begin using ALCS with your AI assistant through the MCP interface

---

## Version Compatibility

| ALCS Version | Node.js | Python | Go   | Java | Docker |
|--------------|---------|--------|------|------|--------|
| 1.0.0        | ≥18.0   | ≥3.9   | ≥1.21| ≥11  | ≥20.10 |

---

## License

See [LICENSE](../LICENSE) for details.

---

## Support

- **Documentation**: [docs/](./README.md)
- **Issues**: [GitHub Issues](https://github.com/your-org/alcs/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-org/alcs/discussions)
