# Test Prompts v1 - Comprehensive MCP Tool Testing Guide
## Q-SYS MCP Server Complete Validation Suite

This document contains comprehensive test prompts for all 18 MCP tools. Each prompt is designed to be copied and pasted directly into an MCP agent chat for execution.

**IMPORTANT**: Every test session MUST start with connection verification. The agent will check connection status and establish/verify connection before proceeding with tests.

**INTERACTIVE REQUIREMENTS**: These tests require user interaction at key points:
- The agent will ASK for Q-SYS Core IP address when not connected
- The agent will ASK for confirmation or alternate IPs when testing connection switching
- Never provide IP addresses in the initial prompt - let the agent ask for them
- Always respond to agent questions with actual IP addresses from your network

---

## CONNECTION SETUP (MANDATORY FIRST STEP)

### Test 0.1: Initial Connection Verification and Setup

```
TEST: Connection Verification and Setup

IMPORTANT: If not connected, ASK FOR IP FIRST before showing any test reports.
NOTE: Use "connect" action to connect to any Core (automatically handles switching if already connected).

Please execute the following connection verification steps:

1. Use manage_connection with action "status" to check current connection
2. If connected:
   - Report Core IP, status, and component count
   - Proceed to next test
3. If disconnected:
   - IMMEDIATELY ask the user (no test report needed yet):
     "No Q-SYS Core connection detected. Please provide the IP address of your Q-SYS Core (e.g., 192.168.1.100):"
   - WAIT for user to provide IP address (just the question, nothing else)
   - Once IP is provided, use manage_connection with action "connect" and parameters: 
     {host: "[provided IP]", port: 443}
     Note: connect action takes host directly, not in a target object
   - If connect fails, check the error message for details
   - After connection attempt, use action "status" to verify
   - THEN provide the complete test report
4. If connection still fails after receiving IP:
   - Check the error message from the connect action
   - Ask: "Cannot reach [IP]. Please verify:
     - Q-SYS Core is powered on at [IP]
     - You can ping [IP] from your network
     Provide different IP or 'skip' to stop:"
   - If new IP provided, return to step 3
   - If 'skip', show brief connection error and stop

EXPECTED OUTPUT:
- Connection Status: [connected/disconnected]
- Core IP: [IP address if connected]
- Component Count: [number if connected]
- User Interaction: [IP requested and received]
- Diagnostic Results: [if connection failed]
- Action Taken: [connected/reconnected/failed]

IMPORTANT: Do not proceed with other tests until connection is confirmed.
IMPORTANT: You MUST ask for the IP address interactively - do not guess or use placeholder IPs.
```

### Test 0.2: Mid-Test Connection Recovery

```
TEST: Connection Recovery During Testing

If connection is lost during testing:

1. IMMEDIATELY ask (no lengthy reports):
   "Connection lost. Provide Q-SYS Core IP to reconnect (or 'skip' to stop):"
   
2. If IP provided:
   - Connect using manage_connection
   - Ask: "Connected. Continue testing? (yes/no)"
   
3. If 'skip':
   - Show brief summary of completed tests only

IMPORTANT: Keep it simple - just ask for what you need.
```

---

## SECTION 1: CONNECTION MANAGEMENT TOOL (3 Actions)

### Test 1.1: Status Action Tests (3 Scenarios)

```
TEST 1.1: Status Action

Execute these 3 status check scenarios:

1. Check Status When Connected:
   - Use manage_connection with action "status"
   - Record: connected (true/false), host, port, uptime, message

2. Check Status When Disconnected:
   - First use action "disconnect" to ensure disconnected
   - Then use action "status"
   - Verify it shows connected: false

3. Check Status After Connect:
   - Use action "connect" with host from initial connection
   - Then use action "status"
   - Verify it shows connected: true and correct host

REPORT FORMAT:
- Scenario 1: Connected Status = [connected/host/port/uptime]
- Scenario 2: Disconnected Status = [connected: false confirmed]
- Scenario 3: Post-Connect Status = [connected: true, correct host]
- Overall Result: [PASS/FAIL]
```

