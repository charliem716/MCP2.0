# BUG-011: File Size Violations in Phase 1 Components
*Consolidates and supersedes BUG-006*

## Status
🔴 **OPEN**

## Priority
High

## Component
Core Infrastructure, QRWC Client

## Description
Multiple Phase 1 files exceed the 500-line maximum specified in the implementation plan architecture guidelines. This violates the modular design principle and makes the code harder to maintain.

## Files Exceeding 500-Line Limit

### Source Files
1. **src/shared/utils/errorHandler.ts**: 615 lines (115 lines over limit)
2. **src/qrwc/commands.ts**: 769 lines (269 lines over limit)
3. **src/qrwc/client.ts**: 873 lines (373 lines over limit)

### Test Files
1. **tests/unit/qrwc/commands.test.ts**: 616 lines (116 lines over limit)
2. **tests/unit/qrwc/client.test.ts**: 696 lines (196 lines over limit)

## Evidence
From implementation.md:
```
"The architecture emphasizes modularity, clean code practices, and scalability while maintaining a maximum file size of 500 lines per module."
```

## Impact
- Reduced code maintainability
- Harder to understand and test individual components
- Violates established architecture principles
- May indicate insufficient modularization
- Makes code reviews more difficult

## Recommended Solution

### 1. errorHandler.ts (615 lines)
Split into separate modules:
- `BaseErrorHandler.ts` - Core error handling class (~200 lines)
- `ErrorReporting.ts` - Error reporting functionality (~150 lines)
- `ErrorRecovery.ts` - Recovery strategies (~150 lines)
- `ErrorUtils.ts` - Utility functions (~100 lines)

### 2. commands.ts (769 lines)
Split by command groups:
- `ComponentCommands.ts` - Component operations (~150 lines)
- `ControlCommands.ts` - Control operations (~150 lines)
- `MixerCommands.ts` - Mixer operations (~150 lines)
- `ChangeGroupCommands.ts` - Change group operations (~150 lines)
- `SnapshotCommands.ts` - Snapshot operations (~150 lines)

### 3. client.ts (873 lines)
The most critical refactor. Split into:
- `WebSocketManager.ts` - WebSocket connection handling (~200 lines)
- `ConnectionManager.ts` - Connection state and retry logic (~150 lines)
- `RequestManager.ts` - Request/response handling (~150 lines)
- `AuthenticationManager.ts` - Authentication logic (~100 lines)
- `HeartbeatManager.ts` - Heartbeat mechanism (~100 lines)
- `QRWCClient.ts` - Main client orchestrator (~150 lines)

**Note:** Lines 623-874 contain duplicate command implementations that already exist in QRCCommands class and should be removed entirely.

### 4. Test files
Split tests to match the new modular structure of source files.

## Acceptance Criteria
- [ ] All Phase 1 source files are under 500 lines
- [ ] All Phase 1 test files are under 500 lines
- [ ] Functionality remains unchanged after refactoring
- [ ] Tests still pass after refactoring
- [ ] No loss of type safety or features
- [ ] Remove duplicate code in client.ts 