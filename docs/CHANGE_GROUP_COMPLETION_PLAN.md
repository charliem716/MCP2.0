# Change Group Full Completion Plan

## Current Status

✅ **Phase 1: Adapter Implementation** - COMPLETE

- All 8 JSON-RPC methods implemented and tested
- AutoPoll timer management working
- Proper cleanup on disconnect
- Unit tests passing

## Remaining Work

### Phase 2: MCP Tools Implementation

Create `src/mcp/tools/change-groups.ts` with the following tools:

#### Required Tools (Priority 1)

1. **CreateChangeGroupTool**
   - Purpose: Create a new change group with specified ID
   - Schema: `{ groupId: string }`
   - Implementation: Call adapter's AddControl with empty array to initialize

2. **AddControlsToChangeGroupTool**
   - Purpose: Add multiple controls to a group
   - Schema: `{ groupId: string, controlNames: string[] }`
   - Implementation: Call ChangeGroup.AddControl

3. **PollChangeGroupTool**
   - Purpose: Poll for changes and return modified controls
   - Schema: `{ groupId: string }`
   - Implementation: Call ChangeGroup.Poll, format results

4. **DestroyChangeGroupTool**
   - Purpose: Clean up a change group
   - Schema: `{ groupId: string }`
   - Implementation: Call ChangeGroup.Destroy

#### Optional Tools (Priority 2)

5. **RemoveControlsFromChangeGroupTool**
   - Schema: `{ groupId: string, controlNames: string[] }`
6. **ClearChangeGroupTool**
   - Schema: `{ groupId: string }`

7. **SetChangeGroupAutoPollTool**
   - Schema: `{ groupId: string, enabled: boolean, intervalSeconds?: number }`
   - Implementation: Call ChangeGroup.AutoPoll or Destroy based on enabled

8. **ListChangeGroupsTool**
   - Schema: `{}` (no params)
   - Implementation: Need to add a method to adapter to list groups

### Phase 3: Tool Registration

Update `src/mcp/handlers/index.ts`:

- Import all change group tools
- Add to `registerQSysTools()` method

### Phase 4: Additional Testing

1. **Tool Tests** (`tests/unit/mcp/tools/change-groups.test.ts`)
   - Test each tool's schema validation
   - Test successful execution
   - Test error handling

2. **Integration Tests** (`tests/integration/qsys/change-groups-integration.test.ts`)
   - Full workflow: create → add → poll → destroy
   - AutoPoll behavior over time
   - Multiple change groups
   - Cleanup on disconnect

3. **MCP Server Tests**
   - Verify tools are accessible via MCP protocol
   - Test tool discovery (list_tools)
   - Test tool execution (call_tool)

### Phase 5: Documentation Updates

1. Update `QSYS_API_REFERENCE.md` with Change Group examples
2. Add Change Group section to main README
3. Create `docs/change-groups-guide.md` with usage examples

## Implementation Steps

### Step 1: Add List Method to Adapter (15 min)

```typescript
// In adapter.ts
listChangeGroups(): Array<{id: string, controlCount: number}> {
  return Array.from(this.changeGroups.entries()).map(([id, group]) => ({
    id,
    controlCount: group.controls.length
  }));
}
```

### Step 2: Create MCP Tools (2 hours)

- Use existing tool patterns from controls.ts and components.ts
- Each tool ~50-70 LOC
- Total: ~400-500 LOC

### Step 3: Register Tools (30 min)

- Update handlers/index.ts
- Import and register all tools

### Step 4: Write Tests (2 hours)

- Unit tests for each tool
- Integration tests for workflows
- Server integration tests

### Step 5: Documentation (1 hour)

- API reference updates
- Usage guide
- Examples

## Success Criteria

- [ ] All 8 MCP tools implemented and registered
- [ ] Tools accessible via MCP server
- [ ] All tests passing (unit + integration)
- [ ] Documentation complete
- [ ] No regression in existing functionality

## Estimated Time

- Total: ~6 hours
- Can be completed in phases if needed

## Next Action

Start with Step 1: Add listChangeGroups() method to adapter to support the ListChangeGroupsTool.
