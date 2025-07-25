# Q-SYS JSON-RPC API Reference

This document provides a comprehensive reference for the Q-SYS JSON-RPC API commands that can be
used with the `send_raw_command` MCP tool.

## Important Notes

### Method Naming Conventions

Q-SYS uses **inconsistent naming conventions** for methods:

1. **CamelCase (no dots)**: Used for some basic commands
   - `StatusGet`
   - `NoOp`
   - `Logon`
   - `ComponentGetComponents`
   - `ComponentGetControls`

2. **Dot Notation**: Used for most control and component operations
   - `Control.Get`
   - `Control.Set`
   - `Component.Get`
   - `Component.Set`
   - `ChangeGroup.AddControl`
   - `Snapshot.Load`

⚠️ **Always check the exact method name format below before using!**

### Response Format

Q-SYS has a bug where it returns `"id": null` in responses instead of echoing the request ID. Our
implementation handles this automatically.

---

## Connection Methods

### NoOp

Simple ping/keep-alive command.

```json
{
  "jsonrpc": "2.0",
  "method": "NoOp",
  "params": {}
}
```

### Logon

Authenticate with Q-SYS Core.

```json
{
  "jsonrpc": "2.0",
  "method": "Logon",
  "params": {
    "User": "username",
    "Password": "password"
  }
}
```

---

## Status Methods

### StatusGet

Get current Core status and design information.

```json
{
  "jsonrpc": "2.0",
  "method": "StatusGet",
  "params": {}
}
```

**Response includes:**

- `Platform`: Core model (e.g., "Core 500i")
- `State`: "Idle", "Active", or "Standby"
- `DesignName`: Currently loaded design name
- `DesignCode`: Design GUID
- `IsRedundant`: Boolean
- `IsEmulator`: Boolean
- `Status`: Object with `Code` and `String`

### EngineStatus

⚠️ **Note**: This method is not callable - it's automatically sent by Q-SYS when status changes.

---

## Named Control Methods

### Control.Get

Get values of Named Controls.

```json
{
  "jsonrpc": "2.0",
  "method": "Control.Get",
  "params": ["ControlName1", "ControlName2"]
}
```

**Response format:**

```json
{
  "result": [
    {
      "Name": "ControlName1",
      "Value": -12,
      "String": "-12.0dB"
    }
  ]
}
```

### Control.Set

Set a Named Control value with optional ramp.

```json
{
  "jsonrpc": "2.0",
  "method": "Control.Set",
  "params": {
    "Name": "ControlName",
    "Value": -10,
    "Ramp": 2.0 // Optional, in seconds
  }
}
```

---

## Component Control Methods

### ComponentGetComponents

Get list of all Named Components in the design.

```json
{
  "jsonrpc": "2.0",
  "method": "ComponentGetComponents",
  "params": {}
}
```

**Response format:**

```json
{
  "result": [
    {
      "Name": "My Gain",
      "Type": "gain",
      "Properties": []
    }
  ]
}
```

### ComponentGetControls

Get all controls in a Named Component.

```json
{
  "jsonrpc": "2.0",
  "method": "ComponentGetControls",
  "params": {
    "Name": "ComponentName"
  }
}
```

### Component.Get

Get specific control values from a Named Component.

```json
{
  "jsonrpc": "2.0",
  "method": "Component.Get",
  "params": {
    "Name": "ComponentName",
    "Controls": [{ "Name": "gain" }, { "Name": "mute" }]
  }
}
```

### Component.Set

Set control values in a Named Component.

```json
{
  "jsonrpc": "2.0",
  "method": "Component.Set",
  "params": {
    "Name": "ComponentName",
    "Controls": [
      {
        "Name": "gain",
        "Value": -10,
        "Ramp": 2.0 // Optional
      },
      {
        "Name": "mute",
        "Value": true
      }
    ]
  }
}
```

---

## Change Group Methods

Change groups allow efficient polling of multiple controls.

### ChangeGroup.AddControl

Add Named Controls to a change group.

```json
{
  "jsonrpc": "2.0",
  "method": "ChangeGroup.AddControl",
  "params": {
    "Id": "myChangeGroup",
    "Controls": ["Control1", "Control2"]
  }
}
```

### ChangeGroup.AddComponentControl

Add component controls to a change group.

```json
{
  "jsonrpc": "2.0",
  "method": "ChangeGroup.AddComponentControl",
  "params": {
    "Id": "myChangeGroup",
    "Component": {
      "Name": "ComponentName",
      "Controls": [{ "Name": "gain" }, { "Name": "mute" }]
    }
  }
}
```

### ChangeGroup.Remove

Remove controls from a change group.

