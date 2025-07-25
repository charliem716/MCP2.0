# Q-SYS Remote Control (QRC) - Component Control Methods

> **Advanced component discovery and control operations**  
> _Named Component operations for detailed Q-SYS system control_

---

## 🚀 Quick Reference

### Essential Component Methods

| Method                        | Purpose                       | Use Case                       |
| ----------------------------- | ----------------------------- | ------------------------------ |
| **`Component.GetComponents`** | Discover all components       | System inventory               |
| **`Component.GetControls`**   | Get component control list    | Explore component capabilities |
| **`Component.Get`**           | Read component control values | Monitor component state        |
| **`Component.Set`**           | Set component control values  | Control specific components    |

### Component vs Named Control

| Aspect        | Named Control        | Component Control               |
| ------------- | -------------------- | ------------------------------- |
| **Scope**     | Single control       | Multiple controls per component |
| **Discovery** | Manual configuration | Automatic discovery             |
| **Naming**    | Simple string        | Component.ControlName format    |
| **Use Case**  | Basic control        | Advanced integration            |

---

## 🔍 Component Discovery

### Component.GetComponents

Discover all Named Components in the current Q-SYS design.

**Method:** `Component.GetComponents`  
**Parameters:** Empty object `{}`

**Request:**

```json
{
  "jsonrpc": "2.0",
  "method": "Component.GetComponents",
  "params": {},
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
      "Name": "My APM",
      "Type": "apm_input"
    },
    {
      "Name": "Matrix Mixer",
      "Type": "matrix_mixer"
    },
    {
      "Name": "PA Router",
      "Type": "pa_router"
    }
  ]
}
```

### Component.GetControls

Get detailed control information for a specific component.

**Method:** `Component.GetControls`

**Parameters:**

- `Name`: Named Component name

**Request:**

```json
{
  "jsonrpc": "2.0",
  "method": "Component.GetControls",
  "params": {
    "Name": "My APM"
  },
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
      "Name": "ent.xfade.gain",
      "String": "-100.0dB",
      "Value": -100.0,
      "Position": 0.0,
      "Direction": "Write",
      "ValueType": "Double",
      "Type": "Knob"
    },
    {
      "Name": "bgm.xfade.gain",
      "String": "0.0dB",
      "Value": 0.0,
      "Position": 1.0,
      "Direction": "Write",
      "ValueType": "Double",
      "Type": "Knob"
    },
    {
      "Name": "ent.input.mute",
      "String": "Unmuted",
      "Value": false,
      "Position": 0.0,
      "Direction": "Write",
      "ValueType": "Boolean",
      "Type": "Button"
    }
  ]
}
```

### Control Properties

| Property        | Description                   | Values                                   |
| --------------- | ----------------------------- | ---------------------------------------- |
| **`Name`**      | Control identifier            | String (e.g., "ent.xfade.gain")          |
| **`String`**    | Human-readable value          | Formatted string                         |
| **`Value`**     | Numeric/boolean value         | Number or boolean                        |
| **`Position`**  | Normalized position (0.0-1.0) | Float                                    |
| **`Direction`** | Read/write capability         | "Read", "Write", "ReadWrite"             |
| **`ValueType`** | Data type                     | "Double", "Integer", "Boolean", "String" |
| **`Type`**      | Control type                  | "Knob", "Button", "Fader", "Text", etc.  |

---

## 📊 Component Control Operations

### Component.Get

Get specific controls from a Named Component.

**Method:** `Component.Get`

**Parameters:**

- `Name`: Named Component name
- `Controls`: Array of control specifications

#### Single Control Example

```json
{
  "jsonrpc": "2.0",
  "id": 1234,
  "method": "Component.Get",
  "params": {
    "Name": "My APM",
    "Controls": [{ "Name": "ent.xfade.gain" }]
  }
}
```

**Response:**

```json
{
  "jsonrpc": "2.0",
  "id": 1234,
  "result": {
    "Name": "My APM",
    "Controls": [
      {
        "Name": "ent.xfade.gain",
        "Value": -100.0,
        "String": "-100.0dB",
        "Position": 0.0
      }
    ]
  }
}
```

#### Multiple Controls Example

```json
{
  "jsonrpc": "2.0",
  "id": 1234,
  "method": "Component.Get",
  "params": {
    "Name": "My APM",
    "Controls": [
      { "Name": "ent.xfade.gain" },
      { "Name": "bgm.xfade.gain" },
      { "Name": "ent.input.mute" }
    ]
  }
}
```

**Response:**

```json
{
  "jsonrpc": "2.0",
  "id": 1234,
  "result": {
    "Name": "My APM",
    "Controls": [
      {
        "Name": "ent.xfade.gain",
        "Value": -100.0,
        "String": "-100.0dB",
        "Position": 0.0
      },
      {
        "Name": "bgm.xfade.gain",
        "Value": 0.0,
        "String": "0.0dB",
        "Position": 1.0
      },
      {
        "Name": "ent.input.mute",
        "Value": false,
        "String": "Unmuted",
        "Position": 0.0
      }
    ]
  }
}
```

