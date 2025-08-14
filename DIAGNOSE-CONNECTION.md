# MCP Connection Diagnostic

## The Problem

Your test results show:
- Only 1 tool available: "multi_tool_use" 
- Expected: 18 tools including "manage_connection"
- This means you're NOT connected to the Q-SYS MCP server

## Diagnostic Steps

### 1. Check Your Current MCP Connection

Please report:
1. What MCP client are you using? (Claude Desktop, CLI, other?)
2. What is your MCP configuration pointing to?
3. Are you connected to the Q-SYS MCP server at all?

### 2. For Claude Desktop Users

Check your Claude Desktop configuration file:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

It should contain something like:
```json
{
  "mcpServers": {
    "qsys-mcp": {
      "command": "node",
      "args": ["/path/to/MCP2.0/dist/index.js"],
      "env": {
        "MCP_MODE": "true"
      }
    }
  }
}
```

### 3. Verify Server is Running

From terminal, check if the Q-SYS MCP server is running:
```bash
ps aux | grep "node.*dist/index.js"
```

### 4. Test Direct Connection

Try connecting directly to the MCP server:
```bash
cd /Users/charliemccarrel/Desktop/Builds/MCP2.0
MCP_MODE=true node dist/index.js
```

Then send this JSON to stdin:
```json
{"jsonrpc":"2.0","method":"tools/list","id":1}
```

You should see 18 tools in the response.

## What "multi_tool_use" Means

The tool "multi_tool_use" is NOT from our Q-SYS MCP server. This appears to be:
- Either Claude's built-in tool orchestration
- Or you're connected to a different MCP server
- Or your MCP client isn't configured correctly

## Correct Server Verification

When properly connected to the Q-SYS MCP server, you should see these 18 tools:
1. list_components
2. qsys_component_get  
3. list_controls
4. get_control_values
5. set_control_values
6. query_core_status
7. get_api_documentation
8. **manage_connection** ← The tool we're testing
9. create_change_group
10. add_controls_to_change_group
11. poll_change_group
12. destroy_change_group
13. remove_controls_from_change_group
14. clear_change_group
15. list_change_groups
16. query_change_events
17. get_event_statistics
18. echo

## Quick Fix Steps

1. **Stop any existing servers:**
   ```bash
   pkill -f "node.*dist/index.js"
   ```

2. **Start the Q-SYS MCP server:**
   ```bash
   cd /Users/charliemccarrel/Desktop/Builds/MCP2.0
   npm run build
   MCP_MODE=true node dist/index.js
   ```

3. **Configure your MCP client** to connect to this server

4. **Restart your MCP client** (Claude Desktop, etc.)

5. **Verify connection** by listing tools - you should see 18 tools, not 1

## Server Status

As of the last check:
- ✅ Code is committed and pushed to GitHub
- ✅ Server has been rebuilt with manage_connection tool
- ✅ Local testing confirms 18 tools available
- ✅ manage_connection tool with all 9 actions including IP switch
- ❌ Your client is not connected to this server

## Contact Information

Repository: https://github.com/charliem716/MCP2.0.git
Latest commit includes: feat(FR-002): implement comprehensive connection management tool with IP switching