### Test 1.2: Connect Action Tests (4 Scenarios)

```
TEST 1.2: Connect Action

Execute these 4 connect scenarios:

1. Connect with Host Only:
   - Use manage_connection with action "connect" and host: [current Core IP]
   - Verify connection succeeds with default port 443

2. Connect with Custom Port:
   - Use action "connect" with host: [current Core IP] and port: 443
   - Verify connection with specified port

3. Switch Cores (Interactive):
   - ASK user: "Would you like to test switching to a different Q-SYS Core? If yes, provide alternate IP (or 'skip'):"
   - If IP provided: Use action "connect" with host: "[user IP]"
   - Note: connect automatically handles switching if already connected
   - If 'skip': Note as "Core switch test skipped by user"
   - Document success or failure

4. Connect to Invalid Host:
   - Use action "connect" with host: "999.999.999.999"
   - Verify proper error handling and message

REPORT FORMAT:
- Scenario 1: Basic Connect = [success/host/port]
- Scenario 2: Custom Port = [success with specified port]
- Scenario 3: Core Switch = [switched successfully or skipped]
- Scenario 4: Invalid Host = [error handled properly]
- Overall Result: [PASS/FAIL]
```

### Test 1.3: Disconnect Action Tests (3 Scenarios)

```
TEST 1.3: Disconnect Action

Execute these 3 disconnect scenarios:

1. Disconnect When Connected:
   - Ensure connected first (use status to check)
   - Use manage_connection with action "disconnect"
   - Verify disconnection succeeds

2. Disconnect When Already Disconnected:
   - Ensure already disconnected
   - Use action "disconnect" again
   - Verify no errors occur

3. Reconnect After Disconnect:
   - Use action "disconnect"
   - Then immediately use action "connect" with previous host
   - Verify reconnection works
   - Measure reconnection time

REPORT FORMAT:
- Scenario 1: Disconnect Connected = [success]
- Scenario 2: Disconnect Disconnected = [no errors]
- Scenario 3: Reconnect Speed = [time in ms]
- Overall Result: [PASS/FAIL]
```

---

## SECTION 2: CORE CONTROL TOOLS (5 Tools)

### Test 2.1: List Components (5 Scenarios)

```
TEST 2.1: Component Discovery

Execute these 5 component discovery scenarios:

1. List All Components:
   - Use list_components with no parameters
   - Count total components found

2. Filter by Type Pattern:
   - Look for components with "gain" in the name
   - Count filtered results

3. Audio Components:
   - Find all audio-related components (mixer, gain, compressor)
   - Categorize by function

4. Video Components:
   - Find video/display components if any
   - Note component types

5. Control Components:
   - Find UCI, custom control, logic components
   - Document control architecture

REPORT FORMAT:
- Scenario 1: Total Components = [count]
- Scenario 2: Gain Components = [count]
- Scenario 3: Audio Types = [list types with counts]
- Scenario 4: Video Types = [list or "none found"]
- Scenario 5: Control Types = [list types]
- Component Naming Pattern: [describe]
- Overall Result: [PASS/FAIL]
```

### Test 2.2: List Controls (5 Scenarios)

```
TEST 2.2: Control Enumeration

Execute these 5 control listing scenarios:

1. Simple Component Controls:
   - Pick first component from list_components
   - Use list_controls to get all its controls
   - Count and categorize controls

2. Complex Component Controls:
   - Find a mixer or router component
   - List all controls
   - Identify control patterns

3. Named vs Component Controls:
   - Test different control name formats
   - Document naming conventions

4. Control Metadata:
   - Check for min/max values
   - Look for control types and units

5. Empty Component Test:
   - Find component with no controls (if any)
   - Verify behavior

REPORT FORMAT:
- Scenario 1: Simple Controls = [count, types]
- Scenario 2: Complex Controls = [count, patterns]
- Scenario 3: Naming Format = [format observed]
- Scenario 4: Metadata Found = [yes/no, details]
- Scenario 5: Empty Component = [behavior noted]
- Control Architecture: [describe]
- Overall Result: [PASS/FAIL]
```

