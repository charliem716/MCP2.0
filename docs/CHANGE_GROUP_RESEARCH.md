# Change Group Research Summary

## Overview

This document summarizes the research findings for implementing Change Group JSON-RPC methods in the
MCP QRWC adapter (BUG-034).

## Relevant Files and Key Lines

### 1. Type Definitions

**File**: `src/shared/types/qsys.ts`

- Lines 163-170: Change Group method enum definitions
- Lines 207-226: `QSysChangeGroup` and `QSysChangeGroupWithMeta` interfaces
- Lines 232-248: Change Group metrics and creation options
- Lines 381-386: Client interface for Change Group methods (single group pattern)

### 2. API Reference Documentation

**File**: `qrc-reference.md`

- Lines 378-566: Complete Change Group API specification
- Methods documented:
  - `ChangeGroup.AddControl` (line 381)
  - `ChangeGroup.AddComponentControl` (line 401)
  - `ChangeGroup.Remove` (line 425)
  - `ChangeGroup.Poll` (line 445)
  - `ChangeGroup.Destroy` (line 481)
  - `ChangeGroup.Invalidate` (line 496)
  - `ChangeGroup.Clear` (line 511)
  - `ChangeGroup.AutoPoll` (line 526)

### 3. ChangeGroupManager Infrastructure

**Location**: `src/mcp/state/change-group/`

- `manager.ts`: Main manager class with transaction-like semantics
- `types.ts`: Execution result and option types
- `change-group-executor.ts`: Handles control execution
- `rollback-handler.ts`: Provides rollback capabilities
- `concurrency-utils.ts`: Utility functions for concurrency

### 4. QRWC Adapter

**File**: `src/mcp/qrwc/adapter.ts`

- Line 735-736: Change Group section marker with TODO comment
- Lines 741-750: `clearAllCaches()` method (needs Change Group cleanup)
- Missing: ChangeGroupManager import and initialization
- Missing: Change Group storage Map
- Missing: Method implementations in `executeCommand()`

## Missing Logic

### 1. Adapter Integration

- No `ChangeGroupManager` import or instance in adapter
- No storage for active change groups (`Map<string, ChangeGroup>`)
- No cleanup in `clearAllCaches()` method
- No cleanup on disconnect

### 2. Method Implementations

All 8 Change Group methods are missing from the adapter's `executeCommand()` switch statement:

- `ChangeGroup.AddControl`
- `ChangeGroup.AddComponentControl`
- `ChangeGroup.Remove`
- `ChangeGroup.Poll`
- `ChangeGroup.Destroy`
- `ChangeGroup.Invalidate`
- `ChangeGroup.Clear`
- `ChangeGroup.AutoPoll`

### 3. AutoPoll Timer Management

- No timer storage for automatic polling
- No timer cleanup on disconnect or destroy
- No rate limiting mechanism

### 4. State Synchronization

- No integration with StateRepository for control tracking
- No use of existing `controlIndex` Map for efficient lookups

## Adapter/State Interaction Points

### 1. Control Index Integration

- Adapter has `controlIndex: Map<string, ControlMetadata>` (efficient O(1) lookups)
- Can leverage this for validating controls before adding to change groups

### 2. State Repository

- Change groups need to track control changes from StateRepository
- ChangeGroupManager expects integration with state updates

### 3. Error Handling

- Adapter has established error handling patterns (retry logic, validation)
- Need to integrate with `validators.ts` and `converters.ts`

### 4. Connection Management

- Must clear change groups and timers on disconnect
- Must handle reconnection scenarios

## Key Implementation Requirements

### 1. Initialization (Phase 2.1 from BUG-034)

```typescript
// In adapter imports
import { ChangeGroupManager } from "../state/change-group/manager.js";
import type { ChangeGroup } from "../state/change-group/types.js";

// In class properties
private changeGroups = new Map<string, ChangeGroup>();
private changeGroupManager: ChangeGroupManager;
private autoPollTimers = new Map<string, NodeJS.Timer>();

// In constructor
this.changeGroupManager = new ChangeGroupManager(this);
```

### 2. Cleanup Requirements

- Clear change groups in `clearAllCaches()`
- Clear AutoPoll timers on disconnect
- Destroy ChangeGroupManager on cleanup

### 3. Method Implementation Pattern

Each method should:

1. Validate parameters using `validators.ts`
2. Check/create change group as needed
3. Delegate to appropriate manager/storage
4. Handle errors with existing patterns
5. Return proper JSON-RPC response

## TODO/FIXME Notes Found

- Line 736 in adapter.ts: "TODO: Implement change group methods here once BUG-034 is addressed"
- No other TODO/FIXME notes related to Change Groups

## Conclusion

The infrastructure exists but is completely disconnected from the adapter. The ChangeGroupManager is
sophisticated but unused. All 8 JSON-RPC methods need implementation following the existing adapter
patterns.
