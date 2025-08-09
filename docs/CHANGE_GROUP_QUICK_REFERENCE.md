# Change Group Tools - Quick Reference

## Tool Descriptions (as shown in MCP clients)

### create_change_group

> Create a new change group with automatic polling for monitoring control value changes. Q-SYS Core
> polls the group automatically at the specified rate. Example: {groupId:'mixer-controls',pollRate:0.1}
> creates a group with 10Hz polling. Group IDs must be unique. Default poll rate is 1 second.

### add_controls_to_change_group

> Add Named Controls to a change group for monitoring. Controls must exist in Q-SYS (e.g.,
> 'Gain1.gain', 'Mixer.level'). Invalid controls are skipped. Example:
> {groupId:'mixer-controls',controlNames:['MainMixer.gain','MainMixer.mute']} adds gain and mute
> controls to the mixer-controls group.

### poll_change_group

> Poll a change group for control value changes since last poll. Returns only controls whose values
> changed. First poll returns all controls as changed. Example: {groupId:'mixer-controls'} returns
> array of changed controls with Name, Value, and String properties. Use for efficient UI updates or
> state monitoring.

### list_change_groups

> List all active change groups showing ID, control count, and auto-poll status. No parameters
> needed. Returns array of groups with {id,controlCount,hasAutoPoll} for each. Use to monitor system
> state and verify cleanup.

### remove_controls_from_change_group

> Remove specific controls from a change group without destroying the group. Example:
> {groupId:'mixer-controls',controlNames:['MainMixer.input_1_gain']} removes the specified control.
> Use when dynamically adjusting monitored controls.

### clear_change_group

> Remove all controls from a change group while keeping it active. Auto-polling continues at the
> originally configured rate. Useful for reconfiguring monitoring without destroying/recreating the
> group. Example: {groupId:'mixer-controls'} clears all controls but keeps the group and polling active.

### destroy_change_group

> Destroy a change group and stop Q-SYS Core from polling it. Always destroy groups when no longer
> needed to prevent memory leaks. Example: {groupId:'mixer-controls'} destroys the group and stops
> Core polling. Also stops event recording if monitoring is enabled.

## Quick Examples

### Basic Monitoring Setup

```javascript
// 1. Create group with auto-polling (default 1Hz)
create_change_group({ groupId: 'ui-page-1' });

// 2. Add controls
add_controls_to_change_group({
  groupId: 'ui-page-1',
  controlNames: ['Volume.level', 'Volume.mute', 'EQ.bypass'],
});

// 3. Poll for changes
poll_change_group({ groupId: 'ui-page-1' });
// Returns: { changes: [...], changeCount: 3, hasChanges: true }

// 4. Clean up when done
destroy_change_group({ groupId: 'ui-page-1' });
```

### Auto-Polling Setup

```javascript
// Create group with 500ms (2Hz) polling for real-time meters
create_change_group({
  groupId: 'realtime-meters',
  pollRate: 0.5
});

// For high-frequency updates (33Hz)
create_change_group({
  groupId: 'audio-meters',
  pollRate: 0.03
});

// Note: Poll rate is fixed after creation. To change rate,
// destroy and recreate the group.
```

### Dynamic Control Management

```javascript
// Start with basic controls
add_controls_to_change_group({
  groupId: 'dynamic',
  controlNames: ['System.status', 'System.alarm'],
});

// Add more controls as needed
add_controls_to_change_group({
  groupId: 'dynamic',
  controlNames: ['Mixer.gain', 'Mixer.mute'],
});

// Remove specific controls
remove_controls_from_change_group({
  groupId: 'dynamic',
  controlNames: ['Mixer.gain'],
});

// Or clear all and start fresh
clear_change_group({ groupId: 'dynamic' });
```
