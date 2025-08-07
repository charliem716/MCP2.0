# Event Monitoring Tools Implementation Plan - Option 1

## Executive Summary

This document outlines the implementation plan to make the event monitoring MCP tools (`qsys.query_change_events` and `qsys.get_event_statistics`) fully functional by extending the QRWCClientAdapter to include a reference to the state manager.

## Problem Statement

The event monitoring tools are currently not accessible to MCP clients because:
1. Tools expect to access a `MonitoredStateManager` with `getEventMonitor()` method
2. Tools receive a `QRWCClientAdapter` (which implements `IControlSystem`)
3. The adapter doesn't have access to the state manager
4. Tools fail the check and don't get registered

## Solution: Extend QRWCClientAdapter

Add state manager reference to the existing QRWCClientAdapter, allowing event monitoring tools to access it through the control system interface.

## Implementation Steps

### Phase 1: Core Changes

#### 1.1 Extend QRWCClientAdapter Interface
**File:** `src/mcp/qrwc/adapter.ts`

**Changes:**
```typescript
// Add private property
private stateManager?: IStateRepository;

// Add setter method
setStateManager(manager: IStateRepository): void {
  this.stateManager = manager;
  logger.debug('State manager attached to QRWC adapter', {
    hasEventMonitor: !!(manager as any).getEventMonitor
  });
}

// Add getter method
getStateManager(): IStateRepository | undefined {
  return this.stateManager;
}
```

**Location:** After constructor, around line 141

#### 1.2 Update Factory to Wire Dependencies
**File:** `src/mcp/factories/default-factory.ts`

**Changes in `createToolRegistry` method:**
1. Create state repository first
2. Set it on the adapter before creating tool registry
3. Pass adapter with state manager to tool registry

**Specific changes:**
```typescript
async createToolRegistry(adapter: QRWCClientAdapter): Promise<MCPToolRegistry> {
  // Create state repository
  const stateRepo = await this.createStateRepository(adapter);
  
  // Attach state manager to adapter
  adapter.setStateManager(stateRepo);
  
  // Create tool registry with adapter that now has state manager
  return new MCPToolRegistry(adapter);
}
```

#### 1.3 Create State Repository Method in Factory
**File:** `src/mcp/factories/default-factory.ts`

**New method:**
```typescript
private async createStateRepository(adapter: QRWCClientAdapter): Promise<IStateRepository> {
  const { createStateRepository } = await import('../state/factory.js');
  const { configManager } = await import('../../config/index.js');
  
  const mcpConfig = configManager.get('mcp');
  const eventMonitoringEnabled = mcpConfig.eventMonitoring?.enabled ?? false;
  const repoType = eventMonitoringEnabled ? 'monitored' : 'simple';
  
  logger.debug('Creating state repository', {
    eventMonitoringEnabled,
    repoType,
    hasEventMonitoring: !!mcpConfig.eventMonitoring
  });
  
  const config = {
    maxEntries: 1000,
    ttlMs: 3600000,
    cleanupIntervalMs: 60000,
    enableMetrics: true,
    persistenceEnabled: false,
    ...(mcpConfig.eventMonitoring ? {
      eventMonitoring: mcpConfig.eventMonitoring
    } : {})
  };
  
  return await createStateRepository(repoType, config, adapter);
}
```

### Phase 2: Update Event Monitoring Tools

#### 2.1 Update Query Events Tool
**File:** `src/mcp/tools/event-monitoring/query-events.ts`

**Change the execute method to:**
```typescript
async execute(params: QueryEventsParams): Promise<ToolCallResult> {
  try {
    // Get state manager from adapter
    const adapter = this.controlSystem as QRWCClientAdapter;
    const stateManager = adapter.getStateManager?.() as MonitoredStateManager | undefined;
    
    // Check if state manager has event monitor
    if (!stateManager?.getEventMonitor) {
      return {
        content: [{
          type: 'text',
          text: 'Event monitoring is not available. Please ensure EVENT_MONITORING_ENABLED=true in your environment.'
        }],
        isError: true,
      };
    }
    
    const eventMonitor = stateManager.getEventMonitor();
    if (!eventMonitor) {
      return {
        content: [{
          type: 'text',
          text: 'Event monitoring is not active. Please create and subscribe to a change group first.'
        }],
        isError: true,
      };
    }
    
    // Continue with existing query logic...
  }
}
```

#### 2.2 Update Statistics Tool
**File:** `src/mcp/tools/event-monitoring/get-statistics.ts`

**Similar changes to get state manager from adapter**

### Phase 3: Update Tool Registration

