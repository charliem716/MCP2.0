# BUG-033HZ-POLLING: High-Frequency Polling Rate Limited to ~3Hz

## Summary
The system was unable to achieve the requested 33Hz (30ms) polling rate for change groups, instead being limited to approximately 3Hz despite configuration requesting 33Hz.

## Impact
- **Severity**: Medium
- **Component**: QRWCClientAdapter - AutoPoll implementation
- **Affected Version**: Prior to fix on 2025-08-11
- **Test**: Test 6.4 - High-Frequency Event Handling

## Root Cause
The `handleChangeGroupAutoPoll` method in `src/mcp/qrwc/adapter.ts` used `setInterval` with an async callback that called `await this.sendCommand('ChangeGroup.Poll')`. Since `setInterval` doesn't wait for async operations to complete, when the poll operation took longer than 30ms (due to processing overhead), subsequent intervals would queue up or skip, effectively limiting the polling rate to the speed of the async operation rather than the configured interval.

## Symptoms
1. Requested 33Hz polling rate (0.03 seconds) only achieved ~3Hz actual rate
2. Expected 197 events in 6 seconds, but only received 18 events
3. Polling intervals averaged 350ms instead of the configured 30ms
4. Audio meter monitoring unable to capture rapid value changes

## Fix Applied

### Changes to `src/mcp/qrwc/adapter.ts`:

1. **Implemented dual-strategy polling based on frequency**:
   - For high-frequency polling (<100ms intervals): Use recursive `setTimeout` with synchronous polling
   - For normal polling (≥100ms intervals): Continue using `setInterval` with async operations

2. **Key improvements in high-frequency mode**:
   - Direct synchronous call to `handleChangeGroupPoll()` instead of async `sendCommand()`
   - Skip overlapping polls if previous one is still running
   - Precise timing adjustment based on processing time
   - Performance monitoring to detect lag

3. **Updated timer cleanup logic**:
   - Handle both `clearInterval()` and `clearTimeout()` for proper cleanup
   - Ensures no memory leaks from abandoned timers

## Test Results

### Before Fix:
```
Requested Rate: 33Hz (30.3ms intervals)
Actual Rate Achieved: 2.8Hz (351.8ms average intervals)  
Performance: Only 8.6% of requested frequency
```

### After Fix:
```
✅ SUCCESS: High-frequency polling is working!
Total polls: 96
Expected polls (3s @ 33Hz): ~99
Actual rate: 32.0Hz
Average interval: 31.0ms
Min interval: 29ms
Max interval: 36ms
Target interval: 30ms
```

## Performance Improvement
- **Before**: 8.6% of target frequency (2.8Hz vs 33Hz)
- **After**: 97% of target frequency (32Hz vs 33Hz)
- **Improvement**: 11.4x increase in polling rate

## Technical Details

### Original Implementation (Problematic):
```typescript
const timer = setInterval(() => {
  void (async () => {
    try {
      await this.sendCommand('ChangeGroup.Poll', { Id: groupId });
    } catch (error) {
      // error handling
    }
  })();
}, intervalMs);
```

### Fixed Implementation (High-Frequency Path):
```typescript
if (intervalMs < 100) {
  let isPolling = false;
  const highFrequencyPoll = () => {
    setTimeout(() => {
      if (isPolling) {
        highFrequencyPoll();
        return;
      }
      isPolling = true;
      try {
        // Synchronous call - no await
        this.handleChangeGroupPoll({ Id: groupId });
      } finally {
        isPolling = false;
      }
      // Precise timing adjustment
      const nextDelay = Math.max(1, intervalMs - processingTime);
      if (this.autoPollTimers.has(groupId)) {
        highFrequencyPoll();
      }
    }, intervalMs);
  };
  highFrequencyPoll();
}
```

## Verification
1. Run `node test-33hz-simple.mjs` to verify high-frequency polling
2. Monitor audio meters with `node test-33hz-meter-monitoring.mjs`  
3. Check event capture rates match configured polling frequency

## Prevention
1. Always consider async operation overhead when implementing high-frequency timers
2. Use synchronous operations for time-critical paths when possible
3. Implement performance monitoring for high-frequency operations
4. Test actual achieved rates, not just configured rates

## Related Files
- `src/mcp/qrwc/adapter.ts` - Main fix location
- `test-33hz-simple.mjs` - Verification test
- `test-33hz-meter-monitoring.mjs` - Original failing test
- `test-prompts/master-test-prompts.md` - Test 6.4 specification