# Running the MCP Voice/Text-Controlled Q-SYS Demo

## Prerequisites

1. Ensure you have a `.env` file with the required configuration:

```bash
cp .env.example .env
# Edit .env with your Q-SYS Core details
```

2. Install dependencies:

```bash
npm install
```

## Running the Application

### Development Mode

```bash
npm run dev
```

### Production Mode

```bash
npm run build
npm start
```

## What Happens When You Run It

1. **Configuration Validation**: The app validates all environment variables
2. **QRWC Client Creation**: Creates a WebSocket client with your Q-SYS settings
3. **Connection to Q-SYS Core**: Attempts to connect to your Q-SYS Core
   - If successful: "✅ Connected to Q-SYS Core"
   - If failed: Error message with details
4. **QRC Commands Initialization**: Sets up the command interface
5. **Ready State**: "🎯 Application is ready and running"

## Graceful Shutdown

Press `Ctrl+C` to stop the application. It will:

- Dispose of QRC commands
- Disconnect from Q-SYS Core
- Clean up all resources

## Troubleshooting

### Connection Failed

- Check your Q-SYS Core is accessible at the configured host/port
- Verify username/password are correct
- Ensure firewall allows connection on port 8443 (or your configured port)

### Environment Errors

- Run `npm run check:env` to validate your configuration
- Check the `.env.example` file for required variables

## Next Steps

With Phase 1 complete, the application can now:

- Connect to Q-SYS Core
- Authenticate successfully
- Send/receive QRC commands
- Manage change groups
- Handle errors gracefully

Phase 2 will add the MCP server functionality.
