# Master Test Prompts 2 - Non-Audio Components Testing Guide
## Focus: Video, Control, Status, Routing, and System Components

This document focuses on testing Q-SYS components that are NOT primarily audio-focused, addressing the testing gap identified in video, control systems, status monitoring, routing matrices, and other system-level components.

## WORKFLOW INSTRUCTIONS
Each test below is formatted as a complete prompt that can be copied to an MCP agent. The agent should:
1. Execute the test steps
2. Report results, errors, and any issues found
3. Provide detailed feedback that can be used for fixes

Copy the entire prompt block (including expected output format) for each test.

---

## SECTION 1: VIDEO & DISPLAY COMPONENTS

### Test 1.1: Video Input/Output Discovery

**COPY THIS ENTIRE PROMPT TO AGENT:**
```
TEST: Video Component Discovery

Please execute the following test and report results:

1. Use list_components to discover all components
2. Search for components with names/types containing:
   - "video", "hdmi", "display", "camera", "PTZ"
   - "screen", "projector", "monitor", "input", "output"
3. For each video-related component found:
   - Use list_controls to get available controls
   - Note control types (routing, status, configuration)
4. Use qsys_component_get for detailed info on 3 video components
5. Document any video-specific control patterns

EXPECTED OUTPUT FORMAT:
- Video Components Found:
  * Component 1: [name] (type: [type])
    - Controls: [list key controls]
  * Component 2: [name] (type: [type])
    - Controls: [list key controls]
- Video Control Types:
  * Input selection: [controls found]
  * Output routing: [controls found]
  * Status monitoring: [controls found]
  * Configuration: [controls found]
- Video-Specific Patterns:
  * Control naming: [patterns observed]
  * Value types: [integer/string/boolean patterns]
- Tool Errors: [any errors]
- Overall Result: [PASS/FAIL with reason]

Note: Skip if no video components found in system.
```

### Test 1.2: Camera Control Testing

**COPY THIS ENTIRE PROMPT TO AGENT:**
```
TEST: PTZ Camera Control

Please execute the following test and report results:

1. Use list_components to find camera/PTZ components
2. Search for components with "camera", "PTZ", "cam" in name
3. If PTZ camera found, use list_controls to find:
   - Pan/Tilt/Zoom controls
   - Preset recall/save controls
   - Power/standby controls
   - Focus/iris controls if available
4. Test PTZ operations (if available):
   - Get current pan/tilt/zoom positions
   - Move to different positions
   - Save current position as preset
   - Recall saved preset
5. Monitor camera status controls

EXPECTED OUTPUT FORMAT:
- Camera Components: [list found or "none"]
- PTZ Controls Found:
  * Pan: [control name and range]
  * Tilt: [control name and range]
  * Zoom: [control name and range]
  * Presets: [list preset controls]
- PTZ Operations:
  * Initial Position: Pan=[X] Tilt=[Y] Zoom=[Z]
  * Movement Test: [success/fail]
  * Preset Save: [success/fail]
  * Preset Recall: [success/fail]
- Camera Status:
  * Power State: [on/standby/unknown]
  * Connection Status: [connected/disconnected]
- Tool Errors: [any errors]
- Overall Result: [PASS/FAIL or "No cameras found"]

Note: Adapt test based on actual camera capabilities found.
```

### Test 1.3: Video Matrix Routing

**COPY THIS ENTIRE PROMPT TO AGENT:**
```
TEST: Video Matrix/Router Control

Please execute the following test and report results:

1. Use list_components to find video routing components
2. Look for "matrix", "router", "switcher", "crosspoint"
3. If video router found:
   - Use list_controls to get routing controls
   - Identify input/output structure
   - Get current routing configuration
4. Test routing changes:
   - Route input 1 to output 1
   - Route input 2 to output 2
   - Create a cross-route (input 1 to output 2)
   - Verify routes took effect
5. Test routing presets if available

EXPECTED OUTPUT FORMAT:
- Video Routing Components: [list or "none found"]
- Matrix Configuration:
  * Input Count: [number]
  * Output Count: [number]
  * Control Format: [crosspoint/individual/other]
- Current Routes:
  * Output 1: Input [X]
  * Output 2: Input [Y]
  * [additional outputs...]
- Routing Tests:
  * Direct Route 1->1: [success/fail]
  * Direct Route 2->2: [success/fail]
  * Cross Route 1->2: [success/fail]
  * Verification: [routes confirmed/not confirmed]
- Routing Presets: [available/not available]
- Tool Errors: [any errors]
- Overall Result: [PASS/FAIL or "No routing components"]

Note: Video routing may use different control formats than audio.
```

---

## SECTION 2: CONTROL SYSTEM COMPONENTS

### Test 2.1: Custom Control Components

**COPY THIS ENTIRE PROMPT TO AGENT:**
```
TEST: Custom Control Components

Please execute the following test and report results:

1. Use list_components to find custom control components
2. Look for components with "custom", "control", "UCI", "user"
3. For each custom control component:
   - Use list_controls to enumerate all controls
   - Identify control types (button, fader, text, LED)
   - Get current control states
4. Test different control types:
   - Trigger button controls
   - Adjust fader/knob controls
   - Set text/string controls
   - Monitor LED/indicator controls
5. Test control interactions and dependencies

EXPECTED OUTPUT FORMAT:
- Custom Control Components: [list found]
- Control Types Found:
  * Buttons: [count and examples]
  * Faders: [count and examples]
  * Text Fields: [count and examples]
  * Indicators: [count and examples]
  * Other: [describe]
- Control Tests:
  * Button Trigger: [control name] = [result]
  * Fader Adjust: [control name] from [X] to [Y]
  * Text Set: [control name] = "[text value]"
  * Indicator Read: [control name] = [state]
- Control Interactions:
  * Dependencies Found: [yes/no - describe]
  * Side Effects: [any observed]
- Tool Errors: [any errors]
- Overall Result: [PASS/FAIL with details]

Document any custom control patterns unique to this system.
```

