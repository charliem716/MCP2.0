# End-to-End Tests

This directory contains end-to-end tests that require a real Q-SYS Core connection.

## Running E2E Tests

These tests are **excluded from the default test suite** because they require external dependencies that cannot be mocked.

To run e2e tests:
```bash
npm run test:e2e
```

## Prerequisites

Before running e2e tests:

1. Have a Q-SYS Core accessible on your network
2. Configure `qsys-core.config.json` with valid connection details:
   ```json
   {
     "host": "your-qsys-core-ip",
     "port": 443,
     "username": "your-username",
     "password": "your-password"
   }
   ```

## Test Files

- `qsys/` - Tests that interact directly with Q-SYS Core
- `live-*.test.ts` - Tests that require live MCP tool execution

## Note

These tests contain `.skip` directives because they cannot run in CI/CD environments without real Q-SYS hardware. They are maintained for manual testing during development.