# Master Test Prompts - Q-SYS MCP Agent Testing Guide

## WORKFLOW INSTRUCTIONS
Each test below is formatted as a complete prompt that can be copied to an MCP agent. The agent should:
1. Execute the test steps
2. Report results, errors, and any issues found
3. Provide detailed feedback that can be used for fixes

Copy the entire prompt block (including expected output format) for each test.

---

## SECTION 1: BASIC CONNECTIVITY & DISCOVERY

### Test 1.1: Initial Connection Verification

**COPY THIS ENTIRE PROMPT TO AGENT:**
```
TEST: Initial Connection Verification

Please execute the following test and report results:

1. Use the echo tool with message "connection test" to verify MCP connectivity
2. Use query_core_status to check the Q-SYS Core connection status
3. Report the Core's firmware version, model, and design name
4. Report total component count if available
5. Note any connection warnings, errors, or unexpected responses

EXPECTED OUTPUT FORMAT:
- Echo Response: [success/failure - actual response]
- Core Status: [connected/disconnected]
- Core Model: [model name]
- Firmware Version: [version]
- Design Name: [name]
- Component Count: [number or "not available"]
- Errors/Warnings: [list any issues]
- Overall Result: [PASS/FAIL with reason]

Report any unexpected behavior or deviations from expected results.
```

### Test 1.2: Component Discovery

**COPY THIS ENTIRE PROMPT TO AGENT:**
```
TEST: Component Discovery

Please execute the following test and report results:

1. Use list_components to get all available components
2. Count total components found
3. Group components by type (look for patterns like gain, mixer, router, etc.)
4. Identify any components with special characters or spaces in names
5. List the first 5 component names as examples
6. Flag any components with unusual naming patterns

EXPECTED OUTPUT FORMAT:
- Total Components Found: [number]
- Component Types Identified: [list of types with counts]
- Components with Special Characters: [list examples or "none found"]
- Components with Spaces: [list examples or "none found"]
- First 5 Components: [list names]
- Unusual Patterns: [describe any found or "none"]
- Tool Errors: [any errors from list_components]
- Overall Result: [PASS/FAIL with reason]

Note if list_components returns unexpected format or errors.
```

### Test 1.3: Control Enumeration

**COPY THIS ENTIRE PROMPT TO AGENT:**
```
TEST: Control Enumeration

Please execute the following test and report results:

1. Use list_components to get available components
2. For the FIRST 3 components found, use list_controls to get their controls
3. Document the exact control name format you observe (dots, underscores, spaces)
4. Count controls by type (gain, mute, position, string, trigger, etc.)
5. Note any controls with metadata or special properties
6. Report if any component has no controls

EXPECTED OUTPUT FORMAT:
- Components Tested: [list the 3 component names]
- Control Name Formats Found:
  * Format 1: [example like "component.control"]
  * Format 2: [example like "component_control"]
  * Other: [any other patterns]
- Control Types Found:
  * gain: [count]
  * mute: [count]
  * position: [count]
  * string: [count]
  * trigger: [count]
  * other: [count and types]
- Controls with Metadata: [list or "none found"]
- Components with No Controls: [list or "none"]
- Tool Errors: [any errors encountered]
- Overall Result: [PASS/FAIL with reason]

Include specific examples of control names for reference.
```

---

## SECTION 2: BASIC CONTROL OPERATIONS

### Test 2.1: Simple Get Operations

**COPY THIS ENTIRE PROMPT TO AGENT:**
```
TEST: Simple Get Operations

Please execute the following test and report results:

1. Use list_components to discover available components
2. Use list_controls on multiple components to find:
   - At least 3 gain controls
   - At least 3 mute controls
   - At least 2 position/level controls (if available)
3. Use get_control_values to retrieve all found control values
4. Document the value type for each control type (number/boolean/string)
5. Check for any null, undefined, or unexpected values

EXPECTED OUTPUT FORMAT:
- Gain Controls Found:
  * Control 1: [name] = [value] (type: [number/string/boolean])
  * Control 2: [name] = [value] (type: [number/string/boolean])
  * Control 3: [name] = [value] (type: [number/string/boolean])
- Mute Controls Found:
  * Control 1: [name] = [value] (type: [number/string/boolean])
  * Control 2: [name] = [value] (type: [number/string/boolean])
  * Control 3: [name] = [value] (type: [number/string/boolean])
- Position/Level Controls Found:
  * Control 1: [name] = [value] (type: [number/string/boolean])
  * Control 2: [name] = [value] (type: [number/string/boolean])
- Unexpected Values: [list any null/undefined/strange values]
- Tool Errors: [any errors from get_control_values]
- Overall Result: [PASS/FAIL with reason]

Note if get_control_values accepts the control name format you're using.
```

### Test 2.2: Simple Set Operations

**COPY THIS ENTIRE PROMPT TO AGENT:**
```
TEST: Simple Set Operations

Please execute the following test and report results:

1. Use list_components and list_controls to find:
   - One real gain control
   - One real mute control
2. Use get_control_values to save current values
3. Use set_control_values to set gain to -20 (with validate:false)
4. Use set_control_values to set mute to true (with validate:false)
5. Wait 2 seconds
6. Use get_control_values to verify both changed
7. Use set_control_values to restore original values
8. Verify restoration succeeded

EXPECTED OUTPUT FORMAT:
- Gain Control Used: [name]
  * Original Value: [value]
  * Set to: -20
  * Actual Value After Set: [value]
  * Restored to: [value]
  * Final Value: [value]
- Mute Control Used: [name]
  * Original Value: [value]
  * Set to: true
  * Actual Value After Set: [value]
  * Restored to: [value]
  * Final Value: [value]
- Set Operations Status:
  * Initial Set Success: [yes/no with details]
  * Restoration Success: [yes/no with details]
- Tool Errors: [any errors encountered]
- Overall Result: [PASS/FAIL with reason]

Report if validate:false was required for success.
```

