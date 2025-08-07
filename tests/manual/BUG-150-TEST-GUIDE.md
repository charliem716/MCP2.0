# BUG-150 Manual Test Guide

## Overview

This guide provides manual testing procedures to verify BUG-150 fixes (33Hz polling and 30-day retention) without relying on mocked tests.

## Test Suite Components

### 1. **test-33hz-polling.mjs** - Direct Polling Test
Tests the adapter's 33Hz polling capability in isolation.

### 2. **inspect-event-database.mjs** - Database Inspector
Examines SQLite databases to verify event recording and retention.

### 3. **e2e-bug-150-test.mjs** - End-to-End Test
Complete integration test with real server and database.

## Prerequisites

```bash
# Build the project first
npm run build

# Install required dependencies (if not already installed)
npm install
```

## Test Procedures

### Quick Verification (Recommended)

Run the standalone 33Hz polling test:

```bash
node tests/manual/test-33hz-polling.mjs
```

**Expected Output:**
- Should show ~33 polls per second
- Average interval should be ~30ms
- Test should PASS

### Full End-to-End Test

1. **Run the E2E test** (automated):
   ```bash
   node tests/manual/e2e-bug-150-test.mjs
   ```
   
   This will:
   - Start the MCP server
   - Create change groups with 33Hz polling
   - Generate events for 3 seconds
   - Verify database records
   - Check retention configuration
   - Clean up automatically

### Manual Database Inspection

1. **Configure environment**:
   ```bash
   export EVENT_MONITORING_ENABLED=true
   export EVENT_MONITORING_RETENTION_DAYS=30
   ```

2. **Start the server**:
   ```bash
   npm start
   ```

3. **In another terminal, generate test events**:
   ```bash
   node tests/manual/test-33hz-polling.mjs
   ```

4. **Inspect the database**:
   ```bash
   node tests/manual/inspect-event-database.mjs
   ```

   **Expected Results:**
   - Events recorded at ~33Hz
   - Timestamps ~30ms apart
   - 30-day retention configured

## Verification Criteria

### ✅ PASS Criteria

1. **33Hz Polling**:
   - Polling rate between 30-36 Hz (±10% tolerance)
   - Average interval between 25-35ms
   - Consistent timing without large gaps

2. **Event Recording**:
   - Events saved to SQLite database
   - Correct timestamps (millisecond precision)
   - Change group IDs properly recorded

3. **30-Day Retention**:
   - Configuration shows 30-day default
   - Environment variable respected
   - Database metadata correct

### ❌ FAIL Criteria

- Polling rate < 30 Hz or > 36 Hz
- Average interval outside 25-35ms range
- No events recorded to database
- Retention not set to 30 days

## Troubleshooting

### Test Fails with "No database found"

Ensure EVENT_MONITORING_ENABLED is set:
```bash
export EVENT_MONITORING_ENABLED=true
npm start
```

### Server doesn't start in E2E test

Check if port is already in use or build is outdated:
```bash
npm run build
killall node  # Stop any running Node processes
```

### Polling rate is incorrect

Verify the adapter was built with latest changes:
```bash
grep "0.03" dist/mcp/qrwc/adapter.js
# Should show the 33Hz default rate
```

## Test Output Examples

### Successful 33Hz Test
```
=== BUG-150 Manual Test: 33Hz Polling ===

1. Creating change group...
   ✓ Change group created: test-33hz-group

2. Adding control to group...
   ✓ Control added to group

3. Starting 33Hz auto-polling (0.03s intervals)...
   ✓ Auto-polling started at 33Hz

4. Waiting for 1 second to collect polling data...

5. Stopping auto-polling...
   ✓ Auto-polling stopped

=== RESULTS ===
Test duration: 1.005 seconds
Total polls executed: 33
Expected polls (~33Hz): 33

Actual polling rate: 32.8 Hz
Acceptable range: 30-36 polls
Status: ✅ PASS

=== TIMING ANALYSIS ===
Average interval: 30.45ms (expected: ~30ms)
Min interval: 29.12ms
Max interval: 31.89ms
Interval consistency: ✅ PASS
```

### Successful Database Inspection
```
📊 Inspecting: events-2025-08-07.db

Total events recorded: 99

=== Events by Change Group ===
  test-33hz-group: 99 events over 3.00s (33.0 Hz)

=== 33Hz Polling Analysis ===
  Change Group: test-33hz-group
  Events analyzed: 99
  Average interval: 30.30ms
  Min interval: 29.00ms
  Max interval: 32.00ms
  Estimated frequency: 33.0 Hz
  33Hz pattern detected: ✅ YES
```

## Automation

To run all manual tests in sequence:

```bash
#!/bin/bash
echo "Running BUG-150 Manual Test Suite"
echo "=================================="

# Build first
npm run build

# Run tests
node tests/manual/test-33hz-polling.mjs
if [ $? -eq 0 ]; then
  echo "✅ Polling test passed"
else
  echo "❌ Polling test failed"
  exit 1
fi

node tests/manual/e2e-bug-150-test.mjs
if [ $? -eq 0 ]; then
  echo "✅ E2E test passed"
else
  echo "❌ E2E test failed"
  exit 1
fi

echo "✅ All BUG-150 tests passed!"
```

## Summary

These manual tests provide concrete verification that:
1. The adapter correctly implements 33Hz polling (0.03s intervals)
2. Events are recorded to SQLite at the correct frequency
3. The 30-day retention is properly configured
4. The system works end-to-end without mocks

Use these tests to validate BUG-150 fixes in real-world conditions.