### Component.Set

Set controls in a Named Component.

**Method:** `Component.Set`

**Parameters:**

- `Name`: Named Component name
- `Controls`: Array of controls to set
- `ResponseValues` (optional): Return new values if `true`

#### Single Control Set Example

```json
{
  "jsonrpc": "2.0",
  "id": 1234,
  "method": "Component.Set",
  "params": {
    "Name": "My APM",
    "Controls": [
      {
        "Name": "ent.xfade.gain",
        "Value": -12.0,
        "Ramp": 2.0
      }
    ]
  }
}
```

#### Multiple Controls Set Example

```json
{
  "jsonrpc": "2.0",
  "id": 1234,
  "method": "Component.Set",
  "params": {
    "Name": "My APM",
    "Controls": [
      {
        "Name": "ent.xfade.gain",
        "Value": -12.0,
        "Ramp": 2.0
      },
      {
        "Name": "bgm.xfade.gain",
        "Value": -6.0,
        "Ramp": 1.0
      },
      {
        "Name": "ent.input.mute",
        "Value": false
      }
    ],
    "ResponseValues": true
  }
}
```

#### Set with Response Values

When `ResponseValues` is `true`, the response includes the new values:

```json
{
  "jsonrpc": "2.0",
  "id": 1234,
  "result": {
    "Name": "My APM",
    "Controls": [
      {
        "Name": "ent.xfade.gain",
        "Value": -12.0,
        "String": "-12.0dB",
        "Position": 0.44
      },
      {
        "Name": "bgm.xfade.gain",
        "Value": -6.0,
        "String": "-6.0dB",
        "Position": 0.7
      },
      {
        "Name": "ent.input.mute",
        "Value": false,
        "String": "Unmuted",
        "Position": 0.0
      }
    ]
  }
}
```

---

## 🛠️ Practical Integration Examples

### Component Discovery System

```javascript
class QSysComponentManager {
  constructor(socket) {
    this.socket = socket;
    this.components = new Map();
    this.controls = new Map();
  }

  async discoverComponents() {
    const response = await this.sendCommand({
      jsonrpc: '2.0',
      method: 'Component.GetComponents',
      params: {},
    });

    // Store component information
    response.result.forEach(component => {
      this.components.set(component.Name, component);
    });

    console.log(`Discovered ${response.result.length} components`);
    return response.result;
  }

  async getComponentControls(componentName) {
    const response = await this.sendCommand({
      jsonrpc: '2.0',
      method: 'Component.GetControls',
      params: {
        Name: componentName,
      },
    });

    // Cache control information
    this.controls.set(componentName, response.result);
    return response.result;
  }

  async setComponentControl(componentName, controlName, value, rampTime = 0) {
    const params = {
      Name: componentName,
      Controls: [
        {
          Name: controlName,
          Value: value,
        },
      ],
    };

    if (rampTime > 0) {
      params.Controls[0].Ramp = rampTime;
    }

    return this.sendCommand({
      jsonrpc: '2.0',
      method: 'Component.Set',
      params: params,
    });
  }

  sendCommand(command) {
    command.id = Date.now();
    return new Promise((resolve, reject) => {
      // Implementation specific to your socket handling
      this.socket.write(JSON.stringify(command) + '\0');
      // Handle response...
    });
  }
}
```

### Audio Processing Module Control

```javascript
class APMController {
  constructor(componentManager, apmName) {
    this.manager = componentManager;
    this.name = apmName;
  }

  // Entertainment input controls
  async setEntertainmentGain(gainValue, rampTime = 1.0) {
    return this.manager.setComponentControl(this.name, 'ent.xfade.gain', gainValue, rampTime);
  }

  async setEntertainmentMute(muted) {
    return this.manager.setComponentControl(this.name, 'ent.input.mute', muted);
  }

  // Background music controls
  async setBackgroundGain(gainValue, rampTime = 1.0) {
    return this.manager.setComponentControl(this.name, 'bgm.xfade.gain', gainValue, rampTime);
  }

  async setBackgroundMute(muted) {
    return this.manager.setComponentControl(this.name, 'bgm.input.mute', muted);
  }

  // Get all APM status
  async getStatus() {
    const response = await this.manager.sendCommand({
      jsonrpc: '2.0',
      method: 'Component.Get',
      params: {
        Name: this.name,
        Controls: [
          { Name: 'ent.xfade.gain' },
          { Name: 'ent.input.mute' },
          { Name: 'bgm.xfade.gain' },
          { Name: 'bgm.input.mute' },
          { Name: 'output.gain' },
        ],
      },
    });

    return response.result.Controls;
  }

  // Crossfade between entertainment and background
  async crossfade(entLevel, bgmLevel, rampTime = 3.0) {
    return this.manager.sendCommand({
      jsonrpc: '2.0',
      method: 'Component.Set',
      params: {
        Name: this.name,
        Controls: [
          {
            Name: 'ent.xfade.gain',
            Value: entLevel,
            Ramp: rampTime,
          },
          {
            Name: 'bgm.xfade.gain',
            Value: bgmLevel,
            Ramp: rampTime,
          },
        ],
      },
    });
  }
}

// Usage example
const apm = new APMController(componentManager, 'Main APM');

// Fade entertainment to background
await apm.crossfade(-100.0, 0.0, 5.0); // 5-second crossfade

// Check current status
const status = await apm.getStatus();
console.log('APM Status:', status);
```

