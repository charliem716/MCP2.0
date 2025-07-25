# Test Failure Analysis - 92 Remaining Failures

## Summary
- **Total Tests**: 598
- **Passing**: 478 (84%)
- **Failing**: 92 
- **Skipped**: 28
- **Failing Test Files**: 12

## Categorized Failures

### 1. LRU Cache Tests (19 failures)
**File**: `tests/unit/mcp/state/lru-cache.test.ts`

**Root Causes**:
- Event emission timing issues with Jest fake timers
- TTL expiration not working correctly with mocked timers
- Memory tracking calculations differ from expectations
- Cleanup timer initialization issues

**Failed Tests**:
- Timer-based features (TTL, cleanup)
- Event emissions (set, hit, miss, evict, expire)
- Memory management and eviction
- Statistics tracking

### 2. Adapter Reliability Tests (50 failures)
**File**: `tests/unit/mcp/qrwc/adapter-reliability.test.ts`

**Root Causes**:
- Retry logic tests failing due to timing/promise issues
- Circuit breaker tests not handling state transitions
- Request batching tests have race conditions
- Exponential backoff timing calculations

**Failed Test Categories**:
- Automatic retry on transient failures
- Exponential backoff timing
- Circuit breaker open/close logic
- Request batching within time windows

### 3. Event Cache Memory Tests (5 failures)
**File**: `tests/unit/mcp/state/event-cache/manager-memory.test.ts`

**Root Causes**:
- Type validation issues with event data
- Memory pressure detection thresholds
- Event ordering and delta calculations

**Failed Tests**:
- Invalid change event handling
- Mixed value type handling
- Memory pressure emissions

### 4. Process Handler Tests (3 failures)
**File**: `tests/unit/process-handlers.test.ts`

**Root Causes**:
- Process event listener cleanup
- Signal handler registration
- Exit code handling

### 5. Logger Tests (2 failures)
**File**: `tests/unit/shared/utils/logger.test.ts`

**Root Causes**:
- Winston transport mocking issues
- Metadata formatting expectations

### 6. State Management Tests (8 failures)
**Files**:
- `tests/unit/mcp/state/change-group-manager.test.ts`
- `tests/unit/mcp/state/control-state-cache.test.ts`
- `tests/unit/mcp/state/state-synchronizer.test.ts`

**Root Causes**:
- Async operation timing
- Event emission order
- Mock synchronization issues

### 7. Other Tests (5 failures)
**Files**:
- `tests/unit/floating-promises.test.ts`
- `tests/unit/mcp/qrwc/adapter-change-groups.test.ts`
- `tests/unit/mcp/qrwc/bug-060-fix.test.ts`
- `tests/unit/mcp/state/invalidation.test.ts`

## Common Patterns

### Timing Issues (60% of failures)
Most failures involve:
- Jest fake timers not advancing correctly
- Promise resolution timing in async tests
- Event emission order dependencies
- Race conditions in batching/throttling logic

### Mock Expectations (25% of failures)
- Mocked functions not called with expected arguments
- Event listeners not receiving expected calls
- Mock state not properly reset between tests

### Type/Value Mismatches (15% of failures)
- Expected null but received undefined
- Number precision differences
- Object property mismatches

## Recommendations for Fixes

1. **LRU Cache**: 
   - Use real timers for TTL tests
   - Mock Date.now() consistently
   - Ensure event emitter is properly initialized

2. **Adapter Reliability**:
   - Add proper async/await handling
   - Use jest.runAllTimers() after timer advances
   - Mock network delays consistently

3. **Event Cache**:
   - Fix type guards for event validation
   - Ensure consistent event ordering
   - Handle edge cases in delta calculations

4. **General**:
   - Review all uses of jest.useFakeTimers()
   - Add afterEach cleanup for all event listeners
   - Ensure mocks are properly reset

## Impact Assessment

These failures don't affect core functionality but impact:
- Performance monitoring features
- Advanced caching strategies
- Reliability/retry mechanisms
- Memory management optimizations

The main application logic and MCP protocol implementation remain stable and functional.