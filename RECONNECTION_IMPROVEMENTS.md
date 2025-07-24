# Q-SYS Core Reconnection Improvements

## Current Limitations

When a Q-SYS Core reboots (typically 1-2 minutes for file load), the current reconnection mechanism
may fail because:

1. **Retry window too short**: Only ~95 seconds of attempts
2. **No state persistence**: Component/control data is lost
3. **No reconnection notifications**: MCP clients unaware of status

## Quick Fix: Extend Reconnection Window

Edit `qsys-core.config.json`:

```json
{
  "qsysCore": {
    "connectionSettings": {
      "reconnectInterval": 10000, // 10 seconds (was 5000)
      "maxReconnectAttempts": 20, // 20 attempts (was 5)
      "timeout": 10000
    }
  }
}
```

This gives you ~3.5 minutes of reconnection attempts.

## Advanced Improvements

### 1. Infinite Reconnection

Modify `src/qrwc/officialClient.ts` line 374:

```typescript
// Change from:
if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
  this.logger.error('Max reconnection attempts reached');
  return;
}

// To:
if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
  this.logger.warn('Max attempts reached, continuing with longer delays');
  // Don't return - keep trying with 60-second intervals
  const delay = 60000; // 1 minute
}
```

### 2. Add Reconnection Listeners

In `src/mcp/server.ts`, listen for reconnection:

```typescript
// Add to initializeQRWCClient():
this.qrwcClient.on('connected', () => {
  this.logger.info('Q-SYS Core reconnected! Refreshing state...');
  // Notify MCP clients about reconnection
  this.emit('core_reconnected');
});

this.qrwcClient.on('disconnected', reason => {
  this.logger.warn('Q-SYS Core disconnected', { reason });
  this.emit('core_disconnected', reason);
});
```

### 3. State Caching

Add a state cache that survives disconnections:

```typescript
// In adapter.ts
private cachedComponents: Map<string, any> = new Map();
private lastConnectedTime: Date;

// Save state periodically when connected
private cacheComponentState(): void {
  if (this.isConnected()) {
    // Cache current component states
    this.cachedComponents = new Map(this.components);
    this.lastConnectedTime = new Date();
  }
}
```

### 4. Connection Status Tool

Add a new MCP tool to check connection status:

```typescript
export class ConnectionStatusTool extends BaseQSysTool {
  async execute(): Promise<ToolCallResult> {
    const status = {
      connected: this.qrwcClient.isConnected(),
      lastDisconnect: this.qrwcClient.lastDisconnectTime,
      reconnectAttempts: this.qrwcClient.reconnectAttempts,
      uptime: this.qrwcClient.connectionUptime,
    };
    return { content: [{ type: 'text', text: JSON.stringify(status) }] };
  }
}
```

## Testing Reconnection

To test the reconnection behavior:

1. Start the MCP server
2. Load a new design file in Q-SYS Designer
3. Monitor the logs for reconnection attempts
4. Verify tools work after Core comes back online

## Monitoring During File Load

Watch the logs:

```bash
tail -f logs/mcp-combined.log | grep -E "(disconnect|reconnect|attempt)"
```

## Best Practices

1. **Warn users before file loads**: "Q-SYS Core will be offline for 1-2 minutes"
2. **Queue commands during disconnect**: Store and retry when reconnected
3. **Show connection status in UI**: Let users know when Core is offline
4. **Test with your typical file load times**: Adjust settings accordingly
