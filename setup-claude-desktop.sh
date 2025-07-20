#\!/bin/bash

# Setup script for Claude Desktop MCP integration

echo "🔧 Q-SYS MCP Server - Claude Desktop Setup"
echo "=========================================="

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

# Build the project
echo "📦 Building MCP server..."
cd "$SCRIPT_DIR"
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build failed. Please fix errors and try again."
    exit 1
fi

# Claude Desktop config path
CLAUDE_CONFIG="$HOME/Library/Application Support/Claude/claude_desktop_config.json"

echo ""
echo "✅ Build successful\!"
echo ""
echo "📝 Add this to your Claude Desktop config:"
echo "   $CLAUDE_CONFIG"
echo ""
echo "----------------------------------------"
cat << JSON
{
  "mcpServers": {
    "qsys": {
      "command": "node",
      "args": [
        "$SCRIPT_DIR/dist/index.js"
      ],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
JSON
echo "----------------------------------------"
echo ""
echo "📌 Steps:"
echo "1. Copy the above configuration"
echo "2. Open: $CLAUDE_CONFIG"
echo "3. Add the 'qsys' entry to your existing 'mcpServers' object"
echo "4. Save the file"
echo "5. Restart Claude Desktop"
echo ""
echo "🎯 Then you can ask Claude:"
echo "   - 'List all Q-SYS components'"
echo "   - 'Set main volume to -10dB'"
echo "   - 'Show Q-SYS system status'"
echo ""

# Offer to open the config file
read -p "Would you like to open the Claude config file now? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    if [ -f "$CLAUDE_CONFIG" ]; then
        open "$CLAUDE_CONFIG"
    else
        echo "Creating new Claude Desktop config..."
        mkdir -p "$HOME/Library/Application Support/Claude"
        echo '{"mcpServers":{}}' > "$CLAUDE_CONFIG"
        open "$CLAUDE_CONFIG"
    fi
fi
