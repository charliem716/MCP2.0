# Q-SYS Remote Control (QRC) - Protocol Overview

> **Getting Started with Q-SYS Remote Control Protocol**  
> *Essential guide for developers new to QRC integration*

---

## 🚨 **CRITICAL PROTOCOL DISTINCTION**

### **Two Different Protocols - Don't Confuse Them!**

| Protocol | Port | Technology | Use Case | This System Uses |
|----------|------|------------|----------|------------------|
| **QRC** | `1710` | JSON-RPC over TCP | Legacy control protocol | ❌ **NO** |
| **QRWC** | `443` | WebSocket over HTTPS | Modern web-based control | ✅ **YES** |

### **What This System Actually Uses: QRWC (Port 443)**

**⚠️ IMPORTANT**: This MCP server uses **QRWC (Q-SYS Remote WebSocket Control)** over port **443**, NOT QRC over port 1710!

```javascript
// ACTUAL CONNECTION USED BY THIS SYSTEM
const coreUrl = `wss://${coreHost}:443/qrc-public-api/v0`;
```

---

## 🚀 Quick Reference

### What is QRWC?
Q-SYS Remote WebSocket Control (QRWC) is the **modern web-based protocol** for external control systems to control Q-SYS functions. Unlike the older QRC protocol:

- ✅ **WebSocket Based**: Real-time bidirectional communication
- ✅ **HTTPS/WSS**: Secure encrypted connections on port 443
- ✅ **Named Controls**: Direct control access without requiring Named Controls configuration
- ✅ **Component-Level Control**: Control any control within any named component
- ✅ **Mixer Control**: Specialized mixer operations using audio concepts
- ✅ **PA Router Control**: Complete PA system integration via PARAPI
- ✅ **Change Groups**: Efficient polling and monitoring of control state changes

### Protocol Specifications

| Aspect | Details |
|--------|---------|
| **Protocol** | WebSocket over HTTPS (WSS) |
| **Port** | `443` |
| **Encoding** | Unicode-based |
| **API Endpoint** | `/qrc-public-api/v0` |
| **Keep-Alive** | WebSocket native keep-alive |
| **Command Format** | JSON-RPC 2.0 |

---

## 🔌 Connection & Requirements

### Network Connection Configuration

```javascript
// QRWC Connection Details (Used by this system)
const QRWC_CONFIG = {
  host: "192.168.1.100",  // Q-SYS Core IP
  port: 443,              // HTTPS/WSS port (NOT 1710!)
  protocol: "wss",        // WebSocket Secure
  endpoint: "/qrc-public-api/v0"
};

// Full WebSocket URL
const coreUrl = `wss://${host}:443/qrc-public-api/v0`;
```

### Connection Types

| Type | Requirements | Use Case |
|------|-------------|----------|
| **Q-SYS Core** | Design loaded and in Run mode | Production systems |
| **Q-SYS Designer Emulate** | Design open and in Emulate mode | Testing and development |
| **Localhost** | Use `"localhost"`, computer name, or IP on port 443 | Local development |

### Authentication Requirements

- **User credentials** must be created in **Q-SYS Administrator**
- **External control privileges** must be enabled for the user
- **Username and password** required for `Logon` method

---

## 📝 Command Format

### JSON-RPC 2.0 Structure

```json
{
  "jsonrpc": "2.0",
  "method": "MethodName",
  "params": { /* parameters */ },
  "id": 1234
}
```

### Critical Requirements

- ✅ **`id` field** must be a number for request/response matching
- ✅ **WebSocket connection** - no null termination needed
- ✅ **Responses** include the same `id` from the request
- ✅ **Keep-alive** handled by WebSocket protocol

### Basic Command Example

```json
{
  "jsonrpc": "2.0",
  "method": "Control.Get",
  "params": ["MainGain"],
  "id": 1234
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
      "Value": -12,
      "String": "-12.0dB"
    }
  ]
}
```

---

## 🔐 Authentication Process

### Step 1: Establish WebSocket Connection
```javascript
const WebSocket = require('ws');
const socket = new WebSocket('wss://192.168.1.100:443/qrc-public-api/v0', {
  rejectUnauthorized: false // For self-signed certificates
});

socket.on('open', () => {
  console.log('Connected to Q-SYS Core via QRWC');
});
```

### Step 2: Send Logon Command
```json
{
  "jsonrpc": "2.0",
  "method": "Logon",
  "params": {
    "User": "username",
    "Password": "1234"
  },
  "id": 1
}
```

### Step 3: Handle Response
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": "login_success"
}
```

### Authentication Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `Invalid credentials` | Wrong username/password | Check Q-SYS Administrator settings |
| `Access denied` | User lacks external control privileges | Enable permissions in Administrator |
| `Connection timeout` | Network or firewall issues | Check network connectivity |

---

## ⏱️ Keep-Alive Management

