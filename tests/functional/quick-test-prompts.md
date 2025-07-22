# Quick MCP Agent Test Script

A condensed version of the test prompts for rapid validation. Copy and paste these prompts to your connected agent.

## Basic Connectivity Test
```
Send an echo message with text 'test123' and query the Q-SYS Core status. Tell me the core name and firmware version.
```

## Discovery Test
```
List all components in the system and tell me:
1. Total component count
2. How many gain components exist
3. The name of the first gain component you find
```

## Snapshot Safety Test
```
Find any snapshot component and create a safety backup. If none exists, just tell me "No snapshot component available" and we'll continue.
```

## Control Read Test
```
Using the first gain component you found, read and report:
1. Current gain value in dB
2. Current mute status (on/off)
3. The control's position value (0-1)
```

## Control Write Test
```
Set that same gain control to -20 dB with a 2-second ramp. Wait for the ramp to complete, then verify the new value is -20 dB.
```

## Bulk Operation Test
```
Get all controls from that gain component using the bulk component query. Tell me how many controls it has total.
```

## Error Handling Test
```
Try to set a control called "InvalidControl" on component "FakeComponent" to value 1. Tell me what error message you get.
```

## Multi-Control Test
```
Find two different gain components. In a single operation, set the first to -15 dB and the second to -25 dB with 1-second ramps.
```

## Performance Test
```
Change a gain control value 5 times quickly: -30, -25, -20, -15, -10 dB with no ramp. Tell me how long it took total.
```

## Restoration Test
```
If you created a snapshot earlier, restore it now. Otherwise, set any modified gain controls back to -10 dB. Confirm the system is in a safe state.
```

---

## One-Line Test Prompts

For even quicker testing, use these one-liners:

1. `Echo 'hello' back to me`
2. `What's the Q-SYS Core firmware version?`
3. `How many components are in the system?`
4. `Find a gain component and tell me its current value`
5. `Set that gain to -20 dB with a 1-second ramp`
6. `List all mute controls in the system`
7. `Try to set component "Fake" control "fake" to 1 and tell me the error`
8. `Get the first 50 controls using pagination`
9. `Find all controls with non-default values`
10. `Restore any changes you made to safe defaults`