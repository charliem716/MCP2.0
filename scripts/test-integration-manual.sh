#!/bin/bash

echo "Running integration tests with Q-SYS Core..."
echo "These tests require a live Q-SYS connection and use --forceExit to work around QRWC polling issues"
echo ""

# Run debug-tools test
echo "1. Running debug-tools-test..."
npm test tests/integration/debug-tools-test.test.ts -- --testNamePattern="Debug MCP Tools Test" --forceExit

# Run live-mcp-tools test  
echo ""
echo "2. Running live-mcp-tools-test..."
npm test tests/integration/live-mcp-tools-test.test.ts -- --testNamePattern="Live MCP Tools Integration Tests" --forceExit

echo ""
echo "Integration tests completed!"