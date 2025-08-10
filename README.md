# MCP Server for Q-SYS Control

Model Context Protocol (MCP) server for Q-SYS audio/video systems using the official @q-sys/qrwc SDK. Enables AI agents to discover, control, and monitor Q-SYS components through a standardized interface.

## Quick Start

```bash
# Install dependencies
npm install

# Configure Q-SYS Core connection
./setup-env.sh

# Test connection
npm run test:connection

# Run development server
npm run dev
```

## Configuration

Edit `qsys-core.config.json` with your Q-SYS Core settings:

```json
{
  "qsysCore": {
    "host": "YOUR_CORE_IP_ADDRESS",
    "port": 443,
    "username": "",
    "password": "",
    "connectionSettings": {
      "timeout": 10000,
      "reconnectInterval": 5000,
      "enableAutoReconnect": true
    }
  }
}
```

Environment variables in `.env`:
- `OPENAI_API_KEY` - For AI agent integration
- `LOG_LEVEL` - Logging verbosity (default: info)
- Event monitoring settings (optional - defaults work out of the box)

## Features

### MCP Tools (17 Available)

**Core Control** (5 tools)
- `list_components` - Discover Q-SYS components
- `list_controls` - List component controls
- `get_control_values` - Read control values
- `set_control_values` - Set control values with validation
- `qsys_component_get` - Get component details

**Change Groups** (7 tools)
- Create, manage, and poll control change groups
- Support for auto-polling at configurable rates (up to 33Hz)
- Add/remove controls dynamically

**Event Monitoring** (2 tools)
- `query_change_events` - Query historical control changes
- `get_event_statistics` - Database statistics and health

**System** (2 tools)
- `query_core_status` - Q-SYS Core health monitoring
- `query_qsys_api` - Direct API access

**Testing** (1 tool)
- `echo` - MCP connectivity test

### Event Monitoring

Automatic SQLite-based event recording for all subscribed change groups:
- 33Hz+ polling support (30+ events/second)
- Daily database rotation with configurable retention
- Sub-millisecond query performance
- Automatic backups


## Technology Stack

- **TypeScript 5.8.4** - Type-safe implementation
- **@q-sys/qrwc 0.4.1-beta** - Official Q-SYS SDK
- **Model Context Protocol** - AI agent integration standard
- **WebSocket (WSS)** - Secure Q-SYS Core communication on port 443
- **SQLite** - Event monitoring and persistence
- **Jest** - Testing framework

## Project Structure

```
src/
├── mcp/                 # Model Context Protocol server
│   ├── qrwc/           # Q-SYS WebSocket adapter
│   ├── tools/          # MCP tool implementations
│   ├── state/          # State management (cache, persistence, events)
│   └── server.ts       # MCP server entry point
├── api/                # REST API and WebSocket handlers
├── shared/             # Shared utilities and types
└── index.ts            # Main application entry
tests/                  # Unit and integration tests
```

## Development

```bash
# Run tests
npm test

# Run with coverage
npm run test:coverage

# Linting
npm run lint

# Type checking
npm run type-check
```

## Documentation

- [Q-SYS Setup Guide](QRWC_SETUP_GUIDE.md) - Q-SYS Core configuration
- [MCP Tools API Reference](docs/api/MCP_TOOLS.md) - Tool documentation
- [Deployment Guide](docs/DEPLOYMENT.md) - Production deployment
- [Troubleshooting](docs/TROUBLESHOOTING.md) - Common issues

## Requirements

- Node.js 18+
- Q-SYS Core with API access enabled
- Network connectivity to Q-SYS Core (port 443)

## Technical Notes

Q-SYS requires secure WebSocket connections (WSS) on port 443. The server handles self-signed certificates automatically with `rejectUnauthorized: false`.

## License

MIT License - see LICENSE file for details.
