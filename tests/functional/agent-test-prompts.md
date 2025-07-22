# MCP Q-SYS Control Agent Test Prompts

This document contains test prompts to validate the MCP control capabilities through an AI agent. Each prompt tests different aspects of the system with expected outcomes.

## Test Execution Instructions

1. Connect your AI agent to the MCP server
2. Execute each prompt in order
3. Verify the agent completes the task successfully
4. Note any failures with the specific error message

---

## 1. CONNECTIVITY TESTS

### Test 1.1: Basic Connection Verification
**Prompt:** "Send an echo message with the text 'MCP Test Active' and confirm you receive it back"
**Expected:** Agent confirms receiving "MCP Test Active" back from the echo tool
**Pass Criteria:** Echo message matches exactly

### Test 1.2: System Status Check
**Prompt:** "Query the Q-SYS Core status and tell me the firmware version, core name, and current system status"
**Expected:** Agent provides firmware version, core name, and status (e.g., "Active", "Standby")
**Pass Criteria:** All three pieces of information are provided

---

## 2. DISCOVERY TESTS

### Test 2.1: Component Discovery
**Prompt:** "List all components in the Q-SYS system and tell me how many components you found. Group them by type if possible."
**Expected:** Agent lists total component count and provides grouping by type
**Pass Criteria:** Component count > 0 and types are identified

### Test 2.2: Filtered Component Search
**Prompt:** "Find all gain, mixer, and router components in the system. Tell me how many of each type you found."
**Expected:** Agent uses regex filter to find specific component types
**Pass Criteria:** Correctly identifies and counts each component type

### Test 2.3: Control Discovery
**Prompt:** "List all gain controls in the system and tell me which components have gain controls"
**Expected:** Agent lists components with gain controls
**Pass Criteria:** Identifies gain controls with their parent components

---

## 3. SAFETY SETUP

### Test 3.1: Snapshot Creation
**Prompt:** "Before we make any changes, find a snapshot component and create a safety snapshot called 'agent_test_backup'. If no snapshot component exists, tell me and we'll proceed without one."
**Expected:** Agent either creates snapshot or reports no snapshot component available
**Pass Criteria:** Clear response about snapshot status

---

## 4. CONTROL VALUE OPERATIONS

### Test 4.1: Read Control Values
**Prompt:** "Find a gain component and read its current gain and mute values. Tell me the exact values including units."
**Expected:** Agent reports gain in dB and mute as on/off or true/false
**Pass Criteria:** Values include proper units (dB for gain)

### Test 4.2: Safe Control Change
**Prompt:** "Set the gain control you just read to -20 dB using a 2-second ramp. After the ramp completes, verify the new value."
**Expected:** Agent sets gain to -20 dB, waits for ramp, confirms new value
**Pass Criteria:** Value changes to -20 dB (±0.5 dB tolerance)

### Test 4.3: Mute Toggle
**Prompt:** "Toggle the mute control on the same component. If it's currently muted, unmute it. If unmuted, mute it. Tell me the before and after states."
**Expected:** Agent reads current state, toggles it, confirms change
**Pass Criteria:** Mute state changes from initial value

### Test 4.4: Restore Original Value
**Prompt:** "Restore the gain control to its original value before we changed it. Use a 1-second ramp."
**Expected:** Agent remembers and restores the original gain value
**Pass Criteria:** Gain returns to original value

---

## 5. BULK OPERATIONS

### Test 5.1: Pagination Test
**Prompt:** "Get all controls in the system using pagination with 100 controls per page. Tell me the total number of controls and how many pages there are."
**Expected:** Agent uses qsys_get_all_controls with pagination
**Pass Criteria:** Reports total controls and page count

### Test 5.2: Non-Default Values
**Prompt:** "Find all controls that have non-default values. Show me the first 5 examples with their component names and current values."
**Expected:** Agent filters for non-default values and lists examples
**Pass Criteria:** Lists up to 5 controls with non-default values

### Test 5.3: Component-Specific Bulk Read
**Prompt:** "Find a mixer or router component and get all of its controls at once. Tell me how many controls it has and list the first 5."
**Expected:** Agent uses qsys_component_get for efficient bulk reading
**Pass Criteria:** Lists control count and examples from single component

---

## 6. ADVANCED CONTROL OPERATIONS