### Test 2.2: Scripting Engine Controls

**COPY THIS ENTIRE PROMPT TO AGENT:**
```
TEST: Script Controller Components

Please execute the following test and report results:

1. Use list_components to find script/code components
2. Look for "script", "lua", "control script", "code"
3. If script components found:
   - Use list_controls to find script controls
   - Identify script inputs/outputs
   - Check script status indicators
4. Test script interactions:
   - Modify script input values
   - Monitor script output changes
   - Check script running status
   - Test script enable/disable if available
5. Document script control patterns

EXPECTED OUTPUT FORMAT:
- Script Components: [list or "none found"]
- Script Controls:
  * Inputs: [list with types]
  * Outputs: [list with types]
  * Status: [list status controls]
  * Enable/Disable: [available/not available]
- Script Tests:
  * Input Modification: [input name] = [value] -> Output: [result]
  * Script Status: [running/stopped/error]
  * Enable/Disable Test: [if available, result]
- Script Patterns:
  * Input Format: [describe format]
  * Output Format: [describe format]
  * Update Behavior: [immediate/polled/triggered]
- Tool Errors: [any errors]
- Overall Result: [PASS/FAIL or "No scripts found"]

Note: Scripts may have complex input/output relationships.
```

### Test 2.3: Snapshot & Preset Controllers

**COPY THIS ENTIRE PROMPT TO AGENT:**
```
TEST: Snapshot and Preset Management

Please execute the following test and report results:

1. Use list_components to find snapshot/preset components
2. Look for "snapshot", "preset", "scene", "memory"
3. If snapshot components found:
   - Use list_controls to find snapshot controls
   - Identify available snapshot slots
   - Check current active snapshot
4. Test snapshot operations:
   - Save current state to snapshot
   - Load different snapshot
   - Verify state changed
   - Test snapshot preview if available
   - Check transition time controls
5. Test global vs partial snapshots

EXPECTED OUTPUT FORMAT:
- Snapshot Components: [list or "none found"]
- Snapshot Configuration:
  * Available Slots: [number or list]
  * Active Snapshot: [current selection]
  * Transition Controls: [timing/speed controls if available]
- Snapshot Operations:
  * Save Test: Slot [X] = [success/fail]
  * Load Test: Slot [Y] = [success/fail]
  * State Verification: [changed/unchanged]
  * Preview Available: [yes/no]
- Snapshot Scope:
  * Global Snapshots: [available/not available]
  * Partial Snapshots: [available/not available]
  * Component-Specific: [yes/no]
- Tool Errors: [any errors]
- Overall Result: [PASS/FAIL or "No snapshots found"]

Document snapshot behavior and transition capabilities.
```

---

## SECTION 3: STATUS MONITORING COMPONENTS

### Test 3.1: System Status Monitors

**COPY THIS ENTIRE PROMPT TO AGENT:**
```
TEST: System Status Monitoring Components

Please execute the following test and report results:

1. Use query_core_status to get baseline system status
2. Use list_components to find status monitoring components
3. Look for "status", "monitor", "health", "diagnostic"
4. For each status component found:
   - Use list_controls to get status indicators
   - Read all status values
   - Identify status types (OK, warning, error)
5. Monitor status changes:
   - Create change group for status controls
   - Poll for 30 seconds
   - Document any status changes
6. Test status history if available

EXPECTED OUTPUT FORMAT:
- System Status (query_core_status):
  * Core Status: [OK/Warning/Error]
  * Network Status: [details]
  * CPU/Memory: [if available]
- Status Components Found: [list]
- Status Indicators:
  * Component 1: [name]
    - Status Controls: [list with current values]
  * Component 2: [name]
    - Status Controls: [list with current values]
- Status Types:
  * OK/Normal: [count]
  * Warning: [count and details]
  * Error: [count and details]
- Status Monitoring:
  * Change Group Created: [yes/no]
  * Changes Detected: [list any changes]
  * Update Frequency: [observed rate]
- Tool Errors: [any errors]
- Overall Result: [PASS/FAIL with details]

Pay special attention to any warnings or errors.
```

### Test 3.2: Network & Device Status

**COPY THIS ENTIRE PROMPT TO AGENT:**
```
TEST: Network Device Status Monitoring

Please execute the following test and report results:

1. Use list_components to find network device monitors
2. Look for "network", "device", "peripheral", "amplifier"
3. For network-connected devices:
   - Get connection status
   - Check device health
   - Monitor communication statistics
4. Test device status indicators:
   - Power status
   - Temperature monitoring
   - Fault indicators
   - Network latency/quality
5. Create comprehensive device status report

EXPECTED OUTPUT FORMAT:
- Network Devices Found: [list]
- Device Status Summary:
  * Device 1: [name/type]
    - Connection: [online/offline]
    - Power: [on/standby/off]
    - Temperature: [if available]
    - Faults: [none/list faults]
  * Device 2: [name/type]
    - [repeat status format]
- Communication Statistics:
  * Latency: [if available]
  * Packet Loss: [if available]
  * Signal Quality: [if available]
- Critical Findings:
  * Offline Devices: [list or "none"]
  * Devices with Faults: [list or "none"]
  * Temperature Warnings: [list or "none"]
- Monitoring Capability:
  * Real-time Updates: [yes/no]
  * Historical Data: [available/not available]
- Tool Errors: [any errors]
- Overall Result: [PASS/FAIL with health summary]

Focus on identifying any devices needing attention.
```

### Test 3.3: Performance Metrics

