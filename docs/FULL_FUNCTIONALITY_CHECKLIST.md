# Full Functionality Checklist - Event Cache System

This checklist replaces steps 2.3 through 4.3 in the original implementation plan.

## Phase 1: Stabilize Core (Day 1)

### Step 1.1: Fix Failing Tests

- [ ] Fix memory management test timeouts
  - [ ] Increase test timeout to 60000ms
  - [ ] Optimize memory pressure test scenarios
  - [ ] Add proper cleanup between tests
- [ ] Fix disk spillover test failures
  - [ ] Implement lazy initialization for spillover directory
  - [ ] Fix configuration path issues
  - [ ] Add proper test cleanup for spillover files
- [ ] Fix compression timing tests
  - [ ] Use jest.useFakeTimers() consistently
  - [ ] Mock setTimeout/setInterval properly
  - [ ] Fix event emission timing issues
- [ ] Fix type validation edge cases
  - [ ] Handle non-numeric values in gte/lte operators
  - [ ] Fix floating point precision issues
  - [ ] Add proper type guards
- [ ] Verify all tests pass with `npm test`

### Step 1.2: Add Integration Test

- [ ] Create `tests/integration/event-cache-real-world.test.ts`
- [ ] Implement 33Hz polling simulation
  - [ ] 30 controls changing at 33Hz for 1 minute
  - [ ] Verify ~60,000 events handled without drops
  - [ ] Confirm memory stays under limit
- [ ] Test query performance
  - [ ] Recent events query < 100ms
  - [ ] Large dataset query < 500ms
  - [ ] Time range queries work correctly
- [ ] Verify compression activates when needed
- [ ] Verify disk spillover activates at threshold
- [ ] Add proper test cleanup

## Phase 2: Complete Missing Features (Days 2-3)

### Step 2.1: Query Optimization (Step 2.3)

- [ ] Create `src/mcp/state/event-cache/query-cache.ts`
- [ ] Implement LRU cache class
  - [ ] Max 100 cached queries
  - [ ] 60 second TTL default
  - [ ] MD5 hash for cache keys
- [ ] Add cache integration to EventCacheManager
  - [ ] Check cache before executing query
  - [ ] Cache successful query results
  - [ ] Invalidate cache on new events
- [ ] Add cache statistics
  - [ ] Hit rate tracking
  - [ ] Cache size monitoring
- [ ] Write unit tests for query cache
  - [ ] Test cache hits/misses
  - [ ] Test invalidation logic
  - [ ] Test TTL expiration

### Step 2.2: Subscribe Tool Implementation (Step 3.3)

- [ ] Add `subscribeToChangeEventsTool` to `change-groups.ts`
- [ ] Implement tool schema
  - [ ] groupId (required string)
  - [ ] enableCache (boolean, default true)
  - [ ] cacheConfig (optional object)
    - [ ] maxAgeMs (60000-86400000)
    - [ ] maxEvents (1000-1000000)
    - [ ] priority (high/normal/low)
- [ ] Implement tool handler
  - [ ] Enable/disable caching per group
  - [ ] Configure group-specific settings
  - [ ] Return success/failure status
- [ ] Add tool to changeGroupTools array
- [ ] Write tool tests
  - [ ] Test enabling/disabling cache
  - [ ] Test configuration validation
  - [ ] Test error handling

### Step 2.3: Load Testing (Step 4.2)

- [ ] Create `tests/integration/event-cache-load.test.ts`
- [ ] Implement sustained load test
  - [ ] 1000 events/second for 10 seconds
  - [ ] Verify no events dropped
  - [ ] Verify query performance maintained
- [ ] Implement large dataset test
  - [ ] Pre-populate 100k events
  - [ ] Test various query patterns
  - [ ] All queries complete < 500ms
- [ ] Add concurrent access test
  - [ ] Multiple groups writing simultaneously
  - [ ] Concurrent queries during writes
  - [ ] Verify data integrity

## Phase 3: Production Hardening (Day 4)

### Step 3.1: Error Recovery

- [ ] Add error handling to EventCacheManager
  - [ ] Implement handleError method
  - [ ] Add error event emission
  - [ ] Log errors with context
- [ ] Implement recovery strategies
  - [ ] Disk full: disable spillover
  - [ ] Memory pressure: emergency eviction
  - [ ] Corruption: clear affected group
