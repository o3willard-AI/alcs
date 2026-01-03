#!/bin/bash
# Kubernetes Deployment Test Suite
# Runs all validation tests for ALCS Kubernetes manifests

set -e

echo "=================================================="
echo "ALCS Kubernetes Deployment Test Suite"
echo "=================================================="
echo ""

# Check if we're in the right directory
if [ ! -d "k8s" ]; then
    echo "❌ Error: k8s directory not found"
    echo "   Please run this script from the ALCS root directory"
    exit 1
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

total_tests=0
passed_tests=0
failed_tests=0

# Test 1: Basic YAML Validation
echo "Test 1: Basic YAML Validation"
echo "------------------------------"
total_tests=$((total_tests + 1))
if python3 validate-k8s.py; then
    echo -e "${GREEN}✅ PASSED${NC}"
    passed_tests=$((passed_tests + 1))
else
    echo -e "${RED}❌ FAILED${NC}"
    failed_tests=$((failed_tests + 1))
fi
echo ""

# Test 2: Advanced Validation
echo "Test 2: Advanced Best Practices Validation"
echo "-------------------------------------------"
total_tests=$((total_tests + 1))
if python3 validate-k8s-advanced.py; then
    echo -e "${GREEN}✅ PASSED (with expected warnings)${NC}"
    passed_tests=$((passed_tests + 1))
else
    echo -e "${RED}❌ FAILED${NC}"
    failed_tests=$((failed_tests + 1))
fi
echo ""

# Test 3: Kustomize Configuration
echo "Test 3: Kustomize Configuration"
echo "--------------------------------"
total_tests=$((total_tests + 1))
if python3 test-kustomize.py; then
    echo -e "${GREEN}✅ PASSED (with expected warnings)${NC}"
    passed_tests=$((passed_tests + 1))
else
    echo -e "${RED}❌ FAILED${NC}"
    failed_tests=$((failed_tests + 1))
fi
echo ""

# Summary
echo "=================================================="
echo "Test Summary"
echo "=================================================="
echo "Total tests: $total_tests"
echo -e "Passed: ${GREEN}$passed_tests${NC}"
if [ $failed_tests -gt 0 ]; then
    echo -e "Failed: ${RED}$failed_tests${NC}"
else
    echo "Failed: 0"
fi
echo ""

if [ $failed_tests -eq 0 ]; then
    echo -e "${GREEN}✅ All tests passed!${NC}"
    echo ""
    echo "Your Kubernetes manifests are valid and ready for deployment."
    echo "Please review k8s/DEPLOYMENT-TEST-REPORT.md for detailed results."
    echo ""
    echo "Next steps:"
    echo "1. Update placeholder values in secret.yaml and kustomization.yaml"
    echo "2. Build and push your Docker image"
    echo "3. Deploy to a test cluster: kubectl apply -k k8s/"
    echo "4. Verify deployment: kubectl get pods -n alcs"
    exit 0
else
    echo -e "${RED}❌ Some tests failed${NC}"
    echo "Please fix the errors above before deploying."
    exit 1
fi
