QRC Commands QRC is a Unicode-based TCP/IP control protocol. The client connects to the Q-SYS Core
(or emulator) on port 1710 and sends JSON RPC 2.0 null-terminated commands.

Note: For the JSON-RPC 2.0 Specification, visit jsonrpc.org.

OpenConnection Methods Use these methods to log on to the Q-SYS Core via the QRC protocol and
maintain the socket connection.

OpenLogon Logs on to the system.

Parameters User, Password

Example { "jsonrpc":"2.0", "method":"Logon", "params":{ "User":"username", "Password":"1234" } }
OpenNoOp This is a simple, "do nothing" method for making sure that the socket remains open.

Parameters None.

Example { "jsonrpc":"2.0", "method":"NoOp", "params":{ } } OpenStatus Methods Use these methods to
obtain the status of the Q-SYS Core.

OpenEngineStatus This method is automatically deployed to return the status of the Q-SYS Core
whenever a client connects to the QRC port or the status changes.

Parameters State : One of the following strings – "Idle", "Active", "Standby".

DesignName : Name of the currently running design.

DesignCode : GUID of the currently running design.

IsRedundant : True if the design is configured to be a redundant design.

IsEmulator : True if the design is currently running in the emulator.

Example { "jsonrpc":"2.0", "method":"EngineStatus", "params":{ "State":"Active",
"DesignName":"MyDesign", "DesignCode":"qALFilm6IcCo", "IsRedundant":false, "IsEmulator":true } }
OpenStatusGet Manually request the current status. Returns the EngineStatus of the Q-SYS Core.

Parameters NA

Response Results Platform : The Q-SYS Core model.

State : One of the following strings – "Idle", "Active", "Standby".

DesignName : Name of the currently running design.

DesignCode : GUID of the currently running design.

IsRedundant : True if the design is configured to be a redundant design.

IsEmulator : True if the design is currently running in the emulator.

Example { "jsonrpc": "2.0", "method": "StatusGet", "id": 1234, "params": 0 } Response {
"jsonrpc":"2.0", "id":1234 "result":{ "Platform":"Core 500i", "State":"Active",
"DesignName":"SAF‐MainPA", "DesignCode":"qALFilm6IcAz", "IsRedundant":false, "IsEmulator":true,
"Status":{ "Code":0 "String":"OK" } } } OpenControl Methods Use these methods to get and set Named
Control values.

OpenControl.Get Specify an array of Named Control strings, receive an array of control values.

Parameters Array of Named Control strings, e.g.:

["Named_Control_Name", "Named_Control_Name"]

Response Name : Name of the control, relative to the component.

Value : The value of the control. This can be a number, string, or boolean.

String : String representation of the control.

Example 1: Single Named Control { "jsonrpc": "2.0", "id": 1234, "method": "Control.Get", "params":
["MainGain"] } Response { "jsonrpc": "2.0", "id": 1234, "result": [ { "Name": "MainGain", "Value":
‐12 } ] } Example 2: Multiple Named Controls { "jsonrpc": "2.0", "id": 1234, "method":
"Control.Get", "params": ["MainGain", "MainMute"] } Response { "jsonrpc": "2.0", "id": 1234,
"result": [ { "Name": "MainGain", "Value": ‐12 "String" : "‐12.0dB" }, { "Name": "MainMute",
"Value": false, "String" : "Unmuted" } ] } OpenControl.Set Set a control's value. Specify a single
control name, value, and optional ramp time.

Parameters Name : Name of the control, relative to the component.

Value : The value of the control. This can be a number, string, or boolean.

Ramp : (Optional) The ramp time used to set the control.

Example { "jsonrpc": "2.0", "id": 1234, "method": "Control.Set", "params": { "Name": "MainGain",
"Value": ‐12 } } OpenComponent Control Methods Use these methods to get and set controls within
Named Components, or obtain a list of all Named Components in a design.

OpenComponent.Get Returns the values of one or more specified controls within a specified Named
Component.

Parameters Name : The name of the named component.

Controls : An array of control values.

