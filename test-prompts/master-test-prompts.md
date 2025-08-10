# Master Test Prompts - Comprehensive Q-SYS MCP Testing Guide

## Overview
This guide provides a comprehensive series of test prompts designed to validate every aspect of the Q-SYS MCP server codebase. Tests progress from simple connectivity checks to complex multi-system orchestration, ensuring thorough coverage of all features, edge cases, and integration points.

## Testing Philosophy
- **Progressive Complexity**: Start simple, build to complex scenarios
- **Real-World Focus**: Test actual production use cases
- **Error Recovery**: Include failure scenarios and recovery patterns
- **Performance Validation**: Measure and optimize response times
- **Integration Testing**: Verify all components work together

---

## SECTION 1: BASIC CONNECTIVITY & DISCOVERY
Tests fundamental connection and component discovery

### Test 1.1: Initial Connection Verification
```
Verify the Q-SYS connection is working:
1. Check the connection status to the Q-SYS Core
2. Report the Core's firmware version and model
3. Count total components available
4. Identify any connection warnings or errors
```

### Test 1.2: Component Discovery
```
Discover and categorize all components:
1. Use list_components to get all available components
2. Group components by type (audio, video, control, etc.)
3. Identify components with special characters or spaces in names
4. Report total count per category
5. Flag any components with unusual naming patterns
```

### Test 1.3: Control Enumeration
```
Map all controls in the system:
1. For the first 5 components, list all their controls
2. Identify control naming patterns (dots, underscores, spaces)
3. Count controls by type (gain, mute, position, string, trigger)
4. Document the exact format required for control names
5. Note any controls with metadata or special properties
```

---

## SECTION 2: BASIC CONTROL OPERATIONS
Tests fundamental get/set operations

### Test 2.1: Simple Get Operations
```
Test basic value retrieval:
1. Get values for 5 different gain controls
2. Get values for 5 different mute controls
3. Get values for any position/level controls
4. Verify value types match expectations (number vs boolean vs string)
5. Check for any null or undefined values
```

### Test 2.2: Simple Set Operations
```
Test basic value setting:
1. Set a single gain control to -20 dB
2. Set a single mute control to true
3. Wait 2 seconds
4. Get both values to verify they changed
5. Set them back to original values
```

### Test 2.3: Ramp Testing
```
Test ramp functionality:
1. Set a gain from current value to -40 with 5 second ramp
2. Immediately get the value (should show starting point)
3. Get value after 2.5 seconds (should show mid-ramp)
4. Get value after 5 seconds (should show target)
5. Verify smooth transition occurred
```

---

## SECTION 3: BATCH OPERATIONS & PERFORMANCE
Tests batch processing and performance limits

### Test 3.1: Small Batch Operations
```
Test batch operations with 10 controls:
1. Discover 10 gain controls from different components
2. Get all 10 values in a single call
3. Set all 10 to -15 dB in a single call WITHOUT validation
4. Measure time taken for the batch set
5. Verify all values changed correctly
```

### Test 3.2: Medium Batch with Validation
```
Test validation impact on 30 controls:
1. Find 30 controls of mixed types (gain, mute, position)
2. Set all 30 WITH validation (validate:true)
3. Record time and any failures
4. Set same 30 WITHOUT validation (validate:false)
5. Compare times and success rates
```

### Test 3.3: Maximum Batch Limits
```
Test system limits with 100 controls:
1. Build list of exactly 100 real controls
2. Attempt to GET all 100 values
3. Verify the 100-control limit is enforced
4. Set 95 controls simultaneously
5. Measure performance and verify success
```

---

## SECTION 4: VALIDATION BEHAVIOR TESTING
Deep dive into validation system behavior

### Test 4.1: Validation Edge Cases
```
Test validation with edge cases:
1. Set 5 REAL controls + 5 FAKE controls WITH validation
2. Document which succeed and which fail
3. Set same mix WITHOUT validation
4. Compare behavior differences
5. Check if real controls actually changed despite validation errors
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
1. Get current values for 20 important controls
2. Save this state snapshot
3. Change all 20 controls to different values
4. Verify changes applied
5. Restore original state from snapshot
6. Verify restoration succeeded
```

