# Event Monitoring System Cleanup Plan

## Overview
We've successfully implemented SDK-based event monitoring that listens directly to control events instead of trying to detect changes ourselves. This document outlines the cleanup needed to remove obsolete code.

## Code to Remove/Update

### 1. Adapter Change Detection Logic (`src/mcp/qrwc/adapter.ts`)

**Remove:**
- Lines 754-810: Change detection logic in `simulateChangeGroupPoll()`
- The `changeGroupLastValues` Map (line ~700)
- The comparison logic that checks `if (lastValue === undefined || lastValue !== currentValue)`

**Keep but Simplify:**
- The polling timer infrastructure (works fine)
- The `changeGroup:changes` event emission (still used by old monitor temporarily)

### 2. Old SQLiteEventMonitor (`src/mcp/state/event-monitor/sqlite-event-monitor.ts`)

**Options:**
1. Mark as deprecated with a comment pointing to V2
2. Keep temporarily for backward compatibility
3. Remove entirely after updating all references

**Current Usage:**
- `MonitoredStateManager` uses it (line 40)
- MCP tools access it through `MonitoredStateManager`
- Integration tests reference it

### 3. MonitoredStateManager Updates (`src/mcp/state/monitored-state-manager.ts`)

**Change:**
```typescript
// Line 2: Update import
import { SQLiteEventMonitorV2 } from './event-monitor/sqlite-event-monitor-v2.js';

// Line 19: Update type
private eventMonitor?: SQLiteEventMonitorV2;

// Lines 40-44: Update initialization
this.eventMonitor = new SQLiteEventMonitorV2(
  this.qrwcAdapter.getClient(), // Need OfficialQRWCClient
  monitoredConfig.eventMonitoring
);
```

**Issue:** Need to pass `OfficialQRWCClient` instead of adapter

### 4. Test Files Archived

**Moved to `tests/bug-150-archive/`:**
- test-tablemicmeter-final.mjs
- test-bug150-verification.mjs
- test-meter-values.mjs
- test-best-meter-monitoring.mjs
- test-meter-recording.mjs
- test-multi-rate-recording.mjs
- test-sdk-value-flow.mjs
- test-sdk-event-recording.mjs (keep this one - demonstrates new system)

### 5. Integration Tests

**Files that need updating:**
- `tests/integration/event-monitoring-33hz.test.ts`
- `tests/integration/event-monitoring-performance.test.ts`
- `tests/integration/event-cache-error-recovery.test.ts`
- `tests/integration/event-cache-maintenance.test.ts`

These tests expect the old event monitoring behavior and need to be updated for SDK-based monitoring.

## Migration Strategy

### Phase 1: Parallel Support (Current)
- Both old and new monitors exist
- New monitor (V2) is fully functional
- Old monitor still used by existing code

### Phase 2: Update Integration Points
1. Update `MonitoredStateManager` to use V2
2. Modify adapter to pass through `OfficialQRWCClient` reference
3. Update MCP tools if needed

### Phase 3: Remove Old Code
1. Remove old `SQLiteEventMonitor`
2. Remove change detection from adapter
3. Update all tests

### Phase 4: Optimize
1. Remove unnecessary event emissions
2. Simplify adapter polling logic
3. Clean up unused imports and types

## Key Architectural Changes

### Old Flow:
```
ChangeGroup.Poll → Read SDK values → Compare with stored → Detect changes → Emit events
                          ↑
                   (SDK already updated values)
```

### New Flow:
```
SDK Control → on('update') event → SDKEventBridge → SQLiteEventMonitorV2 → Database
```

## Benefits of Cleanup

1. **Simpler Architecture**: Remove complex change detection logic
2. **Better Performance**: No unnecessary comparisons
3. **More Accurate**: Records all SDK updates, not just detected changes
4. **Cleaner Code**: Remove ~200 lines of workaround code
5. **Maintainability**: Single source of truth (SDK events)

## Risks

1. **Breaking Changes**: Existing code depends on old monitor
2. **Test Coverage**: Many tests need updating
3. **Integration**: MCP tools may need adjustments

## Recommended Approach

1. **Keep both monitors temporarily** (✅ Done)
2. **Create adapter method to expose OfficialQRWCClient**
3. **Update MonitoredStateManager to support both monitors**
4. **Gradually migrate tests**
5. **Remove old code once stable**

## Files to Review

- [ ] src/mcp/qrwc/adapter.ts
- [ ] src/mcp/state/event-monitor/sqlite-event-monitor.ts
- [ ] src/mcp/state/monitored-state-manager.ts
- [ ] src/mcp/tools/event-monitoring/query-events.ts
- [ ] src/mcp/tools/event-monitoring/get-statistics.ts
- [ ] All integration tests for event monitoring

## Timeline

- **Immediate**: Archive test files (✅ Done)
- **Next**: Update MonitoredStateManager
- **Then**: Update MCP tools
- **Finally**: Remove old code after verification