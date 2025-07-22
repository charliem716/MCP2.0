# Change Group Tools - Quick Reference

## Tool Descriptions (as shown in MCP clients)

### create_change_group
> Create a new change group for monitoring control value changes. Groups allow efficient polling of multiple controls at once. Example: {groupId:'mixer-controls'} creates a group for monitoring mixer-related controls. Group IDs must be unique and non-empty.

### add_controls_to_change_group
> Add Named Controls to a change group for monitoring. Controls must exist in Q-SYS (e.g., 'Gain1.gain', 'Mixer.level'). Invalid controls are skipped. Example: {groupId:'mixer-controls',controlNames:['MainMixer.gain','MainMixer.mute']} adds gain and mute controls to the mixer-controls group.

### poll_change_group
> Poll a change group for control value changes since last poll. Returns only controls whose values changed. First poll returns all controls as changed. Example: {groupId:'mixer-controls'} returns array of changed controls with Name, Value, and String properties. Use for efficient UI updates or state monitoring.

### set_change_group_auto_poll
> Configure automatic polling for a change group. When enabled, polls at specified interval (0.1-300 seconds). Auto-stops after 10 consecutive failures. Example: {groupId:'mixer-controls',enabled:true,intervalSeconds:0.5} polls every 500ms. Set enabled:false to stop polling.

### list_change_groups
> List all active change groups showing ID, control count, and auto-poll status. No parameters needed. Returns array of groups with {id,controlCount,hasAutoPoll} for each. Use to monitor system state and verify cleanup.

### remove_controls_from_change_group
> Remove specific controls from a change group without destroying the group. Example: {groupId:'mixer-controls',controlNames:['MainMixer.input_1_gain']} removes the specified control. Use when dynamically adjusting monitored controls.

### clear_change_group
> Remove all controls from a change group while keeping it active. Useful for reconfiguring monitoring without destroying/recreating the group. Example: {groupId:'mixer-controls'} clears all controls but keeps the group ready for new additions.

### destroy_change_group
> Destroy a change group and clean up all resources including auto-poll timers. Always destroy groups when no longer needed to prevent memory leaks. Example: {groupId:'mixer-controls'} destroys the group and stops any associated polling.

## Quick Examples

### Basic Monitoring Setup
```javascript
// 1. Create group
create_change_group({ groupId: "ui-page-1" })

// 2. Add controls
add_controls_to_change_group({ 
  groupId: "ui-page-1",
  controlNames: ["Volume.level", "Volume.mute", "EQ.bypass"]
})

// 3. Poll for changes
poll_change_group({ groupId: "ui-page-1" })
// Returns: { changes: [...], changeCount: 3, hasChanges: true }

// 4. Clean up when done
destroy_change_group({ groupId: "ui-page-1" })
```

### Auto-Polling Setup
```javascript
// Enable auto-polling every 500ms
set_change_group_auto_poll({
  groupId: "realtime-meters",
  enabled: true,
  intervalSeconds: 0.5
})

// Disable auto-polling
set_change_group_auto_poll({
  groupId: "realtime-meters",
  enabled: false
})
```

### Dynamic Control Management
```javascript
// Start with basic controls
add_controls_to_change_group({
  groupId: "dynamic",
  controlNames: ["System.status", "System.alarm"]
})

// Add more controls as needed
add_controls_to_change_group({
  groupId: "dynamic",
  controlNames: ["Mixer.gain", "Mixer.mute"]
})

// Remove specific controls
remove_controls_from_change_group({
  groupId: "dynamic",
  controlNames: ["Mixer.gain"]
})

// Or clear all and start fresh
clear_change_group({ groupId: "dynamic" })
```