### Test 5.2: Change Group Management  
```
Test ALL change group tools:
1. create_change_group with ID "test-batch"
2. add_controls_to_change_group - add 10 controls with values
3. poll_change_group to monitor for external changes
4. list_change_groups to see all active groups
5. remove_controls_from_change_group - remove 3 controls
6. clear_change_group to remove remaining controls
7. add_controls_to_change_group - add different controls
8. destroy_change_group to clean up
9. list_change_groups to verify it's gone
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
Tests event monitoring and query capabilities

### Test 6.1: Basic Event Monitoring
```
Test event capture:
1. Use get_event_statistics to check if monitoring is enabled
2. Make 10 control changes using set_control_values
3. Query recent events using query_change_events
4. Verify all 10 changes were captured
5. Check event timestamps and metadata
6. Use get_event_statistics to verify counts increased
```

### Test 6.2: Event Filtering and Queries
```
Test event query capabilities with query_change_events:
1. Generate events for multiple components
2. Query events filtering by componentNames parameter
3. Query events filtering by controlNames parameter
4. Query events filtering by startTime and endTime
5. Query events filtering by changeGroupId (if using change groups)
6. Test limit parameter (max 10000)
7. Test offset parameter for pagination
8. Combine multiple filters in one query
```

### Test 6.3: Event Statistics
```
Test statistical analysis:
1. Generate 100 varied events over 5 minutes
2. Use get_event_statistics to analyze
3. Verify component counts are accurate
4. Check hourly distribution data
5. Validate control type breakdowns
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
1. Discover router/matrix components
2. Identify current routing configuration
3. Change 4 routing points
4. Verify routes changed
5. Create a routing preset
```

### Test 7.2: Audio Cross-fades
```
Test smooth transitions:
1. Find two input channels
2. Set first channel to 0 dB
3. Set second channel to -60 dB
4. Cross-fade over 3 seconds (first down, second up)
5. Verify smooth transition completed
```

### Test 7.3: Complex Mix Scenarios
```
Test mixing operations:
1. Find all input channels for a mixer
2. Set up a standard mix (drums, bass, vocals, etc.)
3. Apply EQ to specific channels
4. Set up aux sends
5. Create and recall mix snapshots
```

---

## SECTION 8: ZONE & ROOM CONTROL
Tests multi-zone audio systems

### Test 8.1: Zone Linking
```
Test linked zone control:
1. Find all zone components
2. Link 5 zones together
3. Change master volume
4. Verify all linked zones follow
5. Unlink and verify independence
```

### Test 8.2: Room Combining
```
Test room combine scenarios:
1. Identify combinable rooms/partitions
2. Combine rooms A and B
3. Verify audio routing adjusted
4. Test combined room volume control
5. Separate rooms and verify isolation
```

### Test 8.3: Emergency Mute Scenarios
```
Test emergency procedures:
1. Save current state of all zones
2. Emergency mute ALL outputs instantly
3. Verify complete silence achieved
4. Gradually restore zones one by one
5. Return to saved state
```

---

## SECTION 9: DSP & PROCESSING CONTROL
Tests audio processing components

### Test 9.1: EQ Control
```
Test equalizer adjustments:
1. Find parametric EQ components
2. Adjust frequency, gain, and Q for 3 bands
3. Create a "speech intelligibility" preset
4. Create a "music" preset
5. Switch between presets with ramps
```

### Test 9.2: Dynamics Processing
```
Test compressor/limiter control:
1. Find dynamics processors
2. Adjust threshold to -20 dB
3. Set ratio to 4:1
4. Adjust attack and release times
5. Monitor gain reduction meter
```

### Test 9.3: Acoustic Echo Cancellation
```
Test AEC configuration:
1. Find AEC components
2. Enable/disable AEC processing
3. Adjust reference levels
4. Test non-linear processing settings
5. Monitor AEC convergence status
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
1. Start a 10-second ramp on control A
2. While ramping, change control B instantly
3. Query control C's value
4. Create a change group
5. Verify all operations complete correctly
```

---

## SECTION 11: MCP PROTOCOL TESTING
Tests Model Context Protocol implementation

### Test 11.1: Tool Discovery & Complete Coverage
```
Test ALL 16 MCP tools are available and working:

CORE CONTROL TOOLS (5):
1. list_components - List all Q-SYS components
2. list_controls - List controls for a specific component
3. get_control_values - Get current values of controls
4. set_control_values - Set control values with optional validation
5. qsys_component_get - Get detailed component information

SYSTEM STATUS TOOLS (1):
6. query_core_status - Get Q-SYS Core status and health

CHANGE GROUP TOOLS (7):
7. create_change_group - Create a new change group
8. add_controls_to_change_group - Add controls to group
9. poll_change_group - Poll for control changes
10. list_change_groups - List all active change groups
11. remove_controls_from_change_group - Remove specific controls
12. clear_change_group - Clear all controls from group
13. destroy_change_group - Destroy a change group

EVENT MONITORING TOOLS (2):
14. query_change_events - Query historical control changes
15. get_event_statistics - Get event database statistics

UTILITY TOOLS (1):
16. query_qsys_api - Send raw Q-SYS API commands

TESTING TOOLS (1):
17. echo - Test MCP connectivity

TOTAL: 16 TOOLS (5+1+7+2+1 = 16)

VERIFY EACH TOOL:
- Call with valid parameters
- Call with missing parameters (should error gracefully)
- Call with invalid parameters (should error gracefully)
- Verify response format matches MCP specification
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
query_qsys_api (Utility):
- Send "Component.GetComponents" command
- Send "Component.GetControls" with params
- Send "Mixer.GetCrosspoints" if mixer exists
- Send invalid command (error handling)
- Compare with tool equivalents
- Test command timeout handling

echo:
- Echo simple string "test"
- Echo empty string ""
- Echo special characters "!@#$%"
- Echo very long string (1000 chars)
- Echo unicode "Hello 世界 🌍"
- Verify exact echo response
```

---

## SECTION 12: PERFORMANCE & LOAD TESTING
Tests system performance under load

### Test 12.1: Rapid Sequential Updates
```
Test update rate limits:
1. Find a single gain control
2. Update it 100 times rapidly (different values)
3. Measure total time and success rate
4. Calculate updates per second
5. Identify any rate limiting
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
1. Set up "Meeting Start" sequence:
   - Unmute podium mic
   - Set room speakers to -12 dB
   - Enable acoustic echo cancellation
   - Adjust lighting (if integrated)
2. Create "Presentation Mode":
   - Mute all mics except presenter
   - Route laptop audio to speakers
   - Adjust EQ for speech
3. Implement "Meeting End":
   - Mute all audio
   - Reset to defaults
   - Log usage statistics
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
1. Configure 8 zones with different sources
2. Implement "All Page" override
3. Test priority ducking (fire alarm simulation)
4. Create day/night presets
5. Test scheduled transitions
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

## CONCLUSION

This comprehensive testing guide ensures thorough validation of the Q-SYS MCP server. Execute tests progressively, document results carefully, and use findings to improve system reliability and performance.

Remember: **Complete each phase to 100% before moving to the next.**