- [ ] Add emergency eviction
  - [ ] Remove 50% of events under pressure
  - [ ] Respect group priorities
  - [ ] Log eviction actions
- [ ] Implement health check
  - [ ] Return health status (healthy/degraded/unhealthy)
  - [ ] Track error count
  - [ ] Monitor memory usage percentage
  - [ ] List current issues

### Step 3.2: Configuration Validation

- [ ] Create `src/mcp/state/event-cache/config-validator.ts`
- [ ] Validate memory limits
  - [ ] Minimum 10MB required
  - [ ] Warn if < 50MB
- [ ] Validate event limits
  - [ ] Warn if < 1000 events
  - [ ] Warn if > 1M events
- [ ] Validate retention settings
  - [ ] Warn if < 1 minute
  - [ ] Warn if > 24 hours
- [ ] Validate disk spillover config
  - [ ] Check directory exists
  - [ ] Verify write permissions
  - [ ] Check available disk space
- [ ] Return validation result
  - [ ] List of errors (blocking)
  - [ ] List of warnings (informational)

### Step 3.3: Monitoring Integration

- [ ] Add metrics to getStatistics()
  - [ ] Query cache hit rate
  - [ ] Error count and last error
  - [ ] Uptime in milliseconds
  - [ ] Health status
- [ ] Add performance counters
  - [ ] Events ingested per second
  - [ ] Queries executed per minute
  - [ ] Average query latency
- [ ] Add resource monitoring
  - [ ] Memory usage trend
  - [ ] Disk spillover usage
  - [ ] Compression effectiveness

## Phase 4: Documentation (Day 4.5)

### Step 4.1: API Documentation (Step 4.3)

- [ ] Create API overview section
  - [ ] System description
  - [ ] Key features
  - [ ] Performance characteristics
- [ ] Document MCP tools
  - [ ] read_change_group_events (with examples)
  - [ ] subscribe_to_change_events (with examples)
  - [ ] Integration with get_q_sys_status
- [ ] Document event data structure
  - [ ] All fields explained
  - [ ] Event type definitions
  - [ ] Computed fields description
- [ ] Add configuration guide
  - [ ] System-wide settings
  - [ ] Per-group configuration
  - [ ] Best practices
- [ ] Create query patterns section
  - [ ] Time-based queries
  - [ ] Value filter examples
  - [ ] Performance tips
- [ ] Add troubleshooting guide
  - [ ] Common issues and solutions
  - [ ] Performance tuning
  - [ ] Debug procedures

## Verification Checklist

### Before Marking Complete

- [ ] All unit tests pass (`npm test`)
- [ ] Integration tests pass
- [ ] Load tests meet performance targets
- [ ] No TypeScript compilation errors (`npm run build`)
- [ ] ESLint passes (`npm run lint`)
- [ ] Documentation is complete and accurate
- [ ] Manual testing confirms functionality
  - [ ] Events are being cached
  - [ ] Queries return correct results
  - [ ] Subscribe tool works as expected
  - [ ] Memory limits are respected
  - [ ] Compression works when enabled
  - [ ] Disk spillover activates at threshold

### Performance Targets

- [ ] ✅ 33Hz event ingestion without drops
- [ ] ✅ < 1ms event insertion latency
- [ ] ✅ < 100ms query response for 10k events
- [ ] ✅ < 50MB memory for 100k events
- [ ] ✅ Query cache hit rate > 50% in production
- [ ] ✅ Zero data loss during normal operation
- [ ] ✅ Graceful degradation under pressure

### Production Readiness

- [ ] Error recovery tested
- [ ] Configuration validation working
- [ ] Health monitoring available
- [ ] Documentation complete
- [ ] Load tested at 2x expected volume
- [ ] Memory management verified
- [ ] All features integration tested

## Estimated Timeline

- **Day 1**: Phase 1 (Fix tests + Integration test)
- **Day 2**: Phase 2.1-2.2 (Query cache + Subscribe tool)
- **Day 3**: Phase 2.3 + Phase 3.1 (Load testing + Error recovery)
- **Day 4**: Phase 3.2-3.3 + Phase 4 (Validation + Monitoring + Docs)

**Total: 4 days to fully operational system**