**COPY THIS ENTIRE PROMPT TO AGENT:**
```
TEST: System Performance Metrics

Please execute the following test and report results:

1. Use list_components to find performance monitoring
2. Look for "meter", "level", "cpu", "memory", "latency"
3. For performance components:
   - Get current metric values
   - Identify metric ranges and units
   - Check for threshold indicators
4. Monitor performance over time:
   - Create change group for metrics
   - Poll for 60 seconds at high rate
   - Track min/max/average values
5. Test threshold alerts if available

EXPECTED OUTPUT FORMAT:
- Performance Components: [list or "none found"]
- Current Metrics:
  * CPU Usage: [value if available]
  * Memory Usage: [value if available]
  * Audio Latency: [value if available]
  * Network Latency: [value if available]
  * Processing Load: [value if available]
- Metric Monitoring (60 seconds):
  * Metric: [name]
    - Min: [value]
    - Max: [value]
    - Average: [value]
    - Variation: [stable/fluctuating]
- Threshold Indicators:
  * Warning Thresholds: [list if found]
  * Critical Thresholds: [list if found]
  * Current Violations: [any thresholds exceeded]
- Performance Assessment:
  * System Load: [low/medium/high]
  * Stability: [stable/unstable]
  * Bottlenecks: [identify any]
- Tool Errors: [any errors]
- Overall Result: [PASS/FAIL with performance summary]

Identify any performance concerns or limitations.
```

---

## SECTION 4: ROUTING & MATRIX COMPONENTS

### Test 4.1: Audio/Video Matrix Control

**COPY THIS ENTIRE PROMPT TO AGENT:**
```
TEST: Complex Matrix Router Control

Please execute the following test and report results:

1. Use list_components to find all matrix/router components
2. Identify matrix types (audio, video, control, composite)
3. For each matrix found:
   - Get matrix dimensions (inputs x outputs)
   - Identify control method (crosspoint, source select, etc.)
   - Get current routing state
4. Test complex routing scenarios:
   - One-to-many routing (1 input to multiple outputs)
   - Many-to-one mixing (if supported)
   - Route swapping (A->B becomes B->A)
   - Mute/unmute routes
5. Test routing groups and zones if available

EXPECTED OUTPUT FORMAT:
- Matrix Components Found:
  * Matrix 1: [name] ([X] inputs x [Y] outputs)
    - Type: [audio/video/control]
    - Control Method: [crosspoint/other]
  * Matrix 2: [name] ([X] inputs x [Y] outputs)
    - Type: [audio/video/control]
- Current Routing State:
  * Output 1: Input [X] [muted/active]
  * Output 2: Input [Y] [muted/active]
  * [additional routes...]
- Routing Tests:
  * One-to-Many: Input 1 -> Outputs [1,2,3] = [success/fail]
  * Route Swap: [A->B, B->A] = [success/fail]
  * Route Muting: Output [X] = [muted/unmuted]
- Advanced Features:
  * Routing Groups: [available/not available]
  * Zones: [available/not available]
  * Salvos/Macros: [available/not available]
- Tool Errors: [any errors]
- Overall Result: [PASS/FAIL with details]

Document any matrix-specific control patterns.
```

### Test 4.2: Source Selection Systems

**COPY THIS ENTIRE PROMPT TO AGENT:**
```
TEST: Source Selection and Management

Please execute the following test and report results:

1. Use list_components to find source selectors
2. Look for "source", "input select", "selector"
3. For source selection components:
   - Identify available sources
   - Get current source selections
   - Check source availability/status
4. Test source switching:
   - Switch between available sources
   - Verify switching time
   - Check for glitches or delays
   - Test priority/override features
5. Monitor source status indicators

EXPECTED OUTPUT FORMAT:
- Source Selector Components: [list]
- Available Sources:
  * Selector 1: [name]
    - Sources: [list with names/numbers]
    - Current Selection: [source]
    - Status: [all available/some offline]
  * Selector 2: [name]
    - [repeat format]
- Source Switching Tests:
  * Switch from [A] to [B]: Time=[Xms] Success=[yes/no]
  * Switch from [B] to [C]: Time=[Xms] Success=[yes/no]
  * Glitches/Delays: [none/describe]
- Source Features:
  * Auto-switching: [available/not available]
  * Priority Selection: [available/not available]
  * Source Detection: [automatic/manual]
- Source Status:
  * Active Sources: [list]
  * Inactive Sources: [list]
  * Error Sources: [list if any]
- Tool Errors: [any errors]
- Overall Result: [PASS/FAIL with details]

Note switching behavior and timing.
```

### Test 4.3: Room Combining Systems

**COPY THIS ENTIRE PROMPT TO AGENT:**
```
TEST: Room Combining and Partition Control

Please execute the following test and report results:

1. Use list_components to find room combining systems
2. Look for "room", "combine", "partition", "wall"
3. If room combining found:
   - Identify combinable rooms
   - Get current combine state
   - Check partition wall status
4. Test room combining operations:
   - Combine two adjacent rooms
   - Verify audio/video routing changes
   - Test combined room controls
   - Separate rooms again
   - Verify isolation restored
5. Test combine presets and schedules

EXPECTED OUTPUT FORMAT:
- Room Combine Components: [list or "none found"]
- Room Configuration:
  * Total Rooms: [number]
  * Combinable Pairs: [list pairs]
  * Current State: [all separate/some combined]
- Partition Status:
  * Wall 1-2: [open/closed]
  * Wall 2-3: [open/closed]
  * [additional walls...]
- Combine Operations:
  * Combine Rooms 1+2: [success/fail]
  * Routing Verified: [correct/incorrect]
  * Combined Controls: [working/not working]
  * Separate Rooms: [success/fail]
  * Isolation Verified: [yes/no]
- Advanced Features:
  * Combine Presets: [list if available]
  * Scheduled Combines: [available/not available]
  * Auto-combine: [available/not available]
- Tool Errors: [any errors]
- Overall Result: [PASS/FAIL or "No room combining"]

Document room combining behavior and dependencies.
```

