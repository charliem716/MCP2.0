# Q-SYS Complete API Reference

## Table of Contents

1. [Protocol Overview](#protocol-overview)
2. [Connection & Authentication](#connection--authentication)
3. [Core Control Methods](#core-control-methods)
4. [Component Control Methods](#component-control-methods)
5. [Change Group Operations](#change-group-operations)
6. [Advanced Control Methods](#advanced-control-methods)
7. [Integration Examples](#integration-examples)
8. [Error Codes & Troubleshooting](#error-codes--troubleshooting)
9. [Best Practices](#best-practices)

## Protocol Overview

### Q-SYS Remote Control WebSocket (QRC)

The Q-SYS Remote Control protocol enables real-time control and monitoring of Q-SYS Core systems through WebSocket connections. This protocol provides JSON-RPC 2.0 based communication for controlling audio components, monitoring system status, and managing control changes.

### Key Features

- **Real-time Communication**: WebSocket-based for low-latency control
- **JSON-RPC 2.0**: Standard protocol for method calls and responses
- **Secure Connection**: TLS/SSL support with authentication
- **Event-Driven**: Subscribe to control changes and system events
- **Batch Operations**: Support for change groups and bulk updates

### Connection Requirements

- **Port**: 443 (WSS) or custom configured port
- **Protocol**: WebSocket Secure (WSS)
- **Authentication**: Username/password or token-based
- **Format**: JSON-RPC 2.0 messages

## Connection & Authentication

### WebSocket Connection

```javascript
// Connection URL format
const url = 'wss://<core-ip>:443/qrc';

// Connection with authentication
const ws = new WebSocket(url, {
  rejectUnauthorized: false, // For self-signed certificates
  headers: {
    'Authorization': 'Basic ' + Buffer.from('username:password').toString('base64')
  }
});
```

### Authentication Flow

#### 1. Initial Connection
```json
{
  "jsonrpc": "2.0",
  "method": "Logon",
  "params": {
    "User": "username",
    "Password": "password"
  },
  "id": 1
}
```

#### 2. Successful Response
```json
{
  "jsonrpc": "2.0",
  "result": {
    "Platform": "Q-SYS Designer",
    "State": "Active",
    "DesignName": "MyDesign",
    "DesignCode": "ABC123"
  },
  "id": 1
}
```

### Session Management

- Sessions timeout after 60 seconds of inactivity
- Use `NoOp` method to keep connection alive
- Automatic reconnection recommended for production

## Core Control Methods

### Status.Get

Retrieve overall system status.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "method": "Status.Get",
  "params": 0,
  "id": 2
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "result": {
    "Platform": "Q-SYS Designer",
    "State": "Active",
    "DesignName": "Conference Room",
    "DesignCode": "gXYmSCTfmau4",
    "IsRedundant": false,
    "IsEmulator": false,
    "Status": {
      "Code": 0,
      "String": "OK"
    }
  },
  "id": 2
}
```

### Control.Get

Get current values of named controls.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "method": "Control.Get",
  "params": {
    "Name": ["Volume", "Mute", "Gain"]
  },
  "id": 3
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "result": {
    "Name": "Volume",
    "Controls": [
      {
        "Name": "Volume",
        "Value": -20.5,
        "ValueString": "-20.5dB",
        "Position": 0.75
      },
      {
        "Name": "Mute",
        "Value": 0,
        "ValueString": "false",
        "Position": 0
      }
    ]
  },
  "id": 3
}
```

### Control.Set

Set values for named controls.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "method": "Control.Set",
  "params": {
    "Name": "Volume",
    "Value": -10.0,
    "Ramp": 2.0
  },
  "id": 4
}
```

**Parameters:**
- `Name`: Control name (string)
- `Value`: New value (number)
- `Position`: Alternative to Value (0.0-1.0)
- `Ramp`: Ramp time in seconds (optional)

### Core.GetStatus

Get detailed Core processor status.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "method": "Core.GetStatus",
  "params": {},
  "id": 5
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "result": {
    "DesignName": "Conference Room",
    "DesignCode": "gXYmSCTfmau4",
    "IsRedundant": false,
    "IsEmulator": false,
    "Platform": "Core 110f",
    "Status": {
      "Code": 0,
      "String": "OK"
    },
    "Mode": "Run",
    "CoreId": "CORE-123456"
  },
  "id": 5
}
```

### NoOp

Keep-alive message to prevent timeout.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "method": "NoOp",
  "params": {},
  "id": 6
}
```

## Component Control Methods

### Component.Get

Retrieve component information and control values.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "method": "Component.Get",
  "params": {
    "Name": "Gain1",
    "Controls": ["gain", "mute", "invert"]
  },
  "id": 7
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "result": {
    "Name": "Gain1",
    "Type": "gain",
    "Properties": {
      "Status": {
        "Code": 0,
        "String": "OK"
      }
    },
    "Controls": [
      {
        "Name": "gain",
        "Value": 0.0,
        "ValueString": "0.0dB",
        "Position": 0.5
      },
      {
        "Name": "mute",
        "Value": 0,
        "ValueString": "false",
        "Position": 0
      }
    ]
  },
  "id": 7
}
```

### Component.Set

Set component control values.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "method": "Component.Set",
  "params": {
    "Name": "Gain1",
    "Controls": [
      {
        "Name": "gain",
        "Value": -6.0,
        "Ramp": 1.5
      },
      {
        "Name": "mute",
        "Value": 1
      }
    ]
  },
  "id": 8
}
```

### Component.GetComponents

List all available components in the design.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "method": "Component.GetComponents",
  "params": {},
  "id": 9
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "result": [
    {
      "Name": "Gain1",
      "Type": "gain"
    },
    {
      "Name": "Mixer1",
      "Type": "mixer"
    },
    {
      "Name": "AudioPlayer1",
      "Type": "audio_player"
    }
  ],
  "id": 9
}
```

### Component.GetControls

Get all controls for a specific component.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "method": "Component.GetControls",
  "params": {
    "Name": "Mixer1"
  },
  "id": 10
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "result": {
    "Name": "Mixer1",
    "Type": "mixer",
    "Controls": [
      {
        "Name": "input.1.gain",
        "Type": "Float",
        "Value": 0.0,
        "ValueString": "0.0dB",
        "Position": 0.5
      },
      {
        "Name": "input.1.mute",
        "Type": "Boolean",
        "Value": 0,
        "ValueString": "false"
      },
      {
        "Name": "output.1.gain",
        "Type": "Float",
        "Value": 0.0,
        "ValueString": "0.0dB"
      }
    ]
  },
  "id": 10
}
```

## Change Group Operations

### ChangeGroup.AddControl

Create or add controls to a change group for monitoring.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "method": "ChangeGroup.AddControl",
  "params": {
    "Id": "monitoring-1",
    "Controls": ["Volume", "Mute", "Gain"]
  },
  "id": 11
}
```

### ChangeGroup.AddComponentControl

Add component controls to a change group.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "method": "ChangeGroup.AddComponentControl",
  "params": {
    "Id": "monitoring-1",
    "Component": {
      "Name": "Gain1",
      "Controls": ["gain", "mute"]
    }
  },
  "id": 12
}
```

### ChangeGroup.Remove

Remove controls from a change group.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "method": "ChangeGroup.Remove",
  "params": {
    "Id": "monitoring-1",
    "Controls": ["Volume"]
  },
  "id": 13
}
```

### ChangeGroup.Poll

Poll for changes in a change group.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "method": "ChangeGroup.Poll",
  "params": {
    "Id": "monitoring-1"
  },
  "id": 14
}
```

**Response (with changes):**
```json
{
  "jsonrpc": "2.0",
  "result": {
    "Id": "monitoring-1",
    "Changes": [
      {
        "Name": "Volume",
        "Value": -15.0,
        "ValueString": "-15.0dB"
      },
      {
        "Component": "Gain1",
        "Name": "gain",
        "Value": -3.0,
        "ValueString": "-3.0dB"
      }
    ]
  },
  "id": 14
}
```

### ChangeGroup.AutoPoll

Enable automatic polling with specified interval.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "method": "ChangeGroup.AutoPoll",
  "params": {
    "Id": "monitoring-1",
    "Rate": 0.1
  },
  "id": 15
}
```

**Automatic Update Event:**
```json
{
  "jsonrpc": "2.0",
  "method": "ChangeGroup.AutoPoll",
  "params": {
    "Id": "monitoring-1",
    "Changes": [
      {
        "Name": "Volume",
        "Value": -12.0,
        "ValueString": "-12.0dB"
      }
    ]
  }
}
```

### ChangeGroup.Destroy

Remove a change group and stop monitoring.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "method": "ChangeGroup.Destroy",
  "params": {
    "Id": "monitoring-1"
  },
  "id": 16
}
```

### ChangeGroup.Clear

Clear all controls from a change group.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "method": "ChangeGroup.Clear",
  "params": {
    "Id": "monitoring-1"
  },
  "id": 17
}
```

### ChangeGroup.Invalidate

Force refresh of all controls in group on next poll.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "method": "ChangeGroup.Invalidate",
  "params": {
    "Id": "monitoring-1"
  },
  "id": 18
}
```

## Advanced Control Methods

### Mixer.SetInputGain

Set input gain for a mixer channel.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "method": "Mixer.SetInputGain",
  "params": {
    "Name": "Mixer1",
    "Inputs": [
      {
        "Index": 1,
        "Gain": -6.0,
        "Ramp": 2.0
      }
    ]
  },
  "id": 19
}
```