### Matrix Mixer Control

```javascript
class MatrixMixerController {
  constructor(componentManager, mixerName) {
    this.manager = componentManager;
    this.name = mixerName;
  }

  async setInputGain(inputNumber, gainValue, rampTime = 0) {
    return this.manager.setComponentControl(
      this.name,
      `input.${inputNumber}.gain`,
      gainValue,
      rampTime
    );
  }

  async setInputMute(inputNumber, muted) {
    return this.manager.setComponentControl(this.name, `input.${inputNumber}.mute`, muted);
  }

  async setOutputGain(outputNumber, gainValue, rampTime = 0) {
    return this.manager.setComponentControl(
      this.name,
      `output.${outputNumber}.gain`,
      gainValue,
      rampTime
    );
  }

  async setCrosspointGain(input, output, gainValue, rampTime = 0) {
    return this.manager.setComponentControl(
      this.name,
      `xp.${input}.${output}.gain`,
      gainValue,
      rampTime
    );
  }

  async muteAllInputs() {
    // Get number of inputs first
    const controls = await this.manager.getComponentControls(this.name);
    const inputControls = controls.filter(
      control => control.Name.startsWith('input.') && control.Name.endsWith('.mute')
    );

    const muteCommands = inputControls.map(control => ({
      Name: control.Name,
      Value: true,
    }));

    return this.manager.sendCommand({
      jsonrpc: '2.0',
      method: 'Component.Set',
      params: {
        Name: this.name,
        Controls: muteCommands,
      },
    });
  }
}
```

### Real-Time Component Monitoring

```javascript
class ComponentMonitor {
  constructor(componentManager) {
    this.manager = componentManager;
    this.monitoredComponents = new Map();
    this.pollingInterval = null;
  }

  addComponent(componentName, controlsToMonitor) {
    this.monitoredComponents.set(componentName, controlsToMonitor);
  }

  start(intervalMs = 5000) {
    this.pollingInterval = setInterval(() => {
      this.pollAllComponents();
    }, intervalMs);
  }

  stop() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  async pollAllComponents() {
    for (const [componentName, controls] of this.monitoredComponents) {
      try {
        const response = await this.manager.sendCommand({
          jsonrpc: '2.0',
          method: 'Component.Get',
          params: {
            Name: componentName,
            Controls: controls.map(name => ({ Name: name })),
          },
        });

        // Emit events for value changes
        this.emit('componentUpdate', {
          component: componentName,
          controls: response.result.Controls,
        });
      } catch (error) {
        console.error(`Error polling component ${componentName}:`, error);
      }
    }
  }
}

// Usage
const monitor = new ComponentMonitor(componentManager);
monitor.addComponent('Main APM', ['ent.xfade.gain', 'bgm.xfade.gain']);
monitor.addComponent('Matrix Mixer', ['input.1.gain', 'output.1.gain']);
monitor.start(2000); // Poll every 2 seconds
```

---

## 🔗 Common Component Types

### Audio Processing Module (APM)

- **Controls**: Input gains, crossfade, muting, output levels
- **Use Cases**: Zone mixing, background music management
- **Key Controls**: `ent.xfade.gain`, `bgm.xfade.gain`, `*.input.mute`

### Matrix Mixer

- **Controls**: Input/output gains, crosspoint routing, muting
- **Use Cases**: Large-scale audio routing, mixing consoles
- **Key Controls**: `input.*.gain`, `output.*.gain`, `xp.*.*.gain`

### Gain/EQ Components

- **Controls**: Gain, frequency bands, bypass
- **Use Cases**: Audio processing, room tuning
- **Key Controls**: `gain`, `bypass`, `eq.*.freq`

### Router Components

- **Controls**: Input selection, routing matrix
- **Use Cases**: Source selection, signal routing
- **Key Controls**: `input`, `output.*.input`

---

## 🚦 Next Steps

Ready for advanced control techniques?

1. **🔄 [Advanced Control](qrc-advanced-control.md)** - Change groups, mixers, and snapshots
2. **📢 [PA Remote API](qrc-parapi.md)** - PA system integration
3. **❌ [Errors & Best Practices](qrc-errors-best-practices.md)** - Troubleshooting guide

---

## 🔗 Related Documentation

- **[QRC Overview](qrc-overview.md)** - Protocol basics and connection setup
- **[QRC Core Control](qrc-core-control.md)** - Basic control operations
- **[Q-SYS Protocols Guide](protocols.md)** - QDP vs QRC protocol differences

---

_Continue with [Advanced Control Methods →](qrc-advanced-control.md) to learn about change groups,
mixer control, and snapshot management._
