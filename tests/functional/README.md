# MCP Functional Tests

This directory contains functional tests for the MCP Q-SYS control system.

## Running the Tests

```bash
# Run the full MCP control test suite
npm run test:mcp
```

## Test Coverage

The `mcp-control-test.js` script tests the following areas:

### 1. **Connectivity Tests**
- Echo/Ping test to verify MCP server connection
- Core status query to verify Q-SYS connection

### 2. **Component Discovery**
- List all components in the system
- Filter components by type using regex

### 3. **Control Operations**
- List controls by type (gain, mute, select, etc.)
- Get control values with metadata
- Set control values with ramp transitions
- Bulk control queries with pagination

### 4. **Safety Features**
- Creates a snapshot before testing (if available)
- Restores snapshot after testing
- Uses safe test values (e.g., -20dB for gain)

### 5. **Error Handling**
- Tests invalid control names
- Tests out-of-range values
- Verifies proper error responses

### 6. **Performance Testing**
- Rapid control changes
- Measures average response time

## Test Output

The test script provides:
- **Real-time progress**: Shows each test as it runs
- **Success/Failure status**: Clear PASS/FAIL indicators
- **Failure reasons**: Detailed error messages for failures
- **Summary report**: Total tests, passed, failed counts
- **Exit codes**: 0 for success, 1 for any failures

## Safety Considerations

1. **Snapshot Protection**: The test automatically creates and restores snapshots when available
2. **Safe Values**: Uses conservative test values (e.g., -20dB gain)
3. **Ramp Times**: Uses ramps for smooth transitions
4. **Restoration**: Always attempts to restore original values

## Requirements

- Running Q-SYS Core with configured components
- Valid `qsys-core.config.json` configuration
- MCP server properly configured

## Example Output

```
🧪 MCP Q-SYS Control Functional Test Suite
==========================================

🚀 Starting MCP server...
✅ MCP server started

📋 Testing: Echo/Ping Test
✅ PASS: Echo/Ping Test (45ms)

📋 Testing: Core Status Query
   Core: My Q-SYS Core v9.10.0
   Status: Active
✅ PASS: Core Status Query (123ms)

[... more tests ...]

============================================================
TEST SUMMARY
============================================================
Total: 12 | Passed: 11 | Failed: 1
============================================================

Failed Tests:

❌ Out of Range Value Error
   Reason: Control value 999 is outside valid range [-100, 20]

============================================================
```

## Extending the Tests

To add new tests, follow the pattern in `mcp-control-test.js`:

```javascript
await tester.runTest('Your Test Name', async () => {
  // Test implementation
  const response = await tester.callTool('tool_name', { params });
  
  // Assertions
  if (someCondition) {
    throw new Error('Test failed because...');
  }
  
  // Optional logging
  console.log('   Test-specific output');
});
```