Example { "jsonrpc": "2.0", "id": 1234, "method": "Component.Get", "params": { "Name": "My APM",
"Controls": [ { "Name": "ent.xfade.gain" } ] } } Response { "jsonrpc": "2.0", "result": { "Name":
"My APM", "Controls": [ { "Name": "ent.xfade.gain", "Value": ‐100.0, "String": "‐100.0dB"
"Position": 0 } ] } } OpenComponent.GetControls Returns a table of all controls and their values in
a specified Named Component.

Parameters Name : The name of the named component.

Example { "jsonrpc": "2.0", "id": 1234, "method": "Component.GetControls", "params": { "Name":
"MyGain" } } Response { "jsonrpc": "2.0", "result": { "Name": "MyGain", "Controls": [ { "Name":
"bypass", "Type": "Boolean", "Value": false, "String": "no", "Position": 0.0, "Direction":
"Read/Write" }, "Name": "gain", "Type": "Float", "Value": 0.0, "ValueMin": -100.0, "ValueMax": 20.0,
"StringMin": "-100dB", "StringMax": "20.0dB", "String": "0dB", "Position": 0.83333331, "Name":
"invert", "String": "normal", "Name": "mute", "String": "unmuted", } ] }, "id": 1234 }
OpenComponent.Set Set one or more controls for a single named component. Returns a list of unknown
controls after processing.

Parameters Name : The name of the named component.

Controls : An array of control values.

Example 1: Set a single control { "jsonrpc": "2.0", "id": 1234, "method": "Component.Set", "params":
{ "Name": "My APM", "Controls": [ { "Name": "ent.xfade.gain", "Value": ‐100.0, "Ramp": 2.0 } ] } }
Example 2: Set multiple controls { "jsonrpc": "2.0", "id": 1234, "method": "Component.Set",
"params": { "Name": "My APM", "Controls": [ { "Name": "ent.xfade.gain", "Value": ‐100.0, "Ramp": 2.0
}, { "Name": "bgm.xfade.gain", "Value": 0.0, "Ramp": 1.0 } ] } } OpenComponent.GetComponents Get a
list of all named components in a design, along with their type and properties.

Parameters NA

Example { "jsonrpc": "2.0", "method": "Component.GetComponents", "params": "test", "id": 1234 }
Response { "jsonrpc": "2.0", "result": [ { "Name": "APM ABC", "Type": "apm", "Properties": [] }, {
"Name": "My Delay Mixer", "Type": "delay_matrix", "Properties": [ { "Name": "n_inputs", "Value": "8"
}, { "Name": "n_outputs", "Value": "8" }, { "Name": "max_delay", "Value": "0.5" }, { "Name":
"delay_type", "Value": "0" }, { "Name": "linear_gain", "Value": "False" }, { "Name":
"multi_channel_type", "Value": "1" }, { "Name": "multi_channel_count", "Value": "8" } ] } ], "id":
1234 } OpenChange Group Methods Use these methods to manipulate and poll change groups.

OpenChangeGroup.AddControl Add controls to a change group via Named Controls. Returns a list of
unknown controls after processing.

Parameters Id : Change group ID.

Controls : Array of control names.