---

## SECTION 5: CONTROL INTERFACES & UI

### Test 5.1: User Control Interfaces (UCI)

**COPY THIS ENTIRE PROMPT TO AGENT:**
```
TEST: User Control Interface Components

Please execute the following test and report results:

1. Use list_components to find UCI components
2. Look for "UCI", "interface", "panel", "touchscreen"
3. For each UCI found:
   - Get available pages/layers
   - Identify control elements
   - Check visibility states
4. Test UCI controls:
   - Navigate between pages
   - Operate various control types
   - Test feedback indicators
   - Verify control limits
5. Test UCI logic and scripting

EXPECTED OUTPUT FORMAT:
- UCI Components Found: [list]
- UCI Structure:
  * UCI 1: [name]
    - Pages: [list or count]
    - Active Page: [current]
    - Control Count: [number]
  * UCI 2: [name]
    - [repeat format]
- Control Elements:
  * Buttons: [count and examples]
  * Faders: [count and examples]
  * Meters: [count and examples]
  * Text: [count and examples]
  * Graphics: [if any]
- UCI Operations:
  * Page Navigation: [working/not working]
  * Control Response: [responsive/delayed]
  * Feedback Updates: [real-time/delayed]
  * Control Limits: [enforced/not enforced]
- UCI Logic:
  * Conditional Visibility: [found/not found]
  * Control Interlocks: [found/not found]
  * Scripted Behaviors: [found/not found]
- Tool Errors: [any errors]
- Overall Result: [PASS/FAIL with details]

Note any UCI-specific control behaviors.
```

### Test 5.2: Control Pins and External Interfaces

**COPY THIS ENTIRE PROMPT TO AGENT:**
```
TEST: External Control Pins and Interfaces

Please execute the following test and report results:

1. Use list_components to find control pin components
2. Look for "control pin", "GPIO", "external", "relay"
3. For control pin components:
   - Identify pin types (input/output)
   - Get current pin states
   - Check pin configurations
4. Test control pin operations:
   - Toggle output pins
   - Monitor input pin changes
   - Test pin logic (if configurable)
   - Verify pin responses
5. Test integration with other controls

EXPECTED OUTPUT FORMAT:
- Control Pin Components: [list or "none found"]
- Pin Configuration:
  * Total Pins: [number]
  * Input Pins: [count and list]
  * Output Pins: [count and list]
  * Configurable: [yes/no]
- Current Pin States:
  * Input 1: [high/low/floating]
  * Output 1: [high/low]
  * [additional pins...]
- Pin Operations:
  * Output Toggle Test: Pin [X] = [success/fail]
  * Input Monitor: Pin [Y] = [detected changes/stable]
  * Logic Test: [if applicable, results]
- Pin Integration:
  * Triggers Found: [list any pin->control mappings]
  * Actions Found: [list any control->pin mappings]
  * Delays/Debounce: [configured/not configured]
- Tool Errors: [any errors]
- Overall Result: [PASS/FAIL or "No control pins"]

Document external control integration patterns.
```

### Test 5.3: Named Controls and Virtual Components

**COPY THIS ENTIRE PROMPT TO AGENT:**
```
TEST: Named Controls and Virtual Components

Please execute the following test and report results:

1. Use list_components to identify all components
2. Look for patterns suggesting virtual/named controls
3. Test difference between named and component controls:
   - Use Control.Get for potential named controls
   - Use Component.Get for component controls
   - Compare response formats
4. Test named control operations:
   - Get named control values
   - Set named control values
   - Monitor named control changes
5. Map relationships between named and component controls

EXPECTED OUTPUT FORMAT:
- Control Types Found:
  * Component Controls: [count]
  * Suspected Named Controls: [count]
  * Virtual Components: [if any]
- Named Control Tests:
  * Control.Get Response: [works/fails]
  * Example Named Control: [name] = [value]
  * Setting Named Control: [success/fail]
- Component vs Named:
  * Response Format Difference: [describe]
  * Performance Difference: [if any]
  * Feature Difference: [if any]
- Control Relationships:
  * Named->Component Mappings: [list if found]
  * Aliasing Found: [yes/no]
  * Virtual Controls: [list if found]
- Best Practices:
  * When to Use Named: [recommendation]
  * When to Use Component: [recommendation]
- Tool Errors: [any errors]
- Overall Result: [PASS/FAIL with insights]

Identify the control architecture pattern used.
```

---

## SECTION 6: SYSTEM INTEGRATION COMPONENTS

### Test 6.1: Third-Party Device Integration

**COPY THIS ENTIRE PROMPT TO AGENT:**
```
TEST: Third-Party Device Control Components

Please execute the following test and report results:

1. Use list_components to find third-party integrations
2. Look for brand names, protocols (TCP, serial, etc.)
3. For each third-party component:
   - Identify device type and manufacturer
   - Get available controls
   - Check connection status
4. Test device control:
   - Send commands to devices
   - Monitor device feedback
   - Test error handling
   - Verify timeout behavior
5. Document integration patterns

EXPECTED OUTPUT FORMAT:
- Third-Party Components: [list or "none found"]
- Device Details:
  * Device 1: [name/type]
    - Manufacturer: [if identifiable]
    - Protocol: [TCP/Serial/other]
    - Status: [connected/disconnected]
    - Controls: [list main controls]
  * Device 2: [repeat format]
- Control Tests:
  * Command Send: [device] = [success/fail]
  * Feedback Received: [yes/no]
  * Response Time: [fast/slow/timeout]
  * Error Handling: [graceful/errors]
- Integration Patterns:
  * Command Format: [describe]
  * Feedback Format: [describe]
  * Polling vs Event: [which is used]
- Reliability:
  * Connection Stability: [stable/unstable]
  * Recovery from Disconnect: [automatic/manual]
- Tool Errors: [any errors]
- Overall Result: [PASS/FAIL with details]

Note any device-specific quirks or requirements.
```