### Test 2.3: Ramp Testing

**COPY THIS ENTIRE PROMPT TO AGENT:**
```
TEST: Ramp Functionality

Please execute the following test and report results:

1. Use list_components and list_controls to find a gain control
2. Use get_control_values to save current value
3. Use set_control_values with ramp parameter:
   - Set gain to -40 with ramp:5 (5 second ramp)
4. Immediately use get_control_values (T+0 seconds)
5. Wait 2.5 seconds, then get_control_values (T+2.5 seconds)
6. Wait another 2.5 seconds, then get_control_values (T+5 seconds)
7. Document if smooth transition occurred
8. Optionally restore original value

EXPECTED OUTPUT FORMAT:
- Gain Control Used: [name]
- Original Value: [value]
- Target Value: -40
- Ramp Duration: 5 seconds
- Value at T+0: [value] (should be near original)
- Value at T+2.5: [value] (should be mid-transition)
- Value at T+5: [value] (should be near -40)
- Smooth Transition: [yes/no - explain]
- Ramp Command Format Used: [exact format that worked]
- Tool Errors: [any errors]
- Overall Result: [PASS/FAIL with reason]

Note the exact syntax required for the ramp parameter.
```

---

## SECTION 3: BATCH OPERATIONS & PERFORMANCE

### Test 3.1: Small Batch Operations

**COPY THIS ENTIRE PROMPT TO AGENT:**
```
TEST: Small Batch Operations (10 Controls)

Please execute the following test and report results:

1. Use list_components to discover components
2. Use list_controls to find at least 10 gain controls
3. Build list of exactly 10 gain control names
4. Use get_control_values to get all 10 in ONE call
5. Use set_control_values to set all 10 to -15 (validate:false) in ONE call
6. Measure and report time taken
7. Use get_control_values to verify all changed to -15

EXPECTED OUTPUT FORMAT:
- Controls Used: [list 10 control names]
- Initial Values: [list values]
- Batch Get Time: [milliseconds]
- Batch Set Time: [milliseconds]
- Final Values: [list values - should all be -15]
- Success Rate: [X/10 controls changed successfully]
- Batch Command Format: [show exact format used]
- Tool Errors: [any errors]
- Overall Result: [PASS/FAIL with reason]

Report if batch operations work as expected.
```

### Test 3.2: Validation Comparison

**COPY THIS ENTIRE PROMPT TO AGENT:**
```
TEST: Validation Impact on Performance

Please execute the following test and report results:

1. Find 20 real controls of mixed types (gain, mute, position)
2. Create test with 10 REAL controls and 10 FAKE control names
3. Test WITH validation (validate:true):
   - Set all 20 controls
   - Record time and which ones succeed/fail
4. Test WITHOUT validation (validate:false):
   - Set same 20 controls
   - Record time and which ones succeed/fail
5. Compare results

EXPECTED OUTPUT FORMAT:
- Real Controls: [list 10 names]
- Fake Controls: [list 10 fake names]
- WITH Validation (validate:true):
  * Time: [milliseconds]
  * Real Controls Success: [X/10]
  * Fake Controls Success: [X/10]
  * Errors: [list any errors]
- WITHOUT Validation (validate:false):
  * Time: [milliseconds]
  * Real Controls Success: [X/10]
  * Fake Controls Success: [X/10]
  * Errors: [list any errors]
- Performance Difference: [X ms faster/slower]
- Behavioral Difference: [describe key differences]
- Overall Result: [PASS/FAIL with reason]

Document how validation affects fake vs real controls.
```

### Test 3.3: Maximum Batch Limits

**COPY THIS ENTIRE PROMPT TO AGENT:**
```
TEST: Maximum Batch Size Limits

Please execute the following test and report results:

1. Use list_components and list_controls to find ALL available controls
2. Build list of exactly 100 real control names
3. Test GET limit:
   - Try get_control_values with all 100 controls
   - Document if there's a limit or if it succeeds
4. Test SET limit:
   - Try set_control_values with 95 controls (validate:false)
   - Document success/failure
5. If limits exist, find the maximum that works

EXPECTED OUTPUT FORMAT:
- Total Controls Found: [number]
- 100 Control GET Test:
  * Success: [yes/no]
  * Time: [milliseconds]
  * Error: [if failed, what error]
- 95 Control SET Test:
  * Success: [yes/no]
  * Time: [milliseconds]
  * Error: [if failed, what error]
- Maximum Working Batch Size:
  * GET: [number]
  * SET: [number]
- Performance at Max Size:
  * GET Time: [milliseconds]
  * SET Time: [milliseconds]
- Overall Result: [PASS/FAIL with reason]

Report the practical limits for batch operations.
```

---

## SECTION 4: VALIDATION BEHAVIOR TESTING
Deep dive into validation system behavior

### Test 4.1: Validation Edge Cases
```
Test validation with edge cases:
1. Use list_components and list_controls to identify 5 REAL controls
2. Create 5 FAKE control names that don't exist
3. Set 5 REAL controls + 5 FAKE controls WITH validation
4. Document which succeed and which fail
5. Set same mix WITHOUT validation
6. Compare behavior differences
7. Check if real controls actually changed despite validation errors
```

### Test 4.2: Format Sensitivity
```
Test control name format requirements:
1. Try setting "controlName" alone
2. Try "ComponentName.controlName" format
3. Try with extra spaces, dots, underscores
4. Test case sensitivity
5. Identify the exact format that works with validation
```

### Test 4.3: Production Workaround Validation
```
Test safe patterns for production:
1. Always use validate:false for operations
2. Implement manual validation using get_control_values
3. Compare manual validation accuracy vs built-in
4. Document the most reliable production pattern
5. Create a "verified controls" cache strategy
```

---

## SECTION 5: STATE MANAGEMENT & PERSISTENCE
Tests state tracking and recovery

