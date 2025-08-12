# Feature Request: Connection Status Tool

**FR-ID:** FR-001  
**Date:** 2025-08-12  
**Status:** Proposed  
**Priority:** Medium  

## Summary

Add a dedicated MCP tool to provide comprehensive connection status information for both MCP server and QRWC client connections, improving diagnostics and troubleshooting capabilities.

## Current State

### Existing Tools
- **echo tool**: Simple message echo for MCP connectivity testing only
- **query_core_status tool**: Provides Q-SYS Core status but limited connection details

### Limitations
1. No unified way to check both MCP and QRWC connection health
2. Echo tool doesn't verify QRWC connection state
3. Connection health metrics (uptime, attempts, failures) not exposed
4. No visibility into circuit breaker or connection resilience features

## Proposed Solution

### Option 1: Enhanced Echo Tool (Not Recommended)
Modify the existing echo tool to include QRWC connection status.

**Pros:**
- Minimal code changes
- Backward compatible

**Cons:**
- Violates single responsibility principle
- Mixes concerns (MCP test vs QRWC status)

### Option 2: New Connection Status Tool (Recommended)

Create a new dedicated `connection_status` tool with comprehensive diagnostics.

**Tool Name:** `connection_status`

**Input Parameters:**
```typescript
{
  includeHealth?: boolean,      // Include detailed health metrics
  includeCore?: boolean,        // Include Q-SYS Core info via Status.Get
  includeEndpoint?: boolean     // Include connection endpoint details
}
```

**Output Structure:**
```json
{
  "mcp": {
    "connected": true,
    "server_version": "2.0.0",
    "uptime_ms": 123456
  },
  "qrwc": {
    "connected": true,
    "state": "connected",
    "endpoint": {
      "host": "192.168.50.150",
      "port": 443
    },
    "health": {
      "isHealthy": true,
      "uptime_ms": 45678,
      "lastSuccessfulConnection": "2025-08-12T02:49:58.862Z",
      "totalAttempts": 5,
      "totalSuccesses": 4,
      "consecutiveFailures": 0,
      "circuitBreakerState": "closed"
    }
  },
  "core": {
    "designName": "MCP-Demo-97-Components",
    "platform": "Q-SYS Designer",
    "status": "OK",
    "version": "9.10.0"
  }
}
```

## Implementation Details

### Required Changes

1. **Create new tool file**: `src/mcp/tools/connection-status.ts`
   - Implement `ConnectionStatusTool` class extending `BaseQSysTool`
   - Access adapter's underlying `OfficialQRWCClient` for health metrics
   - Optionally query Q-SYS Core status

2. **Register tool**: Update `src/mcp/handlers/index.ts`
   - Import and register the new tool
   - Maintain backward compatibility

3. **Type definitions**: Ensure proper TypeScript interfaces
   - Define input/output schemas with Zod
   - Add to tool registry

### Technical Considerations

1. **Access Pattern**: Tool needs access to:
   - `IControlSystem.isConnected()` for basic state
   - Cast to `QRWCClientAdapter` to access extended methods
   - `getClient().getHealthStatus()` for detailed metrics

2. **Error Handling**: 
   - Gracefully handle disconnected state
   - Return partial data when some queries fail
   - Clear error messages for troubleshooting

3. **Performance**: 
   - Cache Status.Get results briefly (5 seconds)
   - Minimal overhead for health checks
   - No blocking operations

## Testing Requirements

### Unit Tests
- Mock connection states (connected, disconnected, reconnecting)
- Verify output structure with various parameter combinations
- Error handling for network failures

### Integration Tests
- Real Q-SYS Core connection scenarios
- Connection loss and recovery
- Circuit breaker activation scenarios

### Test Scripts Created
- `test-connection-health.mjs` - Validates ConnectionHealth data
- `test-echo-enhanced.mjs` - Proves data accessibility

## Benefits

1. **Improved Diagnostics**: Single tool for complete connection visibility
2. **Better Troubleshooting**: Detailed metrics for connection issues
3. **Health Monitoring**: Track connection reliability over time
4. **Clean Architecture**: Separation of concerns (echo vs status)

## Risks and Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking changes to adapter | Medium | Use interface checks, graceful degradation |
| Performance overhead | Low | Implement caching, optional parameters |
| Tool discovery confusion | Low | Clear documentation, deprecate echo status features |

## Alternative Approaches Considered

1. **Extend query_core_status**: Rejected - tool focused on Core status, not connections
2. **Multiple specialized tools**: Rejected - too granular, poor UX
3. **Monitoring dashboard**: Out of scope - requires web UI changes

## Success Criteria

- [ ] Tool returns accurate connection states
- [ ] Health metrics update correctly during connection events
- [ ] Documentation clearly explains each metric
- [ ] Integration with existing error handling
- [ ] No performance regression in tool execution

## Timeline

- Design Review: 1 day
- Implementation: 2 days  
- Testing: 1 day
- Documentation: 0.5 day
- **Total: 4.5 days**

## References

- ConnectionManager implementation: `src/qrwc/connection/ConnectionManager.ts`
- OfficialQRWCClient: `src/qrwc/officialClient.ts`
- Current echo tool: `src/mcp/handlers/index.ts:176-201`
- Test validation: `test-connection-health.mjs`, `test-echo-enhanced.mjs`

## Decision

**Status:** Awaiting approval

**Next Steps:**
1. Review and approve feature request
2. Create implementation branch
3. Develop according to specification
4. Submit PR with tests and documentation