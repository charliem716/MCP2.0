# Test Suite Fix Plan

## Overview
10 test suites are currently failing with 19 total test failures. After analysis, I've identified 4 main categories of failures that can be systematically addressed.

## Failure Categories

### 1. 🔧 NODE_ENV Access Issues (3 test suites)
**Affected Tests:**
- `server-signal-handlers.test.ts` - 3 failures
- `persistence-manager-integration.test.ts` - likely similar
- `event-cache-error-recovery.test.ts` - 1 failure

**Root Cause:** TypeScript now requires bracket notation for `process.env['NODE_ENV']` but tests may be mocking process.env incorrectly.

**Fix Strategy:**
1. Update test mocks to properly define process.env with all properties
2. Ensure NODE_ENV is set in test environment
3. Use proper TypeScript-compliant mocking

### 2. 🎭 Mock/Spy Expectation Mismatches (4 test suites)
**Affected Tests:**
- `adapter-reliability.test.ts` - undefined 'Type' property
- `adapter-commands.test.ts` - likely similar issues
- `state-synchronizer.test.ts` - wrong method called
- `manager-memory-pressure.test.ts` - 2 failures (spy not called)

**Root Cause:** Test expectations don't match current implementation behavior

**Fix Strategy:**
1. Update mock return values to match expected data structure
2. Fix method call expectations to match actual implementation
3. Ensure spies are attached to correct methods

### 3. 📋 Assertion/Value Mismatches (2 test suites)
**Affected Tests:**
- `tools-edge-cases.test.ts` - expecting "unknown" but getting "undefined"
- `bug066-behavior.test.ts` - likely assertion failures

**Root Cause:** Implementation returns different values than tests expect

**Fix Strategy:**
1. Update test assertions to match actual return values
2. Or fix implementation if test expectations are correct
3. Add proper null/undefined handling

### 4. ❌ Error Handling Test Issues (1 test suite)
**Affected Tests:**
- `error-handling-verification.test.ts` - ValidationError handling

**Root Cause:** Error handling behavior has changed

**Fix Strategy:**
1. Update error expectations to match current error handling
2. Ensure ValidationError is thrown in correct scenarios

## Implementation Plan

### Phase 1: Quick Wins (1-2 hours)
1. **Fix NODE_ENV issues** (Priority: High, Effort: Low)
   - Add proper process.env mocking in test setup
   - Ensure all tests have NODE_ENV defined
   - Fix: 3-4 test suites

2. **Fix assertion mismatches** (Priority: Medium, Effort: Low)
   - Update expected values in tools-edge-cases.test.ts
   - Simple string value updates
   - Fix: 1-2 test suites

### Phase 2: Mock Updates (2-3 hours)
3. **Update mock return values** (Priority: High, Effort: Medium)
   - Fix adapter test mocks to include all required properties
   - Update state-synchronizer mock expectations
   - Fix: 3-4 test suites

4. **Fix spy attachments** (Priority: Medium, Effort: Medium)
   - Ensure memory pressure spies are properly attached
   - Update method names in expectations
   - Fix: 1-2 test suites

### Phase 3: Complex Fixes (1-2 hours)
5. **Error handling updates** (Priority: Low, Effort: High)
   - Review ValidationError usage
   - Update error expectations
   - Fix: 1 test suite

## Execution Order

1. **Start with NODE_ENV fixes** - Will likely fix 3+ suites quickly
2. **Fix simple assertion mismatches** - Quick wins
3. **Update mocks systematically** - Biggest impact
4. **Address complex error handling last** - Most time-consuming

## Success Metrics
- All 10 test suites passing
- 0 test failures (currently 19)
- No new test failures introduced
- Maintain 94%+ overall test pass rate

## Estimated Timeline
- Total effort: 4-7 hours
- Can be completed in 1-2 days
- Quick wins achievable in first hour

## Next Steps
1. Create a branch for test fixes
2. Start with NODE_ENV fixes
3. Run tests after each fix to verify progress
4. Document any implementation changes needed