### Why QRWC is Better
- **WebSocket Native**: Built-in keep-alive mechanisms
- **Real-time**: Instant bidirectional communication
- **Persistent**: Connection stays open automatically
- **Efficient**: Lower overhead than TCP polling

### Keep-Alive Solutions

#### Option 1: NoOp Command (if needed)
```json
{
  "jsonrpc": "2.0",
  "method": "NoOp",
  "params": {},
  "id": 2
}
```

#### Option 2: Change Group Auto-Poll (Recommended)
```json
{
  "jsonrpc": "2.0",
  "method": "ChangeGroup.AutoPoll",
  "params": {
    "Id": "my_group",
    "Rate": 30
  },
  "id": 3
}
```

---

## 🎯 Command Categories Overview

| Category | Purpose | Key Methods | Document Reference |
|----------|---------|-------------|-------------------|
| **🔌 Connection** | Login, keep-alive | `Logon`, `NoOp` | This document |
| **📊 Status** | Core status, engine info | `StatusGet`, `EngineStatus` | [Core Control →](qrc-core-control.md) |
| **🎛️ Control** | Named Control operations | `Control.Get`, `Control.Set` | [Core Control →](qrc-core-control.md) |
| **🧩 Component** | Named Component operations | `Component.Get`, `Component.Set` | [Component Control →](qrc-component-control.md) |
| **🔄 Change Group** | Efficient state monitoring | `ChangeGroup.AddControl`, `ChangeGroup.Poll` | [Advanced Control →](qrc-advanced-control.md) [Change Groups API →](qrc-change-groups-api.md) |
| **🎚️ Mixer** | Audio mixer control | `Mixer.SetCrossPointGain`, `Mixer.SetInputMute` | [Advanced Control →](qrc-advanced-control.md) |
| **🔊 Loop Player** | Audio playback control | `LoopPlayer.Start`, `LoopPlayer.Stop` | [Advanced Control →](qrc-advanced-control.md) |
| **📸 Snapshot** | Preset management | `Snapshot.Load`, `Snapshot.Save` | [Advanced Control →](qrc-advanced-control.md) |
| **📢 PARAPI** | PA Router control | `PA.PageSubmit`, `PA.ZoneStatus` | [PA Remote API →](qrc-parapi.md) |

---

## 🛠️ Basic Integration Example

### Complete WebSocket Setup
```javascript
const WebSocket = require('ws');

let currentId = 1;
let isLoggedIn = false;

function sendCommand(command) {
  command.id = currentId++;
  const message = JSON.stringify(command);
  socket.send(message); // WebSocket uses send(), not write()
}

// Connect to Q-SYS Core via QRWC
const socket = new WebSocket('wss://192.168.1.100:443/qrc-public-api/v0', {
  rejectUnauthorized: false
});

socket.on('open', () => {
  console.log('Connected to Q-SYS Core via QRWC');
  
  // Login
  sendCommand({
    "jsonrpc": "2.0",
    "method": "Logon",
    "params": {
      "User": "external_user",
      "Password": "secure_password"
    }
  });
});

// Handle responses
socket.on('message', (data) => {
  try {
    const response = JSON.parse(data.toString());
    
    if (response.method === 'EngineStatus') {
      console.log('Core Status:', response.params.State);
    } else if (response.result === 'login_success') {
      isLoggedIn = true;
      console.log('Login successful');
      
      // Setup change groups for monitoring
      setupChangeGroups();
    }
  } catch (error) {
    console.error('Parse error:', error);
  }
});

// Error handling
socket.on('error', (error) => {
  console.error('WebSocket error:', error);
});

socket.on('close', () => {
  console.log('WebSocket connection closed');
  isLoggedIn = false;
});
```

---

## 🚦 Next Steps

Once you have basic connection working:

1. **📊 [Core Control](qrc-core-control.md)** - Learn basic control operations
2. **🧩 [Component Control](qrc-component-control.md)** - Discover and control components  
3. **🔄 [Advanced Control](qrc-advanced-control.md)** - Change groups, mixers, snapshots
4. **📢 [PA Remote API](qrc-parapi.md)** - PA system integration
5. **❌ [Errors & Best Practices](qrc-errors-best-practices.md)** - Troubleshooting and optimization

---

## 🔗 Integration with Q-SYS MCP Server

This QRWC protocol is used by the **Q-SYS MCP Server** for:

- **Core Discovery**: Finding and connecting to Q-SYS cores via QDP
- **Component Control**: Real-time audio system control via QRWC
- **Health Monitoring**: Core status and connection health
- **Change Detection**: Efficient monitoring of control changes

**Architecture Flow**:
1. **QDP Discovery** (UDP port 2467) → Find cores on network
2. **QRWC Control** (WSS port 443) → Connect and control discovered cores

**See also**: [Q-SYS Protocols Guide](protocols.md) for QDP vs QRWC protocol differences

---

*Ready to start controlling Q-SYS systems? Continue with [Core Control Methods →](qrc-core-control.md)*
