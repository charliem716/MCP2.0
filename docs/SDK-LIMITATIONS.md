# Q-SYS SDK Limitations and Constraints

## ⚠️ CRITICAL: DO NOT ATTEMPT WORKAROUNDS ⚠️

This document definitively establishes what CANNOT be done with the Q-SYS integration due to hard technical limitations of the official `@q-sys/qrwc` TypeScript SDK.

## Confirmed Limitations (Tested 2025-08-11)

### 1. Ramp Parameter is Non-Functional

**Status**: PERMANENTLY BLOCKED

The SDK's `control.update()` method only accepts a value parameter:
```typescript
// This is ALL the SDK supports:
control.update(value: string | number | boolean)

// Ramp is NOT supported:
control.update(value, ramp) // ❌ Does not exist
```

**Impact**: 
- Smooth transitions between control values are impossible
- The `ramp` parameter in our API is preserved for future compatibility but does nothing
- See BULLETIN-201 for full details

### 2. sendRawCommand is Non-Functional

**Status**: CONFIRMED NON-WORKING

Despite existing in the code, `sendRawCommand` DOES NOT WORK:

```typescript
// This looks like it should work but DOESN'T:
await client.sendRawCommand('Control.Set', {
  Name: 'SomeControl',
  Value: -20,
  Ramp: 5  // Even if this worked, Q-SYS ignores it
});
// Result: Command timeout after 5 seconds
```

**Why it doesn't work**:
1. Q-SYS uses a proprietary protocol, not standard JSON-RPC
2. The SDK handles authentication and session management that raw commands can't replicate
3. Q-SYS Core completely ignores raw WebSocket messages after SDK connection

**Testing performed**:
- ✅ Direct WebSocket connection - No response
- ✅ sendRawCommand after SDK auth - All commands timeout
- ✅ Various command formats - All ignored by Q-SYS

### 3. Limited Command Set

The SDK only exposes these methods through the official API:
- Component operations (via SDK objects)
- Control operations (via control.update)
- Change groups (via SDK methods)

These Q-SYS commands are NOT accessible:
- Any command requiring raw protocol access
- Custom or undocumented Q-SYS commands
- Commands with parameters the SDK doesn't expose

## What This Means for Development

### DO NOT:
1. ❌ Try to use sendRawCommand for ANY purpose
2. ❌ Attempt to bypass SDK for ramp functionality
3. ❌ Try direct WebSocket connections to Q-SYS
4. ❌ Look for protocol workarounds
5. ❌ Waste time testing raw commands

### DO:
1. ✅ Use only official SDK methods
2. ✅ Accept SDK limitations as hard constraints
3. ✅ Document limitations clearly for users
4. ✅ Request features from QSC for SDK updates

## Historical Context

Multiple attempts have been made to work around these limitations:
- **2024**: Initial implementation preserved ramp parameter hoping for SDK support
- **2025-08-11**: Comprehensive testing proved sendRawCommand non-functional
- **Result**: All workaround attempts failed due to protocol constraints

## The Only Solution

**Contact QSC** and request they add these features to the official SDK:
1. Ramp parameter support in control.update()
2. Additional command parameters as needed

Until QSC updates their SDK, these limitations are **permanent and unfixable**.

## References

- BULLETIN-201: Ramp parameter investigation and sendRawCommand testing
- test-sendraw-comprehensive.mjs: Test script proving sendRawCommand doesn't work
- test-sendraw-debug.mjs: Debug script showing protocol mismatch

---

**Last Updated**: 2025-08-11
**Status**: These limitations are PERMANENT until SDK update
**Do Not**: Attempt workarounds - they will not work