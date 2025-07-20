# Raw Command Fix Summary

## Problem
The `send_raw_command` MCP tool was timing out when using the QRWC library because:
1. QRWC was intercepting WebSocket messages, preventing raw commands from reaching Q-SYS Core
2. Q-SYS Core was returning responses with `id: null` instead of matching request IDs

## Solution Implemented

### 1. Created RawCommandClient (`src/qrwc/rawCommandClient.ts`)
- Separate WebSocket client that bypasses QRWC entirely
- Connects directly to Q-SYS Core WebSocket endpoint
- Handles the Q-SYS bug where responses have null IDs

### 2. Updated QRWCClientAdapter (`src/mcp/qrwc/adapter.ts`)
- Modified `sendRawCommand` to use the new RawCommandClient
- Falls back to FIFO matching for responses with null IDs
- Maintains compatibility with existing adapter interface

### 3. Added Connection Options to OfficialQRWCClient
- Added `getConnectionOptions()` method to expose host/port
- Allows adapter to create RawCommandClient with same connection details

## Test Results

### Before Fix
- Success Rate: 71.4% (10/14 tests passed)
- Raw commands were timing out after 5 seconds
- All NoOp, StatusGet, and other raw commands failed

### After Fix  
- Success Rate: 92.9% (13/14 tests passed)
- Raw commands now complete in 5-50ms
- All raw command operations working correctly
- Only remaining failure is unrelated to raw commands

## Key Findings

1. **Q-SYS Bug**: Q-SYS Core returns `id: null` in JSON-RPC responses instead of echoing the request ID
2. **QRWC Limitation**: The official QRWC library intercepts all WebSocket messages, making raw commands impossible
3. **Workaround**: Using a separate WebSocket connection for raw commands successfully bypasses QRWC interference

## Usage

The `send_raw_command` tool now works reliably for:
- `NoOp` - Simple connectivity test
- `StatusGet` - Core status information  
- `Logon` - Authentication (with warning)
- Any other valid Q-SYS JSON-RPC command

Note: Q-SYS uses camelCase for method names (e.g., `StatusGet` not `Status.Get`)