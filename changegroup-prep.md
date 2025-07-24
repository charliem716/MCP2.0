# Change Group Implementation Preparation Plan

## Overview

This document outlines the preparatory work needed before implementing BUG-034 (Change Group
Methods). Based on a comprehensive codebase analysis, we've identified 2-3 days of preparation work
required to ensure a smooth implementation.

## Current State Assessment

### Ready Components

- ✅ Complete type definitions in `src/shared/types/qsys.ts`
- ✅ Sophisticated ChangeGroupManager implementation in `src/mcp/state/change-group/`
- ✅ Well-structured QRWC adapter with error handling patterns
- ✅ Integration test infrastructure

### Blocking Issues

- ❌ 3,356 ESLint errors (mostly console.log statements)
- ❌ Adapter file too large (937 lines)
- ❌ No connection between ChangeGroupManager and adapter
- ❌ No Change Group method implementations

## Preparation Phases

### Phase 1: Critical Fixes (1-2 days)

#### 1.1 Fix Console.log Statements (BUG-023)

**Priority**: Critical **Time**: 1 day

Tasks:

- [ ] Run `npm run lint:fix` to auto-fix what's possible
- [ ] Replace all `console.*` calls with Winston logger:
  ```typescript
  // Replace
  console.log('message');
  // With
  logger.info('message');
  ```
- [ ] Fix ESLint configuration for test files
- [ ] Ensure all logging uses proper log levels (debug, info, warn, error)

#### 1.2 Basic Adapter Refactoring (Partial BUG-040)

**Priority**: High **Time**: 0.5-1 day

Tasks:

- [ ] Extract control validation logic to `src/mcp/qrwc/validators.ts`
- [ ] Move type conversion helpers to `src/mcp/qrwc/converters.ts`
- [ ] Create clear sections in adapter with comments:
  ```typescript
  // ===== Component Methods =====
  // ===== Control Methods =====
  // ===== Change Group Methods ===== (new)
  ```

### Phase 2: Foundation Setup (1 day)

#### 2.1 Wire ChangeGroupManager to Adapter

Tasks:

- [ ] Add to adapter class:
  ```typescript
  private changeGroups = new Map<string, ChangeGroup>();
  private changeGroupManager: ChangeGroupManager;
  ```
- [ ] Initialize in constructor:
  ```typescript
  this.changeGroupManager = new ChangeGroupManager(this);
  ```
- [ ] Add cleanup in disconnect method

#### 2.2 Create Change Group Storage Structure

Tasks:

- [ ] Define storage interface for change groups
- [ ] Implement persistence for change groups (optional)
- [ ] Add change group metrics collection

### Phase 3: Pre-Implementation Setup (0.5 day)

#### 3.1 Test Infrastructure

Tasks:

- [ ] Create `tests/unit/change-group/` directory
- [ ] Set up mock Q-SYS responses for Change Group methods
- [ ] Create test fixtures for change group scenarios

#### 3.2 Documentation

Tasks:

- [ ] Document Change Group workflow in CLAUDE.md
- [ ] Add Change Group examples to API documentation
- [ ] Create troubleshooting guide for common issues

## Implementation Checklist

Before starting BUG-034 implementation, verify:

- [ ] All ESLint errors resolved
- [ ] Adapter refactored with clear sections
- [ ] ChangeGroupManager connected to adapter
- [ ] Test infrastructure ready
- [ ] No failing tests
- [ ] Build passes cleanly

## Risk Mitigation

### Identified Risks

1. **Q-SYS Core Behavior**: Unknown actual responses
   - Mitigation: Start with manual testing against real Core
   - Document all response formats

2. **Memory Management**: Long-running change groups
   - Mitigation: Implement max change group limit
   - Add automatic cleanup for stale groups

3. **Automatic Polling**: Timer complexity
   - Mitigation: Use existing retry/backoff patterns
   - Implement circuit breaker for failed polls

## Success Criteria

The preparation is complete when:

1. Zero ESLint errors in src/ directory
2. Adapter file has clear Change Group section
3. ChangeGroupManager is wired to adapter
4. All existing tests pass
5. Test infrastructure for Change Groups exists

## Estimated Timeline

- **Phase 1**: 1-2 days
- **Phase 2**: 1 day
- **Phase 3**: 0.5 day
- **Total**: 2.5-3.5 days

## Next Steps

After completing preparation:

1. Create feature branch `feature/bug-034-change-groups`
2. Implement methods in order:
   - ChangeGroup.AddControl
   - ChangeGroup.Poll
   - ChangeGroup.Remove
   - Others...
3. Add comprehensive tests
4. Update documentation

## Notes

- Keep changes minimal during preparation
- Focus on stability over features
- Document any Q-SYS Core quirks discovered
- Consider implementing BUG-034 in smaller PRs (2-3 methods each)
