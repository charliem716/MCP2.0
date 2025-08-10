# Event Cache Comprehensive Test Suite
## Individual Test Prompts for Copy-Paste Testing

Each prompt below is self-contained and tests a specific aspect of the event cache system. Copy and paste one at a time, report results back for analysis.

**IMPORTANT NOTES**: 

### System Architecture - 33Hz Maximum Polling Rate
The event monitoring system is **polling-based** with a maximum rate of 33Hz (30ms intervals). This means:
- Maximum capture rate: 33 events per second per control
- Changes faster than 30ms apart will be aggregated
- Only the value at each polling interval is captured
- This is by design - not a limitation to be "fixed"
- Test expectations should account for this architecture

### Parameter Types
All numeric parameters (pollRate, limit, offset, etc.) now accept both string and number values. The MCP server will automatically convert string numbers to numeric values. For example:
- pollRate: 0.1 (numeric) or "0.1" (string) - both work
- limit: 100 (numeric) or "100" (string) - both work

### Understanding the Tools

**poll_change_group vs query_change_events**: These serve different purposes!
- `poll_change_group`: Manual polling tool for real-time monitoring. Shows changes since YOUR last manual poll. Use `showAll:true` to see all current values.
- `query_change_events`: Accesses the persistent event database populated by automatic polling. This is where all historical events are stored.
- **Key Point**: Manual polls don't affect or read from the event database. They're separate systems!

### Control Name Format
Controls must use the format: `Component.Control`
- ✅ Valid: `Main_Mixer.gain`, `Output_1.mute`, `Delay.bypass`
- ❌ Invalid: `Test_Router.select.1` (too many dots), `gain` (no component)
- The system will now report which controls failed validation

### Debugging Tips
- If controls aren't being added, check the response for `invalid` and `skipped` arrays
- Use `poll_change_group` with `showAll:true` to see current values without waiting for changes
- Always filter `query_change_events` by `changeGroupId` or `controlNames` to avoid confusion from other system activity

---

## TEST 1: Initial System Health Check
```
Please perform an initial health check of the event monitoring system:

1. Call get_event_statistics and report:
   - Is monitoring enabled?
   - Current total events count
   - Database size in MB
   - Buffer statistics (usage, overflow count)
   - Oldest and newest event timestamps

2. Call list_controls with component="Main Mixer" (or any available component) and report:
   - How many controls were found?
   - List the first 5 control names

3. Create a test change group:
   - ID: "health_check_test"
   - Poll rate: 0.1 (numeric value, not string - this is 10Hz)
   - Report success/failure

4. Destroy the test change group and report result

Please format results as:
✅ Success: [what worked]
⚠️ Warning: [any warnings]
❌ Error: [any errors with details]
📊 Metrics: [key numbers]
```

---

## TEST 2: Basic Event Recording (UPDATED FOR 33Hz MAX)
```
Test basic event recording functionality with polling-based system:

IMPORTANT: System is polling-based with max 33Hz (30ms intervals). Key points:
- Each poll captures current values at that moment
- Changes within polling intervals are aggregated (only final value captured)
- Maximum theoretical capture rate is 33 events/second per control

1. Create change group "basic_test_001" with pollRate=0.1 (10Hz - balanced for testing)

2. Add these controls to the group (adjust names based on what's available):
   - Any gain control
   - Any mute control  
   - Any position/level control

3. Set control values 3 times with different values:
   - First set: gain=-10, mute=false, position=0.5
   - Wait 1 second (allow ~10 polls to capture)
   - Second set: gain=-20, mute=true, position=0.75
   - Wait 1 second
   - Third set: gain=-5, mute=false, position=0.25
   - Wait 1 second

4. Wait 1 more second for final recording

5. Query events with query_change_events (changeGroupId="basic_test_001", limit=50)

6. Verify and report:
   - How many events were captured total?
   - Are timestamps in correct order?
   - Do final values match what was set?

Expected behavior:
- Total events: ~40 (10Hz × 4 seconds × 3 controls)
- Each control should show value progression over time
- Final values should match last set operation

Report: Total events captured, polling consistency, value accuracy
```

---

