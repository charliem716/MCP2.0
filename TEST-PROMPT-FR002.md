# Testing Prompt for manage_connection Tool (FR-002)

## Overview
Test the newly implemented `manage_connection` MCP tool that provides comprehensive connection management for Q-SYS Core. This tool has 8 different actions to test.

## Testing Instructions

### 1. Basic Status Check
First, verify the tool exists and get the current connection status:
```
Use the manage_connection tool with action "status" to check the current connection health. Include verbose mode to see extended information.
```

Expected: Should return connection state, health metrics, and optionally connection history.

### 2. Connection Diagnostics
Run a comprehensive diagnostic check:
```
Use manage_connection with action "diagnose" to run full connection diagnostics. This should check network, DNS, port, WebSocket compatibility, and authentication.
```

Expected: Should return diagnostic results with network reachability, DNS resolution, port status, and a summary.

### 3. Connection History
Retrieve recent connection events:
```
Use manage_connection with action "history" and timeRange "1h" to get the last hour of connection events. Also try filtering by eventType "errors" to see only error events.
```

Expected: Should return an array of connection events with timestamps and summaries.

### 4. Connection Testing
Test the connection quality:
```
Test the connection using manage_connection with action "test" and type "basic". Then try type "latency" to measure round-trip times.
```

Expected: Should return test results with success status and metrics (response time for basic, latency statistics for latency test).

### 5. Configuration Check
Try to update connection configuration:
```
Use manage_connection with action "configure" and settings object containing autoReconnect: true and maxRetryAttempts: 5.
```

Expected: Should either update configuration successfully or indicate if not supported.

### 6. Monitor Setup
Set up connection monitoring:
```
Use manage_connection with action "monitor", interval 10 (seconds), and alerts for onDisconnect: true.
```

Expected: Should return monitoring configuration and current status.

### 7. Force Reconnection (if disconnected)
If the connection is down, try to force reconnection:
```
Use manage_connection with action "reconnect", force: true, and maxAttempts: 3 to attempt reconnection.
```

Expected: Should attempt reconnection and return the result.

### 8. Reset Connection
Reset connection states:
```
Use manage_connection with action "reset" and resetCircuitBreaker: true to reset the circuit breaker state.
```

Expected: Should perform reset actions and confirm completion.

### 9. Switch IP Address (NEW)
Switch to a different Q-SYS Core IP:
```
Use manage_connection with action "switch" and target {host: "192.168.1.100", port: 443} to switch to a different Q-SYS Core.
```

Expected: Should disconnect from current core, clear all state, and connect to the new IP address. Returns success/failure with connection status.

## Validation Checklist

### Tool Registration
- [ ] Confirm tool appears in list of available tools (should be 18 total)
- [ ] Verify tool name is exactly "manage_connection"
- [ ] Check description mentions connection management

### Action Testing
- [ ] **status** - Returns current connection state and health
- [ ] **diagnose** - Provides network/DNS/port diagnostics
- [ ] **history** - Returns array of connection events
- [ ] **test** - Performs connection quality tests
- [ ] **configure** - Updates or attempts to update settings
- [ ] **monitor** - Sets up monitoring configuration
- [ ] **reconnect** - Attempts to reconnect (may fail if already connected)
- [ ] **reset** - Performs reset operations
- [ ] **switch** - Switches to different Q-SYS Core IP address

### Error Handling
- [ ] Invalid action (e.g., "invalid_action") returns validation error
- [ ] Missing required parameters provides helpful error message
- [ ] Tool handles disconnected state gracefully

### Response Structure
Each response should contain:
- `success`: boolean indicating if action succeeded
- `action`: string matching the requested action
- `data`: object with action-specific results
- `error` (if failed): object with code, message, and details

## Example Test Sequence

1. Get initial status
2. Run diagnostics
3. Check connection history
4. Run basic connection test
5. Run latency test
6. Try configuration update
7. Setup monitoring
8. If disconnected, attempt reconnection
9. Reset if needed

## Notes for Tester

- The tool works whether connected or disconnected to Q-SYS Core
- Some actions provide different data based on connection state
- Circuit breaker may prevent reconnection if too many failures occurred
- History is maintained in a circular buffer (max 1000 events)
- All actions should complete within a few seconds

## Expected Tool Count
After implementation, you should see **18 total tools** (17 Q-SYS + 1 testing):
- 5 Core Control Tools
- 1 Connection Management Tool (NEW)
- 1 System Status Tool
- 7 Change Group Tools
- 2 Event Monitoring Tools
- 1 Utility Tool
- 1 Testing Tool (echo)

## Sample Commands for Testing Agent

```javascript
// Test 1: Status
await use_mcp_tool("manage_connection", { action: "status", verbose: true })

// Test 2: Diagnostics
await use_mcp_tool("manage_connection", { action: "diagnose" })

// Test 3: History
await use_mcp_tool("manage_connection", { action: "history", timeRange: "1h" })

// Test 4: Connection Test
await use_mcp_tool("manage_connection", { action: "test", type: "basic" })

// Test 5: Configure
await use_mcp_tool("manage_connection", { 
  action: "configure", 
  settings: { autoReconnect: true, maxRetryAttempts: 5 } 
})

// Test 6: Monitor
await use_mcp_tool("manage_connection", { 
  action: "monitor", 
  interval: 10, 
  alerts: { onDisconnect: true } 
})

// Test 7: Reconnect (if needed)
await use_mcp_tool("manage_connection", { 
  action: "reconnect", 
  force: true, 
  maxAttempts: 3 
})

// Test 8: Reset
await use_mcp_tool("manage_connection", { 
  action: "reset", 
  resetCircuitBreaker: true 
})

// Test 9: Switch IP
await use_mcp_tool("manage_connection", {
  action: "switch",
  target: { host: "192.168.1.100", port: 443 }
})
```

Report any issues with:
- Tool not found
- Actions not working as expected
- Missing or incorrect data in responses
- Error messages that aren't helpful
- Performance issues (actions taking > 5 seconds)