#!/usr/bin/env bash
###############################################################################
# ALCS Bootstrap Script - Zero-Touch Installation Orchestrator
#
# Purpose: Autonomous installation and configuration for AI agents
# Usage: ./bootstrap.sh [--skip-system-deps] [--dev]
#
# This script is IDEMPOTENT - safe to run multiple times
###############################################################################

set -e  # Exit on error
set -u  # Exit on undefined variable

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKIP_SYSTEM_DEPS=false
DEV_MODE=false
LOG_FILE="${PROJECT_DIR}/bootstrap.log"

###############################################################################
# Utility Functions
###############################################################################

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $*" | tee -a "$LOG_FILE"
}

log_warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING:${NC} $*" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR:${NC} $*" | tee -a "$LOG_FILE"
}

log_section() {
    echo -e "\n${BLUE}========================================${NC}" | tee -a "$LOG_FILE"
    echo -e "${BLUE}$*${NC}" | tee -a "$LOG_FILE"
    echo -e "${BLUE}========================================${NC}\n" | tee -a "$LOG_FILE"
}

check_command() {
    if command -v "$1" &> /dev/null; then
        log "✓ $1 is installed"
        return 0
    else
        log_warn "✗ $1 is not installed"
        return 1
    fi
}

###############################################################################
# Parse Arguments
###############################################################################

parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --skip-system-deps)
                SKIP_SYSTEM_DEPS=true
                shift
                ;;
            --dev)
                DEV_MODE=true
                shift
                ;;
            -h|--help)
                echo "Usage: $0 [OPTIONS]"
                echo ""
                echo "Options:"
                echo "  --skip-system-deps    Skip system-level dependency installation"
                echo "  --dev                 Install development dependencies"
                echo "  -h, --help           Show this help message"
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                exit 1
                ;;
        esac
    done
}

###############################################################################
# System Detection
###############################################################################

detect_os() {
    log_section "System Detection"

    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        if [ -f /etc/os-release ]; then
            . /etc/os-release
            OS_NAME=$ID
            OS_VERSION=$VERSION_ID
        else
            OS_NAME="linux"
            OS_VERSION="unknown"
        fi
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        OS_NAME="macos"
        OS_VERSION=$(sw_vers -productVersion)
    else
        OS_NAME="unknown"
        OS_VERSION="unknown"
    fi

    log "Operating System: $OS_NAME $OS_VERSION"
    log "Architecture: $(uname -m)"
    log "Shell: $SHELL"
}

###############################################################################
# System Dependencies
###############################################################################

install_system_deps() {
    if [ "$SKIP_SYSTEM_DEPS" = true ]; then
        log_warn "Skipping system dependency installation (--skip-system-deps)"
        return 0
    fi

    log_section "Installing System Dependencies"

    case $OS_NAME in
        ubuntu|debian)
            log "Detected Debian/Ubuntu system"

            # Check if we have sudo access
            if ! sudo -n true 2>/dev/null; then
                log_warn "No sudo access - skipping system package installation"
                log_warn "Please install manually: build-essential, sqlite3, git, curl"
                return 0
            fi

            log "Updating package lists..."
            sudo apt-get update -qq || log_warn "Failed to update package lists"

            log "Installing system packages..."
            sudo apt-get install -y \
                build-essential \
                sqlite3 \
                libsqlite3-dev \
                git \
                curl \
                ca-certificates \
                gnupg \
                lsb-release \
                || log_warn "Some packages failed to install"
            ;;

        macos)
            log "Detected macOS system"

            if ! check_command brew; then
                log "Installing Homebrew..."
                /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
            fi

            log "Installing system packages via Homebrew..."
            brew install sqlite3 git curl || log_warn "Some packages failed to install"
            ;;

        *)
            log_warn "Unknown OS: $OS_NAME - skipping system package installation"
            log_warn "Please ensure you have: build tools, sqlite3, git, curl"
            ;;
    esac
}

###############################################################################
# Node.js Installation
###############################################################################