#### 3.1 Fix Event Monitoring Tools Registration
**File:** `src/mcp/handlers/index.ts`

**Update `registerEventMonitoringTools` method:**
```typescript
private registerEventMonitoringTools(): void {
  try {
    // Check if the control system has state manager with event monitoring
    const adapter = this.controlSystem as any;
    const stateManager = adapter.getStateManager?.();
    
    if (stateManager?.getEventMonitor && typeof stateManager.getEventMonitor === 'function') {
      // Register event monitoring tools
      const eventTools: Array<BaseQSysTool<unknown>> = [
        createQueryChangeEventsTool(this.controlSystem),
        createGetEventStatisticsTool(this.controlSystem),
      ];

      eventTools.forEach(tool => {
        this.registerQSysTool(tool);
      });

      logger.info('Event monitoring tools registered', {
        tools: eventTools.map(t => t.name)
      });
    } else {
      logger.debug('Event monitoring not available - tools not registered', {
        hasAdapter: !!adapter,
        hasGetStateManager: !!adapter.getStateManager,
        hasStateManager: !!stateManager,
        hasGetEventMonitor: !!stateManager?.getEventMonitor
      });
    }
  } catch (error) {
    logger.warn('Failed to register event monitoring tools', { error });
  }
}
```

### Phase 4: Update Imports and Types

#### 4.1 Add Required Imports
**Files to update:**
- `src/mcp/qrwc/adapter.ts` - Import `IStateRepository`
- `src/mcp/tools/event-monitoring/query-events.ts` - Import `QRWCClientAdapter`
- `src/mcp/tools/event-monitoring/get-statistics.ts` - Import `QRWCClientAdapter`

### Phase 5: Configuration and Environment

#### 5.1 Ensure Environment Variables
**File:** `.env`

Verify these are set:
```
EVENT_MONITORING_ENABLED=true
EVENT_MONITORING_DB_PATH=./data/events
EVENT_MONITORING_RETENTION_DAYS=7
EVENT_MONITORING_BUFFER_SIZE=1000
EVENT_MONITORING_FLUSH_INTERVAL=100
```

#### 5.2 Verify Config Loading
**File:** `src/config/index.ts`

Ensure `eventMonitoring` is properly added to MCP config (already done)

### Phase 6: Testing

#### 6.1 Unit Tests
Create tests for:
- QRWCClientAdapter with state manager
- Event monitoring tools with proper state manager
- Tool registration with event monitoring

#### 6.2 Integration Test
**File:** `test-event-monitoring-complete.mjs`

Test script to verify:
1. Server starts with event monitoring
2. Tools are registered
3. Tools are accessible via MCP
4. Tools can query events

### Phase 7: Cleanup

#### 7.1 Remove Workarounds
- Remove any casting to `MonitoredStateManager` in tools
- Remove `any` types where possible
- Clean up debug logs after verification

#### 7.2 Documentation
- Update README with event monitoring setup
- Document the architecture decision
- Add usage examples

## Success Criteria

1. ✅ `qsys.query_change_events` tool is registered and accessible
2. ✅ `qsys.get_event_statistics` tool is registered and accessible
3. ✅ Event monitoring activates when `EVENT_MONITORING_ENABLED=true`
4. ✅ Tools can successfully query events from SQLite database
5. ✅ No breaking changes to existing tools
6. ✅ Clean architecture with proper separation of concerns

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Circular dependency between adapter and state | State manager already accepts adapter in constructor |
| Breaking existing tools | All changes are additive, no modifications to existing interfaces |
| Performance impact | State manager is created lazily and only when needed |
| Type safety | Use proper TypeScript types, avoid `any` where possible |

## Order of Implementation

1. **Phase 1.1**: Extend QRWCClientAdapter with state manager methods
2. **Phase 1.2-1.3**: Update factory to create and wire dependencies
3. **Phase 2**: Update event monitoring tools to use new methods
4. **Phase 3**: Fix tool registration logic
5. **Phase 5**: Verify configuration
6. **Phase 6**: Test everything works
7. **Phase 7**: Clean up and document

## Rollback Plan

If issues arise:
1. The changes are isolated to a few files
2. Can revert adapter changes without affecting other tools
3. Event monitoring can be disabled via environment variable

## Timeline

- Implementation: 1-2 hours
- Testing: 30 minutes
- Documentation: 30 minutes
- **Total: ~2-3 hours**

## Notes

- This approach maintains backward compatibility
- Uses existing DI container pattern
- Minimal changes to existing architecture
- Follows single responsibility principle better than alternatives
- Event monitoring remains optional and doesn't affect core functionality