#!/bin/bash
# Direct Ollama Testing Script
# Tests ALCS agents without MCP server

OLLAMA_HOST="http://192.168.101.85:11434"
ALPHA_MODEL="qwen2.5-coder:32b"
BETA_MODEL="deepseek-r1:14b"

echo "=================================================="
echo "ALCS Direct Ollama Testing"
echo "=================================================="
echo ""
echo "Ollama Server: $OLLAMA_HOST"
echo "Agent Alpha: $ALPHA_MODEL"
echo "Agent Beta: $BETA_MODEL"
echo ""

# Test 1: Verify models are loaded
echo "Test 1: Verifying models..."
echo "------------------------------------"

if curl -s "$OLLAMA_HOST/api/tags" | grep -q "$ALPHA_MODEL"; then
    echo "✅ Agent Alpha model loaded: $ALPHA_MODEL"
else
    echo "❌ Agent Alpha model NOT found: $ALPHA_MODEL"
    exit 1
fi

if curl -s "$OLLAMA_HOST/api/tags" | grep -q "$BETA_MODEL"; then
    echo "✅ Agent Beta model loaded: $BETA_MODEL"
else
    echo "❌ Agent Beta model NOT found: $BETA_MODEL"
    exit 1
fi

echo ""
echo "All models verified!"
echo ""
