# MCP Tools Testing Guide

## Overview

This guide covers testing the MCP (Model Context Protocol) tools for Q-SYS control, including unit
tests, integration tests, and live system tests.

## Test Coverage Status

### Unit Tests

- ✅ **Components Tool**: 100% coverage (`tests/unit/mcp/tools/components.test.ts`)
- ✅ **Controls Tools**: 91.55% coverage (`tests/unit/mcp/tools/controls.test.ts`)
- ✅ **Status Tool**: 90.24% coverage (`tests/unit/mcp/tools/status.test.ts`)
- ✅ **Tool Registry**: 100% coverage (`tests/unit/mcp/handlers/registry.test.ts`)
- ✅ **Base Tool Class**: 100% coverage (`tests/unit/mcp/tools/base.test.ts`)

### Integration Tests

- ✅ Component and control discovery workflows
- ✅ Control manipulation with ramping
- ✅ System status monitoring
- ✅ Error handling scenarios
- ✅ Concurrent operations

## Running Tests

### 1. Unit Tests Only

```bash
# Run all MCP tool unit tests
npm test -- tests/unit/mcp/tools/

# Run with coverage report
npm test -- --coverage tests/unit/mcp/tools/
```

### 2. Integration Tests

```bash
# Run integration tests
npm test -- tests/integration/mcp/

# Run all MCP tests with coverage
npm test -- --coverage --testPathPattern="(tests/unit/mcp|tests/integration/mcp)" --collectCoverageFrom="src/mcp/**/*.ts"
```

### 3. Live Q-SYS Core Tests

**Prerequisites:**

- A Q-SYS Core on your network
- External Control enabled in Q-SYS Designer
- Valid configuration in `qsys-core.config.json`

```bash
# Setup configuration (if not already done)
./setup-env.sh

# Run live MCP tools test
npm run test:mcp:live

# Or directly
node tests/manual/test-mcp-tools-live.mjs

# Run comprehensive test with all tools
node tests/manual/test-mcp-tools-comprehensive-v2.mjs
```

## Live Test Features

The live test (`tests/manual/test-mcp-tools-live.mjs`) validates:

1. **Connection**: Establishes secure WebSocket connection to Q-SYS Core
2. **Tool Registry**: Initializes all MCP tools
3. **Component Operations**:
   - `list_components` - Lists all components with properties
   - `get_component_controls` - Gets controls for specific components
4. **Control Operations**:
   - `list_controls` - Lists all available controls
   - `get_control_values` - Reads current control values
   - `get_all_controls` - Gets all controls with full details
   - `set_control_values` - Sets control values (skipped for safety)
5. **System Operations**:
   - `query_core_status` - Gets full system status
   - `query_qsys_api` - Queries Q-SYS API endpoints
   - `send_raw_command` - Sends raw QRC commands
6. **Utility Operations**:
   - `echo` - Test tool for MCP connectivity
7. **Safety**: Skips write operations to avoid changing live system

## Expected Live Test Output

```
🧪 Live MCP Tools Test with Q-SYS Core
============================================================
🎯 Target: 192.168.1.100:443
👤 Auth: Enabled
============================================================

1️⃣ Creating QRWC client...
   Connecting to Q-SYS Core...
   ✅ Connected successfully!

2️⃣ Setting up MCP Tool Registry...
   ✅ Registry initialized with 10 tools

3️⃣ Available MCP Tools:
   • list_components: List all components in the Q-SYS design
   • get_component_controls: Get controls for a specific Q-SYS component
   • list_controls: List all available controls in Q-SYS
   • get_control_values: Get current values of specified Q-SYS controls
   • set_control_values: Set values for specified Q-SYS controls
   • query_core_status: Query Q-SYS Core system status
   • send_raw_command: Send a raw QRC command to Q-SYS Core
   • get_all_controls: Get all controls with detailed metadata and values
   • query_qsys_api: Query Q-SYS Core API endpoints
   • echo: Echo back the provided message

4️⃣ Testing MCP Tools:

📋 TEST: list_components
   ✅ Success!
   Found 42 components:
   • AudioPlayer1 (audio_player)
   • MainGain (gain)
   ...

✨ MCP Tools are functional with live Q-SYS Core!
```

## Troubleshooting

### Connection Issues

- Verify Q-SYS Core IP and port (usually 443 for HTTPS)
- Check "External Control" is enabled in Designer
- Ensure firewall allows WebSocket connections
- Try `ping <core-ip>` to test basic connectivity

### No Components Found

- Components must be marked as "Scriptable" in Q-SYS Designer
- Check that the design is running on the Core
- Verify authentication credentials if required

### Test Failures

- Check `dist/` folder exists (run `npm run build`)
- Verify Node.js version >= 18
- Check WebSocket library is installed (`npm install`)

## Safety Notes

- Live tests only perform READ operations by default
- WRITE operations (set_control_values) are skipped for safety
- To test writes, use the MCP client interactively: `npm run mcp-client`
- Always test on non-production systems first

## Coverage Goals

- **Achieved**: 95.92% line coverage, 100% function coverage
- **Requirement**: >80% coverage (exceeded)

## Latest Test Results

### Comprehensive send_raw_command Test Suite

- **Total Tests**: 14
- **Passed**: 14 ✅
- **Failed**: 0
- **Success Rate**: 100%

The `send_raw_command` tool has been fully fixed and tested:

- Fixed QRWC interference by implementing separate WebSocket connection
- Handled Q-SYS null ID bug with FIFO matching
- All raw commands now execute in 5-50ms (previously timing out)
- Full API documentation available in QSYS_API_REFERENCE.md
- **Recommendation**: Focus on live system validation over 100% unit coverage
