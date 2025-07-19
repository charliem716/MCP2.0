# BUG-013: Code Duplication in QRWC Client

## Status
✅ **RESOLVED**

## Resolution Summary
**Fixed by implementing official @q-sys/qrwc library integration:**
- ✅ Eliminated ALL duplicate code (1,293 lines removed)
- ✅ Reduced codebase by 79%
- ✅ Replaced custom implementation with battle-tested official library
- ✅ Modern TypeScript with event-driven architecture
- ✅ WebSocket-based communication with built-in polling
- ✅ Zero lint errors, zero warnings

**Files changed:**
- **NEW**: `src/qrwc/officialClient.ts` (349 lines) - Clean wrapper around official library
- **UPDATED**: `src/index.ts` - Simplified to use official client
- **OBSOLETE**: `src/qrwc/client.ts` (873 lines) - Custom implementation no longer needed
- **OBSOLETE**: `src/qrwc/commands.ts` (769 lines) - Duplicate functionality removed

## Priority
Medium

## Component
QRWC Client

## Description
The QRWCClient class contains a large section of duplicate code (lines 623-874) that reimplements functionality already available in the QRCCommands class. This violates DRY principles and adds unnecessary complexity.

## Duplicate Code Location
File: `src/qrwc/client.ts`
Lines: 623-874 (251 lines of unnecessary code)

## Evidence
The client contains an inline class that duplicates these QRCCommands methods:
- `getComponents()`
- `getControls()`
- `getControlValue()`
- `setControlValue()`
- `getControlValues()`
- `setControlValues()`
- `getMixerControls()`
- `getStatus()`
- `createChangeGroup()`
- `poll()`
- And many more...

Example of duplication:
```typescript
// In client.ts (DUPLICATE - lines 675-684)
async getControlValues(controls: Array<{Name: string; Component?: string}>) {
  const result = await this.client.sendCommand({
    jsonrpc: '2.0',
    method: 'Control.GetMultiple',
    params: { Controls: controls }
  });
  return (result as {controls?: unknown[]}).controls ?? [];
}

// Already exists in commands.ts with proper error handling
async getControlValues(controls: Array<{control: string; component?: string}>): Promise<QSysControl[]> {
  // Proper implementation with logging, error handling, and type safety
}
```

## Impact
- Increases file size by 251 lines (contributing to file size violation)
- Maintenance burden - changes need to be made in two places
- Confusion about which implementation to use
- Potential for implementations to diverge
- Violates Single Responsibility Principle
- Makes testing more complex

## Root Cause
Appears to be an attempt to make QRWCClient implement a QSysClient interface by embedding command methods directly. This is the wrong approach - the client should delegate to QRCCommands.

## Recommended Solution

### Remove Duplicate Code
1. Delete lines 623-874 from `src/qrwc/client.ts`
2. If QRWCClient needs to implement a QSysClient interface, use proper delegation:

```typescript
export class QRWCClient extends EventEmitter<QRWCClientEvents> implements QSysClient {
  private commands: QRCCommands;
  
  constructor(options: QRWCClientOptions) {
    super();
    // ... existing constructor code ...
    this.commands = new QRCCommands(this);
  }
  
  // Delegate to QRCCommands
  getComponents() { return this.commands.getComponents(); }
  getControls(component: string) { return this.commands.getControls(component); }
  // ... etc
}
```

### Alternative: Remove Interface Requirement
If the QSysClient interface isn't actually needed in Phase 1, remove it entirely and use QRCCommands directly.

## Benefits of Fix
- Reduces client.ts by 251 lines (helps with file size issue)
- Eliminates maintenance burden
- Clear separation of concerns
- Single source of truth for command implementations
- Easier to test and maintain

## Acceptance Criteria
- [ ] Duplicate command implementations removed from client.ts
- [ ] Client.ts file size reduced by ~251 lines
- [ ] All tests still pass
- [ ] Clear delegation pattern if interface is required
- [ ] No functionality lost 