### Test 5.1: State Save and Restore
```
Test state management:
1. Use list_components and list_controls to find 20 real controls
2. Get current values for these 20 controls
3. Save this state snapshot
4. Change all 20 controls to different values
5. Verify changes applied
6. Restore original state from snapshot
7. Verify restoration succeeded
```

### Test 5.2: Change Group Management

**COPY THIS ENTIRE PROMPT TO AGENT:**
```
TEST: Complete Change Group Lifecycle

Please execute the following test to verify ALL 7 change group tools:

1. Use create_change_group to create group with ID "test-batch"
2. Use add_controls_to_change_group to add 5 real controls
3. Use poll_change_group to check for changes
4. Use list_change_groups to verify group exists
5. Use remove_controls_from_change_group to remove 2 controls
6. Use clear_change_group to empty the group
7. Use add_controls_to_change_group to add 3 different controls
8. Use destroy_change_group to delete the group
9. Use list_change_groups to verify it's gone

EXPECTED OUTPUT FORMAT:
- Step 1 - Create: [success/fail - group ID created]
- Step 2 - Add Controls: [list controls added]
- Step 3 - Poll Result: [any changes detected]
- Step 4 - List Groups: [shows "test-batch" - yes/no]
- Step 5 - Remove Controls: [which 2 removed]
- Step 6 - Clear Result: [success/fail]
- Step 7 - Add New Controls: [list 3 new controls]
- Step 8 - Destroy: [success/fail]
- Step 9 - Final List: [confirms group gone - yes/no]
- Tool Errors: [any errors from any tool]
- All 7 Tools Tested: [checklist]
  ✓ create_change_group
  ✓ add_controls_to_change_group
  ✓ poll_change_group
  ✓ list_change_groups
  ✓ remove_controls_from_change_group
  ✓ clear_change_group
  ✓ destroy_change_group
- Overall Result: [PASS/FAIL with reason]

Verify each tool works as expected.
```

### Test 5.3: Persistent State Recovery
```
Test persistence across restarts:
1. Set 10 controls to specific test values
2. Note the timestamp
3. Simulate a connection loss
4. Reconnect to Q-SYS
5. Verify controls retained their values
6. Check if any state was lost during disconnect
```

---

## SECTION 6: EVENT MONITORING & TRACKING

### Test 6.1: Basic Event Monitoring

**COPY THIS ENTIRE PROMPT TO AGENT:**
```
TEST: Basic Event Monitoring

Please execute the following test and report results:

1. Use get_event_statistics to check monitoring status
2. Note the current total event count
3. Use set_control_values to change 5 different controls
4. Wait 2 seconds for events to be recorded
5. Use query_change_events with no filters to get recent events
6. Verify your 5 changes appear in the results
7. Use get_event_statistics again to verify count increased by 5

EXPECTED OUTPUT FORMAT:
- Initial Statistics:
  * Monitoring Enabled: [yes/no]
  * Initial Event Count: [number]
- Controls Changed: [list 5 control names and values]
- Query Results:
  * Events Found: [number]
  * Your Changes Present: [yes/no - list them]
  * Timestamps Correct: [yes/no]
- Final Statistics:
  * Final Event Count: [number]
  * Count Increased By: [should be 5 or more]
- Tool Errors: [any errors]
- Overall Result: [PASS/FAIL with reason]

Confirm event monitoring is capturing changes.
```

### Test 6.2: Event Query Filtering

**COPY THIS ENTIRE PROMPT TO AGENT:**
```
TEST: Event Query Filtering

Please execute the following test and report results:

1. Make 3 changes to component "Gain1" (if it exists)
2. Make 3 changes to component "Gain2" (if it exists)
3. Test query_change_events filters:
   - Query with componentNames:["Gain1"] 
   - Query with limit:5
   - Query with offset:2
   - Query last 60 seconds (use startTime)
   - Combine componentNames + limit filters
4. Verify each filter works correctly

EXPECTED OUTPUT FORMAT:
- Changes Made:
  * Gain1: [list 3 changes]
  * Gain2: [list 3 changes]
- Filter Tests:
  * componentNames Filter: [returns only Gain1 - yes/no]
  * limit:5 Filter: [returns max 5 - yes/no]
  * offset:2 Filter: [skips first 2 - yes/no]
  * Time Filter: [returns recent only - yes/no]
  * Combined Filters: [work together - yes/no]
- Query Syntax That Worked: [show exact format]
- Tool Errors: [any errors]
- Overall Result: [PASS/FAIL with reason]

Document the correct filter syntax.
```

### Test 6.3: Event Statistics Analysis

**COPY THIS ENTIRE PROMPT TO AGENT:**
```
TEST: Event Statistics Analysis

Please execute the following test and report results:

1. Use get_event_statistics to get baseline
2. Make 20 rapid changes across 5 different components
3. Wait 3 seconds for processing
4. Use get_event_statistics again
5. Verify statistics accurately reflect your changes

EXPECTED OUTPUT FORMAT:
- Baseline Statistics:
  * Total Events: [number]
  * Unique Controls: [number]
  * Database Size: [bytes]
- Changes Made: [brief summary of 20 changes]
- Updated Statistics:
  * Total Events: [increased by ~20]
  * Unique Controls: [number]
  * Events by Component: [show top 5]
  * Hourly Distribution: [if available]
- Statistics Accuracy:
  * Event Count Correct: [yes/no]
  * Component Breakdown Correct: [yes/no]
- Tool Errors: [any errors]
- Overall Result: [PASS/FAIL with reason]

Verify statistics are tracking correctly.
```

### Test 6.4: High-Frequency Event Handling
```
Test 33Hz polling performance:
1. Monitor a rapidly changing meter control
2. Verify events are captured at 33Hz rate
3. Check for any dropped events
4. Measure database performance impact
5. Test query performance with high-volume data
```

---

## SECTION 7: AUDIO ROUTING & MIXING
Tests complex audio routing scenarios

