# Claude Desktop Setup for Q-SYS MCP Server

## ⚠️ IMPORTANT: Connection Issue Identified

Your test shows only "multi_tool_use" which means you're NOT connected to the Q-SYS MCP server.

## ✅ Server Status

The Q-SYS MCP server is WORKING and has all 18 tools including `manage_connection`:
- Server location: `/Users/charliemccarrel/Desktop/Builds/MCP2.0/dist/index.js`
- Tools available: 18 (confirmed via STDIO test)
- manage_connection: Present with all 9 actions including IP switch

## 🔧 Claude Desktop Configuration

### Step 1: Locate Config File

Find your Claude Desktop configuration file:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/Claude\claude_desktop_config.json`

### Step 2: Update Configuration

Replace or merge with this configuration:

```json
{
  "mcpServers": {
    "qsys-mcp": {
      "command": "node",
      "args": ["/Users/charliemccarrel/Desktop/Builds/MCP2.0/dist/index.js"],
      "env": {
        "MCP_MODE": "true",
        "LOG_LEVEL": "error"
      }
    }
  }
}
```

### Step 3: Restart Claude Desktop

1. Completely quit Claude Desktop (not just close the window)
2. Start Claude Desktop again
3. The Q-SYS MCP server should start automatically

### Step 4: Verify Connection

In Claude Desktop, try:
```
Use the echo tool with message "test"
```

You should get: "Echo: test"

Then try:
```
List all available MCP tools
```

You should see 18 tools, NOT just "multi_tool_use".

## 🚀 Alternative: Manual Server Start

If Claude Desktop isn't working, start the server manually:

```bash
cd /Users/charliemccarrel/Desktop/Builds/MCP2.0
npm run build
MCP_MODE=true node dist/index.js
```

Keep this terminal open and connect your MCP client to this running instance.

## 📋 Expected Tools List

When properly connected, you'll see these 18 tools:
1. list_components
2. qsys_component_get
3. list_controls
4. get_control_values
5. set_control_values
6. query_core_status
7. get_api_documentation
8. **manage_connection** ← New tool with IP switching
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

## 🔍 Troubleshooting

### Still seeing "multi_tool_use"?

This means Claude Desktop is using its built-in tools, not the MCP server. Check:

1. **Config file path is correct** - Full absolute path to dist/index.js
2. **Server name matches** - Use "qsys-mcp" in Claude Desktop
3. **Node is in PATH** - The "node" command must work from terminal
4. **Permissions** - Claude Desktop needs permission to execute the script

### Server not starting?

Check the Claude Desktop logs:
- **macOS**: `~/Library/Logs/Claude/`
- Look for errors related to MCP server startup

### Manual Test

Test the server directly:
```bash
cd /Users/charliemccarrel/Desktop/Builds/MCP2.0
echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | MCP_MODE=true node dist/index.js | grep manage_connection
```

If this shows manage_connection, the server works and it's a client config issue.

## 📞 Support

- Repository: https://github.com/charliem716/MCP2.0.git
- Latest commit: feat(FR-002): comprehensive connection management tool
- Server confirmed working as of: 2025-08-14T23:15:00Z