# Event Monitoring Architecture

## Key Design Principle

**Event monitoring in the Q-SYS MCP system works EXCLUSIVELY through change groups and polling.**

This is an intentional architectural decision, not a limitation.

## How It Works

1. **Change Groups**: Create a change group with controls you want to monitor
2. **Polling**: The change group polls controls at a specified rate (e.g., 33Hz)
3. **Event Recording**: Each poll response triggers event recording in SQLiteEventMonitor
4. **Event Storage**: Events are buffered and flushed to SQLite database

## Why This Design?

- **Efficiency**: Only monitored controls generate events (not every control change)
- **Performance**: Batch processing through polling is more efficient than hooking every change
- **Flexibility**: Different polling rates for different monitoring needs
- **Simplicity**: Single path for event recording reduces complexity

## Important Notes

- `set_control_values` does NOT directly record events
- Events are ONLY recorded when a change group polls controls
- This is by design and should not be "fixed"

## Testing Event Monitoring

When testing event monitoring:
1. Always create a change group first
2. Add controls to monitor
3. Make changes to those controls
4. Poll the change group to capture events
5. Query events to verify recording

See `test-prompts/master-test-prompts.md` Test 6.1-6.3 for proper testing patterns.