### Test 7.1: Basic Audio Routing
```
Test routing changes:
1. Use list_components to discover all components
2. Look for router/matrix/crosspoint components in the list
3. If found, use list_controls to get their routing controls
4. Identify current routing configuration
5. Change 4 routing points (if available)
6. Verify routes changed
7. Create a routing preset
Note: Skip if no router/matrix components are found
```

### Test 7.2: Audio Cross-fades
```
Test smooth transitions:
1. Use list_components to find input/channel components
2. Use list_controls to find gain controls on at least 2 channels
3. Set first channel gain to 0 dB
4. Set second channel gain to -60 dB
5. Cross-fade over 3 seconds (first down, second up) using ramp
6. Verify smooth transition completed
Note: Skip if insufficient channel components are found
```

### Test 7.3: Complex Mix Scenarios
```
Test mixing operations:
1. Use list_components to find mixer components
2. Use list_controls to find all input channel controls
3. Set up a standard mix using discovered controls
4. Apply EQ adjustments if EQ controls are found
5. Set up aux sends if aux controls are available
6. Create and recall mix snapshots
Note: Adapt test based on actual components found
```

---

## SECTION 8: ZONE & ROOM CONTROL
Tests multi-zone audio systems

### Test 8.1: Zone Linking
```
Test linked zone control:
1. Use list_components to find zone-related components
2. Use list_controls to find zone volume/mute controls
3. If 5+ zones found, link them together
4. Change master volume on first zone
5. Verify all linked zones follow
6. Unlink and verify independence
Note: Adjust test based on actual zone count found
```

### Test 8.2: Room Combining
```
Test room combine scenarios:
1. Use list_components to find room/partition components
2. Use list_controls to identify combine controls
3. If combinable rooms found, combine first two
4. Verify audio routing adjusted
5. Test combined room volume control
6. Separate rooms and verify isolation
Note: Skip if no room combine components found
```

### Test 8.3: Emergency Mute Scenarios
```
Test emergency procedures:
1. Use list_components to find all output/zone components
2. Use get_control_values to save current state of all mute controls
3. Emergency mute ALL discovered outputs instantly (validate:false)
4. Verify complete silence achieved
5. Gradually restore zones one by one
6. Return to saved state
```

---

## SECTION 9: DSP & PROCESSING CONTROL
Tests audio processing components

### Test 9.1: EQ Control
```
Test equalizer adjustments:
1. Use list_components to find EQ components
2. Use list_controls to find frequency, gain, and Q controls
3. If found, adjust 3 bands
4. Create a "speech intelligibility" preset
5. Create a "music" preset
6. Switch between presets with ramps
Note: Skip if no EQ components found
```

### Test 9.2: Dynamics Processing
```
Test compressor/limiter control:
1. Use list_components to find dynamics processor components
2. Use list_controls to find threshold, ratio, attack, release controls
3. If found, adjust threshold to -20 dB
4. Set ratio to 4:1
5. Adjust attack and release times
6. Monitor gain reduction meter if available
Note: Skip if no dynamics components found
```

### Test 9.3: Acoustic Echo Cancellation
```
Test AEC configuration:
1. Use list_components to find AEC components
2. Use list_controls to find AEC enable/disable and parameter controls
3. If found, enable/disable AEC processing
4. Adjust reference levels if controls available
5. Test non-linear processing settings if available
6. Monitor AEC convergence status if available
Note: Skip if no AEC components found
```

---

## SECTION 10: INTEGRATION & ERROR HANDLING
Tests system integration and error recovery

### Test 10.1: Connection Resilience
```
Test connection recovery:
1. Establish normal connection
2. Simulate network interruption
3. Verify automatic reconnection
4. Check if state synchronized after reconnect
5. Verify no control commands lost
```

### Test 10.2: Invalid Input Handling
```
Test error handling:
1. Send invalid control names
2. Send out-of-range values
3. Send wrong data types
4. Send malformed requests
5. Verify graceful error handling
```

### Test 10.3: Concurrent Operations
```
Test simultaneous operations:
1. Change control A's value
2. Immediately change control B's value
3. Query control C's value
4. Create a change group
5. Verify all operations complete correctly
```

---

## SECTION 11: MCP PROTOCOL TESTING

### Test 11.1: Complete MCP Tool Coverage

**COPY THIS ENTIRE PROMPT TO AGENT:**
```
TEST: Verify All 16 MCP Tools

Please test EVERY MCP tool to ensure all are working:

CORE CONTROL TOOLS (test all 5):
1. list_components - Call with no parameters
2. list_controls - Call with a valid component name
3. get_control_values - Get 3 control values
4. set_control_values - Set 2 controls (validate:false)
5. qsys_component_get - Get details for one component

SYSTEM STATUS (test 1):
6. query_core_status - Call and verify response

CHANGE GROUP TOOLS (test all 7):
7. create_change_group - Create group "test-all-tools"
8. add_controls_to_change_group - Add 2 controls
9. poll_change_group - Poll the group
10. list_change_groups - List all groups
11. remove_controls_from_change_group - Remove 1 control
12. clear_change_group - Clear the group
13. destroy_change_group - Destroy "test-all-tools"

EVENT MONITORING (test both):
14. query_change_events - Query last 10 events
15. get_event_statistics - Get current stats

UTILITY (test 1):
16. query_qsys_api - Send "StatusGet" command

TESTING (test 1):
17. echo - Echo "tool test complete"

EXPECTED OUTPUT FORMAT:
Tool Coverage Checklist:
[ ] 1. list_components - [PASS/FAIL]
[ ] 2. list_controls - [PASS/FAIL]
[ ] 3. get_control_values - [PASS/FAIL]
[ ] 4. set_control_values - [PASS/FAIL]
[ ] 5. qsys_component_get - [PASS/FAIL]
[ ] 6. query_core_status - [PASS/FAIL]
[ ] 7. create_change_group - [PASS/FAIL]
[ ] 8. add_controls_to_change_group - [PASS/FAIL]
[ ] 9. poll_change_group - [PASS/FAIL]
[ ] 10. list_change_groups - [PASS/FAIL]
[ ] 11. remove_controls_from_change_group - [PASS/FAIL]
[ ] 12. clear_change_group - [PASS/FAIL]
[ ] 13. destroy_change_group - [PASS/FAIL]
[ ] 14. query_change_events - [PASS/FAIL]
[ ] 15. get_event_statistics - [PASS/FAIL]
[ ] 16. query_qsys_api - [PASS/FAIL]
[ ] 17. echo - [PASS/FAIL]

Total Working: [X/17]
Failed Tools: [list any that failed]
Overall Result: [PASS if 16+/17, FAIL otherwise]

Report any tools that don't work or return errors.
```