### Mixer.SetOutputGain

Set output gain for mixer channels.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "method": "Mixer.SetOutputGain",
  "params": {
    "Name": "Mixer1",
    "Outputs": [
      {
        "Index": 1,
        "Gain": 0.0
      }
    ]
  },
  "id": 20
}
```

### Mixer.SetCrossPointGain

Set crosspoint gain in a mixer matrix.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "method": "Mixer.SetCrossPointGain",
  "params": {
    "Name": "Mixer1",
    "Inputs": [1, 2],
    "Outputs": [1],
    "Value": -3.0,
    "Ramp": 1.0
  },
  "id": 21
}
```

### PA.PageSubmit

Submit a page announcement.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "method": "PA.PageSubmit",
  "params": {
    "Name": "PageStation1",
    "Message": "Attention please",
    "QueueTimeout": 30,
    "Priority": 1,
    "Zones": [1, 2, 3]
  },
  "id": 22
}
```

### PA.PageCancel

Cancel an active page.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "method": "PA.PageCancel",
  "params": {
    "Name": "PageStation1"
  },
  "id": 23
}
```

## Integration Examples

### Complete Connection Example

```javascript
const WebSocket = require('ws');

class QSysController {
  constructor(host, username, password) {
    this.host = host;
    this.username = username;
    this.password = password;
    this.ws = null;
    this.requestId = 0;
    this.pending = new Map();
  }

  async connect() {
    const url = `wss://${this.host}:443/qrc`;
    
    this.ws = new WebSocket(url, {
      rejectUnauthorized: false
    });

    this.ws.on('open', () => {
      this.authenticate();
    });

    this.ws.on('message', (data) => {
      const response = JSON.parse(data);
      if (response.id && this.pending.has(response.id)) {
        const { resolve, reject } = this.pending.get(response.id);
        this.pending.delete(response.id);
        
        if (response.error) {
          reject(response.error);
        } else {
          resolve(response.result);
        }
      } else if (response.method) {
        // Handle unsolicited events
        this.handleEvent(response);
      }
    });

    this.ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });

    // Keep-alive
    setInterval(() => {
      this.sendRequest('NoOp', {});
    }, 30000);
  }

  async authenticate() {
    const result = await this.sendRequest('Logon', {
      User: this.username,
      Password: this.password
    });
    console.log('Connected to:', result.DesignName);
    return result;
  }

  sendRequest(method, params) {
    return new Promise((resolve, reject) => {
      const id = ++this.requestId;
      const request = {
        jsonrpc: '2.0',
        method,
        params,
        id
      };

      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(request));

      // Timeout after 10 seconds
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 10000);
    });
  }

  handleEvent(event) {
    if (event.method === 'ChangeGroup.AutoPoll') {
      console.log('Control changes:', event.params.Changes);
    }
  }

  // Control methods
  async getControl(name) {
    return this.sendRequest('Control.Get', { Name: [name] });
  }

  async setControl(name, value, ramp) {
    return this.sendRequest('Control.Set', {
      Name: name,
      Value: value,
      Ramp: ramp
    });
  }

  // Component methods
  async getComponent(name, controls) {
    return this.sendRequest('Component.Get', {
      Name: name,
      Controls: controls
    });
  }

  async setComponent(name, controls) {
    return this.sendRequest('Component.Set', {
      Name: name,
      Controls: controls
    });
  }

  // Change group methods
  async createChangeGroup(id, controls) {
    return this.sendRequest('ChangeGroup.AddControl', {
      Id: id,
      Controls: controls
    });
  }

  async enableAutoPoll(id, rate) {
    return this.sendRequest('ChangeGroup.AutoPoll', {
      Id: id,
      Rate: rate
    });
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

// Usage
const controller = new QSysController('192.168.1.100', 'admin', 'password');

async function main() {
  await controller.connect();
  
  // Get control value
  const volume = await controller.getControl('Volume');
  console.log('Current volume:', volume);
  
  // Set control value with 2 second ramp
  await controller.setControl('Volume', -10, 2.0);
  
  // Monitor changes
  await controller.createChangeGroup('monitor-1', ['Volume', 'Mute']);
  await controller.enableAutoPoll('monitor-1', 0.1);
}

main().catch(console.error);
```

### Batch Operations Example

```javascript
// Set multiple controls at once
async function batchControlUpdate(controller) {
  const updates = [
    { name: 'Volume', value: -15 },
    { name: 'Mute', value: 0 },
    { name: 'Gain', value: -3 }
  ];

  for (const update of updates) {
    await controller.setControl(update.name, update.value);
  }
}

// Set multiple component controls
async function updateMixer(controller) {
  await controller.setComponent('Mixer1', [
    { Name: 'input.1.gain', Value: -6 },
    { Name: 'input.2.gain', Value: -3 },
    { Name: 'output.1.gain', Value: 0 }
  ]);
}
```

### Error Handling Example

```javascript
async function safeControlUpdate(controller, name, value) {
  try {
    const result = await controller.setControl(name, value);
    console.log(`Successfully updated ${name} to ${value}`);
    return result;
  } catch (error) {
    if (error.code === -32602) {
      console.error(`Invalid control name: ${name}`);
    } else if (error.code === -32603) {
      console.error(`Value out of range for ${name}: ${value}`);
    } else {
      console.error(`Failed to update ${name}:`, error.message);
    }
    throw error;
  }
}
```

## Error Codes & Troubleshooting

### Standard JSON-RPC Error Codes

| Code | Message | Description |
|------|---------|-------------|
| -32700 | Parse error | Invalid JSON was received |
| -32600 | Invalid Request | The JSON sent is not a valid Request object |
| -32601 | Method not found | The method does not exist or is not available |
| -32602 | Invalid params | Invalid method parameter(s) |
| -32603 | Internal error | Internal JSON-RPC error |

### Q-SYS Specific Error Codes

| Code | Message | Description | Solution |
|------|---------|-------------|----------|
| 1 | Invalid Page Request ID | Page ID doesn't exist | Check page station name |
| 2 | Invalid Page Request | Page parameters invalid | Verify zone numbers and priority |
| 3 | Missing file | Referenced file not found | Upload file to Core |
| 4 | Change Group ID not found | Invalid change group | Create group before polling |
| 5 | Unknown component | Component doesn't exist | Check component name spelling |
| 6 | Unknown control | Control doesn't exist | Verify control name |
| 7 | Control is read-only | Cannot set value | Control is status-only |
| 8 | Value out of range | Value exceeds limits | Check min/max values |

### Common Issues & Solutions

#### Connection Refused
**Problem:** Cannot establish WebSocket connection  
**Solutions:**
- Verify Core IP address and port (typically 443)
- Check network connectivity
- Ensure QRC is enabled in Core configuration
- Verify firewall rules allow WebSocket traffic

#### Authentication Failed
**Problem:** Logon method returns error  
**Solutions:**
- Verify username and password
- Check user has remote control permissions
- Ensure user account is not locked
- Try with administrator credentials for testing

#### Controls Not Updating
**Problem:** Control.Set appears successful but values don't change  
**Solutions:**
- Check control is not read-only
- Verify control name exactly matches design
- Ensure no other client is overriding values
- Check for active snapshots or presets

#### Change Group Not Receiving Updates
**Problem:** AutoPoll enabled but no events received  
**Solutions:**
- Verify controls were added to group
- Check Rate parameter is reasonable (0.1-1.0)
- Ensure WebSocket connection is stable
- Verify controls actually changing values

#### Timeout Errors
**Problem:** Requests timeout without response  
**Solutions:**
- Send NoOp messages every 30 seconds
- Check network latency
- Verify Core is not overloaded
- Implement automatic reconnection

## Best Practices

### Connection Management

1. **Always implement reconnection logic**
   ```javascript
   function setupReconnect(controller) {
     controller.ws.on('close', () => {
       console.log('Connection lost, reconnecting...');
       setTimeout(() => controller.connect(), 5000);
     });
   }
   ```

2. **Use connection pooling for multiple Cores**
   ```javascript
   class CorePool {
     constructor() {
       this.connections = new Map();
     }
     
     async getConnection(coreId, config) {
       if (!this.connections.has(coreId)) {
         const conn = new QSysController(config);
         await conn.connect();
         this.connections.set(coreId, conn);
       }
       return this.connections.get(coreId);
     }
   }
   ```

### Performance Optimization

1. **Batch control updates when possible**
   - Use Component.Set for multiple controls
   - Group related changes together
   - Minimize network round-trips

2. **Use appropriate polling rates**
   - 100ms (0.1) for critical real-time monitoring
   - 500ms (0.5) for general monitoring
   - 1000ms (1.0) for status updates

3. **Implement caching for static data**
   ```javascript
   class CachedController extends QSysController {
     constructor(...args) {
       super(...args);
       this.cache = new Map();
       this.cacheTimeout = 5000; // 5 seconds
     }
     
     async getCachedComponent(name) {
       const key = `component:${name}`;
       const cached = this.cache.get(key);
       
       if (cached && Date.now() - cached.time < this.cacheTimeout) {
         return cached.data;
       }
       
       const data = await this.getComponent(name);
       this.cache.set(key, { data, time: Date.now() });
       return data;
     }
   }
   ```

### Security Considerations

1. **Use secure connections (WSS) in production**
2. **Implement token-based authentication when available**
3. **Rotate credentials regularly**
4. **Limit user permissions to minimum required**
5. **Log all control changes for audit trail**
6. **Validate all input values before sending**
7. **Implement rate limiting for control changes**

### Error Recovery

1. **Implement exponential backoff for retries**
   ```javascript
   async function retryWithBackoff(fn, maxRetries = 3) {
     for (let i = 0; i < maxRetries; i++) {
       try {
         return await fn();
       } catch (error) {
         if (i === maxRetries - 1) throw error;
         await new Promise(r => setTimeout(r, Math.pow(2, i) * 1000));
       }
     }
   }
   ```

2. **Handle partial failures gracefully**
3. **Provide meaningful error messages to users**
4. **Log errors with context for debugging**

### Monitoring & Logging

1. **Log all method calls and responses in development**
2. **Monitor connection health with heartbeat**
3. **Track performance metrics (latency, success rate)**
4. **Alert on connection failures or high error rates**
5. **Maintain audit log of all control changes**

## Component Type Reference

### Common Component Types

| Type | Description | Common Controls |
|------|-------------|-----------------|
| `gain` | Gain control | gain, mute, invert |
| `mixer` | Audio mixer | input.X.gain, output.X.gain, crosspoint |
| `audio_player` | Audio file player | play, stop, pause, loop, output.gain |
| `delay` | Audio delay | delay_ms, bypass |
| `router` | Audio router | select, input.X.select |
| `meter` | Audio meter | level, peak, rms |
| `generator` | Signal generator | frequency, level, enable |

### Control Value Types

| Type | Range | Example |
|------|-------|---------|
| Float | Component-specific | -100.0 to 10.0 (dB) |
| Integer | Component-specific | 0 to 100 |
| Boolean | 0 or 1 | 0 = false, 1 = true |
| String | Any text | "Playing", "Stopped" |
| Position | 0.0 to 1.0 | 0.5 = 50% |

### Position vs Value

- **Position**: Normalized 0.0-1.0 representation
- **Value**: Actual value in component units
- **ValueString**: Human-readable representation

Example:
```json
{
  "Name": "gain",
  "Value": -20.0,        // Actual dB value
  "Position": 0.25,      // 25% of range
  "ValueString": "-20.0dB"  // Display string
}
```

## Conclusion

This comprehensive reference covers all aspects of the Q-SYS Remote Control WebSocket protocol. For the latest updates and additional features, consult the official Q-SYS documentation or contact Q-SYS support.

### Quick Reference Links

- [Q-SYS Official Documentation](https://q-sys.com/resources/documentation/)
- [Q-SYS Designer Software](https://q-sys.com/products/software/)