### Test 6.1: Multi-Control Change
**Prompt:** "Find two different gain components. Set the first to -15 dB and the second to -25 dB, both with 1.5-second ramps. Do this in a single operation if possible."
**Expected:** Agent sets multiple controls in one call
**Pass Criteria:** Both gains change to specified values

### Test 6.2: String Control Test
**Prompt:** "Find a component with a text or string control (like a router's input selection or a text display). Read its current value and tell me what it says."
**Expected:** Agent identifies and reads a string-type control
**Pass Criteria:** Reports the string value of a non-numeric control

---

## 7. ERROR HANDLING TESTS

### Test 7.1: Invalid Component
**Prompt:** "Try to read the gain value from a component called 'ThisComponentDoesNotExist' and tell me what error you receive."
**Expected:** Agent attempts operation and reports the error
**Pass Criteria:** Handles error gracefully and reports it clearly

### Test 7.2: Out of Range Value
**Prompt:** "Try to set a gain control to +100 dB (which should be out of range) and tell me what happens."
**Expected:** Agent attempts operation and reports range error
**Pass Criteria:** Identifies this as a range violation error

### Test 7.3: Invalid Control Type
**Prompt:** "Try to set a mute control to the value 0.5 (mutes should only be 0 or 1) and report what happens."
**Expected:** Agent attempts operation and handles the error
**Pass Criteria:** Recognizes invalid value for control type

---

## 8. PERFORMANCE TESTS

### Test 8.1: Rapid Changes
**Prompt:** "Find a gain control and change its value 5 times rapidly: -30, -25, -20, -15, -10 dB with no ramp time. Time how long this takes and tell me the average time per change."
**Expected:** Agent performs rapid changes and calculates timing
**Pass Criteria:** Completes all changes and provides timing data

### Test 8.2: Large Data Query
**Prompt:** "Get a list of ALL controls in the system (not paginated) if there are less than 500 total. Otherwise, get the first 500. Tell me how long this query takes."
**Expected:** Agent retrieves large dataset and reports timing
**Pass Criteria:** Successfully retrieves controls with timing information

---

## 9. SYSTEM RESTORATION

### Test 9.1: Restore Snapshot
**Prompt:** "If you created a snapshot at the beginning, restore it now. If no snapshot was created, set any gain controls you modified back to -10 dB as a safe default."
**Expected:** Agent either restores snapshot or sets safe defaults
**Pass Criteria:** System returned to safe state

### Test 9.2: Final Verification
**Prompt:** "Query the core status one more time and confirm the system is still active and responding normally."
**Expected:** Agent confirms system is operational
**Pass Criteria:** Core status shows active/normal operation

---

## 10. COMPREHENSIVE WORKFLOW TEST

### Test 10.1: Complex Scenario
**Prompt:** "I want to set up a simple audio route. Find a router component, list its available inputs and outputs, then route input 1 to output 1. After that, find the gain control for output 1 and set it to -6 dB with a 3-second fade. Describe each step as you do it."
**Expected:** Agent performs multi-step routing and gain adjustment workflow
**Pass Criteria:** Completes entire workflow successfully

### Test 10.2: Status Report
**Prompt:** "Give me a summary of the Q-SYS system: How many components are there? What types are most common? Are there any controls currently at extreme values (gain below -50 dB or above 0 dB)? What's the overall system health?"
**Expected:** Agent provides comprehensive system overview
**Pass Criteria:** Provides all requested information accurately

---

## Test Summary Checklist

- [ ] Connectivity verified (echo and status)
- [ ] Component discovery working
- [ ] Control read operations successful
- [ ] Control write operations successful
- [ ] Bulk operations functional
- [ ] Error handling appropriate
- [ ] Performance acceptable
- [ ] System restored to safe state
- [ ] Complex workflows completed

## Notes for Test Execution

1. **Safety First**: Always create snapshots when available
2. **Use Conservative Values**: Test with -20 dB rather than extreme values
3. **Verify Changes**: Always confirm control changes were applied
4. **Document Failures**: Note the exact error message for any failures
5. **System Restoration**: Always restore original state after testing

## Expected Agent Behaviors

The agent should:
- Use appropriate MCP tools for each task
- Handle errors gracefully without crashing
- Provide clear feedback on success/failure
- Remember values between prompts when needed
- Use efficient methods (bulk operations when appropriate)
- Follow safety practices (ramps, reasonable values)