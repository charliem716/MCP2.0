# Change Group Tools Documentation

## Overview

Change Groups provide an efficient way to monitor multiple Q-SYS control values for changes. Instead
of polling individual controls, you can group related controls together and check for changes across
the entire group in a single operation. This is particularly useful for monitoring user interfaces,
tracking system state changes, or building reactive applications.

## Available Tools

### 1. create_change_group

Creates a new change group with automatic polling for monitoring control value changes. Q-SYS Core automatically polls the group at the specified rate.

**Parameters:**

- `groupId` (string, required): Unique identifier for the change group. Must be non-empty.
- `pollRate` (number, optional): Polling rate in seconds (default: 1.0)
  - Minimum: 0.03 seconds (33Hz)
  - Maximum: 3600 seconds (1 hour)
  - Common values: 0.03 (33Hz), 0.1 (10Hz), 0.5 (2Hz), 1 (1Hz)

**Returns:**

```json
{
  "success": true,
  "groupId": "mixer-controls",
  "message": "Change group 'mixer-controls' created with auto-polling",
  "pollRate": 0.1,
  "frequency": "10.0Hz",
  "recording": true
}
```

**Example Usage:**

```json
{
  "groupId": "mixer-controls",
  "pollRate": 0.1
}
```

**Use Cases:**

- Initialize a monitoring session for a specific UI page
- Create separate groups for different subsystems (audio, video, control)
- Set up monitoring for user-adjustable controls

**Important Notes:**

- Auto-polling starts immediately when the group is created
- Q-SYS Core handles the polling automatically at the specified rate
- Changes are automatically recorded to the database for historical tracking
- The poll rate determines both the Core's polling frequency and event recording rate
- Event monitoring is always active when change groups exist

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

### 4. list_change_groups

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

### 5. remove_controls_from_change_group

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

### 6. clear_change_group

Removes all controls from a change group while keeping the group active. Useful for reconfiguring
monitoring. Auto-polling continues at the originally configured rate.

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

### 7. destroy_change_group

Destroys a change group and stops Q-SYS Core from polling it. Also cleans up all associated resources.

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

- Stops Q-SYS Core from auto-polling this group
- Clears all stored control values and history
- Stops event recording for this group
- Group ID can be reused after destruction

---

## Best Practices

### 1. Group Organization

- Create logical groups based on UI pages or functional areas
- Keep groups focused (10-50 controls per group)
- Use descriptive group IDs that indicate purpose

### 2. Polling Strategy

- Configure poll rate during group creation based on needs:
  - UI updates: 0.1-0.5 seconds (10Hz-2Hz)
  - Status monitoring: 1-5 seconds
  - Background checks: 10-60 seconds
- Use manual `poll_change_group` for event-driven updates
- Q-SYS Core handles the automatic polling efficiently

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
// When entering a page - auto-polling starts immediately
create_change_group({ 
  groupId: 'mixer-page',
  pollRate: 0.5  // 2Hz polling for responsive UI
});
add_controls_to_change_group({
  groupId: 'mixer-page',
  controlNames: getAllMixerControls(),
});

// When leaving the page
destroy_change_group({ groupId: 'mixer-page' });
```

### Event-Driven Updates

```javascript
// Set up monitoring with 1Hz polling (default)
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
// Start with core controls - 1 second poll rate
create_change_group({ 
  groupId: 'dynamic-group',
  pollRate: 1.0
});
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
   - Q-SYS Core handles polling efficiently, but consider overall system load
   - 33Hz (0.03s) is maximum rate, suitable for real-time meters
   - 1-10Hz typical for UI updates
2. **Group Size**: Larger groups take longer to process
3. **Network Latency**: Consider round-trip time when setting poll rates
4. **Concurrent Groups**: Each group polls independently at Q-SYS Core level

## Limitations

- Control names must match exactly (case-sensitive)
- Groups are not persisted across server restarts
- No built-in change history (only current vs last poll)
- Poll rate is fixed after group creation (recreate group to change rate)
- Q-SYS Core manages all automatic polling internally
