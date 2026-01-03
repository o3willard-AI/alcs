#!/bin/bash

#######################################
# ALCS Analysis Tools Installation Script
#
# Installs all test frameworks and static analysis tools
# required for ALCS to perform real test execution and code analysis.
#
# Usage: ./install-analysis-tools.sh [options]
# Options:
#   --all          Install all tools (default)
#   --python       Install Python tools only
#   --javascript   Install JavaScript tools only
#   --go           Install Go tools only
#   --java         Install Java tools only
#   --docker       Install Docker (if not present)
#   --verify       Verify installations only
#######################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Detect OS
detect_os() {
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        if [ -f /etc/debian_version ]; then
            OS="debian"
            PKG_MANAGER="apt-get"
        elif [ -f /etc/redhat-release ]; then
            OS="redhat"
            PKG_MANAGER="yum"
        else
            OS="linux"
            PKG_MANAGER="unknown"
        fi
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        OS="macos"
        PKG_MANAGER="brew"
    else
        OS="unknown"
        PKG_MANAGER="unknown"
    fi
}

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Install Python and pip
install_python() {
    log_info "Installing Python and pip..."

    if command_exists python3; then
        log_success "Python3 already installed: $(python3 --version)"
    else
        case $OS in
            debian)
                sudo $PKG_MANAGER update
                sudo $PKG_MANAGER install -y python3 python3-pip python3-venv
                ;;
            redhat)
                sudo $PKG_MANAGER install -y python3 python3-pip
                ;;
            macos)
                brew install python3
                ;;
            *)
                log_error "Unsupported OS for Python installation"
                return 1
                ;;
        esac
    fi

    # Upgrade pip
    python3 -m pip install --upgrade pip
    log_success "Python setup complete"
}

# Install Python test and analysis tools
install_python_tools() {
    log_info "Installing Python test frameworks and analyzers..."

    # Install pytest with coverage
    python3 -m pip install --user pytest pytest-cov
    log_success "pytest and pytest-cov installed"

    # Install Pylint
    python3 -m pip install --user pylint
    log_success "pylint installed"

    # Install Bandit (security)
    python3 -m pip install --user bandit
    log_success "bandit installed"

    # Install flake8 (alternative linter)
    python3 -m pip install --user flake8
    log_success "flake8 installed"
}

# Install Node.js and npm
install_nodejs() {
    log_info "Installing Node.js and npm..."

    if command_exists node; then
        log_success "Node.js already installed: $(node --version)"
    else
        case $OS in
            debian)
                curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
                sudo $PKG_MANAGER install -y nodejs
                ;;
            redhat)
                curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
                sudo $PKG_MANAGER install -y nodejs
                ;;
            macos)
                brew install node
                ;;
            *)
                log_error "Unsupported OS for Node.js installation"
                return 1
                ;;
        esac
    fi

    log_success "Node.js setup complete"
}

# Install JavaScript test and analysis tools
install_javascript_tools() {
    log_info "Installing JavaScript test frameworks and analyzers..."

    # Install Jest
    npm install -g jest
    log_success "jest installed globally"

    # Install ESLint
    npm install -g eslint
    log_success "eslint installed globally"

    # Install TypeScript (for TS support)
    npm install -g typescript
    log_success "typescript installed globally"
}

# Install Go
install_go() {
    log_info "Installing Go..."

    if command_exists go; then
        log_success "Go already installed: $(go version)"
        return 0
    fi

    case $OS in
        debian|redhat)
            GO_VERSION="1.21.5"
            wget "https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz"
            sudo rm -rf /usr/local/go
            sudo tar -C /usr/local -xzf "go${GO_VERSION}.linux-amd64.tar.gz"
            rm "go${GO_VERSION}.linux-amd64.tar.gz"

            # Add to PATH
            echo 'export PATH=$PATH:/usr/local/go/bin' >> ~/.bashrc
            export PATH=$PATH:/usr/local/go/bin
            ;;
        macos)
            brew install go
            ;;
        *)
            log_error "Unsupported OS for Go installation"
            return 1
            ;;
    esac

    log_success "Go setup complete"
}

# Install Java and Maven
install_java() {
    log_info "Installing Java and Maven..."

    if command_exists java; then
        log_success "Java already installed: $(java -version 2>&1 | head -n 1)"
    else
        case $OS in
            debian)
                sudo $PKG_MANAGER update
                sudo $PKG_MANAGER install -y default-jdk
                ;;
            redhat)
                sudo $PKG_MANAGER install -y java-11-openjdk-devel
                ;;
            macos)
                brew install openjdk@17
                ;;
            *)
                log_error "Unsupported OS for Java installation"
                return 1
                ;;
        esac
    fi

    # Install Maven
    if command_exists mvn; then
        log_success "Maven already installed: $(mvn --version | head -n 1)"
    else
        case $OS in
            debian|redhat)
                sudo $PKG_MANAGER install -y maven
                ;;
            macos)
                brew install maven
                ;;
            *)
                log_error "Unsupported OS for Maven installation"
                return 1
                ;;
        esac
    fi

    log_success "Java and Maven setup complete"
}