### Test 2.3: Get Control Values (5 Scenarios)

```
TEST 2.3: Control Value Retrieval

Execute these 5 value retrieval scenarios:

1. Single Control Value:
   - Get one gain control value
   - Verify value type and range

2. Batch Retrieval (10 controls):
   - Get 10 control values in one call
   - Measure response time

3. Mixed Control Types:
   - Get gain, mute, and position values
   - Document value formats

4. Maximum Batch (50 controls):
   - Try getting 50 controls at once
   - Check for limits or errors

5. Non-existent Control:
   - Try getting fake control name
   - Document error handling

REPORT FORMAT:
- Scenario 1: Single Value = [value, type]
- Scenario 2: Batch (10) = [success, time]
- Scenario 3: Mixed Types = [formats documented]
- Scenario 4: Large Batch (50) = [success/fail]
- Scenario 5: Invalid Control = [error handled correctly]
- Performance: [response times]
- Overall Result: [PASS/FAIL]
```

### Test 2.4: Set Control Values (5 Scenarios)

```
TEST 2.4: Control Value Setting

Execute these 5 value setting scenarios:

1. Simple Set with Validation:
   - Set one gain to -20 with validate: true
   - Verify change applied

2. Batch Set without Validation:
   - Set 5 controls with validate: false
   - Measure speed difference

3. Mixed Value Types:
   - Set number, boolean, and string values
   - Verify all types work

4. Boundary Testing:
   - Set values at min/max limits
   - Check clamping behavior

5. Invalid Values:
   - Try setting out-of-range values
   - Document handling

REPORT FORMAT:
- Scenario 1: Validated Set = [success, time]
- Scenario 2: Batch Unvalidated = [success, faster?]
- Scenario 3: Mixed Types = [all working?]
- Scenario 4: Boundaries = [clamped correctly?]
- Scenario 5: Invalid Values = [handled properly?]
- Validation Impact: [performance difference]
- Overall Result: [PASS/FAIL]
```

### Test 2.5: Component Get (5 Scenarios)

```
TEST 2.5: Component Details Retrieval

Execute these 5 component detail scenarios:

1. Audio Component Details:
   - Use qsys_component_get on a mixer
   - Compare with individual get_control_values

2. Control Component Details:
   - Get details for UCI or custom control
   - Document all properties returned

3. Efficiency Comparison:
   - Time qsys_component_get vs multiple get_control_values
   - Calculate performance gain

4. Metadata Completeness:
   - Check for position, color, metadata
   - Document what's included

5. Large Component Test:
   - Get details for component with 20+ controls
   - Verify completeness

REPORT FORMAT:
- Scenario 1: Audio Details = [complete/partial]
- Scenario 2: Control Details = [properties listed]
- Scenario 3: Efficiency = [X% faster/slower]
- Scenario 4: Metadata = [included items]
- Scenario 5: Large Component = [all controls retrieved?]
- Best Use Case: [when to use this tool]
- Overall Result: [PASS/FAIL]
```

---

## SECTION 3: SYSTEM STATUS TOOL

### Test 3.1: Core Status Monitoring (5 Scenarios)

