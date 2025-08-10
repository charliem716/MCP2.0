# Event Cache Comprehensive Test Suite
## Individual Test Prompts for Copy-Paste Testing

Each prompt below is self-contained and tests a specific aspect of the event cache system. Copy and paste one at a time, report results back for analysis.

**IMPORTANT NOTES**: 

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

## TEST 2: Basic Event Recording (UPDATED)
```
Test basic event recording functionality with proper change detection:

IMPORTANT: The system now only records ACTUAL CHANGES, not every poll. This means:
- First poll records initial values for all controls
- Subsequent polls only record controls that have changed
- Rapid changes need sufficient time between them to be detected

1. Create change group "basic_test_001" with pollRate=1 (1Hz - slower for reliable change detection)

2. Add these controls to the group (adjust names based on what's available):
   - Any gain control
   - Any mute control  
   - Any position/level control

3. Set control values 3 times with different values:
   - First set: gain=-10, mute=false, position=0.5
   - Wait 2 seconds (allow at least 2 polls to detect the change)
   - Second set: gain=-20, mute=true, position=0.75
   - Wait 2 seconds
   - Third set: gain=-5, mute=false, position=0.25
   - Wait 2 seconds

4. Wait 2 more seconds for final recording

5. Query events with query_change_events (changeGroupId="basic_test_001", limit=50)

6. Verify and report:
   - Initial values captured (first poll)
   - Were all 9 changes captured? (3 controls × 3 changes)
   - Are timestamps in correct order?
   - Do values match what was set?

Expected behavior:
- First poll: Records initial state of all 3 controls
- After each value change: Records only the controls that changed
- Total events: ~12 (3 initial + 9 changes)

Report: Total events captured, change detection accuracy, any missing events
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

## TEST 5: Memory Pressure Test
```
Test system behavior under memory pressure:

1. Get initial statistics with get_event_statistics

2. Create change group "memory_test" with pollRate=0.03

3. Add 10 controls to the group

4. Generate 500 rapid changes:
   - Change all 10 controls 50 times
   - Use random values
   - Minimal delay between changes

5. Monitor during test:
   - Call get_event_statistics every 100 changes
   - Watch for buffer overflow count increases
   - Note any compression events

6. After completion:
   - Final statistics check
   - Query total events captured
   - Calculate capture rate

Report:
- Events captured vs expected (500)
- Buffer overflows detected
- Compression events triggered
- Performance degradation observed?
- Memory usage growth
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

## TEST 10: Statistics Accuracy Test
```
Verify statistics accuracy:

1. Get initial statistics (record all values)

2. Generate exactly 100 events:
   - Use 5 unique controls
   - 20 changes each

3. Get final statistics

4. Verify:
   - Total events increased by exactly 100
   - Unique controls increased by up to 5
   - Database size increased appropriately
   - Buffer statistics are reasonable
   - No overflow count increases

5. Calculate and report:
   - Events per second captured
   - Database growth per event (bytes)
   - Buffer efficiency percentage

Report all calculations and any discrepancies
```

---

## TEST 11: Cleanup Validation
```
Test cleanup operations:

1. Create 3 change groups with different poll rates

2. Add controls and generate 20 events each

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

Report: Cleanup successful? Historical data preserved?
```

---

## TEST 12: Stress Burst Test
```
Test system response to sudden load bursts:

1. Create change group "burst_test" with pollRate=0.03

2. Add 5 controls

3. Perform burst pattern:
   - Burst 1: 50 changes in 1 second
   - Pause 5 seconds
   - Burst 2: 100 changes in 2 seconds
   - Pause 5 seconds
   - Burst 3: 200 changes in 3 seconds

4. Monitor after each burst:
   - Check statistics for overflows
   - Query captured events
   - Calculate capture percentage

Report:
- Burst 1: X/50 captured
- Burst 2: X/100 captured
- Burst 3: X/200 captured
- Recovery time between bursts
- System stability maintained?
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