# Change Group Implementation Plan

## Overview

This plan outlines the implementation of Change Group JSON-RPC methods in the QRWC adapter AND
corresponding MCP tools, resolving BUG-034 while staying within the @q-sys/qrwc SDK.

## Implementation Components

### 1. Adapter Layer (JSON-RPC)

- Implement 8 Change Group methods in `src/mcp/qrwc/adapter.ts`
- Handle low-level Q-SYS communication
- Manage state tracking and timers

### 2. MCP Tools Layer

- Create `src/mcp/tools/change-groups.ts` with 6-8 tools
- Expose Change Group functionality to AI agents
- Follow existing tool patterns from controls.ts, components.ts

## Supported Methods

### 1. ChangeGroup.AddControl

- Add Named Controls to a change group
- Creates group if it doesn't exist
- Validates controls exist before adding

### 2. ChangeGroup.AddComponentControl

- Add component controls to a change group
- Similar to AddControl but with component scope
- Leverages existing component validation

### 3. ChangeGroup.Remove

- Remove specific controls from a change group
- Handles both named and component controls

### 4. ChangeGroup.Poll

- Poll for control value changes
- Returns only controls that changed since last poll
- Integrates with StateRepository for change detection

### 5. ChangeGroup.Clear

- Remove all controls from a change group
- Keeps group alive for reuse

### 6. ChangeGroup.Destroy

- Delete a change group entirely
- Clean up timers and resources

### 7. ChangeGroup.Invalidate

- Force all controls to be reported as changed on next poll
- Useful after reconnection

### 8. ChangeGroup.AutoPoll

- Set up automatic polling at specified rate
- Manages timers safely with cleanup

## Adapter Integration

### 1. Initialization

```typescript
// Add to imports
import type { ChangeGroup } from "../state/repository.js";

// Add to class properties
private changeGroups = new Map<string, ChangeGroup>();
private autoPollTimers = new Map<string, NodeJS.Timer>();
private changeGroupLastValues = new Map<string, Map<string, unknown>>();

// Note: ChangeGroupManager not used - it's for batch execution, not polling
```

### 2. State Extensions

- Track last polled values per group
- Monitor StateRepository for changes
- Maintain invalidation flags

### 3. Cleanup on Disconnect

- Clear all timers in `clearAllCaches()`
- Destroy all change groups
- Reset tracking maps

## Implementation Details

### AddControl Flow

1. Validate group ID and control names
2. Create/get change group from map
3. Verify controls exist via controlIndex
4. Add to group's control list
5. Initialize tracking for new controls

### Poll Flow

1. Get change group by ID
2. For each control in group:
   - Get current value from StateRepository
   - Compare with last polled value
   - Add to changes if different
3. Update last polled values
4. Return changes array

### AutoPoll Management

1. Clear existing timer if any
2. Set new interval timer
3. On each tick: execute Poll and emit results
4. Store timer reference for cleanup

## Code Structure (≤150 LOC)

```typescript
// In executeCommand switch:

case "ChangeGroup.AddControl": {
  const id = params?.['Id'] as string;
  const controls = params?.['Controls'] as string[] || [];

  if (!id) throw new Error("Change group ID required");

  let group = this.changeGroups.get(id);
  if (!group) {
    group = { id, controls: [] };
    this.changeGroups.set(id, group);
    this.changeGroupLastValues.set(id, new Map());
  }

  // Validate and add controls
  for (const control of controls) {
    if (!this.controlIndex.has(control)) {
      logger.warn(`Control not found: ${control}`);
      continue;
    }
    if (!group.controls.includes(control)) {
      group.controls.push(control);
    }
  }

  return { result: true };
}

case "ChangeGroup.Poll": {
  const id = params?.['Id'] as string;
  if (!id) throw new Error("Change group ID required");

  const group = this.changeGroups.get(id);
  if (!group) throw new Error(`Change group not found: ${id}`);

  const lastValues = this.changeGroupLastValues.get(id)!;
  const changes = [];

  for (const controlName of group.controls) {
    const current = await this.getControlValue(controlName);
    const last = lastValues.get(controlName);

    if (current?.Value !== last) {
      changes.push({
        Name: controlName,
        Value: current?.Value,
        String: current?.String || String(current?.Value)
      });
      lastValues.set(controlName, current?.Value);
    }
  }

  return { result: { Id: id, Changes: changes } };
}

// Similar patterns for other methods...
```

## Test Strategy

1. Unit tests for each method
2. Integration tests with mock controls
3. Timer cleanup verification
4. Error handling validation

## MCP Tools to Create

### Core Tools (Required)

1. **CreateChangeGroupTool**
   - Creates a new change group with specified ID
   - Parameters: `groupId: string`

2. **AddControlsToChangeGroupTool**
   - Adds Named Controls to a change group
   - Parameters: `groupId: string, controlNames: string[]`

3. **PollChangeGroupTool**
   - Polls for control value changes
   - Parameters: `groupId: string`
   - Returns: Array of changed controls with values

4. **DestroyChangeGroupTool**
   - Destroys a change group and cleans up resources
   - Parameters: `groupId: string`

### Additional Tools (Optional)

5. **RemoveControlsFromChangeGroupTool**
   - Removes specific controls from a group
   - Parameters: `groupId: string, controlNames: string[]`

6. **ClearChangeGroupTool**
   - Removes all controls from a group
   - Parameters: `groupId: string`

7. **SetChangeGroupAutoPollTool**
   - Configures automatic polling
   - Parameters: `groupId: string, enabled: boolean, rateSeconds?: number`

8. **ListChangeGroupsTool**
   - Lists all active change groups
   - Returns: Array of group IDs with control counts

## Tool Registration

Add to `registerQSysTools()` in `src/mcp/handlers/index.ts`:

```typescript
import {
  createCreateChangeGroupTool,
  createAddControlsToChangeGroupTool,
  createPollChangeGroupTool,
  createDestroyChangeGroupTool,
  // ... other tools
} from "../tools/change-groups.js";

// In registerQSysTools():
createCreateChangeGroupTool(this.qrwcClient),
createAddControlsToChangeGroupTool(this.qrwcClient),
createPollChangeGroupTool(this.qrwcClient),
createDestroyChangeGroupTool(this.qrwcClient),
// ... other tools
```

## Estimated Code Size

- Adapter implementation: ~150 LOC
- MCP tools: ~400-500 LOC (50-70 per tool)
- Tool registration: ~10 LOC
- Tests: ~300 LOC

## Constraints

- No external dependencies
- Preserve existing APIs
- Follow project conventions
- Maintain type safety

---

Plan ready—apply code changes?