install_nodejs() {
    log_section "Node.js Installation"

    if check_command node && check_command npm; then
        local node_version=$(node --version)
        local npm_version=$(npm --version)
        log "Node.js $node_version already installed"
        log "npm $npm_version already installed"

        # Check if version is sufficient (need v18+)
        local major_version=$(echo "$node_version" | cut -d'.' -f1 | sed 's/v//')
        if [ "$major_version" -ge 18 ]; then
            log "✓ Node.js version is sufficient (v18+)"
            return 0
        else
            log_warn "Node.js version is too old (need v18+), will install nvm"
        fi
    fi

    # Install nvm if not present
    if [ ! -d "$HOME/.nvm" ]; then
        log "Installing nvm (Node Version Manager)..."
        curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

        # Load nvm
        export NVM_DIR="$HOME/.nvm"
        [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    else
        log "✓ nvm already installed"
        export NVM_DIR="$HOME/.nvm"
        [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    fi

    # Install latest LTS Node.js
    log "Installing Node.js LTS via nvm..."
    nvm install --lts
    nvm use --lts
    nvm alias default lts/*

    log "✓ Node.js $(node --version) installed"
    log "✓ npm $(npm --version) installed"
}

###############################################################################
# Project Dependencies
###############################################################################

install_project_deps() {
    log_section "Installing Project Dependencies"

    cd "$PROJECT_DIR"

    # Check if package.json exists
    if [ ! -f "package.json" ]; then
        log_error "package.json not found in $PROJECT_DIR"
        exit 1
    fi

    log "Installing npm dependencies..."
    npm install

    if [ "$DEV_MODE" = true ]; then
        log "Installing development dependencies..."
        npm install --save-dev
    fi

    log "✓ npm dependencies installed"
}

###############################################################################
# Database Setup
###############################################################################

setup_database() {
    log_section "Database Setup"

    cd "$PROJECT_DIR"

    # Check if .env exists, if not create from .env.example
    if [ ! -f ".env" ]; then
        if [ -f ".env.example" ]; then
            log "Creating .env from .env.example..."
            cp .env.example .env
        else
            log "Creating default .env file..."
            cat > .env <<EOF
# ALCS Environment Configuration
# Generated by bootstrap.sh on $(date)

# Database Configuration
DATABASE_URL="file:./prisma/dev.db"

# LLM Configuration (Ollama)
# Update these URLs if your Ollama server is running elsewhere
OLLAMA_BASE_URL="http://localhost:11434"

# Agent Alpha (Code Generator)
AGENT_ALPHA_MODEL="qwen2.5-coder:32b"
AGENT_ALPHA_PROVIDER="ollama"

# Agent Beta (Code Reviewer)
AGENT_BETA_MODEL="deepseek-r1:14b"
AGENT_BETA_PROVIDER="ollama"

# Server Configuration
DEFAULT_MAX_ITERATIONS=5
DEFAULT_QUALITY_THRESHOLD=85
TASK_TIMEOUT_MINUTES=30

# Logging
LOG_LEVEL="info"
EOF
        fi
        log "✓ .env file created"
    else
        log "✓ .env file already exists"
    fi

    # Generate Prisma client
    log "Generating Prisma client..."
    npx prisma generate

    # Run database migrations
    log "Running database migrations..."
    if [ -f "prisma/dev.db" ]; then
        log "Database already exists, checking migration status..."
        npx prisma migrate deploy || log_warn "Migration deployment had warnings"
    else
        log "Creating new database..."
        npx prisma migrate dev --name init
    fi

    log "✓ Database setup complete"
}

###############################################################################
# Build Project
###############################################################################

build_project() {
    log_section "Building Project"

    cd "$PROJECT_DIR"

    log "Compiling TypeScript..."
    npm run build

    log "✓ Project built successfully"
}

###############################################################################
# Ollama Setup Check
###############################################################################

check_ollama() {
    log_section "Ollama LLM Server Check"

    # Extract Ollama URL from .env
    if [ -f ".env" ]; then
        OLLAMA_URL=$(grep OLLAMA_BASE_URL .env | cut -d '=' -f2 | tr -d '"' | tr -d "'")
    else
        OLLAMA_URL="http://localhost:11434"
    fi

    log "Checking Ollama server at $OLLAMA_URL..."

    if curl -s "${OLLAMA_URL}/api/tags" > /dev/null 2>&1; then
        log "✓ Ollama server is accessible"

        # Check for required models
        local models=$(curl -s "${OLLAMA_URL}/api/tags" | grep -o '"name":"[^"]*"' | cut -d'"' -f4 || echo "")

        if echo "$models" | grep -q "qwen2.5-coder"; then
            log "✓ qwen2.5-coder model found"
        else
            log_warn "qwen2.5-coder model not found"
            log_warn "Run: ollama pull qwen2.5-coder:32b"
        fi

        if echo "$models" | grep -q "deepseek-r1"; then
            log "✓ deepseek-r1 model found"
        else
            log_warn "deepseek-r1 model not found"
            log_warn "Run: ollama pull deepseek-r1:14b"
        fi
    else
        log_warn "Ollama server not accessible at $OLLAMA_URL"
        log_warn "Please install Ollama: https://ollama.com/download"
        log_warn "Or update OLLAMA_BASE_URL in .env if running remotely"
    fi
}

###############################################################################
# Post-Install Summary
###############################################################################

print_summary() {
    log_section "Installation Summary"

    log "✓ Bootstrap completed successfully!"
    echo ""
    log "Next steps:"
    log "  1. Review and update .env file with your configuration"
    log "  2. Ensure Ollama is running with required models:"
    log "     - ollama pull qwen2.5-coder:32b"
    log "     - ollama pull deepseek-r1:14b"
    log "  3. Run verification: python3 verify_install.py"
    log "  4. Start the MCP server: npm run mcp"
    echo ""
    log "Documentation:"
    log "  - README.md - Project overview"
    log "  - AGENT_INSTRUCTIONS.md - AI agent guide"
    log "  - Technical specs in docs/ directory"
    echo ""
    log "Log file saved to: $LOG_FILE"
}

###############################################################################
# Main Installation Flow
###############################################################################

main() {
    log_section "ALCS Bootstrap - Starting Installation"
    log "Project Directory: $PROJECT_DIR"
    log "Log File: $LOG_FILE"

    parse_args "$@"

    detect_os
    install_system_deps
    install_nodejs
    install_project_deps
    setup_database
    build_project
    check_ollama

    print_summary

    log_section "Bootstrap Complete"
    exit 0
}

###############################################################################
# Error Handler
###############################################################################

error_handler() {
    local line_number=$1
    log_error "Installation failed at line $line_number"
    log_error "Check $LOG_FILE for details"
    log_error "You can re-run this script - it's idempotent"
    exit 1
}

trap 'error_handler ${LINENO}' ERR

###############################################################################
# Execute
###############################################################################

main "$@"