```json
{
  "jsonrpc": "2.0",
  "method": "ChangeGroup.Remove",
  "params": {
    "Id": "myChangeGroup",
    "Controls": ["Control1"]
  }
}
```

### ChangeGroup.Poll

Poll a change group for updates.

```json
{
  "jsonrpc": "2.0",
  "method": "ChangeGroup.Poll",
  "params": {
    "Id": "myChangeGroup"
  }
}
```

### ChangeGroup.AutoPoll

Set up automatic polling at specified interval.

```json
{
  "jsonrpc": "2.0",
  "method": "ChangeGroup.AutoPoll",
  "params": {
    "Id": "myChangeGroup",
    "Rate": 5 // Seconds
  }
}
```

### ChangeGroup.Clear

Remove all controls from a change group.

```json
{
  "jsonrpc": "2.0",
  "method": "ChangeGroup.Clear",
  "params": {
    "Id": "myChangeGroup"
  }
}
```

### ChangeGroup.Destroy

Delete a change group.

```json
{
  "jsonrpc": "2.0",
  "method": "ChangeGroup.Destroy",
  "params": {
    "Id": "myChangeGroup"
  }
}
```

### ChangeGroup.Invalidate

Force resend of all control values.

```json
{
  "jsonrpc": "2.0",
  "method": "ChangeGroup.Invalidate",
  "params": {
    "Id": "myChangeGroup"
  }
}
```

---

## Snapshot Methods

### Snapshot.Load

Load a snapshot with optional ramp time.

```json
{
  "jsonrpc": "2.0",
  "method": "Snapshot.Load",
  "params": {
    "Name": "SnapshotBankName",
    "Bank": 1, // Snapshot number (1-based)
    "Ramp": 2.5 // Optional, in seconds
  }
}
```

### Snapshot.Save

Save current state to a snapshot.

```json
{
  "jsonrpc": "2.0",
  "method": "Snapshot.Save",
  "params": {
    "Name": "SnapshotBankName",
    "Bank": 1 // Snapshot number (1-based)
  }
}
```

---

## Error Codes

| Code   | Description                 |
| ------ | --------------------------- |
| -32700 | Parse error - Invalid JSON  |
| -32600 | Invalid request             |
| -32601 | Method not found            |
| -32602 | Invalid params              |
| -32603 | Server error                |
| 2      | Invalid Page Request ID     |
| 3      | Bad Page Request            |
| 4      | Missing file                |
| 5      | Change Groups exhausted     |
| 6      | Unknown change group        |
| 7      | Unknown component name      |
| 8      | Unknown control             |
| 9      | Illegal mixer channel index |
| 10     | Logon required              |

---

## Blocked Commands

The following commands are **blocked for safety** by the MCP tool:

- `Design.Save` / `DesignSave`
- `Design.Delete` / `DesignDelete`
- `Design.Deploy` / `DesignDeploy`
- `Core.Reboot` / `CoreReboot`
- `Core.Shutdown` / `CoreShutdown`
- `Core.FactoryReset` / `CoreFactoryReset`
- `Network.Set` / `NetworkSet`

---

## Usage Examples with send_raw_command

### Example 1: Get Core Status

```javascript
await send_raw_command({
  method: 'StatusGet',
  params: {},
});
```

### Example 2: Set a Named Control

```javascript
await send_raw_command({
  method: 'Control.Set',
  params: {
    Name: 'MainVolume',
    Value: -10,
    Ramp: 2.0,
  },
});
```

### Example 3: Get Component Controls

```javascript
await send_raw_command({
  method: 'Component.Get',
  params: {
    Name: 'Mixer1',
    Controls: [{ Name: 'gain' }, { Name: 'mute' }],
  },
});
```

### Example 4: Create and Poll Change Group

```javascript
// Add controls to change group
await send_raw_command({
  method: 'ChangeGroup.AddControl',
  params: {
    Id: 'myGroup',
    Controls: ['Volume1', 'Volume2'],
  },
});

// Poll for changes
await send_raw_command({
  method: 'ChangeGroup.Poll',
  params: {
    Id: 'myGroup',
  },
});
```

---

## Best Practices

1. **Use MCP Tools When Available**: Prefer using dedicated MCP tools like `get_control_values`,
   `set_control_values`, etc. over raw commands when possible.

2. **Check Method Names**: Always verify the exact method name format (CamelCase vs. dot notation)
   from this reference.

3. **Handle Errors**: Q-SYS will return error -32601 for unknown methods. Always handle errors
   appropriately.

4. **Use Change Groups for Monitoring**: When monitoring multiple controls, use change groups for
   efficiency rather than polling individual controls.

5. **Specify Timeouts**: For critical operations, specify appropriate timeout values (default is
   5000ms, max is 30000ms).

6. **Test First**: Use `NoOp` to test connectivity before attempting complex operations.