## TEST 3: High-Frequency Event Capture (33Hz Audio Meter Test)
```
Test high-frequency event capture at Q-SYS native 33Hz rate with audio meters:

IMPORTANT: Audio meters provide naturally changing values that properly test 33Hz polling.
Manual set operations are NOT suitable for testing high-frequency capture since the system
only records actual changes detected during polling, not set operations.

1. Get initial event count from get_event_statistics

2. Find audio meter controls:
   - Use list_components to find meter/audio components
   - Look for components with names containing "meter", "Meter", or type "meter2"
   - Use get_component_controls to find meter controls (meter.1, level, peak, rms)
   - Common examples: "TableMicMeter.meter.1", "TableMicMeter.meter.2", "AudioMeter.peak"
   - NOTE: Multi-part control names ARE supported (Component.Control.Index format)

3. Create change group "meter_33hz_test"

4. Add 2-4 meter controls to the group (don't overload with too many)

5. Start auto-polling at 33Hz:
   - Use create_monitored_change_group with pollRate=0.03 (30ms intervals)
   OR
   - Use regular change group with ChangeGroup.AutoPoll rate=0.03

6. Monitor for 10 seconds (should generate ~333 poll cycles)

7. Query events for this change group (changeGroupId="meter_33hz_test", limit=1000)

8. Get final event count from get_event_statistics

Expected behavior with ACTIVE AUDIO:
- Continuous stream of events as meter values change
- Event rate should approach 33Hz per control if audio is active
- Total events: up to 333 * number_of_controls (if constantly changing)

Expected behavior with SILENCE:
- Few or no events (meters don't change without audio)
- This is correct behavior - only changes are recorded

Report:
- New events captured: X
- Expected poll cycles: 333
- Events per second: X/10
- Capture efficiency: (events/expected_polls) * 100%
- Per control:
  - Number of events
  - Number of unique values (indicates variation)
  - Value range (min to max in dB)

Analysis:
- 0 events = No audio signal or wrong controls
- <10% efficiency = Mostly silence, occasional audio
- >80% efficiency = Active audio with continuous meter movement
- 100% efficiency = Meters changing every poll cycle

Note: This test requires active audio in the Q-SYS system. If testing without audio,
use a signal generator or play audio through the system to see meter movement.
```

---

## TEST 4: Query Filtering Accuracy
```
Test all query filtering options:

1. Create change group "filter_test" and add 3 controls

2. Generate 10 changes across the 3 controls

3. Test each filter type:

   A. Time-based filtering:
      - Query last 30 seconds
      - Query last 2 minutes  
      - Query with startTime=5min ago, endTime=2min ago
      - Report: Events returned for each query

   B. Control name filtering:
      - Query for single control name
      - Query for 2 control names
      - Query for non-existent control
      - Report: Correct filtering? Any false positives?

   C. Change group filtering:
      - Query with changeGroupId="filter_test"
      - Query with invalid changeGroupId="does_not_exist"
      - Report: Results match expected?

   D. Component filtering (if applicable):
      - Query by component name
      - Report: Only that component's events returned?

   E. Pagination:
      - Query with limit=5, offset=0
      - Query with limit=5, offset=5
      - Query with limit=5, offset=10
      - Report: No duplicates? Correct ordering?

Report any filtering failures or unexpected results
```

---

## TEST 5: Memory Pressure Test (33Hz AWARE)
```
Test system behavior under memory pressure:

1. Get initial statistics with get_event_statistics

2. Create change group "memory_test" with pollRate=0.03 (33Hz max rate)

3. Add 10 controls to the group

4. Run for 15 seconds at maximum polling rate:
   - Expected polls: 15 seconds × 33Hz = 495 polls
   - Maximum possible events: 495 × 10 controls = 4,950 events
   - Change control values every 100ms (10Hz change rate)
   - Total changes: 150 (15 seconds × 10Hz)

5. Monitor during test:
   - Call get_event_statistics every 5 seconds
   - Watch for buffer overflow count increases
   - Note any compression events

6. After completion:
   - Final statistics check
   - Query total events captured
   - Calculate capture rate

Report:
- Events captured (should be ≤4,950)
- Actual capture rate (events/second)
- Buffer overflows detected
- Compression events triggered
- Performance degradation observed?

Note: With 33Hz polling and 10Hz changes, system should capture most changes
```

---

## TEST 6: Concurrent Change Groups
```
Test multiple simultaneous change groups:

1. Create 3 change groups:
   - "concurrent_a" with pollRate=0.05
   - "concurrent_b" with pollRate=0.10
   - "concurrent_c" with pollRate=0.03

2. Add 2 different controls to each group (6 total unique controls)

3. Simultaneously change all 6 controls 5 times

4. Wait 3 seconds

5. Query events for each change group separately

6. Verify:
   - Each group captured its own controls only
   - No cross-contamination between groups
   - All events properly tagged with correct changeGroupId

Report: Events per group, any mixing of data, poll rate accuracy
```

---

## TEST 7: Database Persistence Test
```
Test database persistence and recovery:

1. Generate 50 test events in change group "persist_test"

2. Query and record the event IDs and timestamps

3. Wait 5 seconds

4. Query the same events again by timestamp range

5. Verify:
   - Same events returned
   - IDs unchanged
   - Data integrity maintained

6. Query events from 24 hours ago (should be empty or very old)

Report: Persistence verified? Any data inconsistencies?
```

---

