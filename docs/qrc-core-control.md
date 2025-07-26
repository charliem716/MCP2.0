# Q-SYS Remote Control (QRC) - Core Control Methods

> **Basic control operations for Q-SYS systems**  
> _Status monitoring and Named Control operations_

---

## 🚀 Quick Reference

### Essential Methods

| Method            | Purpose             | Parameters          | Use Case            |
| ----------------- | ------------------- | ------------------- | ------------------- |
| **`StatusGet`**   | Get core status     | None                | Health monitoring   |
| **`Control.Get`** | Read control values | Control names array | Monitor controls    |
| **`Control.Set`** | Set control values  | Name, value, ramp   | Control devices     |
| **`NoOp`**        | Keep-alive          | None                | Maintain connection |

### Common Control Types

| Type        | Description        | Example Values                    |
| ----------- | ------------------ | --------------------------------- |
| **Float**   | Numeric with range | `-100.0` to `20.0` (gain)         |
| **Boolean** | True/false         | `true` (muted), `false` (unmuted) |
| **Integer** | Whole numbers      | `1`, `2`, `3` (selections)        |
| **String**  | Text values        | `"Input 1"`, `"Stereo"`           |

---

## 📊 Status Methods

### StatusGet

Get current Q-SYS Core status and configuration.

**Method:** `StatusGet`  
**Parameters:** None (use `0` for params)

**Request:**

```json
{
  "jsonrpc": "2.0",
  "method": "StatusGet",
  "id": 1234,
  "params": 0
}
```

**Response:**

```json
{
  "jsonrpc": "2.0",
  "id": 1234,
  "result": {
    "Platform": "Core 510i",
    "State": "Active",
    "DesignName": "SAF-MainPA",
    "DesignCode": "qALFilm6IcAz",
    "IsRedundant": false,
    "IsEmulator": true,
    "Status": {
      "Code": 0,
      "String": "OK"
    }
  }
}
```

### Response Fields

| Field               | Type    | Description                    |
| ------------------- | ------- | ------------------------------ |
| **`Platform`**      | String  | Q-SYS Core model               |
| **`State`**         | String  | "Idle", "Active", or "Standby" |
| **`DesignName`**    | String  | Currently running design       |
| **`DesignCode`**    | String  | GUID of current design         |
| **`IsRedundant`**   | Boolean | Redundant configuration        |
| **`IsEmulator`**    | Boolean | Running in emulator mode       |
| **`Status.Code`**   | Integer | Status code (0 = OK)           |
| **`Status.String`** | String  | Human-readable status          |

### EngineStatus (Automatic Notifications)

The core automatically sends `EngineStatus` notifications when the state changes.

**Method:** `EngineStatus` (received automatically)

**Example Notification:**

```json
{
  "jsonrpc": "2.0",
  "method": "EngineStatus",
  "params": {
    "State": "Active",
    "DesignName": "MyDesign",
    "DesignCode": "abc123def456",
    "IsRedundant": false,
    "IsEmulator": false
  }
}
```

### State Values

| State         | Description                    | Action Required       |
| ------------- | ------------------------------ | --------------------- |
| **`Active`**  | Core is running and available  | Normal operation      |
| **`Idle`**    | No design loaded               | Load design           |
| **`Standby`** | Redundant core in standby mode | Switch to active core |

---

## 🎛️ Control Methods

### Control.Get

Get values from Named Controls.

**Method:** `Control.Get`  
**Parameters:** Array of Named Control strings

#### Single Control Example

```json
{
  "jsonrpc": "2.0",
  "id": 1234,
  "method": "Control.Get",
  "params": ["MainGain"]
}
```

**Response:**

```json
{
  "jsonrpc": "2.0",
  "id": 1234,
  "result": [
    {
      "Name": "MainGain",
      "Value": -12.0,
      "String": "-12.0dB"
    }
  ]
}
```

#### Multiple Controls Example

```json
{
  "jsonrpc": "2.0",
  "id": 1234,
  "method": "Control.Get",
  "params": ["MainGain", "MainMute", "InputSelect"]
}
```

