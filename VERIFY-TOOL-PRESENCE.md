# Quick Verification: manage_connection Tool

## Direct Tool Test

Please execute these commands to verify the manage_connection tool is present:

### 1. Direct Tool Call
Try calling the tool directly:
```
Use the manage_connection tool with parameters: {"action": "status"}
```

Expected: Either success with connection status OR error about connection (NOT "tool not found")

### 2. If Tool Not Found
If you get "TOOL_NOT_FOUND", please:
1. Restart/refresh your MCP connection
2. Check what version/instance of the MCP server you're connected to
3. Report the server endpoint/configuration you're using

### 3. Alternative Check
Try using the echo tool first to verify MCP connectivity:
```
Use the echo tool with parameters: {"message": "test"}
```

Then immediately try:
```
Use the manage_connection tool with parameters: {"action": "status"}
```

## Diagnostic Information Needed

If the tool is still not found, please provide:
1. How you're connecting to the MCP server (Claude Desktop config, CLI, etc.)
2. The server version or build information
3. Whether you restarted the MCP server after the update
4. The exact error message you receive

## Local Verification

The tool has been verified as working locally:
- Tool count: 18 (17 Q-SYS + 1 testing)
- Tool name: manage_connection
- Available actions: status, reconnect, diagnose, test, configure, history, monitor, reset, switch
- Build completed successfully
- MCP server includes the tool when queried via JSON-RPC

The issue appears to be that your testing environment may be using a cached or older version of the MCP server.