```
TEST 3.1: System Status Monitoring

Execute these 5 status monitoring scenarios:

1. Basic Status Query:
   - Use query_core_status
   - Document all fields returned

2. Status During Load:
   - Make 10 rapid control changes
   - Check status for performance impact

3. Error Detection:
   - Check for any system errors or warnings
   - Document status indicators

4. Component Count Verification:
   - Compare count with list_components
   - Verify consistency

5. Continuous Monitoring:
   - Query status 5 times over 30 seconds
   - Look for changes or stability

REPORT FORMAT:
- Scenario 1: Fields Available = [list all fields]
- Scenario 2: Under Load = [performance impact?]
- Scenario 3: Errors/Warnings = [none/list any]
- Scenario 4: Count Match = [consistent?]
- Scenario 5: Stability = [stable/changing]
- Missing Information: [note any gaps]
- Overall Result: [PASS/FAIL]
```

---

## SECTION 4: CHANGE GROUP TOOLS (7 Tools)

### Test 4.1: Change Group Lifecycle (5 Scenarios)

```
TEST 4.1: Complete Change Group Operations

Execute these 5 change group scenarios using ALL 7 tools:

1. Create and Populate Group:
   - Use create_change_group with id "test-group-1"
   - Use add_controls_to_change_group to add 5 controls
   - Use list_change_groups to verify

2. Polling and Monitoring:
   - Make external changes to controls
   - Use poll_change_group with showAll: true
   - Document changes detected

3. Modify Group Contents:
   - Use remove_controls_from_change_group to remove 2 controls
   - Use add_controls_to_change_group to add 3 different ones
   - Verify with list_change_groups

4. Clear and Repopulate:
   - Use clear_change_group to empty
   - Add new controls
   - Poll to verify working

5. Cleanup:
   - Use destroy_change_group
   - Verify with list_change_groups
   - Confirm complete removal

REPORT FORMAT:
- Scenario 1: Create/Add = [success, 5 controls added]
- Scenario 2: Poll Changes = [changes detected?]
- Scenario 3: Modify = [remove 2, add 3 success?]
- Scenario 4: Clear/Repopulate = [working?]
- Scenario 5: Destroy = [removed completely?]
- All 7 Tools Tested: [checklist]
- Overall Result: [PASS/FAIL]
```

### Test 4.2: Multiple Change Groups (5 Scenarios)

```
TEST 4.2: Multiple Change Group Management

Execute these 5 multiple group scenarios:

1. Create 3 Groups:
   - Create "audio-monitor", "video-monitor", "control-monitor"
   - Add appropriate controls to each

2. Simultaneous Polling:
   - Poll all 3 groups
   - Check for interference

3. Selective Operations:
   - Clear only "video-monitor"
   - Remove controls from "audio-monitor"
   - Leave "control-monitor" unchanged

4. List and Verify:
   - Use list_change_groups
   - Verify all 3 groups and their states

5. Cleanup All:
   - Destroy all 3 groups
   - Verify complete cleanup

REPORT FORMAT:
- Scenario 1: 3 Groups Created = [success]
- Scenario 2: Simultaneous Poll = [no interference?]
- Scenario 3: Selective Ops = [correct groups affected?]
- Scenario 4: List Shows = [all 3 with correct states?]
- Scenario 5: All Destroyed = [confirmed clean]
- Max Groups Tested: 3
- Overall Result: [PASS/FAIL]
```

### Test 4.3: Change Group Edge Cases (5 Scenarios)

```
TEST 4.3: Change Group Edge Cases

Execute these 5 edge case scenarios:

1. Duplicate Group ID:
   - Create group "duplicate-test"
   - Try creating another with same ID
   - Verify error handling

2. Non-existent Group Operations:
   - Try to poll non-existent group
   - Try to add controls to fake group
   - Document errors

3. Empty Group Polling:
   - Create group with no controls
   - Poll it
   - Check behavior

4. Large Control Set:
   - Add 50 controls to one group
   - Poll and measure performance

5. Rapid Create/Destroy:
   - Create and destroy 5 groups rapidly
   - Check for resource leaks

REPORT FORMAT:
- Scenario 1: Duplicate ID = [properly rejected?]
- Scenario 2: Invalid Group = [errors clear?]
- Scenario 3: Empty Poll = [handled correctly?]
- Scenario 4: 50 Controls = [performance acceptable?]
- Scenario 5: Rapid Ops = [stable?]
- Error Messages: [helpful/confusing]
- Overall Result: [PASS/FAIL]
```