**Response:**

```json
{
  "jsonrpc": "2.0",
  "id": 1234,
  "result": [
    {
      "Name": "MainGain",
      "Value": -12.0,
      "String": "-12.0dB"
    },
    {
      "Name": "MainMute",
      "Value": false,
      "String": "Unmuted"
    },
    {
      "Name": "InputSelect",
      "Value": 2,
      "String": "Input 2"
    }
  ]
}
```

### Control.Set

Set a Named Control value with optional ramping.

**Method:** `Control.Set`

**Parameters:**

- `Name`: Control name (string)
- `Value`: New value (number, string, or boolean)
- `Ramp` (optional): Ramp time in seconds

#### Basic Set Example

```json
{
  "jsonrpc": "2.0",
  "id": 1234,
  "method": "Control.Set",
  "params": {
    "Name": "MainGain",
    "Value": -15.0
  }
}
```

#### Set with Ramp Example

```json
{
  "jsonrpc": "2.0",
  "id": 1234,
  "method": "Control.Set",
  "params": {
    "Name": "MainGain",
    "Value": -12.0,
    "Ramp": 2.0
  }
}
```

#### Boolean Control Example

```json
{
  "jsonrpc": "2.0",
  "id": 1234,
  "method": "Control.Set",
  "params": {
    "Name": "MainMute",
    "Value": true
  }
}
```

### Response Format

**Success Response:**

```json
{
  "jsonrpc": "2.0",
  "id": 1234,
  "result": {}
}
```

**Error Response:**

```json
{
  "jsonrpc": "2.0",
  "id": 1234,
  "error": {
    "code": 8,
    "message": "Unknown control"
  }
}
```

---

## 🔄 Keep-Alive Methods

### NoOp

No-operation command for maintaining connection.

**Method:** `NoOp`  
**Parameters:** Empty object

**Request:**

```json
{
  "jsonrpc": "2.0",
  "method": "NoOp",
  "params": {},
  "id": 2
}
```

**Response:**

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {}
}
```

### Keep-Alive Strategy

```javascript
// Send NoOp every 30 seconds
setInterval(() => {
  sendCommand({
    jsonrpc: '2.0',
    method: 'NoOp',
    params: {},
    id: Date.now(),
  });
}, 30000);
```

---

## 🛠️ Integration Examples

### Basic Control Loop

```javascript
const net = require('net');
const socket = new net.Socket();

let currentId = 1;
let isLoggedIn = false;

function sendCommand(command) {
  command.id = currentId++;
  const message = JSON.stringify(command) + '\0';
  socket.write(message);
  return command.id;
}

// Connect and login
socket.connect(1710, 'your-qsys-core-ip', () => {
  sendCommand({
    jsonrpc: '2.0',
    method: 'Logon',
    params: {
      User: 'admin',
      Password: 'password',
    },
  });
});

// Handle responses
socket.on('data', data => {
  const messages = data
    .toString()
    .split('\0')
    .filter(msg => msg.length > 0);

  messages.forEach(msg => {
    try {
      const response = JSON.parse(msg);

      if (response.result === 'login_success') {
        isLoggedIn = true;
        console.log('Connected successfully');

        // Start monitoring
        startControlMonitoring();
      }
    } catch (error) {
      console.error('Parse error:', error);
    }
  });
});

function startControlMonitoring() {
  // Get status every 10 seconds
  setInterval(() => {
    sendCommand({
      jsonrpc: '2.0',
      method: 'StatusGet',
      params: 0,
    });
  }, 10000);

  // Monitor controls every 5 seconds
  setInterval(() => {
    sendCommand({
      jsonrpc: '2.0',
      method: 'Control.Get',
      params: ['MainGain', 'MainMute'],
    });
  }, 5000);

  // Keep-alive every 30 seconds
  setInterval(() => {
    sendCommand({
      jsonrpc: '2.0',
      method: 'NoOp',
      params: {},
    });
  }, 30000);
}
```

### Audio Control Functions

```javascript
// Mute/Unmute control
function setMute(controlName, muted) {
  return sendCommand({
    jsonrpc: '2.0',
    method: 'Control.Set',
    params: {
      Name: controlName,
      Value: muted,
    },
  });
}

