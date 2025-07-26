# Claude Desktop MCP Setup for Q-SYS Control

## Quick Setup

1. **Build the MCP server:**

   ```bash
   cd /Users/charliemccarrel/Desktop/Builds/MCP2.0
   npm run build
   ```

2. **Edit Claude Desktop config:**

   ```bash
   # Open Claude Desktop config
   open ~/Library/Application\ Support/Claude/claude_desktop_config.json
   ```

3. **Add this configuration to the file:**

   ```json
   {
     "mcpServers": {
       "qsys": {
         "command": "node",
         "args": ["/Users/charliemccarrel/Desktop/Builds/MCP2.0/dist/index.js"],
         "env": {
           "NODE_ENV": "production"
         }
       }
     }
   }
   ```

   If you already have other MCP servers, add it to the existing `mcpServers` object:

   ```json
   {
     "mcpServers": {
       "filesystem": {
         // ... existing server config
       },
       "qsys": {
         "command": "node",
         "args": ["/Users/charliemccarrel/Desktop/Builds/MCP2.0/dist/index.js"],
         "env": {
           "NODE_ENV": "production"
         }
       }
     }
   }
   ```

4. **Restart Claude Desktop** to load the new configuration.

## What You'll See in Claude

Once connected, you'll have access to these Q-SYS tools:

- **list_components** - "Show me all Q-SYS components"
- **get_component_controls** - "What controls does the Main Mixer have?"
- **list_controls** - "List all available controls"
- **get_control_values** - "What's the current volume of Main Gain?"
- **set_control_values** - "Set Main Volume to -10dB"
- **query_core_status** - "Show Q-SYS system status"
- **send_raw_command** - "Send StatusGet command to Q-SYS"
- **get_all_controls** - "Get all control values from the system"
- **query_qsys_api** - "Show Q-SYS API documentation"

## Example Commands You Can Use

Once connected, you can ask Claude things like:

- "List all mixers in the Q-SYS system"
- "Set the main volume to -20dB with a 3 second ramp"
- "Show me the status of all gain controls"
- "What's the current CPU usage of the Q-SYS Core?"
- "Mute all microphones"
- "Show me all controls for the Room Combine component"
- "Set multiple controls at once: main gain to -10, aux gain to -15"

## Troubleshooting

1. **Server won't start:**
   - Make sure you've run `npm run build` first
   - Check that Q-SYS Core config exists: `qsys-core.config.json`
   - Verify Q-SYS Core is accessible on your network

2. **Claude doesn't show Q-SYS tools:**
   - Restart Claude Desktop after editing config
   - Check the config file syntax is valid JSON
   - Look for errors in Claude's developer console

3. **Connection to Q-SYS fails:**
   - Run `npm run test:connection` to verify Q-SYS connectivity
   - Check firewall settings for port 443 to Q-SYS Core
   - Ensure External Control is enabled in Q-SYS Designer

## Alternative: Using NPX (if published)

If the package were published to npm, you could use:

```json
{
  "mcpServers": {
    "qsys": {
      "command": "npx",
      "args": ["mcp-voice-text-qsys"],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

## Logs and Debugging

The MCP server logs to:

- Console output (visible in Claude's MCP server logs)
- Log files in the project directory (if configured)

To see server logs in Claude Desktop:

1. Open Claude Desktop
2. Check the developer console for MCP server output
3. Look for lines starting with the MCP server name
