# Change Group Implementation Checklist

## Phase 1: Adapter Implementation (JSON-RPC Methods)

### Setup
- [ ] Add imports to adapter.ts
  - [ ] Import ChangeGroup type from repository
- [ ] Add class properties
  - [ ] `private changeGroups = new Map<string, ChangeGroup>()`
  - [ ] `private autoPollTimers = new Map<string, NodeJS.Timer>()`
  - [ ] `private changeGroupLastValues = new Map<string, Map<string, unknown>>()`

### Method Implementations in executeCommand()
- [ ] ChangeGroup.AddControl
  - [ ] Validate group ID and control names
  - [ ] Create group if doesn't exist
  - [ ] Validate controls exist via controlIndex
  - [ ] Add controls to group
- [ ] ChangeGroup.AddComponentControl
  - [ ] Similar to AddControl but with component scope
  - [ ] Validate component exists
  - [ ] Add component controls to group
- [ ] ChangeGroup.Remove
  - [ ] Validate group exists
  - [ ] Remove specified controls
  - [ ] Handle both named and component controls
- [ ] ChangeGroup.Poll
  - [ ] Get current values from StateRepository
  - [ ] Compare with last polled values
  - [ ] Return only changed controls
  - [ ] Update last polled values
- [ ] ChangeGroup.Clear
  - [ ] Validate group exists
  - [ ] Remove all controls
  - [ ] Keep group alive
- [ ] ChangeGroup.Destroy
  - [ ] Clear any active timers
  - [ ] Remove from all maps
  - [ ] Clean up resources
- [ ] ChangeGroup.Invalidate
  - [ ] Mark all controls as changed
  - [ ] Force full update on next poll
- [ ] ChangeGroup.AutoPoll
  - [ ] Clear existing timer if any
  - [ ] Set up interval timer
  - [ ] Handle rate parameter
  - [ ] Store timer reference

### Cleanup
- [ ] Update clearAllCaches() method
  - [ ] Clear all autoPoll timers
  - [ ] Clear changeGroups map
  - [ ] Clear changeGroupLastValues map

## Phase 2: MCP Tools Implementation

### Create change-groups.ts file
- [ ] Import necessary dependencies
  - [ ] BaseQSysTool from base.ts
  - [ ] Zod schemas
  - [ ] Type definitions

### Core Tools (Required)
- [ ] CreateChangeGroupTool
  - [ ] Define Zod schema for groupId
  - [ ] Implement execute method
  - [ ] Add proper description
  - [ ] Export factory function
- [ ] AddControlsToChangeGroupTool
  - [ ] Define schema for groupId and controlNames
  - [ ] Implement execute method
  - [ ] Handle validation errors
  - [ ] Export factory function
- [ ] PollChangeGroupTool
  - [ ] Define schema for groupId
  - [ ] Implement execute method
  - [ ] Format changes response
  - [ ] Export factory function
- [ ] DestroyChangeGroupTool
  - [ ] Define schema for groupId
  - [ ] Implement execute method
  - [ ] Handle cleanup
  - [ ] Export factory function

### Additional Tools (Optional)
- [ ] RemoveControlsFromChangeGroupTool
  - [ ] Define schema
  - [ ] Implement execute
  - [ ] Export factory
- [ ] ClearChangeGroupTool
  - [ ] Define schema
  - [ ] Implement execute
  - [ ] Export factory
- [ ] SetChangeGroupAutoPollTool
  - [ ] Define schema with rate parameter
  - [ ] Implement execute
  - [ ] Export factory
- [ ] ListChangeGroupsTool
  - [ ] No parameters needed
  - [ ] Return active groups
  - [ ] Export factory

## Phase 3: Tool Registration

### Update src/mcp/handlers/index.ts
- [ ] Add import for change-groups tools
- [ ] Add tools to registerQSysTools() method
  - [ ] createCreateChangeGroupTool
  - [ ] createAddControlsToChangeGroupTool
  - [ ] createPollChangeGroupTool
  - [ ] createDestroyChangeGroupTool
  - [ ] (optional tools if implemented)

## Phase 4: Testing

### Unit Tests
- [ ] Create tests/unit/mcp/qrwc/adapter-change-groups.test.ts
  - [ ] Test each adapter method
  - [ ] Test error conditions
  - [ ] Test timer cleanup
- [ ] Create tests/unit/mcp/tools/change-groups.test.ts
  - [ ] Test each tool
  - [ ] Test parameter validation
  - [ ] Test error handling

### Integration Tests
- [ ] Create tests/integration/change-groups.test.ts
  - [ ] Test full flow: create, add, poll, destroy
  - [ ] Test AutoPoll functionality
  - [ ] Test with mock Q-SYS components
  - [ ] Test cleanup on disconnect

### Manual Testing
- [ ] Test with actual Q-SYS Core
- [ ] Verify AutoPoll timing
- [ ] Test multiple change groups
- [ ] Test error scenarios

## Phase 5: Documentation

### Update Documentation
- [ ] Update QSYS_API_REFERENCE.md if needed
- [ ] Add examples to relevant docs
- [ ] Update BUG-034.md with resolution

### Final Report
- [ ] Create CHANGE_GROUP_REPORT.md
  - [ ] Document implementation details
  - [ ] List any issues found
  - [ ] Provide test results
  - [ ] Note any future improvements

## Verification Checklist

### Code Quality
- [ ] All ESLint errors resolved
- [ ] TypeScript types are strict (no any)
- [ ] Code follows project patterns
- [ ] Proper error handling

### Functionality
- [ ] All 8 JSON-RPC methods work
- [ ] All MCP tools are accessible
- [ ] AutoPoll works correctly
- [ ] Cleanup happens on disconnect

### Tests
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] npm test runs clean
- [ ] Manual testing complete

## Completion Criteria
- [ ] BUG-034 can be closed
- [ ] No regression in existing functionality
- [ ] Code is production ready
- [ ] Documentation is complete