# Install Docker
install_docker() {
    log_info "Installing Docker..."

    if command_exists docker; then
        log_success "Docker already installed: $(docker --version)"
        return 0
    fi

    case $OS in
        debian)
            # Install Docker on Debian/Ubuntu
            sudo $PKG_MANAGER update
            sudo $PKG_MANAGER install -y \
                ca-certificates \
                curl \
                gnupg \
                lsb-release

            # Add Docker's official GPG key
            sudo mkdir -p /etc/apt/keyrings
            curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

            # Set up repository
            echo \
              "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
              $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

            # Install Docker
            sudo $PKG_MANAGER update
            sudo $PKG_MANAGER install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

            # Add user to docker group
            sudo usermod -aG docker $USER
            ;;
        macos)
            log_warning "Please install Docker Desktop for Mac from: https://docs.docker.com/desktop/install/mac-install/"
            return 1
            ;;
        *)
            log_error "Unsupported OS for Docker installation"
            return 1
            ;;
    esac

    log_success "Docker setup complete"
    log_warning "You may need to log out and back in for Docker group membership to take effect"
}

# Verify installations
verify_tools() {
    log_info "Verifying tool installations..."
    echo ""

    # Python tools
    echo "Python Tools:"
    command_exists python3 && echo "  ✓ Python: $(python3 --version)" || echo "  ✗ Python: Not installed"
    command_exists pytest && echo "  ✓ pytest: $(pytest --version | head -n 1)" || echo "  ✗ pytest: Not installed"
    command_exists pylint && echo "  ✓ pylint: $(pylint --version | head -n 1)" || echo "  ✗ pylint: Not installed"
    command_exists bandit && echo "  ✓ bandit: $(bandit --version 2>&1 | head -n 1)" || echo "  ✗ bandit: Not installed"
    echo ""

    # JavaScript tools
    echo "JavaScript Tools:"
    command_exists node && echo "  ✓ Node.js: $(node --version)" || echo "  ✗ Node.js: Not installed"
    command_exists npm && echo "  ✓ npm: $(npm --version)" || echo "  ✗ npm: Not installed"
    command_exists jest && echo "  ✓ jest: $(jest --version)" || echo "  ✗ jest: Not installed"
    command_exists eslint && echo "  ✓ eslint: $(eslint --version)" || echo "  ✗ eslint: Not installed"
    echo ""

    # Go tools
    echo "Go Tools:"
    command_exists go && echo "  ✓ Go: $(go version)" || echo "  ✗ Go: Not installed"
    echo ""

    # Java tools
    echo "Java Tools:"
    command_exists java && echo "  ✓ Java: $(java -version 2>&1 | head -n 1)" || echo "  ✗ Java: Not installed"
    command_exists mvn && echo "  ✓ Maven: $(mvn --version | head -n 1)" || echo "  ✗ Maven: Not installed"
    echo ""

    # Docker
    echo "Container Tools:"
    command_exists docker && echo "  ✓ Docker: $(docker --version)" || echo "  ✗ Docker: Not installed"
    echo ""
}

# Main installation function
main() {
    log_info "ALCS Analysis Tools Installation Script"
    log_info "========================================"
    echo ""

    # Detect OS
    detect_os
    log_info "Detected OS: $OS (Package Manager: $PKG_MANAGER)"
    echo ""

    # Parse arguments
    INSTALL_PYTHON=false
    INSTALL_JAVASCRIPT=false
    INSTALL_GO=false
    INSTALL_JAVA=false
    INSTALL_DOCKER=false
    VERIFY_ONLY=false

    if [ $# -eq 0 ]; then
        # Default: install all
        INSTALL_PYTHON=true
        INSTALL_JAVASCRIPT=true
        INSTALL_GO=true
        INSTALL_JAVA=true
        INSTALL_DOCKER=true
    else
        while [ $# -gt 0 ]; do
            case "$1" in
                --all)
                    INSTALL_PYTHON=true
                    INSTALL_JAVASCRIPT=true
                    INSTALL_GO=true
                    INSTALL_JAVA=true
                    INSTALL_DOCKER=true
                    ;;
                --python)
                    INSTALL_PYTHON=true
                    ;;
                --javascript)
                    INSTALL_JAVASCRIPT=true
                    ;;
                --go)
                    INSTALL_GO=true
                    ;;
                --java)
                    INSTALL_JAVA=true
                    ;;
                --docker)
                    INSTALL_DOCKER=true
                    ;;
                --verify)
                    VERIFY_ONLY=true
                    ;;
                *)
                    log_error "Unknown option: $1"
                    echo "Usage: $0 [--all|--python|--javascript|--go|--java|--docker|--verify]"
                    exit 1
                    ;;
            esac
            shift
        done
    fi

    # Verify only mode
    if [ "$VERIFY_ONLY" = true ]; then
        verify_tools
        exit 0
    fi

    # Install tools
    if [ "$INSTALL_PYTHON" = true ]; then
        install_python
        install_python_tools
        echo ""
    fi

    if [ "$INSTALL_JAVASCRIPT" = true ]; then
        install_nodejs
        install_javascript_tools
        echo ""
    fi

    if [ "$INSTALL_GO" = true ]; then
        install_go
        echo ""
    fi

    if [ "$INSTALL_JAVA" = true ]; then
        install_java
        echo ""
    fi

    if [ "$INSTALL_DOCKER" = true ]; then
        install_docker
        echo ""
    fi

    # Verify installations
    echo ""
    log_success "Installation complete!"
    echo ""
    verify_tools

    echo ""
    log_info "Next steps:"
    echo "  1. If Docker was installed, log out and back in"
    echo "  2. Run 'npm install' in the ALCS directory"
    echo "  3. Run 'npm test' to verify everything works"
    echo "  4. Start ALCS with 'npm start'"
}

# Run main function
main "$@"