---

## SECTION 5: EVENT MONITORING TOOLS (2 Tools)

### Test 5.1: Event Recording and Querying (5 Scenarios)

```
TEST 5.1: Event Monitoring System

Execute these 5 event monitoring scenarios:

1. Baseline Statistics:
   - Use get_event_statistics
   - Record current event count

2. Generate Events:
   - Create change group "event-test"
   - Add 5 controls and make changes
   - Poll to record events

3. Query Recent Events:
   - Use query_change_events with no filters
   - Verify your changes appear

4. Filtered Queries:
   - Query with componentNames filter
   - Query with limit: 10
   - Query last 60 seconds only

5. Statistics Update:
   - Use get_event_statistics again
   - Verify count increased
   - Check component breakdown

REPORT FORMAT:
- Scenario 1: Baseline Count = [number]
- Scenario 2: Events Generated = [success]
- Scenario 3: Events Found = [your changes present?]
- Scenario 4: Filters Work = [correct filtering?]
- Scenario 5: Count Increased = [by how much?]
- Monitoring Active: [yes/no]
- Overall Result: [PASS/FAIL]
```

### Test 5.2: Advanced Event Queries (5 Scenarios)

```
TEST 5.2: Advanced Event Analysis

Execute these 5 advanced query scenarios:

1. Time Range Query:
   - Query events from last 5 minutes
   - Count events in range

2. Component-Specific History:
   - Query events for one specific component
   - Analyze change patterns

3. Pagination Test:
   - Query with limit: 20 and offset: 0
   - Then offset: 20
   - Verify pagination works

4. Change Group Filtering:
   - Query events by changeGroupId
   - Verify correct association

5. Statistical Analysis:
   - Get event statistics
   - Identify most active component
   - Check hourly distribution

REPORT FORMAT:
- Scenario 1: 5-min Events = [count]
- Scenario 2: Component History = [pattern found]
- Scenario 3: Pagination = [working correctly?]
- Scenario 4: Group Filter = [accurate?]
- Scenario 5: Most Active = [component name]
- Database Size: [from statistics]
- Overall Result: [PASS/FAIL]
```

---

## SECTION 6: UTILITY AND TESTING TOOLS

### Test 6.1: API Documentation Tool (5 Scenarios)

```
TEST 6.1: API Documentation Access

Execute these 5 documentation scenarios:

1. List All Tools:
   - Use get_api_documentation with query_type "tools"
   - Verify all 18 tools documented

2. Method Reference:
   - Query with query_type "methods"
   - Check method_category "Control"

3. Component Documentation:
   - Query with query_type "components"
   - Look for mixer and gain docs

4. Search Functionality:
   - Search for "mute" across docs
   - Search for "validation"

5. Examples:
   - Query with query_type "examples"
   - Verify examples are runnable

REPORT FORMAT:
- Scenario 1: Tools Documented = [18/18?]
- Scenario 2: Control Methods = [count found]
- Scenario 3: Component Docs = [complete?]
- Scenario 4: Search Works = [relevant results?]
- Scenario 5: Examples = [useful/outdated?]
- Documentation Quality: [good/needs work]
- Overall Result: [PASS/FAIL]
```

### Test 6.2: Echo Test Tool (5 Scenarios)

```
TEST 6.2: Echo Connectivity Test

Execute these 5 echo test scenarios:

1. Simple Echo:
   - Use echo with message "test"
   - Verify exact echo

2. Empty String:
   - Echo empty string ""
   - Check handling

3. Special Characters:
   - Echo "!@#$%^&*()"
   - Verify preservation

4. Unicode Test:
   - Echo "Hello 世界 🌍"
   - Check unicode support

5. Long String:
   - Echo 500 character string
   - Verify no truncation

REPORT FORMAT:
- Scenario 1: Simple = [exact match?]
- Scenario 2: Empty = [handled?]
- Scenario 3: Special = [preserved?]
- Scenario 4: Unicode = [supported?]
- Scenario 5: Long String = [complete?]
- Echo Reliability: 100%?
- Overall Result: [PASS/FAIL]
```