Example { "jsonrpc": "2.0", "id": 1234, "method": "ChangeGroup.AddControl", "params": { "Id": "my
change group" "Controls" : [ "some control", "another control" ] } }
OpenChangeGroup.AddComponentControl Add controls to a change group via a Named Component. Returns a
list of unknown controls after processing.

Parameters Id : Change group ID.

Component : Named Component name and array of controls.

Example { "jsonrpc": "2.0", "id": 1234, "method": "ChangeGroup.AddComponentControl", "params": {
"Id": "my change group" "Component" : { "Name": "My Component", "Controls": [ { "Name": "gain" }, {
"Name": "mute" } ] } } } OpenChangeGroup.Remove Remove controls from a change group via Named
Controls. Returns a list of unknown controls after processing.

Parameters Id : Change group ID.

Controls : Array of control names.

Example { "jsonrpc": "2.0", "id": 1234, "method": "ChangeGroup.Remove", "params": { "Id": "my change
group" "Controls" : [ "some control" ] } } OpenChangeGroup.Poll Poll a change group.

Parameters Id : Change group ID.

Example { "jsonrpc": "2.0", "id": 1234, "method": "ChangeGroup.Poll", "params": { "Id": "my change
group" } } Response { "jsonrpc": "2.0", "id": 1234, "result": { "Id": "my change group", "Changes":
[ { // Named control return value "Name": "some control", "Value": ‐12 "String": "‐12dB" }, { //
Named component return value "Component": "My Component", "Name": "gain", "Value": ‐12 "String":
"‐12dB" } ] } } OpenChangeGroup.Destroy Destroy a change group.

Parameters Id : Change group ID.

Example { "jsonrpc": "2.0", "id": 1234, "method": "ChangeGroup.Destroy", "params": { "Id": "my
change group" } } OpenChangeGroup.Invalidate Invalidates a change group, which causes all controls
to be resent.

Parameters Id : Change group ID.

Example { "jsonrpc": "2.0", "id": 1234, "method": "ChangeGroup.Invalidate", "params": { "Id": "my
change group" } } OpenChangeGroup.Clear Clears a change group, which removes all controls.

Parameters Id : Change group ID.

Example { "jsonrpc": "2.0", "id": 1234, "method": "ChangeGroup.Clear", "params": { "Id": "my change
group" } } OpenChangeGroup.AutoPoll Set up automatic polling.

Parameters Id : Change group ID.

Rate : The polling interval, in seconds.

Example Configure automatic polling to receive a response every 5 seconds:

{ "jsonrpc": "2.0", "id": 1234, "method": "ChangeGroup.AutoPoll", "params": { "Id": "my change
group" "Rate": 5 } } Response { "jsonrpc": "2.0", "id": 1234, "result": { "Id": "my change group",
"Changes": [ { // Named control return value "Name": "some control", "Value": ‐12 "String": "‐12dB"
}, { // Named component return value "Component": "My Component", "Name": "gain", "Value": ‐12
"String": "‐12dB" } ] } } ClosedMixer Control Methods Use the mixer control API methods to set mixer
input and output parameters.

ClosedLoop Player Control Methods Use the Loop Player control API methods to queue up file playback
into a named Loop Player.

OpenSnapshot Methods Use these methods to load and save snapshots.

OpenSnapshot.Load Load control settings from a specified snapshot bank and number with an optional
ramp time.

Parameters Name : String. The name of the snapshot bank from which to load the snapshot. This is the
name given to the bank when it was created in Q-SYS Designer Software.

Bank : Integer. Identifies a snapshot within a snapshot bank. The range is 1 to the number of
snapshots in the bank, inclusive.

Ramp : Double. Optional argument, in seconds, for specifying the ramp time when loading the
snapshot.

Example From a snapshot bank called "MySpecialBank", load control settings from snapshot # 7 with a
ramp time of 8.5 seconds...

{ "jsonrpc": "2.0", "method": "Snapshot.Load", "params": { "Name": "MySpecialBank", "Bank": 7,
"Ramp": 8.5 }, "id": 1234 } OpenSnapshot.Save Save control settings to a specified snapshot bank and
number.

Parameters Name : String. The name of the snapshot bank to which to save the snapshot. This is the
name given to the bank when it was created in Q-SYS Designer Software.

Bank : Integer. Identifies a snapshot within a snapshot bank. The range is 1 to the number of
snapshots in the bank, inclusive.

Example Save control settings to a snapshot bank called "MyVerySpecialBank" to snapshot # 4.

{ "jsonrpc": "2.0", "method": "Snapshot.Save", "params": { "Name": "MyVerySpecialBank", "Bank": 4,
}, "id": 1234 } OpenError Code Reference These codes can be returned as the code value in a JSON-RPC
error object.

Code Details -32700

Parse error. Invalid JSON was received by the server.

-32600

Invalid request. The JSON sent is not a valid Request object.

-32601

Method not found.

-32602

Invalid params.

-32603

Server error.

2

Invalid Page Request ID

3

Bad Page Request - could not create the requested Page Request

4

Missing file

5

Change Groups exhausted

6

Unknown change croup

7

Unknown component name

8

Unknown control

9

Illegal mixer channel index

10

Logon required