### Test 11.2: Tool Chaining & Integration
```
Test complex tool sequences covering ALL tools:

SEQUENCE 1 - Basic Discovery & Control:
1. echo to verify connection
2. query_core_status to check system health
3. list_components to discover all components
4. list_controls on 3 different components
5. get_control_values on discovered controls
6. set_control_values to modify them

SEQUENCE 2 - Change Groups:
1. create_change_group with ID "test-group"
2. add_controls_to_change_group (add 5 controls)
3. poll_change_group to check for changes
4. list_change_groups to verify it exists
5. remove_controls_from_change_group (remove 2 controls)
6. clear_change_group to empty it
7. destroy_change_group to clean up

SEQUENCE 3 - Event Monitoring:
1. get_event_statistics to check baseline
2. Make 10 control changes
3. query_change_events to retrieve them
4. Filter events by component
5. Filter events by time range
6. get_event_statistics to see updated counts

SEQUENCE 4 - Advanced API:
1. qsys_component_get for detailed component info
2. query_qsys_api with raw "Component.GetControls" command
3. Compare results with list_controls tool
4. Use query_qsys_api for custom commands

SEQUENCE 5 - Complete Tool Coverage:
1. Use echo to test connectivity
2. qsys_component_get for detailed component info
3. Compare with list_controls output
4. Use all 7 change group tools in sequence
5. Query events with various filters
6. Get statistics to verify system state
```

### Test 11.3: Error Response Format
```
Test MCP error handling:
1. Call tools with missing parameters
2. Call tools with invalid parameters
3. Call non-existent tools
4. Verify error format follows MCP spec
5. Check error recovery procedures
```

---

## SECTION 11.5: COMPREHENSIVE TOOL-BY-TOOL VALIDATION
Ensures every single MCP tool is thoroughly tested

### Test 11.5.1: Core Control Tools (5 tools)
```
Test each core control tool exhaustively:

list_components:
- Call with no parameters (list all)
- Call with filter parameters if supported
- Verify response includes component names and types
- Test with non-existent filter

list_controls:
- Call with valid component name
- Call with component containing spaces
- Call with non-existent component (should error)
- Verify control properties returned

get_control_values:
- Get single control value
- Get 10 control values in batch
- Get 100 control values (test limit)
- Get non-existent control (behavior check)
- Mix real and fake controls

set_control_values:
- Set with validate:true (real controls)
- Set with validate:false (real controls)
- Set with validate:true (fake controls)
- Set with validate:false (fake controls)
- Test ramp parameter (0 to 10 seconds)
- Test invalid values (out of range, wrong type)

qsys_component_get:
- Get details for audio component
- Get details for control component
- Get details for video component
- Test with non-existent component
- Compare with list_controls output
```

### Test 11.5.2: System Status Tools (1 tool)
```
query_core_status:
- Call with no parameters
- Check status includes:
  * Core model and version
  * Network information
  * System health metrics
  * Connected clients
- Call repeatedly to check for changes
```

### Test 11.5.3: Complete Change Group Tools (7 tools)
```
Test full change group lifecycle with all 7 tools:

create_change_group:
- Create with simple ID "test1"
- Create with complex ID "test-group-2024"
- Try duplicate ID (should fail)
- Create multiple groups simultaneously

add_controls_to_change_group:
- Add single control with value
- Add 10 controls in batch
- Add control that doesn't exist
- Add to non-existent group

poll_change_group:
- Poll empty group
- Poll after external changes
- Poll non-existent group
- Rapid polling (10 times/second)

remove_controls_from_change_group:
- Remove single control
- Remove multiple controls
- Remove non-existent control
- Remove from empty group

clear_change_group:
- Clear populated group
- Clear empty group
- Clear non-existent group

list_change_groups:
- List with no groups
- List with 1 group
- List with 5 groups
- Verify all properties returned

destroy_change_group:
- Destroy existing group
- Destroy non-existent group
- Destroy and verify with list

Note: Event monitoring for change groups is handled through:
- poll_change_group for detecting external changes
- query_change_events for historical data with changeGroupId filter
- Automatic 33Hz polling captures all control changes
```

### Test 11.5.4: Event Monitoring Tools (2 tools)
```
query_change_events:
- Query all events (no filters)
- Filter by startTime only
- Filter by endTime only
- Filter by time range
- Filter by changeGroupId
- Filter by controlNames array
- Filter by componentNames array
- Test limit (1, 100, 1000, 10000)
- Test offset for pagination
- Combine multiple filters
- Test with no events in range

get_event_statistics:
- Call with no parameters
- Verify statistics include:
  * Total event count
  * Unique control count
  * Database size
  * Active change groups
  * Events per component
  * Hourly distribution
- Call after making changes
- Verify counts update correctly
```

