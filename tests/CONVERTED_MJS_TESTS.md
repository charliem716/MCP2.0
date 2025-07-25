# Converted .mjs Tests to Jest

This document tracks which critical .mjs test files have been converted to Jest format.

## Converted Tests

### Integration Tests
1. **test-connection.mjs** → `test-connection.test.ts`
   - Tests Q-SYS Core WebSocket connection
   - Verifies QRWC instance creation
   - Located in: `tests/integration/qsys/`

2. **test-component-control.mjs** → `test-component-control.test.ts`
   - Tests component discovery and control
   - Verifies control value reading and writing
   - Located in: `tests/integration/qsys/`

3. **server-signal-cleanup.test.mjs** → `server-signal-cleanup.test.ts`
   - Tests BUG-028: Signal handler cleanup
   - Prevents handler accumulation
   - Located in: `tests/integration/mcp/`

### Bug Verification Tests
4. **verify-bug-103.mjs** → `verify-bug-103.test.ts`
   - Verifies ESLint passes without errors
   - Located in: `tests/unit/`

## Notes

- All converted tests follow Jest conventions
- Tests use TypeScript for better type safety
- Integration tests check for config file existence before running
- Bug verification tests ensure fixed issues don't regress

## Remaining .mjs Tests

Many .mjs files remain in the `tests/manual/` directory. These are primarily:
- Ad-hoc testing utilities
- Manual verification scripts
- Development tools

These don't need immediate conversion as they're not part of the automated test suite.