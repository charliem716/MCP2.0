# Skipped Tests Analysis

This report details all skipped tests in the codebase, categorized by the reason for skipping. Each category includes a summary of the issue and a recommendation for how to proceed.

## 1. Tests Requiring Live Q-SYS Connection

These tests are skipped because they require a connection to a live Q-SYS Core, which is not available in the standard CI/CD environment.

*   **Files:**
    *   `tests/bug-042-verification.test.ts`
    *   `tests/integration/qsys/test-status-get.test.ts`
    *   `tests/integration/qsys/test-connection.test.ts`
    *   `tests/integration/qsys/test-retry-logic.test.ts`
    *   `tests/integration/qsys/test-component-control.test.ts`
    *   `tests/integration/live-tools-test.test.ts`
    *   `tests/integration/live-tools-comprehensive.test.ts`
*   **Reason:** These are valuable integration tests that verify real-world interaction with the Q-SYS hardware. They are skipped to allow the test suite to pass in environments without a Q-SYS Core.
*   **Recommendation:** Keep these tests skipped in the main test suite. Create a separate, manually-triggered workflow (e.g., a GitHub Actions workflow) that runs these tests against a dedicated test device.

## 2. Tests Requiring Architectural Updates

These tests are skipped because they were written for a previous version of the application architecture and need to be updated to work with the new, simplified state management system.

*   **Files:**
    *   `tests/integration/test-raw-command-tool.test.ts`
    *   `tests/test-raw-command-simple.test.ts`
    *   `tests/integration/mcp-critical-workflows.test.ts`
*   **Reason:** The tests are tightly coupled to the old architecture, which has been removed. They are failing because they are trying to access components and methods that no longer exist.
*   **Recommendation:** Rewrite these tests to align with the current architecture. The core logic of the tests is still valuable, but the implementation needs to be updated.

## 3. Tests with Complex Mocking Issues

These tests are skipped because they rely on complex mocking of external libraries (e.g., `winston`) that is difficult to maintain.

*   **Files:**
    *   `tests/unit/shared/utils/logger.test.ts`
    *   `tests/unit/mcp/server-signal-handlers.test.skip.ts`
*   **Reason:** The tests are brittle and difficult to maintain due to the complexity of mocking the `winston` logger and the `process` object.
*   **Recommendation:** Refactor the code to make it more testable. For the logger, consider wrapping it in a simple, injectable service that can be easily mocked. For the signal handlers, consider moving the logic to a separate, testable module.

## 4. Redundant or Obsolete Tests

These tests are skipped because they are redundant or have been made obsolete by the recent refactoring.

*   **Files:**
    *   `tests/unit/mcp/state/archived-complex/event-cache/manager-memory.test.ts`
    *   `tests/unit/mcp/state/archived-complex/event-cache/monitoring-integration.test.ts`
    *   `tests/unit/mcp/state/archived-complex/persistence-manager-integration.test.ts`
*   **Reason:** These tests were for the old, complex state management system, which has been archived. They are no longer relevant to the current codebase.
*   **Recommendation:** Delete these test files. The code they were testing is no longer in use.

## 5. Partially Skipped Tests

These tests have some skipped blocks within them, but the test suites themselves are still running.

*   **Files:**
    *   `tests/unit/mcp/qrwc/adapter-core.test.ts`
    *   `tests/unit/mcp/qrwc/adapter-commands.test.ts`
    *   `tests/unit/mcp/tools/change-groups.test.ts`
    *   `tests/integration/error-handling-verification.test.ts`
*   **Reason:** The skipped blocks are for functionality that is not yet implemented or is difficult to test in isolation.
*   **Recommendation:** Review each skipped block individually. If the functionality is important, implement it and write the corresponding tests. If the functionality is not important, remove the skipped blocks.