### Test 11.5.5: Utility & Testing Tools (2 tools)
```
query_qsys_api (Utility) - COMPREHENSIVE TESTING:

BASIC COMMANDS:
- Send "Component.GetComponents" with no params to list all components
- Send "Component.GetControls" with {"Name": "ComponentName"} params
- Send "Component.Get" with {"Name": "ComponentName"} to get details
- Send "Control.Get" with control list array
- Send "Control.Set" with control values array

COMPONENT-SPECIFIC COMMANDS:
- Send "Mixer.GetCrosspoints" with mixer component name
- Send "Router.GetStatus" if router component exists
- Send "Snapshot.Load" with snapshot number (if snapshots exist)
- Send "ChangeGroup.Create" with Id parameter
- Send "ChangeGroup.AddControl" with group Id and controls

STATUS & MONITORING:
- Send "StatusGet" with no params for Core status
- Send "Component.GetStatus" with component name
- Send "LogEntry" to add a log entry

ERROR HANDLING:
- Send invalid command like "InvalidCommand" (should error)
- Send valid command with wrong params (should error)
- Send command with malformed JSON params
- Send empty method name
- Test timeout with long-running command

COMPARISON TESTS:
- Send "Component.GetComponents" and compare with list_components tool
- Send "Component.GetControls" and compare with list_controls tool  
- Send "Control.Get" and compare with get_control_values tool
- Send "Control.Set" and compare with set_control_values tool

ADVANCED USAGE:
- Send batch commands if supported
- Test command rate limiting
- Verify response format consistency
- Test with component names containing special characters

echo:
- Echo simple string "test"
- Echo empty string ""
- Echo special characters "!@#$%"
- Echo very long string (1000 chars)
- Echo unicode "Hello 世界 🌍"
- Verify exact echo response
```

---

## SECTION 11.6: RAW Q-SYS API DEEP DIVE
Comprehensive testing of query_qsys_api tool

### Test 11.6.1: Discovery Commands
```
Test component and control discovery via raw API:
1. Use query_qsys_api with "Component.GetComponents" method
2. Parse response to get component list
3. For first 3 components, send "Component.GetControls" with their names
4. Send "Component.Get" for detailed component properties
5. Compare all results with standard MCP tools (list_components, list_controls)
6. Document any differences in response format
```

### Test 11.6.2: Control Operations
```
Test control manipulation via raw API:
1. First use list_controls to find real control names
2. Use query_qsys_api with "Control.Get" method:
   - params: [{"Name": "ComponentName.ControlName"}]
3. Use query_qsys_api with "Control.Set" method:
   - params: [{"Name": "ComponentName.ControlName", "Value": -20}]
4. Test with multiple controls in single command:
   - params: [{"Name": "Control1", "Value": 0}, {"Name": "Control2", "Value": 1}]
5. Test with ramp parameter:
   - params: [{"Name": "ControlName", "Value": -40, "Ramp": 5}]
6. Compare results with get_control_values and set_control_values tools
```

### Test 11.6.3: Change Group Management
```
Test change group operations via raw API:
1. Send "ChangeGroup.Create" with {"Id": "test-api-group"}
2. Send "ChangeGroup.AddControl" with:
   - {"Id": "test-api-group", "Controls": ["Control1", "Control2"]}
3. Send "ChangeGroup.AddComponentControl" for component controls
4. Send "ChangeGroup.Poll" to check for changes
5. Send "ChangeGroup.Clear" to empty the group
6. Send "ChangeGroup.Destroy" to remove it
7. Compare with standard change group tools
```

### Test 11.6.4: System Commands
```
Test system-level commands:
1. Send "StatusGet" for Core status (no params)
2. Send "Component.GetStatus" for component health
3. Send "LogEntry" with message to add system log:
   - params: {"Message": "Test log from MCP"}
4. Send "Design.Get" to get design information
5. Send "Mixer.GetCrosspoints" if mixer components exist
6. Send "Router.GetStatus" if router components exist
7. Document all successful commands for reference
```

### Test 11.6.5: Error Scenarios
```
Test error handling with invalid commands:
1. Send completely invalid method: "This.Does.Not.Exist"
2. Send valid method with wrong params:
   - "Component.GetControls" with {"InvalidParam": "value"}
3. Send malformed params:
   - "Control.Set" with non-JSON params
4. Send empty method: ""
5. Send null params vs empty params vs no params
6. Test very long method names (1000+ chars)
7. Verify all errors are handled gracefully
```

### Test 11.6.6: Performance Comparison
```
Compare raw API vs MCP tools performance:
1. Time 100 operations using get_control_values
2. Time same 100 operations using query_qsys_api with "Control.Get"
3. Time batch operations with both approaches
4. Compare response parsing overhead
5. Identify when to use raw API vs MCP tools
6. Document performance differences
```

---

## SECTION 12: PERFORMANCE & LOAD TESTING
Tests system performance under load

### Test 12.1: Rapid Sequential Updates
```
Test update rate limits:
1. Use list_components and list_controls to find a single gain control
2. Get its current value and save it
3. Update it 100 times rapidly (different values)
4. Measure total time and success rate
5. Calculate updates per second
6. Identify any rate limiting
7. Restore original value
```

### Test 12.2: Parallel Operations
```
Test concurrent load:
1. Start 5 long ramps (10 seconds each)
2. While ramping, perform 20 instant sets
3. While setting, query 30 values
4. Monitor response times
5. Check for any timeouts or failures
```

### Test 12.3: Memory & Resource Usage
```
Test resource consumption:
1. Monitor baseline memory usage
2. Perform 1000 operations
3. Check memory after operations
4. Wait for garbage collection
5. Verify no memory leaks
```

---

## SECTION 13: ADVANCED SCENARIOS
Tests complex real-world use cases

### Test 13.1: Conference Room Automation
```
Simulate conference room control:
1. Use list_components to discover all audio components
2. Use list_controls to identify mic, speaker, and AEC controls
3. Set up "Meeting Start" sequence:
   - Find and unmute microphone controls
   - Find and set speaker gain controls to -12 dB
   - Enable AEC if AEC controls found
   - Adjust any lighting controls if found
4. Create "Presentation Mode":
   - Mute all discovered mic controls except one
   - Route audio if routing controls found
   - Adjust EQ if EQ controls found
5. Implement "Meeting End":
   - Mute all discovered audio outputs
   - Reset controls to original values
   - Use query_change_events to log changes
```

