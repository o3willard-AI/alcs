#!/bin/bash

#######################################
# ALCS Docker Image Build Script
#
# Builds all test execution Docker images for ALCS.
# Images are pre-configured with test frameworks and analysis tools.
#
# Usage: ./build-test-images.sh [options]
# Options:
#   --all          Build all images (default)
#   --python       Build Python image only
#   --node         Build Node.js image only
#   --go           Build Go image only
#   --java         Build Java image only
#   --push         Push images to registry after building
#   --no-cache     Build without using cache
#   --parallel     Build images in parallel (faster but more resource-intensive)
#######################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default settings
PUSH_IMAGES=false
USE_CACHE=true
BUILD_PARALLEL=false

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

# Check if Docker is available
check_docker() {
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed or not in PATH"
        log_info "Please install Docker: https://docs.docker.com/get-docker/"
        exit 1
    fi

    if ! docker info &> /dev/null; then
        log_error "Docker daemon is not running"
        log_info "Please start Docker and try again"
        exit 1
    fi

    log_success "Docker is available: $(docker --version)"
}

# Build a single Docker image
build_image() {
    local dockerfile=$1
    local image_name=$2
    local context_dir=$3

    log_info "Building image: ${image_name}"
    log_info "Dockerfile: ${dockerfile}"

    local build_args="docker build"

    if [ "$USE_CACHE" = false ]; then
        build_args="$build_args --no-cache"
    fi

    build_args="$build_args -t ${image_name}"
    build_args="$build_args -f ${dockerfile}"
    build_args="$build_args ${context_dir}"

    if $build_args; then
        log_success "Successfully built ${image_name}"

        # Show image size
        local image_size=$(docker images ${image_name} --format "{{.Size}}" | head -n 1)
        log_info "Image size: ${image_size}"

        return 0
    else
        log_error "Failed to build ${image_name}"
        return 1
    fi
}

# Push image to registry
push_image() {
    local image_name=$1

    if [ "$PUSH_IMAGES" = true ]; then
        log_info "Pushing image: ${image_name}"

        if docker push "${image_name}"; then
            log_success "Successfully pushed ${image_name}"
        else
            log_error "Failed to push ${image_name}"
            return 1
        fi
    fi
}

# Build Python image
build_python() {
    log_info "===== Building Python Test Runner ====="
    if build_image "docker/Dockerfile.python" "alcs/test-runner-python:latest" "docker"; then
        push_image "alcs/test-runner-python:latest"
        return 0
    fi
    return 1
}

# Build Node.js image
build_node() {
    log_info "===== Building Node.js Test Runner ====="
    if build_image "docker/Dockerfile.node" "alcs/test-runner-node:latest" "docker"; then
        push_image "alcs/test-runner-node:latest"
        return 0
    fi
    return 1
}

# Build Go image
build_go() {
    log_info "===== Building Go Test Runner ====="
    if build_image "docker/Dockerfile.go" "alcs/test-runner-go:latest" "docker"; then
        push_image "alcs/test-runner-go:latest"
        return 0
    fi
    return 1
}

# Build Java image
build_java() {
    log_info "===== Building Java Test Runner ====="
    if build_image "docker/Dockerfile.java" "alcs/test-runner-java:latest" "docker"; then
        push_image "alcs/test-runner-java:latest"
        return 0
    fi
    return 1
}

# Build all images sequentially
build_all_sequential() {
    local failed=0

    build_python || ((failed++))
    echo ""

    build_node || ((failed++))
    echo ""

    build_go || ((failed++))
    echo ""

    build_java || ((failed++))
    echo ""

    return $failed
}

# Build all images in parallel
build_all_parallel() {
    log_info "Building all images in parallel..."

    local pids=()

    (build_python) &
    pids+=($!)

    (build_node) &
    pids+=($!)

    (build_go) &
    pids+=($!)

    (build_java) &
    pids+=($!)

    local failed=0
    for pid in "${pids[@]}"; do
        if ! wait "$pid"; then
            ((failed++))
        fi
    done

    return $failed
}

# Main build function
main() {
    log_info "ALCS Docker Image Build Script"
    log_info "==============================="
    echo ""

    # Check Docker availability
    check_docker
    echo ""

    # Parse arguments
    BUILD_PYTHON=false
    BUILD_NODE=false
    BUILD_GO=false
    BUILD_JAVA=false

    if [ $# -eq 0 ]; then
        # Default: build all
        BUILD_PYTHON=true
        BUILD_NODE=true
        BUILD_GO=true
        BUILD_JAVA=true
    else
        while [ $# -gt 0 ]; do
            case "$1" in
                --all)
                    BUILD_PYTHON=true
                    BUILD_NODE=true
                    BUILD_GO=true
                    BUILD_JAVA=true
                    ;;
                --python)
                    BUILD_PYTHON=true
                    ;;
                --node)
                    BUILD_NODE=true
                    ;;
                --go)
                    BUILD_GO=true
                    ;;
                --java)
                    BUILD_JAVA=true
                    ;;
                --push)
                    PUSH_IMAGES=true
                    log_info "Will push images to registry after building"
                    ;;
                --no-cache)
                    USE_CACHE=false
                    log_info "Building without cache"
                    ;;
                --parallel)
                    BUILD_PARALLEL=true
                    log_info "Building images in parallel"
                    ;;
                *)
                    log_error "Unknown option: $1"
                    echo "Usage: $0 [--all|--python|--node|--go|--java] [--push] [--no-cache] [--parallel]"
                    exit 1
                    ;;
            esac
            shift
        done
    fi

    echo ""

    # Change to project root directory
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
    cd "$PROJECT_ROOT"

    log_info "Working directory: $(pwd)"
    echo ""

    # Build images
    local start_time=$(date +%s)
    local failed=0

    if [ "$BUILD_PARALLEL" = true ] && [ "$BUILD_PYTHON" = true ] && [ "$BUILD_NODE" = true ] && [ "$BUILD_GO" = true ] && [ "$BUILD_JAVA" = true ]; then
        # Build all in parallel
        build_all_parallel
        failed=$?
    else
        # Build selected images sequentially
        if [ "$BUILD_PYTHON" = true ]; then
            build_python || ((failed++))
            echo ""
        fi

        if [ "$BUILD_NODE" = true ]; then
            build_node || ((failed++))
            echo ""
        fi

        if [ "$BUILD_GO" = true ]; then
            build_go || ((failed++))
            echo ""
        fi

        if [ "$BUILD_JAVA" = true ]; then
            build_java || ((failed++))
            echo ""
        fi
    fi

    local end_time=$(date +%s)
    local duration=$((end_time - start_time))

    # Summary
    echo ""
    log_info "===== Build Summary ====="
    log_info "Duration: ${duration} seconds"

    if [ $failed -eq 0 ]; then
        log_success "All images built successfully!"
    else
        log_error "${failed} image(s) failed to build"
        exit 1
    fi

    echo ""
    log_info "Available images:"
    docker images | grep "alcs/test-runner" || log_warning "No ALCS test runner images found"

    echo ""
    log_info "Next steps:"
    echo "  1. Test images: docker run -it alcs/test-runner-python:latest"
    echo "  2. Use with docker-compose: cd docker && docker-compose up"
    if [ "$PUSH_IMAGES" = false ]; then
        echo "  3. Push to registry: $0 --all --push"
    fi
}

# Run main function
main "$@"