// Set gain with ramp
function setGain(controlName, gainValue, rampTime = 0) {
  const params = {
    Name: controlName,
    Value: gainValue,
  };

  if (rampTime > 0) {
    params.Ramp = rampTime;
  }

  return sendCommand({
    jsonrpc: '2.0',
    method: 'Control.Set',
    params: params,
  });
}

// Get current values
function getControlValues(controlNames) {
  return sendCommand({
    jsonrpc: '2.0',
    method: 'Control.Get',
    params: controlNames,
  });
}

// Usage examples
setMute('MainMute', true); // Mute immediately
setGain('MainGain', -12.0, 2.0); // Set gain with 2-second ramp
getControlValues(['MainGain', 'MainMute']); // Get current values
```

### Error Handling

```javascript
function handleResponse(response) {
  if (response.error) {
    switch (response.error.code) {
      case 8:
        console.error('Unknown control:', response.error.message);
        break;
      case 10:
        console.error('Not logged in, attempting reconnection...');
        // Implement reconnection logic
        break;
      default:
        console.error('QRC Error:', response.error);
    }
  } else if (response.result) {
    // Handle successful response
    console.log('Success:', response.result);
  }
}
```

---

## 🔗 Common Use Cases

### 1. Audio System Control Panel

```javascript
// Create a simple control panel
const audioControls = {
  // Main output controls
  mainGain: 'MainGain',
  mainMute: 'MainMute',

  // Microphone controls
  micGain: 'MicGain',
  micMute: 'MicMute',

  // Source selection
  sourceSelect: 'SourceSelect',

  // Monitor values
  async getAll() {
    const response = await sendCommand({
      jsonrpc: '2.0',
      method: 'Control.Get',
      params: [this.mainGain, this.mainMute, this.micGain, this.micMute, this.sourceSelect],
    });
    return response;
  },

  // Set main volume
  async setMainVolume(volume, rampTime = 1.0) {
    return sendCommand({
      jsonrpc: '2.0',
      method: 'Control.Set',
      params: {
        Name: this.mainGain,
        Value: volume,
        Ramp: rampTime,
      },
    });
  },
};
```

### 2. System Health Monitor

```javascript
class QSysHealthMonitor {
  constructor(socket) {
    this.socket = socket;
    this.isHealthy = false;
    this.lastStatus = null;
  }

  start() {
    // Check status every 30 seconds
    setInterval(() => {
      this.checkHealth();
    }, 30000);
  }

  async checkHealth() {
    try {
      const response = await sendCommand({
        jsonrpc: '2.0',
        method: 'StatusGet',
        params: 0,
      });

      if (response.result.State === 'Active') {
        this.isHealthy = true;
        this.lastStatus = response.result;
        console.log(`Q-SYS Core healthy: ${response.result.DesignName}`);
      } else {
        this.isHealthy = false;
        console.warn(`Q-SYS Core not active: ${response.result.State}`);
      }
    } catch (error) {
      this.isHealthy = false;
      console.error('Health check failed:', error);
    }
  }
}
```

---

## 🚦 Next Steps

Ready for more advanced control operations?

1. **🧩 [Component Control](qrc-component-control.md)** - Discover and control individual components
2. **🔄 [Advanced Control](qrc-advanced-control.md)** - Change groups, mixers, and snapshots
3. **📢 [PA Remote API](qrc-parapi.md)** - PA system integration
4. **❌ [Errors & Best Practices](qrc-errors-best-practices.md)** - Troubleshooting guide

---

## 🔗 Related Documentation

- **[QRC Overview](qrc-overview.md)** - Protocol basics and connection setup
- **[Q-SYS Protocols Guide](protocols.md)** - QDP vs QRC protocol differences
- **[Core API](core-api.md)** - Q-SYS MCP Server core control endpoints

---

_Continue with [Component Control Methods →](qrc-component-control.md) to learn about advanced
component discovery and control._