## TEST 8: Error Recovery Test
```
Test error handling and recovery:

1. Try invalid operations and verify graceful handling:
   - Query with limit=-1 (invalid)
   - Query with offset=999999 (very large)
   - Query with startTime in future
   - Create change group with invalid pollRate=0
   - Add non-existent control to change group

2. After each error, verify system still works:
   - Can still query events
   - Can still create valid change groups
   - Statistics still update

Report: All errors handled gracefully? System remains stable?
```

---

## TEST 9: Value Type Handling
```
Test different control value types:

1. Create change group "type_test"

2. Test each value type if available:
   - Numeric: Set gains from -100 to +20
   - Boolean: Toggle mute true/false
   - String: Set string controls if any exist
   - Position: Set 0.0, 0.5, 1.0
   - Complex: Any multi-value controls

3. Query events and verify:
   - Values stored correctly
   - Type conversions handled
   - No data corruption

Report: All types handled? Any conversion issues?
```

---

## TEST 10: Statistics Accuracy Test (POLLING-BASED)
```
Verify statistics accuracy with polling architecture:

1. Get initial statistics (record all values)

2. Run controlled test:
   - Create change group with 5 unique controls
   - Set pollRate=0.1 (10Hz for predictable results)
   - Run for exactly 10 seconds
   - Change values every 500ms (20 total changes)
   - Expected polls: 10 seconds × 10Hz = 100 polls
   - Maximum events: 100 polls × 5 controls = 500 events

3. Get final statistics

4. Verify:
   - Total events increased (should be ≤500)
   - Unique controls count correct
   - Database size increased appropriately
   - Buffer statistics are reasonable
   - No overflow count increases

5. Calculate and report:
   - Events captured per second
   - Actual vs theoretical capture rate
   - Database growth per event (bytes)
   - Polling efficiency (events/polls)

Expected: With changes every 500ms and 100ms polling, should capture most changes
Report all calculations and any discrepancies
```

---

## TEST 11: Cleanup Validation
```
Test cleanup operations:

1. Create 3 change groups with different poll rates:
   - Group A: pollRate=0.03 (33Hz - maximum)
   - Group B: pollRate=0.1 (10Hz - medium)
   - Group C: pollRate=1.0 (1Hz - slow)

2. Add 2 controls to each group and run for 2 seconds:
   - Group A: ~66 polls × 2 controls = ~132 events max
   - Group B: ~20 polls × 2 controls = ~40 events max
   - Group C: ~2 polls × 2 controls = ~4 events max

3. Destroy change groups one by one:
   - Verify each destruction succeeds
   - Confirm polling stops (no new events)
   - Check existing events remain in database

4. Query historical events for destroyed groups:
   - Should return previously recorded events
   - No new events after destruction time

5. Verify final state:
   - All groups destroyed
   - System ready for new tests

Report: Cleanup successful? Historical data preserved? Event counts as expected?
```

---

## TEST 12: Stress Burst Test (33Hz MAXIMUM)
```
Test system response to sudden load bursts:

1. Create change group "burst_test" with pollRate=0.03 (33Hz max)

2. Add 5 controls

3. Perform burst pattern (understanding 33Hz limits):
   - Burst 1: 50 changes in 2 seconds (25 changes/sec)
     * Max capturable: 2 sec × 33Hz × 5 controls = 330 events
   - Pause 5 seconds
   - Burst 2: 100 changes in 3 seconds (33 changes/sec)
     * Max capturable: 3 sec × 33Hz × 5 controls = 495 events
   - Pause 5 seconds
   - Burst 3: 150 changes in 5 seconds (30 changes/sec)
     * Max capturable: 5 sec × 33Hz × 5 controls = 825 events

4. Monitor after each burst:
   - Check statistics for overflows
   - Query captured events
   - Calculate actual capture rate

Report:
- Burst 1: X events captured (max 330)
- Burst 2: X events captured (max 495)
- Burst 3: X events captured (max 825)
- Actual events/second for each burst
- System stability maintained?

Note: Changes faster than 33Hz cannot be individually captured
```

---

## ANALYSIS TEMPLATE

After each test, provide results in this format:

```
TEST NAME: [Test X: Description]
TIMESTAMP: [ISO timestamp]

RESULTS:
✅ Successes:
- [List what worked]

⚠️ Warnings:
- [List non-critical issues]

❌ Failures:
- [List critical problems with details]

📊 Metrics:
- Events Captured: X/Y
- Response Times: Xms avg
- Error Rate: X%
- [Other relevant metrics]

RAW DATA:
[Include any error messages, stack traces, or unusual responses]

NOTES:
[Any observations or patterns noticed]
```

---

## Testing Instructions

1. Run tests in order, starting with TEST 1
2. After each test, report results using the template
3. Wait for analysis and any fixes before proceeding
4. If a test fails critically, we may need to fix before continuing
5. Some tests may need control name adjustments based on your system

Goal: Identify and fix any bugs in the event cache system through systematic testing.