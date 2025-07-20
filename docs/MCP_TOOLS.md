# MCP Tools Documentation

This document describes all available MCP (Model Context Protocol) tools for controlling Q-SYS audio/video systems.

## Available Tools

### 1. `list_components`
Lists all components in the Q-SYS design with optional filtering.

**Parameters:**
- `filter` (optional, string): Filter pattern for component names
- `includeProperties` (optional, boolean): Include detailed component properties

**Example:**
```json
{
  "filter": "Mixer",
  "includeProperties": true
}
```

### 2. `list_controls`
Lists available controls in Q-SYS components with filtering options.

**Parameters:**
- `component` (optional, string): Specific component name
- `controlType` (optional, enum): Filter by type - 'gain', 'mute', 'input_select', 'output_select', 'all'
- `includeMetadata` (optional, boolean): Include control metadata like min/max values

**Example:**
```json
{
  "component": "MainMixer",
  "controlType": "gain",
  "includeMetadata": true
}
```

### 3. `get_control_values`
Gets current values of specified Q-SYS controls.

**Parameters:**
- `controls` (required, array): Array of control names (minimum 1)

**Example:**
```json
{
  "controls": ["MainMixer.gain", "OutputGain.mute"]
}
```

### 4. `set_control_values`
Sets values for specified Q-SYS controls with optional ramping.

**Parameters:**
- `controls` (required, array): Array of control objects with:
  - `name` (string): Control name
  - `value` (number|string|boolean): Control value
  - `ramp` (optional, number): Ramp time in seconds

**Example:**
```json
{
  "controls": [
    { "name": "MainMixer.gain", "value": -10, "ramp": 2.5 },
    { "name": "OutputGain.mute", "value": false }
  ]
}
```

### 5. `query_core_status`
Queries Q-SYS Core system status and health information.

**Parameters:**
- `includeDetails` (optional, boolean): Include detailed system information
- `includeNetworkInfo` (optional, boolean): Include network configuration
- `includePerformance` (optional, boolean): Include performance metrics

**Example:**
```json
{
  "includeDetails": true,
  "includeNetworkInfo": true,
  "includePerformance": true
}
```

### 6. `send_raw_command` (NEW)
Sends raw Q-SYS commands directly to the Core (advanced use).

**Parameters:**
- `method` (required, string): Q-SYS method name (e.g., 'Status.Get', 'Component.Get')
- `params` (optional, any): Parameters for the method call
- `timeout` (optional, number): Command timeout in milliseconds (max: 30000)

**Common Commands:**
- `Status.Get`: Get core status
- `Component.Get`: Get component info
- `Component.Set`: Set component controls
- `Mixer.Set`: Set mixer controls
- `Design.Get`: Get design info
- `Logon`: Authenticate with core

**Blocked Commands (for safety):**
- `Design.Save`, `Design.Delete`, `Design.Deploy`
- `Core.Reboot`, `Core.Shutdown`, `Core.FactoryReset`
- `Network.Set`

**Example:**
```json
{
  "method": "Component.Get",
  "params": {
    "Name": "MainMixer"
  }
}
```

**Response Format:**
```json
{
  "method": "Component.Get",
  "success": true,
  "response": {
    "Name": "MainMixer",
    "Controls": [...]
  },
  "timestamp": "2025-01-20T08:00:00.000Z"
}
```

### 7. `echo`
Testing tool that echoes back messages to verify MCP functionality.

**Parameters:**
- `message` (required, string): Message to echo back

**Example:**
```json
{
  "message": "Hello, Q-SYS!"
}
```

## Tool Naming Convention

All Q-SYS-specific tools follow the naming pattern:
- Component tools: `list_components`
- Control tools: `list_controls`, `get_control_values`, `set_control_values`
- Status tools: `query_core_status`
- Advanced tools: `send_raw_command`

## Error Handling

All tools return structured responses with:
- `content`: Array with response data
- `isError`: Boolean indicating if an error occurred

Error responses include detailed error information:
```json
{
  "content": [{
    "type": "text",
    "text": "Error message with details"
  }],
  "isError": true
}
```

## Performance Considerations

- Tools log warnings for operations taking >1000ms
- The `send_raw_command` tool has a configurable timeout (default: 5000ms, max: 30000ms)
- Large component lists may take longer to process

## Security Notes

1. The `send_raw_command` tool blocks dangerous operations
2. All tool operations are logged for audit purposes
3. Connection management is handled at the server level (no connect/disconnect tools)
4. Authentication commands (Logon/Logoff) trigger warning logs when used

## Usage with AI Agents

These tools are designed for use by AI agents through the MCP protocol. Agents can:
- Discover available components and controls
- Monitor system status
- Adjust audio/video settings
- Execute advanced Q-SYS commands (with restrictions)

The tools provide a safe, validated interface to Q-SYS operations while preventing potentially harmful actions.