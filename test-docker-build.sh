#!/bin/bash
# Complete Docker Build Test Suite
# Runs all validation checks without requiring Docker

set -e

echo "=================================================="
echo "ALCS Docker Build Validation Suite"
echo "=================================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Test Dockerfile validation
echo "Test 1: Dockerfile Validation"
echo "------------------------------"
if python3 validate-dockerfile.py; then
    echo -e "${GREEN}✅ PASSED${NC}"
else
    echo "❌ FAILED"
    exit 1
fi
echo ""

# Check if Docker is available
echo "Test 2: Docker Environment"
echo "------------------------------"
if command -v docker &> /dev/null; then
    echo -e "${GREEN}✅ Docker is available${NC}"
    docker --version
    echo ""
    echo "You can now:"
    echo "  1. Build the image: ./build-docker.sh"
    echo "  2. Test the image: ./test-docker.sh"
else
    echo -e "${YELLOW}⚠️  Docker is not installed${NC}"
    echo ""
    echo "To build and test the image, install Docker:"
    echo "  • Ubuntu/Debian: sudo apt-get install docker.io"
    echo "  • macOS: brew install --cask docker"
    echo "  • Or visit: https://docs.docker.com/get-docker/"
fi
echo ""

echo "=================================================="
echo "Summary"
echo "=================================================="
echo ""
echo -e "${GREEN}✅ Dockerfile validation complete${NC}"
echo ""
echo "Generated files:"
echo "  • validate-dockerfile.py - Dockerfile validator"
echo "  • build-docker.sh - Build automation script"
echo "  • test-docker.sh - Comprehensive test script"
echo "  • .dockerignore - Build context optimization"
echo "  • DOCKER-BUILD-TEST-REPORT.md - Detailed report"
echo ""
echo "Next steps:"
if command -v docker &> /dev/null; then
    echo "  1. Build: ./build-docker.sh"
    echo "  2. Test: ./test-docker.sh"
    echo "  3. Push: docker push your-registry/alcs:latest"
else
    echo "  1. Install Docker"
    echo "  2. Build: ./build-docker.sh"
    echo "  3. Test: ./test-docker.sh"
fi
echo ""
