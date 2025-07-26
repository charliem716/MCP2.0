# Change Group Tools Documentation

## Overview

Change Groups provide an efficient way to monitor multiple Q-SYS control values for changes. Instead
of polling individual controls, you can group related controls together and check for changes across
the entire group in a single operation. This is particularly useful for monitoring user interfaces,
tracking system state changes, or building reactive applications.

## Available Tools

### 1. create_change_group

Creates a new change group for monitoring control value changes.

**Parameters:**

- `groupId` (string, required): Unique identifier for the change group. Must be non-empty.

**Returns:**

```json
{
  "success": true,
  "groupId": "mixer-controls",
  "message": "Change group 'mixer-controls' created successfully"
}
```

**Example Usage:**

```json
{
  "groupId": "mixer-controls"
}
```

**Use Cases:**

- Initialize a monitoring session for a specific UI page
- Create separate groups for different subsystems (audio, video, control)
- Set up monitoring for user-adjustable controls

---

### 2. add_controls_to_change_group

Adds Named Controls to an existing change group for monitoring. Controls must exist in the Q-SYS
design.

**Parameters:**

- `groupId` (string, required): The change group identifier
- `controlNames` (array of strings, required): Array of control names to add (e.g., 'Gain1.gain',
  'Mixer.level')

**Returns:**

```json
{
  "success": true,
  "groupId": "mixer-controls",
  "controlsAdded": 3,
  "message": "Added 3 controls to change group 'mixer-controls'"
}
```

**Example Usage:**

```json
{
  "groupId": "mixer-controls",
  "controlNames": [
    "MainMixer.gain",
    "MainMixer.mute",
    "MainMixer.input_1_gain",
    "MainMixer.input_2_gain"
  ]
}
```

**Notes:**

- Invalid control names are logged but don't cause the operation to fail
- Controls can be added incrementally to an existing group
- Duplicate controls are automatically filtered out

---

### 3. poll_change_group

Polls a change group for control value changes since the last poll. Only returns controls whose
values have changed.

**Parameters:**

- `groupId` (string, required): The change group identifier to poll

**Returns:**

```json
{
  "groupId": "mixer-controls",
  "changes": [
    {
      "Name": "MainMixer.gain",
      "Value": -6.5,
      "String": "-6.5 dB"
    },
    {
      "Name": "MainMixer.mute",
      "Value": true,
      "String": "true"
    }
  ],
  "changeCount": 2,
  "hasChanges": true
}
```

**Example Usage:**

```json
{
  "groupId": "mixer-controls"
}
```

**Behavior:**

- First poll returns all controls as "changed"
- Subsequent polls only return controls with value changes
- Empty changes array indicates no changes since last poll

---

### 4. set_change_group_auto_poll

Configures automatic polling for a change group. When enabled, the group will be polled
automatically at the specified interval.

**Parameters:**

- `groupId` (string, required): The change group identifier
- `enabled` (boolean, required): Enable or disable automatic polling
- `intervalSeconds` (number, optional): Polling interval in seconds (0.1 to 300, default: 1.0)

**Returns:**

```json
{
  "success": true,
  "groupId": "mixer-controls",
  "autoPollEnabled": true,
  "intervalSeconds": 2,
  "message": "Auto-poll enabled for change group 'mixer-controls' at 2s intervals"
}
```

**Example Usage:**

```json
{
  "groupId": "mixer-controls",
  "enabled": true,
  "intervalSeconds": 0.5
}
```

**Important Notes:**

- Minimum interval: 0.1 seconds (100ms)
- Maximum interval: 300 seconds (5 minutes)
- Auto-poll stops automatically after 10 consecutive failures
- Only one auto-poll timer per group (new settings replace existing)

---

### 5. list_change_groups

Lists all active change groups and their current status.

**Parameters:** None

**Returns:**

```json
{
  "groups": [
    {
      "id": "mixer-controls",
      "controlCount": 4,
      "hasAutoPoll": true
    },
    {
      "id": "room-controls",
      "controlCount": 8,
      "hasAutoPoll": false
    }
  ],
  "totalGroups": 2,
  "message": "Found 2 active change group(s)"
}
```

**Example Usage:**

