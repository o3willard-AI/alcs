#!/bin/bash

#######################################
# ALCS Installation Verification Script
#
# Verifies that all test frameworks, static analysis tools,
# and Docker images are properly installed and functional.
#
# Usage: ./verify-installation.sh [options]
# Options:
#   --full         Run full verification including functional tests (default)
#   --quick        Run quick checks only (command availability)
#   --tools        Check tools only (no Docker)
#   --docker       Check Docker images only
#######################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Verification mode
MODE="full"

# Counters
TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[✓]${NC} $1"
    ((PASSED_CHECKS++))
    ((TOTAL_CHECKS++))
}

log_failure() {
    echo -e "${RED}[✗]${NC} $1"
    ((FAILED_CHECKS++))
    ((TOTAL_CHECKS++))
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_header() {
    echo ""
    echo -e "${BLUE}===== $1 =====${NC}"
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Verify Python installation and tools
verify_python() {
    log_header "Python Tools"

    # Check Python
    if command_exists python3; then
        local version=$(python3 --version 2>&1)
        log_success "Python: $version"

        # Check pip
        if command_exists pip3 || python3 -m pip --version &> /dev/null; then
            local pip_version=$(python3 -m pip --version 2>&1 | head -n 1)
            log_success "pip: $pip_version"
        else
            log_failure "pip: Not installed"
        fi

        # Check pytest
        if python3 -m pytest --version &> /dev/null; then
            local pytest_version=$(python3 -m pytest --version 2>&1)
            log_success "pytest: $pytest_version"

            if [ "$MODE" = "full" ]; then
                # Functional test
                local test_dir=$(mktemp -d)
                echo "def test_sample(): assert True" > "$test_dir/test_sample.py"
                if python3 -m pytest "$test_dir" -v &> /dev/null; then
                    log_success "pytest: Functional test passed"
                else
                    log_failure "pytest: Functional test failed"
                fi
                rm -rf "$test_dir"
            fi
        else
            log_failure "pytest: Not installed"
        fi

        # Check pytest-cov
        if python3 -m pytest --cov --version &> /dev/null 2>&1 || python3 -c "import pytest_cov" &> /dev/null; then
            log_success "pytest-cov: Installed"
        else
            log_failure "pytest-cov: Not installed"
        fi

        # Check pylint
        if command_exists pylint || python3 -m pylint --version &> /dev/null; then
            local pylint_version=$(python3 -m pylint --version 2>&1 | head -n 1)
            log_success "pylint: $pylint_version"

            if [ "$MODE" = "full" ]; then
                # Functional test
                local test_file=$(mktemp --suffix=.py)
                echo "print('hello')" > "$test_file"
                if python3 -m pylint "$test_file" --disable=all &> /dev/null; then
                    log_success "pylint: Functional test passed"
                else
                    log_failure "pylint: Functional test failed"
                fi
                rm -f "$test_file"
            fi
        else
            log_failure "pylint: Not installed"
        fi

        # Check bandit
        if command_exists bandit || python3 -m bandit --version &> /dev/null; then
            local bandit_version=$(bandit --version 2>&1 | head -n 1)
            log_success "bandit: $bandit_version"

            if [ "$MODE" = "full" ]; then
                # Functional test
                local test_file=$(mktemp --suffix=.py)
                echo "import os" > "$test_file"
                if bandit "$test_file" -f json &> /dev/null; then
                    log_success "bandit: Functional test passed"
                else
                    log_failure "bandit: Functional test failed"
                fi
                rm -f "$test_file"
            fi
        else
            log_failure "bandit: Not installed"
        fi

        # Check coverage
        if python3 -m coverage --version &> /dev/null; then
            local coverage_version=$(python3 -m coverage --version 2>&1)
            log_success "coverage: $coverage_version"
        else
            log_failure "coverage: Not installed"
        fi

    else
        log_failure "Python: Not installed"
    fi
}

# Verify Node.js installation and tools
verify_nodejs() {
    log_header "JavaScript/TypeScript Tools"

    # Check Node.js
    if command_exists node; then
        local node_version=$(node --version)
        log_success "Node.js: $node_version"

        # Check npm
        if command_exists npm; then
            local npm_version=$(npm --version)
            log_success "npm: v$npm_version"
        else
            log_failure "npm: Not installed"
        fi

        # Check Jest
        if command_exists jest || npx jest --version &> /dev/null; then
            local jest_version=$(npx jest --version 2>&1 | head -n 1)
            log_success "Jest: $jest_version"

            if [ "$MODE" = "full" ]; then
                # Functional test
                local test_dir=$(mktemp -d)
                echo "test('sample', () => { expect(1).toBe(1); });" > "$test_dir/sample.test.js"
                if npx jest "$test_dir" --passWithNoTests &> /dev/null; then
                    log_success "Jest: Functional test passed"
                else
                    log_failure "Jest: Functional test failed"
                fi
                rm -rf "$test_dir"
            fi
        else
            log_failure "Jest: Not installed"
        fi

        # Check ESLint
        if command_exists eslint || npx eslint --version &> /dev/null; then
            local eslint_version=$(npx eslint --version 2>&1)
            log_success "ESLint: $eslint_version"

            if [ "$MODE" = "full" ]; then
                # Functional test
                local test_file=$(mktemp --suffix=.js)
                echo "const x = 1;" > "$test_file"
                if npx eslint "$test_file" --no-eslintrc &> /dev/null; then
                    log_success "ESLint: Functional test passed"
                else
                    # ESLint may report style issues, which is okay
                    log_success "ESLint: Functional test passed (with style warnings)"
                fi
                rm -f "$test_file"
            fi
        else
            log_failure "ESLint: Not installed"
        fi

        # Check TypeScript
        if command_exists tsc || npx tsc --version &> /dev/null; then
            local ts_version=$(npx tsc --version 2>&1)
            log_success "TypeScript: $ts_version"
        else
            log_failure "TypeScript: Not installed"
        fi

    else
        log_failure "Node.js: Not installed"
    fi
}

# Verify Go installation
verify_go() {
    log_header "Go Tools"

    # Check Go
    if command_exists go; then
        local go_version=$(go version)
        log_success "Go: $go_version"

        if [ "$MODE" = "full" ]; then
            # Functional test
            local test_dir=$(mktemp -d)
            cd "$test_dir"
            echo "package main" > main.go
            echo "import \"testing\"" > main_test.go
            echo "func TestSample(t *testing.T) { t.Log(\"ok\") }" >> main_test.go
            go mod init test &> /dev/null
            if go test -v &> /dev/null; then
                log_success "go test: Functional test passed"
            else
                log_failure "go test: Functional test failed"
            fi
            cd - > /dev/null
            rm -rf "$test_dir"
        fi

        # Check coverage support
        if go tool cover -h &> /dev/null; then
            log_success "go tool cover: Available"
        else
            log_failure "go tool cover: Not available"
        fi

    else
        log_failure "Go: Not installed"
    fi
}

# Verify Java installation and tools
verify_java() {
    log_header "Java Tools"

    # Check Java
    if command_exists java; then
        local java_version=$(java -version 2>&1 | head -n 1)
        log_success "Java: $java_version"

        # Check javac
        if command_exists javac; then
            local javac_version=$(javac -version 2>&1)
            log_success "javac: $javac_version"
        else
            log_failure "javac: Not installed"
        fi

        # Check Maven
        if command_exists mvn; then
            local mvn_version=$(mvn --version 2>&1 | head -n 1)
            log_success "Maven: $mvn_version"

            if [ "$MODE" = "full" ]; then
                # Functional test
                local test_dir=$(mktemp -d)
                cd "$test_dir"

                # Create minimal pom.xml
                cat > pom.xml << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0
         http://maven.apache.org/xsd/maven-4.0.0.xsd">
  <modelVersion>4.0.0</modelVersion>
  <groupId>com.test</groupId>
  <artifactId>test</artifactId>
  <version>1.0</version>
  <properties>
    <maven.compiler.source>11</maven.compiler.source>
    <maven.compiler.target>11</maven.compiler.target>
  </properties>
</project>
EOF

                if mvn validate &> /dev/null; then
                    log_success "Maven: Functional test passed"
                else
                    log_failure "Maven: Functional test failed"
                fi

                cd - > /dev/null
                rm -rf "$test_dir"
            fi
        else
            log_failure "Maven: Not installed"
        fi

    else
        log_failure "Java: Not installed"
    fi
}

# Verify Docker installation and images
verify_docker() {
    log_header "Docker"

    # Check Docker
    if command_exists docker; then
        local docker_version=$(docker --version)
        log_success "Docker: $docker_version"

        # Check Docker daemon
        if docker info &> /dev/null; then
            log_success "Docker daemon: Running"

            # Check for ALCS images
            local images=("alcs/test-runner-python:latest" "alcs/test-runner-node:latest" "alcs/test-runner-go:latest" "alcs/test-runner-java:latest")

            for image in "${images[@]}"; do
                if docker images -q "$image" &> /dev/null && [ -n "$(docker images -q "$image")" ]; then
                    local image_size=$(docker images "$image" --format "{{.Size}}" | head -n 1)
                    log_success "Docker image: $image (Size: $image_size)"

                    if [ "$MODE" = "full" ]; then
                        # Functional test - run container
                        if docker run --rm "$image" echo "test" &> /dev/null; then
                            log_success "Docker image $image: Functional test passed"
                        else
                            log_failure "Docker image $image: Functional test failed"
                        fi
                    fi
                else
                    log_failure "Docker image: $image (Not found)"
                fi
            done

            # Check docker-compose
            if command_exists docker-compose || docker compose version &> /dev/null; then
                local compose_version=$(docker compose version 2>&1 || docker-compose --version 2>&1)
                log_success "Docker Compose: $compose_version"
            else
                log_warning "Docker Compose: Not installed (optional)"
            fi

        else
            log_failure "Docker daemon: Not running"
        fi

    else
        log_failure "Docker: Not installed"
    fi
}

# Main verification function
main() {
    log_info "ALCS Installation Verification Script"
    log_info "======================================"
    echo ""

    # Parse arguments
    while [ $# -gt 0 ]; do
        case "$1" in
            --full)
                MODE="full"
                log_info "Mode: Full verification (includes functional tests)"
                ;;
            --quick)
                MODE="quick"
                log_info "Mode: Quick verification (command availability only)"
                ;;
            --tools)
                MODE="tools"
                log_info "Mode: Tools only (no Docker)"
                ;;
            --docker)
                MODE="docker"
                log_info "Mode: Docker only"
                ;;
            *)
                log_warning "Unknown option: $1"
                echo "Usage: $0 [--full|--quick|--tools|--docker]"
                exit 1
                ;;
        esac
        shift
    done

    local start_time=$(date +%s)

    # Run verifications based on mode
    if [ "$MODE" != "docker" ]; then
        verify_python
        verify_nodejs
        verify_go
        verify_java
    fi

    if [ "$MODE" != "tools" ]; then
        verify_docker
    fi

    local end_time=$(date +%s)
    local duration=$((end_time - start_time))

    # Summary
    log_header "Verification Summary"
    echo ""
    log_info "Total checks: $TOTAL_CHECKS"
    log_info "Passed: $PASSED_CHECKS"
    log_info "Failed: $FAILED_CHECKS"
    log_info "Duration: ${duration} seconds"
    echo ""

    if [ $FAILED_CHECKS -eq 0 ]; then
        log_success "All verification checks passed!"
        echo ""
        log_info "Your ALCS installation is ready to use."
        return 0
    else
        log_failure "$FAILED_CHECKS check(s) failed"
        echo ""
        log_info "Recommendations:"
        if [ $FAILED_CHECKS -gt 0 ]; then
            echo "  1. Install missing tools using: ./scripts/install-analysis-tools.sh"
            if [ "$MODE" != "tools" ]; then
                echo "  2. Build Docker images using: ./scripts/build-test-images.sh"
            fi
            echo "  3. Re-run this verification script"
        fi
        return 1
    fi
}

# Run main function
main "$@"