### Test 6.2: Clock and Scheduling Components

**COPY THIS ENTIRE PROMPT TO AGENT:**
```
TEST: Clock, Timer, and Scheduling Systems

Please execute the following test and report results:

1. Use list_components to find timing components
2. Look for "clock", "timer", "schedule", "calendar"
3. For timing components found:
   - Get current time/date
   - Check active schedules
   - Identify timer controls
4. Test timing operations:
   - Start/stop timers
   - Check schedule triggers
   - Test manual override
   - Verify time sync
5. Monitor scheduled events

EXPECTED OUTPUT FORMAT:
- Timing Components: [list or "none found"]
- System Time:
  * Current Time: [if available]
  * Time Zone: [if available]
  * NTP Sync: [yes/no/unknown]
- Schedulers Found:
  * Scheduler 1: [name]
    - Active Schedules: [count]
    - Next Event: [time if available]
  * Scheduler 2: [repeat format]
- Timer Tests:
  * Timer Start: [success/fail]
  * Timer Stop: [success/fail]
  * Elapsed Time: [accurate/inaccurate]
- Schedule Tests:
  * Manual Trigger: [success/fail]
  * Override Test: [success/fail]
  * Schedule Enable/Disable: [success/fail]
- Event Monitoring:
  * Scheduled Events Detected: [yes/no]
  * Event Accuracy: [on-time/delayed]
- Tool Errors: [any errors]
- Overall Result: [PASS/FAIL or "No timing components"]

Document scheduling capabilities and limitations.
```

### Test 6.3: Logic and Processing Components

**COPY THIS ENTIRE PROMPT TO AGENT:**
```
TEST: Logic Controllers and Processors

Please execute the following test and report results:

1. Use list_components to find logic components
2. Look for "logic", "gate", "flip-flop", "processor"
3. For logic components:
   - Identify logic types (AND, OR, NOT, etc.)
   - Get input/output states
   - Check logic configuration
4. Test logic operations:
   - Change inputs and verify outputs
   - Test edge triggers if available
   - Verify timing/delays
   - Test complex logic chains
5. Document logic patterns

EXPECTED OUTPUT FORMAT:
- Logic Components: [list or "none found"]
- Logic Types Found:
  * Boolean Gates: [AND/OR/NOT/XOR found]
  * Flip-Flops: [SR/D/T/JK found]
  * Comparators: [found/not found]
  * Custom Logic: [describe if found]
- Logic States:
  * Component: [name] Type: [type]
    - Inputs: [states]
    - Output: [state]
    - Truth Table Verified: [yes/no]
- Logic Tests:
  * Simple Gate Test: [pass/fail]
  * Edge Trigger Test: [if applicable]
  * Propagation Delay: [measured if possible]
  * Chain Test: [pass/fail]
- Advanced Features:
  * Configurable Logic: [yes/no]
  * Timing Controls: [yes/no]
  * State Memory: [yes/no]
- Tool Errors: [any errors]
- Overall Result: [PASS/FAIL or "No logic components"]

Map any complex logic relationships found.
```

---

## SECTION 7: COMMUNICATION & PROTOCOL COMPONENTS

### Test 7.1: Serial Communication Components

**COPY THIS ENTIRE PROMPT TO AGENT:**
```
TEST: Serial/RS232/RS485 Communication

Please execute the following test and report results:

1. Use list_components to find serial components
2. Look for "serial", "RS232", "RS485", "COM", "UART"
3. For serial components:
   - Get port configuration (baud, bits, parity)
   - Check connection status
   - Monitor data flow
4. Test serial operations:
   - Send test strings
   - Monitor received data
   - Test control characters
   - Verify data integrity
5. Document serial patterns

EXPECTED OUTPUT FORMAT:
- Serial Components: [list or "none found"]
- Port Configuration:
  * Port 1: [name]
    - Baud Rate: [speed]
    - Data Bits: [7/8]
    - Parity: [none/even/odd]
    - Stop Bits: [1/2]
    - Flow Control: [none/hardware/software]
- Connection Status:
  * Connected Devices: [list]
  * Port Activity: [active/idle]
- Serial Tests:
  * Send Test: "[string]" = [success/fail]
  * Receive Test: Data = "[received]"
  * Control Chars: [working/not working]
  * Data Integrity: [good/errors]
- Communication Patterns:
  * Protocol Format: [ASCII/binary/hex]
  * Termination: [CR/LF/CRLF/other]
  * Response Time: [immediate/delayed]
- Tool Errors: [any errors]
- Overall Result: [PASS/FAIL or "No serial components"]

Note any protocol-specific requirements.
```

### Test 7.2: Network Communication Components

**COPY THIS ENTIRE PROMPT TO AGENT:**
```
TEST: TCP/IP Network Communication

Please execute the following test and report results:

1. Use list_components to find network components
2. Look for "TCP", "UDP", "IP", "ethernet", "network"
3. For network components:
   - Get connection parameters
   - Check link status
   - Monitor traffic statistics
4. Test network operations:
   - Send network commands
   - Monitor responses
   - Test connection recovery
   - Check timeout handling
5. Document network patterns

EXPECTED OUTPUT FORMAT:
- Network Components: [list or "none found"]
- Network Configuration:
  * Component 1: [name]
    - Protocol: [TCP/UDP]
    - IP Address: [if shown]
    - Port: [if shown]
    - Connection State: [connected/listening/disconnected]
- Network Statistics:
  * Packets Sent: [if available]
  * Packets Received: [if available]
  * Errors: [if available]
  * Latency: [if measurable]
- Network Tests:
  * Send Command: [success/fail]
  * Response Received: [yes/no]
  * Recovery Test: [auto-recovers/manual]
  * Timeout Behavior: [describe]
- Communication Patterns:
  * Protocol Type: [text/binary]
  * Message Format: [describe]
  * Keep-Alive: [yes/no]
- Tool Errors: [any errors]
- Overall Result: [PASS/FAIL or "No network components"]

Document network communication requirements.
```

