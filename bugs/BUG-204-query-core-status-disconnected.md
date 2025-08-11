# BUG-204: query_core_status Tool Fails When Q-SYS Core Disconnected

## Issue Summary
The `query_core_status` MCP tool was throwing `QSYS_CONNECTION_FAILED` errors when Q-SYS Core was not connected, instead of returning a valid disconnected status response.

## Root Cause
The base tool class (`BaseQSysTool`) was checking connection status before executing any tool logic. This prevented the `query_core_status` tool from returning meaningful disconnected status information, even though the tool is designed to report connection state.

## Test Results (Before Fix)
From Test 11.5.2 in master-test-prompts.md:
- All calls consistently returned `QSYS_CONNECTION_FAILED` error
- Tool was not accessible when Core was disconnected
- No way to check connection status via MCP when disconnected

## Solution Implemented

### 1. Added Connection Check Override
Added `skipConnectionCheck()` method to base tool class that tools can override:

```typescript
// In base.ts
protected skipConnectionCheck(): boolean {
  return false;  // Default: check connection
}

// Modified execute() to respect override
if (!this.skipConnectionCheck()) {
  // Perform connection check
}
```

### 2. Status Tool Override
The `query_core_status` tool now overrides this to skip connection check:

```typescript
protected override skipConnectionCheck(): boolean {
  return true;  // Allow status queries when disconnected
}
```

### 3. Graceful Disconnected Response
When disconnected, the tool returns a structured status object with `connected: false` instead of throwing an error:

```typescript
if (!isConnected) {
  return {
    connectionStatus: { connected: false, ... },
    systemHealth: { status: 'disconnected', ... },
    _metadata: { error: 'Q-SYS Core not connected', ... }
  };
}
```

## Test Results (After Fix)
All parameter combinations now work correctly when disconnected:
- ✅ No parameters: Returns disconnected status
- ✅ includeDetails: true: Returns disconnected status
- ✅ includeNetworkInfo: true: Returns disconnected status  
- ✅ includePerformance: true: Returns disconnected status
- ✅ All parameters combined: Returns disconnected status

## Files Modified
1. `src/mcp/tools/base.ts` - Added `skipConnectionCheck()` method
2. `src/mcp/tools/status.ts` - Override connection check and handle disconnected state

## Testing Scripts Created
- `test-status-disconnect.mjs` - Basic disconnection test
- `test-status-params.mjs` - Comprehensive parameter testing

## Impact
- The `query_core_status` tool can now be used to check connection state
- No breaking changes to other tools (they still check connection by default)
- Provides graceful degradation when Q-SYS Core is unavailable

## Verification
Run the test scripts to verify the fix:
```bash
./test-status-disconnect.mjs
./test-status-params.mjs
```

Both should show all tests passing with disconnected status returned instead of errors.