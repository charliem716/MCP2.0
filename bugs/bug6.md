# BUG-006: File Size Violations in Phase 1 Components

## Status
🔴 **OPEN**

## Priority
Medium

## Component
Core Infrastructure, QRWC Client

## Description
Multiple Phase 1 files exceed the 500-line maximum specified in the implementation plan architecture guidelines. This violates the modular design principle and makes the code harder to maintain.

## Files Exceeding 500-Line Limit

### Source Files
1. **src/shared/utils/errorHandler.ts**: 592 lines (92 lines over limit)
2. **src/qrwc/commands.ts**: 807 lines (307 lines over limit)
3. **src/qrwc/client.ts**: 864 lines (364 lines over limit)

### Test Files
1. **tests/unit/qrwc/commands.test.ts**: 616 lines (116 lines over limit)
2. **tests/unit/qrwc/client.test.ts**: 683 lines (183 lines over limit)

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

## Recommended Solution
1. **errorHandler.ts**: Split into separate modules:
   - BaseErrorHandler class
   - ErrorReporting module
   - ErrorRecovery module
   - ProcessHandlers module

2. **commands.ts**: Split into logical groups:
   - ComponentCommands
   - ControlCommands
   - MixerCommands
   - ChangeGroupCommands
   - SnapshotCommands

3. **client.ts**: Split into:
   - WebSocketManager
   - ConnectionManager
   - RequestManager
   - AuthenticationManager
   - EventEmitter base

4. **Test files**: Split tests to match the new modular structure

## Acceptance Criteria
- [ ] All Phase 1 source files are under 500 lines
- [ ] All Phase 1 test files are under 500 lines
- [ ] Functionality remains unchanged after refactoring
- [ ] Tests still pass after refactoring
- [ ] No loss of type safety or features 