#!/bin/bash
# Build ALCS Docker image
# This script builds the production Docker image with proper tagging

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
DOCKERFILE="${DOCKERFILE:-Dockerfile.prod}"
BUILD_CONTEXT="${BUILD_CONTEXT:-.}"

echo -e "${BLUE}=================================================="
echo "ALCS Docker Image Build"
echo -e "==================================================${NC}"
echo ""

# Check if Docker is available
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker is not installed or not in PATH${NC}"
    echo ""
    echo "Please install Docker:"
    echo "  • Ubuntu/Debian: sudo apt-get install docker.io"
    echo "  • macOS: brew install --cask docker"
    echo "  • Or visit: https://docs.docker.com/get-docker/"
    exit 1
fi

echo -e "${GREEN}✅ Docker is available${NC}"
docker --version
echo ""

# Check if Dockerfile exists
if [ ! -f "$DOCKERFILE" ]; then
    echo -e "${RED}❌ Dockerfile not found: $DOCKERFILE${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Dockerfile found: $DOCKERFILE${NC}"
echo ""

# Validate Dockerfile
echo -e "${BLUE}Step 1: Validating Dockerfile...${NC}"
echo "----------------------------------------------------"
if python3 validate-dockerfile.py; then
    echo -e "${GREEN}✅ Dockerfile validation passed${NC}"
else
    echo -e "${RED}❌ Dockerfile validation failed${NC}"
    echo "Please fix the errors above before building"
    exit 1
fi
echo ""

# Show build configuration
echo -e "${BLUE}Step 2: Build Configuration${NC}"
echo "----------------------------------------------------"
echo "  Image name: $IMAGE_NAME"
echo "  Image tag: $IMAGE_TAG"
echo "  Full image: $IMAGE_NAME:$IMAGE_TAG"
echo "  Dockerfile: $DOCKERFILE"
echo "  Build context: $BUILD_CONTEXT"
echo ""

# Check .dockerignore
if [ -f ".dockerignore" ]; then
    echo -e "${GREEN}✅ .dockerignore found (optimized build context)${NC}"
    echo "   Excluding $(wc -l < .dockerignore) patterns"
else
    echo -e "${YELLOW}⚠️  .dockerignore not found (may copy unnecessary files)${NC}"
fi
echo ""

# Build the image
echo -e "${BLUE}Step 3: Building Docker image...${NC}"
echo "----------------------------------------------------"
echo "This may take several minutes on first build..."
echo ""

BUILD_START=$(date +%s)

if docker build \
    -t "$IMAGE_NAME:$IMAGE_TAG" \
    -t "$IMAGE_NAME:latest" \
    -f "$DOCKERFILE" \
    --build-arg BUILD_DATE="$(date -u +'%Y-%m-%dT%H:%M:%SZ')" \
    --build-arg VCS_REF="$(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')" \
    --progress=plain \
    "$BUILD_CONTEXT"; then

    BUILD_END=$(date +%s)
    BUILD_TIME=$((BUILD_END - BUILD_START))

    echo ""
    echo -e "${GREEN}✅ Docker image built successfully${NC}"
    echo "   Build time: ${BUILD_TIME}s"
else
    echo ""
    echo -e "${RED}❌ Docker build failed${NC}"
    exit 1
fi
echo ""

# Show image info
echo -e "${BLUE}Step 4: Image Information${NC}"
echo "----------------------------------------------------"
docker images "$IMAGE_NAME" --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedAt}}"
echo ""

# Show image layers
echo -e "${BLUE}Image Layers:${NC}"
docker history "$IMAGE_NAME:$IMAGE_TAG" --no-trunc --format "table {{.CreatedBy}}\t{{.Size}}" | head -20
echo ""

# Summary
echo -e "${GREEN}=================================================="
echo "✅ Build Complete"
echo -e "==================================================${NC}"
echo ""
echo "Image: $IMAGE_NAME:$IMAGE_TAG"
echo "Size: $(docker images "$IMAGE_NAME:$IMAGE_TAG" --format "{{.Size}}")"
echo ""
echo "Next steps:"
echo "  1. Test the image: ./test-docker.sh"
echo "  2. Run the image: docker run -p 3000:3000 $IMAGE_NAME:$IMAGE_TAG"
echo "  3. Push to registry: docker push $IMAGE_NAME:$IMAGE_TAG"
echo ""
