# Bug Priority List

**Updated**: 2025-08-09  
**Purpose**: Track and prioritize active bugs in the codebase

## Current Active Bugs

### High Priority (P1)
1. **BUG-179** - Graceful shutdown improvements for test stability
   - Severity: Medium
   - Component: testing, shutdown
   - Status: Open

2. **BUG-178** - Improve floating promises handling in production
   - Severity: Medium  
   - Component: async, error-handling
   - Status: Open

### Medium Priority (P2)
3. **BUG-177** - Process-handlers mock not being properly reset between tests
   - Severity: Low
   - Component: testing, mocks
   - Status: Open

### Low Priority (P3)
4. **BUG-174** - ESLint warnings and code quality issues
   - Severity: Low
   - Component: code-quality, linting
   - Status: Open

## Recently Resolved

- **BUG-167** - Add database indexes for query performance (Resolved: 2025-08-09)
  - Added 7 database indexes for improved query performance
  
- **BUG-171** - Implement complete database backup and recovery strategy (Resolved: 2025-08-08)

- **BUG-166** - Create comprehensive production documentation (Resolved: 2025-08-08)

- **BUG-187** - Event monitoring with automatic polling (Resolved)

- **BUG-186** - Component discovery in get_all_controls (Resolved)

- **BUG-184** - Unrecognized QRWC command error messages (Resolved)

- **BUG-183** - ChangeGroup.Remove and Clear commands (Resolved)

- **BUG-180** - MCP server connection persistence (Resolved)

## Notes

- Priority levels: P1 (High), P2 (Medium), P3 (Low)
- Severity levels: Critical, High, Medium, Low
- This list includes only bugs with active reports in the bugs/ folder
- Bug reports are automatically removed when bugs are resolved

## Next Actions

1. Address BUG-179 for test stability improvements
2. Fix BUG-178 floating promises issues
3. Clean up BUG-177 test mock issues
4. Improve code quality per BUG-174

---

**Last Updated**: 2025-08-09 after resolving BUG-167