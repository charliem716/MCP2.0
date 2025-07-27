# Critical Workflow Integration Tests

This document describes the critical workflow integration tests implemented for the Q-SYS MCP server. These tests ensure that the MCP server properly integrates with Q-SYS systems and handles all critical use cases.

## Test Structure

The tests are organized into four main categories:

### 1. Component Discovery Workflow

Tests the ability to discover and filter Q-SYS components through MCP tools.

#### Test Cases:

**Should discover all components via MCP tools**
- Verifies that the `list_components` tool returns all components in the Q-SYS system
- Validates response format (array of component objects)
- Confirms core components are present (AudioPlayer1, Mixer1, Gain1)

**Should filter components by type**
- Tests filtering components by their type (e.g., "Audio Player")
- Ensures only matching components are returned

**Should search components by name pattern**
- Tests regex pattern matching on component names
- Example: Finding all components with "Mix" in their name

**Should validate response format for component discovery**
- Ensures each component has required properties: Name, Type, Properties
- Validates the structure matches expected Q-SYS format

### 2. Control Change Workflow

Tests the ability to read and modify Q-SYS control values.

#### Test Cases:

**Should handle single control changes**
- Sets a single control value (e.g., Gain1.gain = -10)
- Verifies the change was applied successfully
- Reads back the value to confirm persistence

**Should handle batch control changes**
- Updates multiple controls in a single operation
- Tests different control types (gain, mute, play states)
- Verifies all changes are applied atomically

**Should verify state synchronization**
- Creates a change group to monitor control changes
- Makes control changes and polls for updates
- Ensures change groups properly track modifications

### 3. Error Recovery Scenarios

Tests the system's ability to handle and recover from various error conditions.

#### Test Cases:

**Should handle connection loss and reconnection**
- Simulates Q-SYS Core disconnect
- Verifies tools report disconnected state appropriately
- Tests successful reconnection and state recovery

**Should handle invalid command gracefully**
- Attempts to control non-existent components
- Verifies proper error responses without crashes
- Ensures partial failures don't affect valid operations

**Should recover from timeout errors**
- Simulates network timeouts during operations
- Verifies the system can recover and retry
- Ensures no lingering effects from timeout failures

### 4. Multi-Client Consistency

Tests concurrent access from multiple MCP clients.

#### Test Cases:

**Should handle concurrent state changes from multiple clients**
- Two clients modify different controls simultaneously
- Verifies both changes are applied without conflicts
- Ensures both clients see the complete final state

**Should verify state propagation between clients**
- One client makes a change
- Second client reads the same control
- Verifies changes are immediately visible to all clients

**Should prevent race conditions in control updates**
- Multiple clients rapidly update the same control
- Verifies final state is consistent
- Ensures no updates are lost due to race conditions

## Test Implementation

### Mock Q-SYS Core

A comprehensive mock implementation (`QSysCoreMock`) simulates a real Q-SYS Core:

- **Components**: AudioPlayer, Mixer, Gain, Router, Snapshot Controller, Status
- **Controls**: Each component has appropriate controls (gains, mutes, selects, etc.)
- **Change Groups**: Full support for creating, polling, and auto-polling
- **Failure Injection**: Supports simulating connection failures, timeouts, and invalid responses

### Test Setup

Each test suite:
1. Creates a mock Q-SYS Core instance
2. Initializes the MCP tool registry with the mock
3. Sets up event cache management
4. Configures proper mocking of WebSocket connections

### Assertions

Tests verify:
- Response formats match MCP protocol specifications
- Control values persist correctly
- Error conditions produce appropriate error responses
- Concurrent operations maintain data consistency
- System recovers gracefully from failures

## Running the Tests

```bash
# Run all critical workflow tests
npm test -- tests/integration/mcp-critical-workflows.test.ts

# Run specific test suites
npm test -- tests/integration/mcp-critical-workflows.test.ts --testNamePattern="Component Discovery"
npm test -- tests/integration/mcp-critical-workflows.test.ts --testNamePattern="Control Change"
npm test -- tests/integration/mcp-critical-workflows.test.ts --testNamePattern="Error Recovery"
npm test -- tests/integration/mcp-critical-workflows.test.ts --testNamePattern="Multi-Client"
```

## Test Coverage

These integration tests provide comprehensive coverage of:
- All major MCP tool operations
- Error handling and recovery paths
- Concurrent access scenarios
- State synchronization mechanisms
- Connection lifecycle management

The tests ensure the MCP server can reliably control Q-SYS systems in production environments with multiple clients and various failure scenarios.