---

## SECTION 7: INTEGRATION TESTING

### Test 7.1: Tool Chaining and Dependencies (5 Scenarios)

```
TEST 7.1: Complex Tool Integration

Execute these 5 integration scenarios:

1. Discovery Chain:
   - list_components → list_controls → get_control_values
   - Verify data flows correctly

2. Change Monitoring Chain:
   - create_change_group → add_controls → set values → poll → query_events
   - Verify events recorded

3. Status Verification Chain:
   - set_control_values → query_core_status → get_control_values
   - Verify consistency

4. Documentation Integration:
   - get_api_documentation for method
   - Execute that method
   - Verify docs accurate

5. Error Recovery Chain:
   - Trigger error (bad control name)
   - Check manage_connection status
   - Verify no connection impact

REPORT FORMAT:
- Scenario 1: Discovery Chain = [data consistent?]
- Scenario 2: Monitoring Chain = [events captured?]
- Scenario 3: Status Chain = [values match?]
- Scenario 4: Docs Accurate = [method worked as documented?]
- Scenario 5: Error Isolated = [connection stable?]
- Integration Issues: [none/list issues]
- Overall Result: [PASS/FAIL]
```

---

## SECTION 8: PERFORMANCE TESTING

### Test 8.1: Load and Stress Testing (5 Scenarios)

```
TEST 8.1: System Performance Under Load

Execute these 5 performance scenarios:

1. Rapid Sequential Operations:
   - Execute 50 get_control_values rapidly
   - Measure average response time

2. Large Batch Operations:
   - Get 100 controls in one call
   - Set 50 controls in one call
   - Compare times

3. Concurrent Tool Usage:
   - Run 5 different tools simultaneously
   - Check for conflicts

4. Sustained Load (1 minute):
   - Continuous operations for 60 seconds
   - Monitor for degradation

5. Recovery After Load:
   - Stop all operations
   - Measure recovery time
   - Verify normal operation

REPORT FORMAT:
- Scenario 1: 50 Gets = [avg time, total time]
- Scenario 2: Batch 100/50 = [get time, set time]
- Scenario 3: Concurrent = [conflicts found?]
- Scenario 4: Sustained = [stable/degraded?]
- Scenario 5: Recovery = [time to normal]
- Performance Grade: [A/B/C/D/F]
- Overall Result: [PASS/FAIL]
```

---

## SECTION 9: ERROR HANDLING AND RECOVERY

### Test 9.1: Error Handling Validation (5 Scenarios)

```
TEST 9.1: Comprehensive Error Handling

Execute these 5 error handling scenarios:

1. Invalid Tool Parameters:
   - Call tools with wrong parameter types
   - Verify error messages are helpful

2. Network Interruption Simulation:
   - Make requests during connection issues
   - Check graceful degradation

3. Invalid Control Names:
   - Use fake component and control names
   - Verify clear error reporting

4. Resource Limits:
   - Try exceeding limits (1000 control batch)
   - Check error handling

5. Malformed Requests:
   - Send requests with missing required fields
   - Verify validation works

REPORT FORMAT:
- Scenario 1: Parameter Errors = [clear messages?]
- Scenario 2: Network Errors = [handled gracefully?]
- Scenario 3: Invalid Names = [specific errors?]
- Scenario 4: Limit Errors = [informative?]
- Scenario 5: Validation = [catches all issues?]
- Error Quality: [helpful/confusing]
- Overall Result: [PASS/FAIL]
```

---

## SECTION 10: COMPREHENSIVE VALIDATION

