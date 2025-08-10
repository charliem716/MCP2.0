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

## TEST 3: High-Frequency Event Capture (33Hz Test - UPDATED)
```
Test high-frequency event capture at Q-SYS native 33Hz rate with change detection:

IMPORTANT: With change detection, the system only records when values actually change.
At 33Hz (30ms polls), changes must persist long enough to be detected.

1. Get initial event count from get_event_statistics

2. Create change group "hz33_test" with pollRate=0.03 (33Hz)

3. Add a single control (any gain or level control)

4. Rapidly change the control value 30 times:
   ```
   for i in 1 to 30:
     set_control_values with value = -30 + i
     wait 60ms (2 poll cycles to ensure detection)
   ```

5. Wait 2 seconds for all events to be recorded

6. Query events for this change group (changeGroupId="hz33_test", limit=100)

7. Get final event count from get_event_statistics

Expected behavior:
- First poll captures initial value
- Each change should be detected if it persists for at least 1-2 poll cycles
- Some rapid changes might be missed if they occur between polls

Report:
- Events captured: X out of 30
- Missing events: [list any gaps in value sequence]
- Time span of events: first to last timestamp
- Actual capture rate: events/second
- Change detection accuracy: % of changes captured
- Any buffer overflows reported?

Note: If many changes are missed, increase the wait time between changes or reduce poll rate.
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