### Test 13.2: Live Event Management
```
Simulate live event control using all relevant tools:
1. Sound check sequence:
   - Use list_components to find input channels
   - Use get_control_values to check current state
   - Use set_control_values to enable channels sequentially
   - Use query_qsys_api for custom DSP commands
2. Show start:
   - create_change_group "show-start"
   - add_controls_to_change_group for all show controls
   - Use set_control_values with ramps for smooth transitions
   - poll_change_group to monitor
3. Emergency stop:
   - Use set_control_values without validation for speed
   - query_change_events to log what happened
   - get_event_statistics for incident report
4. Post-show:
   - destroy_change_group "show-start"
   - Use query_change_events to review all changes
```

### Test 13.3: Multi-Room Audio Distribution
```
Test distributed audio system:
1. Use list_components to find all zone/room components
2. Use list_controls to find source selection and volume controls
3. Configure discovered zones with different sources (up to 8)
4. Implement "All Page" override on all found zones
5. Test priority ducking if ducking controls found
6. Create day/night presets for discovered zones
7. Test scheduled transitions
Note: Adapt to actual zone count found
```

---

## SECTION 14: SECURITY & VALIDATION
Tests security measures and input validation

### Test 14.1: Input Sanitization
```
Test dangerous inputs:
1. Try SQL injection in control names
2. Try path traversal in component names
3. Send oversized payloads
4. Test unicode and special characters
5. Verify all inputs sanitized
```

### Test 14.2: Authentication & Authorization
```
Test access control:
1. Verify connection requires credentials
2. Test invalid credentials
3. Check credential timeout
4. Test concurrent sessions
5. Verify secure credential storage
```

### Test 14.3: Rate Limiting & DoS Protection
```
Test abuse prevention:
1. Send 1000 requests rapidly
2. Check if rate limiting engages
3. Test recovery after rate limit
4. Verify no service disruption
5. Check resource consumption
```

---

## Q-SYS API COMMAND REFERENCE
Quick reference for query_qsys_api tool usage

### Common Commands
```javascript
// Component Discovery
{"method": "Component.GetComponents", "params": {}}

// Get controls for a specific component  
{"method": "Component.GetControls", "params": {"Name": "ComponentName"}}

// Get component details
{"method": "Component.Get", "params": {"Name": "ComponentName"}}

// Get control values (single)
{"method": "Control.Get", "params": [{"Name": "ComponentName.ControlName"}]}

// Get control values (multiple)
{"method": "Control.Get", "params": [
  {"Name": "Component1.Control1"},
  {"Name": "Component2.Control2"}
]}

// Set control value
{"method": "Control.Set", "params": [{"Name": "ComponentName.ControlName", "Value": -20}]}

// Set control with ramp
{"method": "Control.Set", "params": [{"Name": "ComponentName.ControlName", "Value": -40, "Ramp": 5}]}

// Get Core status
{"method": "StatusGet", "params": {}}

// Create change group
{"method": "ChangeGroup.Create", "params": {"Id": "group-id"}}

// Add controls to change group
{"method": "ChangeGroup.AddControl", "params": {
  "Id": "group-id",
  "Controls": ["Control1", "Control2"]
}}

// Poll change group
{"method": "ChangeGroup.Poll", "params": {"Id": "group-id"}}

// Destroy change group
{"method": "ChangeGroup.Destroy", "params": {"Id": "group-id"}}

// Add log entry
{"method": "LogEntry", "params": {"Message": "Log message here"}}
```

### Usage Examples
```
# Example 1: Get all components
Use query_qsys_api with method "Component.GetComponents" and empty params {}

# Example 2: Get specific control value
Use query_qsys_api with method "Control.Get" and params [{"Name": "Gain1.gain"}]

# Example 3: Set multiple controls
Use query_qsys_api with method "Control.Set" and params:
[
  {"Name": "Gain1.gain", "Value": -10},
  {"Name": "Gain1.mute", "Value": true}
]

# Example 4: Set with ramp
Use query_qsys_api with method "Control.Set" and params:
[{"Name": "Gain1.gain", "Value": -30, "Ramp": 3}]
```

---

## SECTION 15: COMPREHENSIVE SYSTEM VALIDATION
Complete end-to-end system testing

### Test 15.1: Full System Diagnostic
```
Complete system check:
1. DISCOVERY PHASE:
   - Count all components and controls
   - Identify all control types
   - Map component relationships

2. VALIDATION PHASE:
   - Test 10% of all controls
   - Verify value ranges
   - Check response times

3. PERFORMANCE PHASE:
   - Batch operations on 50 controls
   - Measure average response time
   - Test maximum throughput

4. RELIABILITY PHASE:
   - 100 random operations
   - Check success rate
   - Identify any failures

5. REPORT GENERATION:
   - Total controls tested
   - Average response time
   - Success percentage
   - Recommendations
```

### Test 15.2: Production Readiness Check
```
Verify production readiness:
1. Connection stability (1 hour test)
2. Memory leak detection
3. Error recovery validation
4. Concurrent user simulation
5. Backup and restore procedures
6. Event monitoring integrity
7. Performance benchmarks
8. Security audit
9. Documentation completeness
10. Generate readiness report
```

### Test 15.3: Stress Test Ultimate
```
Maximum stress test:
1. Connect to largest available Q-SYS system
2. Discover ALL components (may be 100+)
3. Monitor 50 high-frequency controls
4. Perform 500 control changes
5. Query 10,000 historical events
6. Create 10 change groups
7. Execute 5 parallel cross-fades
8. Maintain all operations for 30 minutes
9. Verify no degradation
10. Generate performance report
```

---

## QUICK VALIDATION SEQUENCES