```json
{}
```

---

### 6. remove_controls_from_change_group

Removes specific controls from a change group without destroying the group.

**Parameters:**

- `groupId` (string, required): The change group identifier
- `controlNames` (array of strings, required): Array of control names to remove

**Returns:**

```json
{
  "success": true,
  "groupId": "mixer-controls",
  "controlsRemoved": 2,
  "message": "Removed 2 controls from change group 'mixer-controls'"
}
```

**Example Usage:**

```json
{
  "groupId": "mixer-controls",
  "controlNames": ["MainMixer.input_1_gain", "MainMixer.input_2_gain"]
}
```

---

### 7. clear_change_group

Removes all controls from a change group while keeping the group active. Useful for reconfiguring
monitoring.

**Parameters:**

- `groupId` (string, required): The change group identifier to clear

**Returns:**

```json
{
  "success": true,
  "groupId": "mixer-controls",
  "message": "All controls cleared from change group 'mixer-controls'"
}
```

**Example Usage:**

```json
{
  "groupId": "mixer-controls"
}
```

---

### 8. destroy_change_group

Destroys a change group and cleans up all associated resources including auto-poll timers.

**Parameters:**

- `groupId` (string, required): The change group identifier to destroy

**Returns:**

```json
{
  "success": true,
  "groupId": "mixer-controls",
  "message": "Change group 'mixer-controls' destroyed successfully"
}
```

**Example Usage:**

```json
{
  "groupId": "mixer-controls"
}
```

**Notes:**

- Automatically stops any active auto-poll timers
- Clears all stored control values and history
- Group ID can be reused after destruction

---

## Best Practices

### 1. Group Organization

- Create logical groups based on UI pages or functional areas
- Keep groups focused (10-50 controls per group)
- Use descriptive group IDs that indicate purpose

### 2. Polling Strategy

- Use auto-poll for UI updates (0.5-2 second intervals)
- Use manual poll for event-driven updates
- Consider network and CPU load when setting intervals

### 3. Lifecycle Management

- Always destroy groups when no longer needed
- Clear groups instead of destroying if reconfiguring
- Monitor the total number of active groups

### 4. Error Handling

- Check for empty changes arrays (no updates)
- Handle group not found errors gracefully
- Implement retry logic for transient failures

## Common Patterns

### UI Page Monitoring

```javascript
// When entering a page
create_change_group({ groupId: 'mixer-page' });
add_controls_to_change_group({
  groupId: 'mixer-page',
  controlNames: getAllMixerControls(),
});
set_change_group_auto_poll({
  groupId: 'mixer-page',
  enabled: true,
  intervalSeconds: 0.5,
});

// When leaving the page
destroy_change_group({ groupId: 'mixer-page' });
```

### Event-Driven Updates

```javascript
// Set up monitoring
create_change_group({ groupId: 'critical-controls' });
add_controls_to_change_group({
  groupId: 'critical-controls',
  controlNames: ['System.alarm', 'System.status'],
});

// Check periodically
const result = poll_change_group({ groupId: 'critical-controls' });
if (result.hasChanges) {
  handleSystemChanges(result.changes);
}
```

### Dynamic Monitoring

```javascript
// Start with core controls
create_change_group({ groupId: 'dynamic-group' });
add_controls_to_change_group({
  groupId: 'dynamic-group',
  controlNames: coreControls,
});

// Add controls as needed
if (userOpensMixer) {
  add_controls_to_change_group({
    groupId: 'dynamic-group',
    controlNames: mixerControls,
  });
}

// Remove when not needed
if (userClosesMixer) {
  remove_controls_from_change_group({
    groupId: 'dynamic-group',
    controlNames: mixerControls,
  });
}
```

## Performance Considerations

1. **Polling Frequency**: Higher frequencies increase network and CPU load
2. **Group Size**: Larger groups take longer to process
3. **Network Latency**: Consider round-trip time when setting intervals
4. **Concurrent Groups**: Each auto-poll group runs independently

## Limitations

- Maximum 10 consecutive poll failures before auto-poll stops
- Control names must match exactly (case-sensitive)
- Groups are not persisted across server restarts
- No built-in change history (only current vs last poll)
