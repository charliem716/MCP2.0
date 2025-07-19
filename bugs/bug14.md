# BUG-014: Main Entry Point Does Not Start MCP Server

## Status
✅ **RESOLVED**

## Resolution Summary
**Fixed by implementing unified MCP server architecture:**
- ✅ Updated `src/index.ts` to start MCP server instead of standalone QRWC client
- ✅ Created `QRWCClientAdapter` to bridge OfficialQRWCClient with MCP tools
- ✅ MCP server now uses real Q-SYS connection via official @q-sys/qrwc library
- ✅ Server responds to JSON-RPC 2.0 requests on stdio transport
- ✅ All 5 Q-SYS tools are registered and functional
- ✅ Connected to live Q-SYS Core at 192.168.50.150:443
- ✅ AI agents can now control Q-SYS systems via MCP protocol

**Test Results:**
- MCP server starts successfully
- Responds to `tools/list` with 6 registered tools
- `query_core_status` tool returns realistic Q-SYS status
- Graceful shutdown on SIGTERM/SIGINT signals
- Phase 2.1 deliverable "Functional MCP server responding to stdio" ✅ **ACHIEVED**

## Priority
**CRITICAL**

## Component
MCP Server Integration

## Description
The main entry point (`src/index.ts`) only initializes the QRWC client and does not start the MCP server, despite Phase 2.1 requiring a "Functional MCP server responding to stdio". The MCP server implementation exists in `src/mcp/server.ts` and `src/mcp/index.ts` but is never launched.

## Evidence
Current `src/index.ts`:
- Only initializes `OfficialQRWCClient`
- No reference to `MCPServer` class
- No stdio transport setup
- No JSON-RPC handler initialization

Phase 2 Deliverables require:
- [ ] ✅ Functional MCP server responding to stdio
- [ ] ✅ MCP server can be called by agents

## Impact
- MCP server is not accessible to AI agents
- Phase 2.1 deliverables cannot be met
- OpenAI agents cannot communicate with Q-SYS system
- Core functionality of the project is missing

## Root Cause
The implementation appears to have focused on the QRWC client connection (Phase 1) without integrating the MCP server layer (Phase 2).

## Recommended Solution

### Option 1: Dual Mode Support
Update `src/index.ts` to support both standalone and MCP server modes:

```typescript
// Check for MCP mode via environment or command line
const mode = process.env.MCP_MODE || process.argv[2];

if (mode === 'mcp' || process.env.MCP_SERVER === 'true') {
  // Start MCP server
  const { MCPServer } = await import('./mcp/server.js');
  const mcpServer = new MCPServer(mcpConfig);
  await mcpServer.start();
} else {
  // Current standalone mode
  const qrwcClient = new OfficialQRWCClient(clientOptions);
  await qrwcClient.connect();
}
```

### Option 2: Separate Entry Points
Create `src/mcp-server.ts` as the MCP server entry point and update package.json:

```json
"scripts": {
  "start": "node dist/index.js",
  "start:mcp": "node dist/mcp-server.js",
  "dev": "tsx src/index.ts",
  "dev:mcp": "tsx src/mcp-server.ts"
}
```

### Option 3: Unified Architecture (Recommended)
Integrate MCP server as the primary entry point since the project goal is AI agent integration:

```typescript
// src/index.ts
async function main() {
  // Start MCP server which internally manages QRWC connection
  const mcpServer = new MCPServer(config);
  await mcpServer.start();
  
  logger.info('MCP Voice/Text-Controlled Q-SYS Demo running');
  logger.info('MCP server listening on stdio');
}
```

## Verification Steps
1. Confirm MCP server starts and listens on stdio
2. Verify JSON-RPC 2.0 handler responds to requests
3. Test tool listing via MCP protocol
4. Ensure Q-SYS connection is established through MCP

## Acceptance Criteria
- [ ] MCP server starts when application launches
- [ ] Server responds to stdio transport
- [ ] JSON-RPC handlers are registered
- [ ] Tools are accessible via MCP protocol
- [ ] Phase 2 deliverables can be demonstrated 