### Test 7.3: Protocol Translation Components

**COPY THIS ENTIRE PROMPT TO AGENT:**
```
TEST: Protocol Converters and Translators

Please execute the following test and report results:

1. Use list_components to find protocol converters
2. Look for "converter", "translator", "bridge", "gateway"
3. For converter components:
   - Identify input/output protocols
   - Get translation mappings
   - Check active conversions
4. Test protocol conversion:
   - Send data to input side
   - Verify output side translation
   - Test bidirectional if applicable
   - Check error handling
5. Document conversion rules

EXPECTED OUTPUT FORMAT:
- Protocol Converters: [list or "none found"]
- Converter Configuration:
  * Converter 1: [name]
    - Input Protocol: [type]
    - Output Protocol: [type]
    - Direction: [unidirectional/bidirectional]
    - Active: [yes/no]
- Translation Mappings:
  * Input Range: [describe]
  * Output Range: [describe]
  * Scaling: [linear/custom]
  * Special Rules: [list if any]
- Conversion Tests:
  * Input->Output Test: [value]->[result] = [correct/incorrect]
  * Reverse Test: [if applicable]
  * Boundary Test: [pass/fail]
  * Error Input Test: [handled/not handled]
- Performance:
  * Conversion Delay: [if measurable]
  * Throughput: [if measurable]
- Tool Errors: [any errors]
- Overall Result: [PASS/FAIL or "No converters found"]

Map protocol conversion relationships.
```

---

## SECTION 8: SPECIALTY SYSTEM COMPONENTS

### Test 8.1: Emergency and Life Safety

**COPY THIS ENTIRE PROMPT TO AGENT:**
```
TEST: Emergency and Life Safety Systems

SAFETY NOTE: Only test if authorized. Do not trigger actual emergencies.

Please execute the following test and report results:

1. Use list_components to find emergency components
2. Look for "emergency", "fire", "evacuation", "alert", "alarm"
3. For emergency components (TEST MODE ONLY):
   - Check system armed/test status
   - Get zone statuses
   - Identify override controls
4. Test IN TEST MODE ONLY:
   - Check emergency mute capabilities
   - Verify message selection
   - Test zone isolation
   - Check system priorities
5. Document safety system integration

EXPECTED OUTPUT FORMAT:
- Emergency Components: [list or "none found"]
- System Status:
  * Armed State: [armed/test/disabled]
  * Active Alarms: [none/list any]
  * Test Mode: [available/not available]
- Zone Configuration:
  * Total Zones: [number]
  * Active Zones: [list]
  * Isolated Zones: [list]
- Emergency Controls:
  * Mute Available: [yes/no]
  * Message Selection: [available messages]
  * Override Controls: [list]
- Priority Levels:
  * Emergency Priority: [highest/configurable]
  * Override Other Audio: [yes/no]
- SAFETY VERIFICATION:
  * Test Mode Confirmed: [YES/NO]
  * No Active Emergencies: [confirmed]
- Tool Errors: [any errors]
- Overall Result: [PASS/FAIL - TEST MODE ONLY]

CRITICAL: Only document capabilities. Do not activate emergency systems.
```

### Test 8.2: Environmental Monitoring

**COPY THIS ENTIRE PROMPT TO AGENT:**
```
TEST: Environmental Sensors and Monitoring

Please execute the following test and report results:

1. Use list_components to find environmental sensors
2. Look for "temperature", "humidity", "sensor", "environment"
3. For sensor components:
   - Read current sensor values
   - Check sensor ranges
   - Identify alarm thresholds
4. Monitor sensor data:
   - Track readings over time
   - Check for out-of-range values
   - Test sensor calibration if available
5. Document environmental conditions

EXPECTED OUTPUT FORMAT:
- Environmental Components: [list or "none found"]
- Sensor Readings:
  * Temperature Sensors:
    - Sensor 1: [location] = [value]°[C/F]
    - Sensor 2: [location] = [value]°[C/F]
  * Humidity Sensors:
    - Sensor 1: [location] = [value]%
  * Other Sensors:
    - [type]: [value]
- Sensor Configuration:
  * Ranges: [min-max for each type]
  * Alarm Thresholds: [list if set]
  * Calibration: [available/not available]
- Environmental Status:
  * Normal Range Count: [number]
  * Warning Count: [number]
  * Critical Count: [number]
- Trending (if monitored):
  * Stable Readings: [yes/no]
  * Rate of Change: [if significant]
- Tool Errors: [any errors]
- Overall Result: [PASS/FAIL with environmental summary]

Flag any environmental concerns detected.
```

### Test 8.3: Metering and Analytics

**COPY THIS ENTIRE PROMPT TO AGENT:**
```
TEST: Metering and Analytics Components

Please execute the following test and report results:

1. Use list_components to find metering/analytics
2. Look for "meter", "analytics", "statistics", "counter"
3. For metering components:
   - Identify meter types and purposes
   - Get current readings
   - Check meter ranges and units
4. Test meter operations:
   - Monitor real-time updates
   - Check peak/average tracking
   - Test meter reset if available
   - Verify accuracy where possible
5. Document measurement capabilities

EXPECTED OUTPUT FORMAT:
- Metering Components: [list or "none found"]
- Meter Types:
  * Level Meters: [count and purpose]
  * Frequency Meters: [count and purpose]
  * Power Meters: [count and purpose]
  * Usage Counters: [count and purpose]
  * Other: [describe]
- Current Readings:
  * Meter 1: [name] = [value] [units]
  * Meter 2: [name] = [value] [units]
  * [additional meters...]
- Meter Features:
  * Real-time Update Rate: [Hz/seconds]
  * Peak Hold: [available/not available]
  * Averaging: [available/not available]
  * History: [available/not available]
- Analytics Capabilities:
  * Trending: [available/not available]
  * Statistics: [min/max/avg if available]
  * Logging: [available/not available]
- Tool Errors: [any errors]
- Overall Result: [PASS/FAIL with details]

Note any unusual measurements or analytics features.
```

