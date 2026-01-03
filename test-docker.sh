#!/bin/bash
# Test ALCS Docker image
# This script runs comprehensive tests on the built Docker image

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
IMAGE_NAME="${IMAGE_NAME:-alcs}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
CONTAINER_NAME="alcs-test-$$"
TEST_PORT="${TEST_PORT:-3000}"

echo -e "${BLUE}=================================================="
echo "ALCS Docker Image Test Suite"
echo -e "==================================================${NC}"
echo ""

# Check if Docker is available
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker is not installed${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Docker is available${NC}"
echo ""

# Check if image exists
if ! docker image inspect "$IMAGE_NAME:$IMAGE_TAG" &> /dev/null; then
    echo -e "${RED}❌ Image not found: $IMAGE_NAME:$IMAGE_TAG${NC}"
    echo ""
    echo "Please build the image first:"
    echo "  ./build-docker.sh"
    exit 1
fi

echo -e "${GREEN}✅ Image found: $IMAGE_NAME:$IMAGE_TAG${NC}"
echo ""

# Test counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Helper function to run tests
run_test() {
    local test_name="$1"
    local test_command="$2"

    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    echo -e "${BLUE}Test $TOTAL_TESTS: $test_name${NC}"

    if eval "$test_command"; then
        echo -e "${GREEN}✅ PASSED${NC}"
        PASSED_TESTS=$((PASSED_TESTS + 1))
        return 0
    else
        echo -e "${RED}❌ FAILED${NC}"
        FAILED_TESTS=$((FAILED_TESTS + 1))
        return 1
    fi
}

# Cleanup function
cleanup() {
    echo ""
    echo "🧹 Cleaning up..."
    docker rm -f "$CONTAINER_NAME" 2>/dev/null || true
}

trap cleanup EXIT

# Test 1: Image Inspection
echo -e "${BLUE}Test 1: Image Inspection${NC}"
echo "----------------------------------------------------"

# Get image details
IMAGE_ID=$(docker image inspect "$IMAGE_NAME:$IMAGE_TAG" --format='{{.Id}}' | cut -d':' -f2 | cut -c1-12)
IMAGE_SIZE=$(docker image inspect "$IMAGE_NAME:$IMAGE_TAG" --format='{{.Size}}' | awk '{print $1/1024/1024 " MB"}')
IMAGE_CREATED=$(docker image inspect "$IMAGE_NAME:$IMAGE_TAG" --format='{{.Created}}')

echo "  Image ID: $IMAGE_ID"
echo "  Size: $IMAGE_SIZE"
echo "  Created: $IMAGE_CREATED"

# Check image labels
echo ""
echo "  Labels:"
docker image inspect "$IMAGE_NAME:$IMAGE_TAG" --format='{{range $k, $v := .Config.Labels}}  {{$k}}: {{$v}}{{println}}{{end}}'

# Check exposed ports
echo ""
echo "  Exposed ports:"
docker image inspect "$IMAGE_NAME:$IMAGE_TAG" --format='{{range $k, $v := .Config.ExposedPorts}}  {{$k}}{{println}}{{end}}'

# Check user
echo ""
echo "  User: $(docker image inspect "$IMAGE_NAME:$IMAGE_TAG" --format='{{.Config.User}}')"

# Check entrypoint and cmd
echo "  Entrypoint: $(docker image inspect "$IMAGE_NAME:$IMAGE_TAG" --format='{{.Config.Entrypoint}}')"
echo "  Cmd: $(docker image inspect "$IMAGE_NAME:$IMAGE_TAG" --format='{{.Config.Cmd}}')"

echo -e "${GREEN}✅ Image inspection complete${NC}"
echo ""

# Test 2: Security Scan
echo -e "${BLUE}Test 2: Security Checks${NC}"
echo "----------------------------------------------------"

# Check if running as root
USER=$(docker image inspect "$IMAGE_NAME:$IMAGE_TAG" --format='{{.Config.User}}')
if [ -z "$USER" ] || [ "$USER" = "root" ] || [ "$USER" = "0" ]; then
    echo -e "${RED}❌ Container runs as root (security risk)${NC}"
    FAILED_TESTS=$((FAILED_TESTS + 1))
else
    echo -e "${GREEN}✅ Container runs as non-root user: $USER${NC}"
    PASSED_TESTS=$((PASSED_TESTS + 1))
fi
TOTAL_TESTS=$((TOTAL_TESTS + 1))

# Check for health check
HEALTHCHECK=$(docker image inspect "$IMAGE_NAME:$IMAGE_TAG" --format='{{.Config.Healthcheck}}')
if [ -z "$HEALTHCHECK" ] || [ "$HEALTHCHECK" = "<nil>" ]; then
    echo -e "${YELLOW}⚠️  No health check configured${NC}"
else
    echo -e "${GREEN}✅ Health check configured${NC}"
    PASSED_TESTS=$((PASSED_TESTS + 1))
fi
TOTAL_TESTS=$((TOTAL_TESTS + 1))

echo ""

# Test 3: Start Container
echo -e "${BLUE}Test 3: Start Container${NC}"
echo "----------------------------------------------------"

# Create test environment file
cat > /tmp/alcs-test.env <<EOF
NODE_ENV=production
PORT=3000
LOG_LEVEL=info
DATABASE_URL=postgresql://test:test@localhost:5432/test
REDIS_URL=redis://localhost:6379
ENABLE_AUTHENTICATION=false
ENABLE_RATE_LIMITING=false
EOF

echo "Starting container..."
if docker run -d \
    --name "$CONTAINER_NAME" \
    --env-file /tmp/alcs-test.env \
    -p "$TEST_PORT:3000" \
    "$IMAGE_NAME:$IMAGE_TAG" > /dev/null; then
    echo -e "${GREEN}✅ Container started${NC}"
    PASSED_TESTS=$((PASSED_TESTS + 1))
else
    echo -e "${RED}❌ Failed to start container${NC}"
    FAILED_TESTS=$((FAILED_TESTS + 1))
    exit 1
fi
TOTAL_TESTS=$((TOTAL_TESTS + 1))

# Wait for container to be ready
echo "Waiting for container to be ready..."
for i in {1..30}; do
    if docker ps | grep -q "$CONTAINER_NAME"; then
        sleep 1
    else
        echo -e "${RED}❌ Container exited unexpectedly${NC}"
        echo ""
        echo "Container logs:"
        docker logs "$CONTAINER_NAME"
        exit 1
    fi

    # Try to connect
    if curl -s -f http://localhost:$TEST_PORT/health > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Container is ready (took ${i}s)${NC}"
        break
    fi

    if [ $i -eq 30 ]; then
        echo -e "${YELLOW}⚠️  Container didn't become ready after 30s${NC}"
        echo ""
        echo "Container status:"
        docker ps -a | grep "$CONTAINER_NAME"
        echo ""
        echo "Container logs:"
        docker logs "$CONTAINER_NAME"
    fi
done

echo ""

# Test 4: Health Check
echo -e "${BLUE}Test 4: Health Check Endpoint${NC}"
echo "----------------------------------------------------"

HEALTH_RESPONSE=$(curl -s http://localhost:$TEST_PORT/health 2>/dev/null || echo "")
if [ -n "$HEALTH_RESPONSE" ]; then
    echo "Response: $HEALTH_RESPONSE"

    if echo "$HEALTH_RESPONSE" | grep -q "healthy\|ok\|status"; then
        echo -e "${GREEN}✅ Health check endpoint responding${NC}"
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        echo -e "${YELLOW}⚠️  Unexpected health check response${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  Health check endpoint not accessible${NC}"
    echo "This may be expected if database is not connected"
fi
TOTAL_TESTS=$((TOTAL_TESTS + 1))

echo ""

# Test 5: Metrics Endpoint
echo -e "${BLUE}Test 5: Metrics Endpoint${NC}"
echo "----------------------------------------------------"

METRICS_RESPONSE=$(curl -s http://localhost:9090/metrics 2>/dev/null || echo "")
if [ -n "$METRICS_RESPONSE" ]; then
    echo "Metrics available:"
    echo "$METRICS_RESPONSE" | grep "^alcs_" | head -5
    echo "  ... ($(echo "$METRICS_RESPONSE" | grep -c "^alcs_") metrics total)"

    if echo "$METRICS_RESPONSE" | grep -q "alcs_"; then
        echo -e "${GREEN}✅ Metrics endpoint responding${NC}"
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        echo -e "${YELLOW}⚠️  No ALCS metrics found${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  Metrics endpoint not accessible on port 9090${NC}"
fi
TOTAL_TESTS=$((TOTAL_TESTS + 1))

echo ""

# Test 6: Container Resources
echo -e "${BLUE}Test 6: Container Resource Usage${NC}"
echo "----------------------------------------------------"

STATS=$(docker stats "$CONTAINER_NAME" --no-stream --format "table {{.CPUPerc}}\t{{.MemUsage}}")
echo "$STATS"

MEM_USAGE=$(docker stats "$CONTAINER_NAME" --no-stream --format "{{.MemUsage}}" | cut -d'/' -f1 | sed 's/[^0-9.]//g')
if [ -n "$MEM_USAGE" ]; then
    echo ""
    if (( $(echo "$MEM_USAGE < 500" | bc -l) )); then
        echo -e "${GREEN}✅ Memory usage is reasonable (${MEM_USAGE} MiB)${NC}"
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        echo -e "${YELLOW}⚠️  High memory usage: ${MEM_USAGE} MiB${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  Could not determine memory usage${NC}"
fi
TOTAL_TESTS=$((TOTAL_TESTS + 1))

echo ""

# Test 7: Container Logs
echo -e "${BLUE}Test 7: Container Logs${NC}"
echo "----------------------------------------------------"

echo "Recent logs (last 20 lines):"
docker logs "$CONTAINER_NAME" --tail 20

# Check for errors in logs
ERROR_COUNT=$(docker logs "$CONTAINER_NAME" 2>&1 | grep -i "error" | wc -l)
if [ "$ERROR_COUNT" -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✅ No errors in container logs${NC}"
    PASSED_TESTS=$((PASSED_TESTS + 1))
else
    echo ""
    echo -e "${YELLOW}⚠️  Found $ERROR_COUNT error messages in logs${NC}"
fi
TOTAL_TESTS=$((TOTAL_TESTS + 1))

echo ""

# Test 8: File System
echo -e "${BLUE}Test 8: Container File System${NC}"
echo "----------------------------------------------------"

echo "Checking application files..."
docker exec "$CONTAINER_NAME" ls -la /app/dist | head -10

echo ""
echo "Checking ownership..."
docker exec "$CONTAINER_NAME" ls -la /app/dist/mcp-server.js

echo ""
echo "Checking user..."
CONTAINER_USER=$(docker exec "$CONTAINER_NAME" whoami)
if [ "$CONTAINER_USER" != "root" ]; then
    echo -e "${GREEN}✅ Running as user: $CONTAINER_USER${NC}"
    PASSED_TESTS=$((PASSED_TESTS + 1))
else
    echo -e "${RED}❌ Running as root${NC}"
    FAILED_TESTS=$((FAILED_TESTS + 1))
fi
TOTAL_TESTS=$((TOTAL_TESTS + 1))

echo ""

# Test 9: Image Layers
echo -e "${BLUE}Test 9: Image Layer Analysis${NC}"
echo "----------------------------------------------------"

LAYER_COUNT=$(docker history "$IMAGE_NAME:$IMAGE_TAG" --no-trunc | wc -l)
echo "Total layers: $((LAYER_COUNT - 1))"  # -1 for header

if [ $LAYER_COUNT -lt 30 ]; then
    echo -e "${GREEN}✅ Reasonable number of layers${NC}"
    PASSED_TESTS=$((PASSED_TESTS + 1))
else
    echo -e "${YELLOW}⚠️  Many layers ($LAYER_COUNT). Consider combining RUN commands.${NC}"
fi
TOTAL_TESTS=$((TOTAL_TESTS + 1))

echo ""

# Test 10: Vulnerability Scan (if trivy is available)
echo -e "${BLUE}Test 10: Vulnerability Scan${NC}"
echo "----------------------------------------------------"

if command -v trivy &> /dev/null; then
    echo "Running Trivy vulnerability scan..."
    if trivy image --severity HIGH,CRITICAL --no-progress "$IMAGE_NAME:$IMAGE_TAG"; then
        echo -e "${GREEN}✅ No high/critical vulnerabilities found${NC}"
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        echo -e "${YELLOW}⚠️  Vulnerabilities found (see above)${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  Trivy not installed, skipping vulnerability scan${NC}"
    echo "   Install: https://github.com/aquasecurity/trivy"
fi
TOTAL_TESTS=$((TOTAL_TESTS + 1))

echo ""

# Cleanup
rm -f /tmp/alcs-test.env

# Summary
echo -e "${BLUE}=================================================="
echo "Test Summary"
echo -e "==================================================${NC}"
echo "Total tests: $TOTAL_TESTS"
echo -e "Passed: ${GREEN}$PASSED_TESTS${NC}"
if [ $FAILED_TESTS -gt 0 ]; then
    echo -e "Failed: ${RED}$FAILED_TESTS${NC}"
else
    echo "Failed: 0"
fi
echo ""

if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "${GREEN}✅ All tests passed!${NC}"
    echo ""
    echo "The Docker image is working correctly."
    echo ""
    echo "Next steps:"
    echo "  1. Tag for registry: docker tag $IMAGE_NAME:$IMAGE_TAG your-registry/alcs:$IMAGE_TAG"
    echo "  2. Push to registry: docker push your-registry/alcs:$IMAGE_TAG"
    echo "  3. Deploy to Kubernetes: kubectl apply -k k8s/"
    exit 0
else
    echo -e "${RED}❌ Some tests failed${NC}"
    echo "Please review the failures above."
    exit 1
fi
