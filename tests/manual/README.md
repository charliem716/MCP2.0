# Manual Tests

This directory contains manual integration and end-to-end test scripts that are used for testing the
MCP server functionality.

## Directory Structure

- `scripts/` - Manual test scripts for various scenarios
  - `test-*.cjs` - CommonJS test scripts
  - `test-*.mjs` - ES Module test scripts
  - `test_*.py` - Python test scripts
  - `test-*.json` - Test data and cache state files
  - `test-*.txt` - Test input/output files

## Running Manual Tests

These scripts are designed to test the MCP server in a running state. To use them:

1. Start the MCP server: `npm run dev`
2. In another terminal, run the test script:
   ```bash
   node tests/manual/scripts/test-soundbar-controls.cjs
   # or
   python3 tests/manual/scripts/test_mcp_components.py
   ```

## Test Categories

- **Component Tests**: `test-component-*.cjs` - Test component discovery and control
- **Control Tests**: `test-*-controls.cjs` - Test control listing and manipulation
- **Bug Verification**: `test-bug-*.cjs` - Verify specific bug fixes
- **MCP Protocol**: `test-mcp-*.cjs` - Test MCP protocol implementation
- **Error Handling**: `test-error-*.cjs` - Test error scenarios

## Note

These are not unit tests and are not run by `npm test`. They are used for manual verification and
debugging of the MCP server functionality.