### Quick Health Check (2 minutes)
```
1. echo "test" - Verify MCP connection
2. query_core_status - Check Q-SYS health
3. list_components - Get first 5 components
4. get_control_values - Read 10 controls
5. set_control_values - Modify 5 controls
6. query_change_events - Get last 10 events
7. get_event_statistics - Check monitoring status
```

### Standard Validation (5 minutes)
```
1. echo and query_core_status - System check
2. list_components - Full discovery
3. list_controls - Sample 5 components
4. get/set_control_values - Test 20 operations
5. create/add/poll/destroy_change_group - Full cycle
6. query_change_events - Verify monitoring
7. get_event_statistics - Check statistics
8. query_qsys_api - Test raw API access
```

### Comprehensive Validation (15 minutes)
```
1. TEST ALL 16 TOOLS:
   - echo - Connection test
   - query_core_status - System health
   - list_components - Full discovery
   - list_controls - All component types
   - get_control_values - Various batches
   - set_control_values - With/without validation
   - qsys_component_get - Detailed info
   - create_change_group - Multiple groups
   - add_controls_to_change_group - Batch adds
   - poll_change_group - Monitor changes
   - remove_controls_from_change_group - Partial removal
   - clear_change_group - Full clear
   - list_change_groups - Verify management
   - destroy_change_group - Cleanup
   - query_change_events - Historical data
   - get_event_statistics - Full stats
   - query_qsys_api - Custom commands
   
2. INTEGRATION TESTS:
   - Tool chaining scenarios
   - Error handling for each tool
   - Performance metrics per tool
   - Concurrent tool usage
```

---

## EXPECTED OUTCOMES & SCORING

### Critical Features (Must Pass)
- ✅ Connection establishment
- ✅ Component discovery
- ✅ Basic get/set operations
- ✅ Event monitoring
- ✅ Error handling

### Important Features (Should Pass)
- ✅ Batch operations
- ✅ Validation behavior
- ✅ State management
- ✅ Change groups
- ✅ Performance targets

### Advanced Features (Nice to Have)
- ✅ Complex routing
- ✅ Cross-fades
- ✅ Emergency procedures
- ✅ High-frequency monitoring
- ✅ Production optimizations

### Scoring Guide
- 90-100%: Production ready
- 70-89%: Beta ready with known issues
- 50-69%: Alpha testing only
- Below 50%: Development phase

---

## TROUBLESHOOTING GUIDE

### Common Issues and Solutions

#### Connection Failures
- Verify Q-SYS Core IP and port
- Check firewall settings
- Validate credentials
- Test network connectivity

#### Validation Errors
- Use validate:false as workaround
- Implement manual validation
- Check control name format
- Verify component names

#### Performance Issues
- Reduce batch sizes
- Disable validation
- Check network latency
- Monitor resource usage

#### Event Monitoring Issues
- Verify EVENT_MONITORING_ENABLED=true
- Check database permissions
- Monitor disk space
- Validate query parameters

---

## REPORTING TEMPLATE

### Test Report Format
```
Test Name: [Test X.X: Description]
Date: [YYYY-MM-DD HH:MM:SS]
Environment: [Development/Staging/Production]

SETUP:
- Q-SYS Core Version: [X.X.X]
- Component Count: [N]
- Control Count: [N]

EXECUTION:
- Step 1: [Result]
- Step 2: [Result]
- Step 3: [Result]

RESULTS:
- Success Rate: [X%]
- Average Response: [Xms]
- Errors Encountered: [List]

RECOMMENDATIONS:
- [Action items]
- [Improvements needed]
- [Follow-up tests]
```

---

## AUTOMATION SCRIPTS

### Automated Test Runner
```javascript
// Example automation script structure
async function runTestSuite() {
  const results = [];
  
  // Run each test section
  results.push(await runSection1Tests());
  results.push(await runSection2Tests());
  // ... continue for all sections
  
  // Generate report
  generateReport(results);
  
  // Calculate score
  const score = calculateScore(results);
  console.log(`Overall Score: ${score}%`);
}
```

### Continuous Validation
```javascript
// Run key tests every hour
setInterval(async () => {
  await runQuickHealthCheck();
  await checkEventMonitoring();
  await validateConnectionStatus();
}, 3600000);
```

---

## QUICK TEST SUMMARY

### Priority 1: Core Functionality (Must Pass)
1. **Test 1.1** - Initial Connection Verification
2. **Test 2.1** - Simple Get Operations  
3. **Test 2.2** - Simple Set Operations
4. **Test 11.1** - Complete MCP Tool Coverage (all 17 tools)

### Priority 2: Critical Features (Should Pass)
5. **Test 3.1** - Small Batch Operations
6. **Test 3.2** - Validation Comparison
7. **Test 5.2** - Change Group Management (all 7 tools)
8. **Test 6.1** - Basic Event Monitoring
9. **Test 6.2** - Event Query Filtering

### Priority 3: Advanced Features (Nice to Have)
10. **Test 2.3** - Ramp Testing
11. **Test 3.3** - Maximum Batch Limits
12. **Test 6.3** - Event Statistics Analysis

## HOW TO USE THIS GUIDE

1. **Copy the entire prompt block** for each test (everything in the code block)
2. **Paste to your MCP agent** exactly as formatted
3. **Wait for the agent's response** with test results
4. **Copy the agent's response** back here for analysis
5. **We'll fix any issues** found and re-test

## SCORING CRITERIA

- **PASS**: Tool works as expected with correct output
- **FAIL**: Tool errors, returns unexpected data, or doesn't work
- **PARTIAL**: Tool works but with limitations or workarounds needed

## CONCLUSION

This testing guide is optimized for the workflow where:
- You copy individual test prompts to an MCP agent
- The agent executes and reports detailed results
- You bring back the results for fixes/improvements
- We iterate until all tests pass

Start with Priority 1 tests to ensure core functionality, then proceed to Priority 2 and 3 as needed.