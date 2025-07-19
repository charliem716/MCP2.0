# BUG-016: Duplicate QRWC Client Implementations

## Status
🔴 **OPEN**

## Priority
**MEDIUM**

## Component
QRWC Client Architecture

## Description
The codebase contains two different QRWC client implementations that serve different purposes but create confusion and potential maintenance issues:

1. `src/qrwc/officialClient.ts` - Uses official @q-sys/qrwc SDK (Phase 1)
2. `src/mcp/qrwc/client.ts` - Placeholder/mock implementation (Phase 2)

## Evidence
### Official Client (src/qrwc/officialClient.ts)
- 349 lines of production-ready code
- Uses `@q-sys/qrwc` SDK
- Full WebSocket implementation
- Real Q-SYS Core connection

### MCP Placeholder Client (src/mcp/qrwc/client.ts)
- 156 lines of mock code
- No actual WebSocket connection
- Returns hardcoded responses
- Comments indicate "placeholder implementation"

### Usage Conflicts
- Main entry point uses `OfficialQRWCClient`
- MCP server uses placeholder `QRWCClient`
- Tools expect real Q-SYS responses but get mocks

## Impact
- MCP tools don't actually communicate with Q-SYS Core
- Confusing for developers - which client to use?
- Mock data doesn't reflect real system state
- Phase 2 deliverables compromised (tools aren't functional)
- Violates DRY principle

## Root Cause
Phase 2 implementation created a separate mock client instead of reusing the working Phase 1 client. This appears to be an architectural oversight.

## Recommended Solution

### Option 1: Unify Clients (Recommended)
Replace the mock client with the official one:

```typescript
// src/mcp/server.ts
import { OfficialQRWCClient } from '../qrwc/officialClient.js';

export class MCPServer {
  private qrwcClient: OfficialQRWCClient;
  
  constructor(config: MCPServerConfig) {
    // Use the real client
    this.qrwcClient = new OfficialQRWCClient({
      host: config.qrwc.host,
      port: config.qrwc.port,
      // ... other options
    });
  }
}
```

### Option 2: Adapter Pattern
If interfaces differ, create an adapter:

```typescript
// src/mcp/qrwc/adapter.ts
export class QRWCClientAdapter implements QRWCClient {
  constructor(private officialClient: OfficialQRWCClient) {}
  
  async sendCommand(command: string, params?: any) {
    // Adapt to official client API
    return this.officialClient.sendCommand(command, params);
  }
}
```

### Option 3: Delete Mock Client
Simply delete `src/mcp/qrwc/client.ts` and update all imports to use the official client.

## Migration Steps
1. Update all imports from `mcp/qrwc/client` to `qrwc/officialClient`
2. Adjust interfaces if needed
3. Remove mock responses from tools
4. Test all MCP tools with real Q-SYS connection
5. Delete the placeholder client file

## Verification
1. MCP tools return real Q-SYS data
2. No mock responses in production code
3. Single client implementation
4. All tests pass with real client

## Acceptance Criteria
- [ ] Only one QRWC client implementation exists
- [ ] MCP server uses the official client
- [ ] All tools communicate with real Q-SYS Core
- [ ] No hardcoded/mock responses
- [ ] Tests updated to handle real responses 