---

## SECTION 9: ADVANCED CONTROL SCENARIOS

### Test 9.1: Multi-Component Synchronized Control

**COPY THIS ENTIRE PROMPT TO AGENT:**
```
TEST: Synchronized Multi-Component Operations

Please execute the following test and report results:

1. Identify groups of related non-audio components:
   - Video routing + Control systems
   - Status monitors + Device control
   - Logic gates + Control pins
2. Create synchronized control scenario:
   - Set up change group with mixed component types
   - Coordinate video switch with control changes
   - Monitor status during transitions
3. Test synchronization:
   - Execute coordinated changes
   - Measure timing differences
   - Verify correct sequencing
   - Check for race conditions
4. Document coordination patterns

EXPECTED OUTPUT FORMAT:
- Component Groups Tested:
  * Group 1: [components involved]
  * Group 2: [components involved]
- Synchronization Test:
  * Actions Performed: [list in sequence]
  * Timing Alignment: [synchronized/offset]
  * Sequence Verified: [correct/incorrect]
  * Race Conditions: [none/found-describe]
- Coordination Results:
  * Video+Control: [coordinated/independent]
  * Status+Device: [coordinated/independent]
  * Logic+Pins: [coordinated/independent]
- Performance Impact:
  * Latency Added: [if measurable]
  * Reliability: [100%/degraded]
- Best Practices Found:
  * Recommended Sequence: [describe]
  * Timing Requirements: [describe]
- Tool Errors: [any errors]
- Overall Result: [PASS/FAIL with insights]

Document successful coordination strategies.
```

### Test 9.2: Fault Tolerance and Recovery

**COPY THIS ENTIRE PROMPT TO AGENT:**
```
TEST: Fault Recovery for Non-Audio Systems

Please execute the following test and report results:

1. Test video component failure recovery:
   - Simulate input loss (disconnect)
   - Check failover behavior
   - Verify status reporting
   - Test recovery on reconnection
2. Test control system resilience:
   - Send invalid control values
   - Test boundary conditions
   - Verify error handling
   - Check state persistence
3. Test system-wide recovery:
   - Document error propagation
   - Check cascade failures
   - Verify isolation between systems
4. Create fault recovery matrix

EXPECTED OUTPUT FORMAT:
- Video System Resilience:
  * Input Loss Handling: [switches/freezes/blank]
  * Failover Time: [if applicable]
  * Status Reporting: [accurate/delayed/none]
  * Recovery Behavior: [automatic/manual]
- Control System Resilience:
  * Invalid Input Handling: [rejected/clamped/error]
  * Boundary Behavior: [safe/unsafe]
  * Error Messages: [clear/cryptic/none]
  * State Persistence: [maintained/lost]
- System Isolation:
  * Video Errors Affect Audio: [yes/no]
  * Control Errors Affect Video: [yes/no]
  * Status Errors Affect Control: [yes/no]
- Recovery Matrix:
  * Component Type | Failure Mode | Recovery Method | Time
  * Video Input | Signal Loss | [method] | [time]
  * Control | Invalid Value | [method] | [time]
  * [additional entries...]
- Tool Errors: [any errors]
- Overall Result: [PASS/FAIL with recommendations]

Identify critical failure points and recovery gaps.
```

### Test 9.3: Performance Under Load

**COPY THIS ENTIRE PROMPT TO AGENT:**
```
TEST: Non-Audio System Performance Testing

Please execute the following test and report results:

1. Create high-load scenario:
   - Rapid video switching (10 switches/second)
   - Continuous control updates
   - Multiple status monitors polling
   - Complex logic evaluations
2. Monitor system performance:
   - Response time degradation
   - Command queue depth
   - Error rate increase
   - Status update delays
3. Test sustained load (2 minutes):
   - Maintain high activity
   - Check for memory leaks
   - Monitor stability
   - Document any failures
4. Recovery after load:
   - Stop high activity
   - Measure recovery time
   - Verify normal operation

EXPECTED OUTPUT FORMAT:
- Load Test Configuration:
  * Video Switches: [rate achieved]
  * Control Updates: [rate achieved]
  * Status Polls: [rate achieved]
  * Logic Operations: [rate achieved]
- Performance During Load:
  * Initial Response Time: [baseline ms]
  * Peak Response Time: [max ms]
  * Error Rate: [percentage]
  * Status Delay: [seconds]
- Sustained Load Results (2 min):
  * Stability: [stable/degraded/failed]
  * Memory Usage: [stable/increasing]
  * Failures: [none/list failures]
  * Performance Trend: [steady/declining]
- Recovery Metrics:
  * Recovery Time: [seconds to normal]
  * Residual Errors: [none/some]
  * Full Function Restored: [yes/no]
- Bottlenecks Identified:
  * Primary Limitation: [describe]
  * Secondary Issues: [list]
- Tool Errors: [any errors]
- Overall Result: [PASS/FAIL with load limits]

Define safe operating limits for production.
```

---

## SECTION 10: COMPREHENSIVE INTEGRATION TESTING

### Test 10.1: Full Non-Audio System Validation

