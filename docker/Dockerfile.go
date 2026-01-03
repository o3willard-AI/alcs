# Go Test Execution Environment
# Pre-configured with Go test tools, golangci-lint, and related utilities

FROM golang:1.21-alpine

# Install system dependencies
RUN apk add --no-cache \
    git \
    bash \
    gcc \
    musl-dev

# Install Go tools for testing and analysis
RUN go install github.com/onsi/ginkgo/v2/ginkgo@latest && \
    go install github.com/onsi/gomega/...@latest && \
    go install golang.org/x/tools/cmd/cover@latest && \
    go install github.com/axw/gocov/gocov@latest && \
    go install github.com/AlekSi/gocov-xml@latest

# Install golangci-lint for static analysis
RUN wget -O- -nv https://raw.githubusercontent.com/golangci/golangci-lint/master/install.sh | sh -s v1.55.2

# Create non-root user for test execution
RUN adduser -D -u 1000 testuser

# Set working directory
WORKDIR /workspace

# Set Go environment variables
ENV GO111MODULE=on
ENV CGO_ENABLED=0

# Switch to non-root user
USER testuser

# Default command (can be overridden)
CMD ["/bin/bash"]

# Metadata
LABEL maintainer="ALCS Team"
LABEL description="Go test execution environment with native test tools"
LABEL version="1.0.0"