### Test 10.1: Complete System Validation (Final Test)

```
TEST 10.1: Full System Validation

This is the final comprehensive test. Execute all steps and provide detailed summary:

1. CONNECTION VERIFICATION:
   - Verify connection with manage_connection
   - Run diagnostics
   - Check history for issues

2. TOOL COVERAGE CHECK:
   - Confirm all 18 tools are available
   - Test one operation from each tool
   - Note any tools that fail

3. PERFORMANCE BASELINE:
   - Measure response times for common operations
   - Document baseline metrics

4. INTEGRATION TEST:
   - Complete workflow from discovery to monitoring
   - Verify all data flows correctly

5. FINAL REPORT:
   Generate comprehensive report with:
   - Tools tested: X/18
   - Tests passed: X/total
   - Performance grade
   - Production readiness assessment
   - Recommendations for improvements

EXPECTED OUTPUT:
=== FINAL VALIDATION REPORT ===

CONNECTION:
- Status: [connected/issues]
- Diagnostics: [pass/fail]
- Stability: [stable/unstable]

TOOL COVERAGE:
- Available Tools: [18/18]
- Working Tools: [X/18]
- Failed Tools: [list any]

PERFORMANCE:
- Average Response: [Xms]
- Batch Performance: [good/fair/poor]
- Under Load: [stable/degraded]

INTEGRATION:
- Data Flow: [consistent/issues]
- Error Handling: [robust/weak]
- Recovery: [automatic/manual]

PRODUCTION READINESS:
- Score: [X/100]
- Grade: [A/B/C/D/F]
- Status: [Ready/Not Ready]

CRITICAL ISSUES:
[List any blockers]

RECOMMENDATIONS:
[Top 3 improvements needed]

=== END REPORT ===
```

---

## TEST EXECUTION INSTRUCTIONS

### For Test Operators:

1. **Always start with Test 0.1** (Connection Verification)
2. **Copy entire test blocks** including the expected output format
3. **Wait for complete results** before proceeding to next test
4. **Document all failures** with specific error messages
5. **Save test results** for analysis and debugging

### Expected Testing Time:

- Quick Validation (Tests 0.1, 2.1, 4.1, 5.1): ~10 minutes
- Standard Validation (Sections 1-6): ~30 minutes  
- Comprehensive Validation (All sections): ~60 minutes

### Success Criteria:

- **PASS**: Tool works as expected with correct output
- **FAIL**: Tool errors, returns unexpected data, or doesn't work
- **PARTIAL**: Tool works but with limitations or workarounds needed

### Critical Success Metrics:

- All 18 tools must be accessible
- Connection management must work
- Core control tools must function
- Event monitoring must be active
- Error handling must be graceful

---

## QUICK REFERENCE: ALL 18 TOOLS

1. **manage_connection** - Connection management (11 actions)
2. **list_components** - List all Q-SYS components
3. **list_controls** - List controls for a component
4. **get_control_values** - Get current control values
5. **set_control_values** - Set control values
6. **qsys_component_get** - Get complete component details
7. **query_core_status** - Get Q-SYS Core status
8. **create_change_group** - Create a change group
9. **add_controls_to_change_group** - Add controls to group
10. **poll_change_group** - Poll for control changes
11. **list_change_groups** - List all change groups
12. **remove_controls_from_change_group** - Remove controls
13. **clear_change_group** - Clear all controls from group
14. **destroy_change_group** - Destroy a change group
15. **query_change_events** - Query historical events
16. **get_event_statistics** - Get event statistics
17. **get_api_documentation** - Get API documentation
18. **echo** - Echo test for connectivity

---

## NOTES

- Test results should be reported immediately after each test
- Any test failures should include complete error messages
- Performance metrics should include actual times in milliseconds
- Connection issues should be resolved before continuing tests
- All boolean parameters must use actual booleans (true/false), not strings

---

END OF TEST PROMPTS v1