**COPY THIS ENTIRE PROMPT TO AGENT:**
```
TEST: Complete Non-Audio Component Validation

This is a comprehensive test of all non-audio systems.

Please execute the following test and report results:

1. DISCOVERY PHASE:
   - Count all video components
   - Count all control components
   - Count all status components
   - Count all routing components
   - Count all other non-audio components

2. FUNCTIONAL TEST PHASE:
   - Test 2 video controls (if found)
   - Test 2 custom controls (if found)
   - Test 2 status monitors (if found)
   - Test 2 routing operations (if found)
   - Test 2 other operations (if found)

3. INTEGRATION TEST PHASE:
   - Create change group with mixed types
   - Perform coordinated operations
   - Monitor all status indicators
   - Verify system coherence

4. DOCUMENTATION PHASE:
   - List all component types found
   - Document control patterns
   - Note any limitations
   - Provide recommendations

EXPECTED OUTPUT FORMAT:
- DISCOVERY RESULTS:
  * Video Components: [count]
  * Control Components: [count]
  * Status Components: [count]
  * Routing Components: [count]
  * Other Non-Audio: [count]
  * TOTAL NON-AUDIO: [sum]

- FUNCTIONAL TESTS:
  * Video: [X/2 passed] - [details]
  * Control: [X/2 passed] - [details]
  * Status: [X/2 passed] - [details]
  * Routing: [X/2 passed] - [details]
  * Other: [X/2 passed] - [details]

- INTEGRATION TESTS:
  * Change Group Created: [yes/no]
  * Mixed Types Working: [yes/no]
  * Coordination Success: [yes/no]
  * System Coherent: [yes/no]

- KEY FINDINGS:
  * Most Common Type: [type]
  * Best Performing: [components]
  * Issues Found: [list critical issues]
  * Recommendations: [top 3]

- COVERAGE METRICS:
  * Component Coverage: [X%]
  * Control Coverage: [X%]
  * Test Success Rate: [X%]

- Overall Result: [PASS/FAIL]
  Production Ready: [YES/NO]
  Confidence Level: [HIGH/MEDIUM/LOW]

Provide executive summary of non-audio system capabilities.
```

### Test 10.2: Cross-System Interaction Matrix

**COPY THIS ENTIRE PROMPT TO AGENT:**
```
TEST: Cross-System Interaction Testing

Please execute the following test and report results:

1. Test interactions between system types:
   - Video affects Control?
   - Control affects Status?
   - Status affects Routing?
   - Routing affects Video?
2. Create interaction matrix
3. Document dependencies
4. Identify isolation boundaries

EXPECTED OUTPUT FORMAT:
- Interaction Matrix:
  |          | Video | Control | Status | Routing |
  |----------|-------|---------|--------|---------|
  | Video    |   -   | [Y/N]   | [Y/N]  | [Y/N]   |
  | Control  | [Y/N] |    -    | [Y/N]  | [Y/N]   |
  | Status   | [Y/N] | [Y/N]   |   -    | [Y/N]   |
  | Routing  | [Y/N] | [Y/N]   | [Y/N]  |    -    |

- Dependencies Found:
  * [System A] depends on [System B] for [function]
  * [List all dependencies]

- Isolation Boundaries:
  * Well Isolated: [list systems]
  * Coupled Systems: [list pairs]
  * Critical Dependencies: [list]

- Risk Assessment:
  * Single Points of Failure: [identify]
  * Cascade Failure Risk: [high/medium/low]

- Overall Result: [PASS/FAIL with architectural insights]
```

---

## QUICK VALIDATION CHECKLIST

### Priority 1: Core Non-Audio Functions (Must Test)
- [ ] Test 1.1 - Video Component Discovery
- [ ] Test 2.1 - Custom Control Components  
- [ ] Test 3.1 - System Status Monitors
- [ ] Test 4.1 - Matrix Router Control

### Priority 2: Advanced Features (Should Test)
- [ ] Test 1.2 - Camera Control
- [ ] Test 2.3 - Snapshot Controllers
- [ ] Test 5.1 - User Control Interfaces
- [ ] Test 6.1 - Third-Party Integration

### Priority 3: Specialized Systems (Nice to Test)
- [ ] Test 7.1 - Serial Communication
- [ ] Test 8.1 - Emergency Systems (TEST MODE)
- [ ] Test 9.1 - Multi-Component Sync
- [ ] Test 10.1 - Full System Validation

---

## SCORING GUIDE

### Component Coverage
- 90-100%: Excellent - All non-audio systems tested
- 70-89%: Good - Most systems tested, minor gaps
- 50-69%: Fair - Significant gaps in coverage
- Below 50%: Poor - Major testing needed

### Success Criteria
- Video Systems: Core routing and control working
- Control Systems: Custom controls and UCIs functional
- Status Systems: Monitoring and alerts operational
- Integration: Cross-system operations verified

---

## TROUBLESHOOTING NON-AUDIO COMPONENTS

### Common Issues

#### Video Components Not Responding
- Check video license activation
- Verify network bandwidth for video
- Confirm video firmware compatibility

#### Control Logic Not Working
- Verify control script compilation
- Check logic component connections
- Review control priorities and overrides

#### Status Not Updating
- Check polling rates and intervals
- Verify change group configuration
- Confirm status component connections

#### Integration Failures
- Review component naming conventions
- Check for timing/sequencing issues
- Verify protocol compatibility

---

## NOTES FOR TESTERS

1. **Adapt Tests to Your System**: Not all systems have all component types
2. **Safety First**: Never trigger real emergency systems
3. **Document Everything**: Even "not found" results are valuable
4. **Test Incrementally**: Start with discovery before testing control
5. **Check Dependencies**: Some components require others to function

---

## CONCLUSION

This test suite comprehensively covers non-audio Q-SYS components including:
- Video and display systems
- Control interfaces and logic
- Status monitoring and alerts  
- Routing and matrix systems
- System integration components
- Communication protocols
- Environmental monitoring
- Emergency systems (test mode only)

Use these tests to ensure complete coverage of your Q-SYS system beyond audio functionality.