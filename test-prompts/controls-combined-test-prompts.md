# Combined Control Tools Test Prompts

## Overview
These are consolidated test prompts that test multiple capabilities in single operations, making testing faster and more efficient.

## Test 1: Control Naming Format Discovery
Tests: Understanding the exact naming format required
```
STEP 1 - Component Discovery:
Use list_components to see all available components.
Note any special characters, spaces, or punctuation in component names.

STEP 2 - Control Discovery:
Pick 3 different components and for each one:
- Use list_controls with that exact component name
- Note the format of control names returned (do they include dots, underscores, etc?)

STEP 3 - Format Testing:
Based on what you discovered, try getting values using different formats:
- Try: "controlName" alone (from list_controls output)
- Try: "ComponentName.controlName" (combining component + control)
- Try: Different separators if unclear (. vs _ vs space)

STEP 4 - Verify Correct Format:
Once you identify working formats, set those controls to new values and verify the change.
This confirms you have the right naming format.
```

## Test 2: Small to Medium Batch with Validation Comparison
Tests: Batch operations, validation performance, component grouping
```
STEP 1 - Discover Real Controls:
- Use list_components to see what components exist
- Pick 5-8 different components from the list
- For each component, use list_controls to find controls with 'gain' and 'mute' in their names
- Note the exact control names returned (they might be like 'input.1.gain' not just 'gain')

STEP 2 - Set Controls WITH Validation:
Using the EXACT control names you discovered (in ComponentName.controlName format):
- Set 15 real controls to specific values WITH validation (validate:true)
- Include a mix of gains (-10, -15, -20 dB) and mutes (true/false)
- Record the time taken and which controls succeeded/failed

STEP 3 - Set Same Controls WITHOUT Validation:
- Set the SAME 15 controls again WITHOUT validation (validate:false)
- Use different values (add 5 dB to all gains, toggle all mutes)
- Record the time taken and compare the speed difference
- Verify with get_control_values that changes actually applied
```

## Test 3: Validation Behavior Testing
Tests: Validation vs non-validation, real vs fake controls, error detection
```
PHASE 1 - Discovery:
First, use list_components to see what components actually exist in the system.
Then pick one component and use list_controls to see its actual control names.

PHASE 2 - Test WITH Validation (validate:true):
Try to set these controls WITH validation enabled:
- Use 5 real controls from your discovery (use exact ComponentName.controlName format)
- Add these definitely fake controls:
  InvalidControl.DoesNotExist to 0
  Another.Fake.Control to 100
  Zone.1.gain to -10 (unless this actually exists)
  System.DSP.1.Compressor.threshold to -20

Report which ones succeed vs fail with validation ON.
IMPORTANT: Check if real controls actually changed despite reporting success/failure!

PHASE 3 - Test WITHOUT Validation (validate:false):
Now set THE SAME controls WITHOUT validation.
Report which ones succeed vs fail with validation OFF.

PHASE 3.5 - Bug Investigation:
Based on the validation bug discovered, test these scenarios:
- Set ONLY real controls WITH validation - do they work?
- Set one real control at a time WITH validation - which ones fail?
- Try different control name formats with validation to find what works

PHASE 4 - Verify Real Changes:
For the real controls that reported success:
- Get their values to confirm they actually changed
- This will reveal if non-validated "success" actually did anything

PHASE 5 - Analysis:
Compare results between validated and non-validated modes.
What's the actual behavior difference?
Does validate:false truly accept ANY name, or does it still check at the Q-SYS level?
```

## Test 4: Complex Sequencing with State Management
Tests: Read-modify-write, state save/restore, zone linking, cascading changes
```
Phase 0 - Discovery:
- Use list_components to find components with 'Zone', 'Main', or similar names
- Use list_controls on found components to get actual control names
- Identify at least 5 zone-like components with gain and mute controls
- Note: They might be named differently (e.g., 'Channel.1' instead of 'Zone.1')

Phase 1 - Save current state:
- Using the discovered control names, get and save values for:
  * The main/master gain control you found
  * 5 zone/channel gain controls
  * All corresponding mute controls

Phase 2 - Zone linking test:
- Set the main gain control to -12 dB
- Set all 5 discovered zone gains to match the main gain with 1 second ramps

Phase 3 - Cascading mute:
- Mute the zones in sequence with delays between each

Phase 4 - Modify all by offset:
- Get all zone gains again
- Add 6 dB to each value
- Set them back with the new values

Phase 5 - Restore:
- Restore all controls to their original values from Phase 1
- Verify restoration with get_control_values
```

## Test 5: Maximum Batch & Performance Limits
Tests: 100 control limit, performance at scale, boundary testing
```
STEP 1 - Discover Available Controls:
- Use list_components to get ALL components in the system
- For the first 10-15 components, use list_controls to get their control names
- Build a list of all discovered control names

STEP 2 - Create Maximum Batch:
- From your discovered controls, select exactly 100 controls
- Prioritize controls that look like:
  * Gains (anything with 'gain', 'level', 'volume')
  * Mutes (anything with 'mute', 'enable', 'bypass')
  * Positions (anything with 'position', 'pan', 'balance')
- If you have fewer than 100 real controls, that's fine - use what you have

STEP 3 - Test Getting 100 Controls:
- Use get_control_values with your list of 100 (or max available) controls
- Record the time taken and success rate

STEP 4 - Test Setting at Scale:
- Set 95 of these controls simultaneously WITHOUT validation
- Use appropriate values based on control type (gains: -20, mutes: false, etc.)
- Record time taken and verify success
```

## Test 6: Advanced Routing & Transitions
Tests: Cross-fades, complex routing, proper sequencing
```
STEP 0 - Discover Routing Controls:
- Use list_components to find components with 'Router', 'Matrix', 'Input', 'Output' in names
- Use list_controls on these components to find:
  * Routing/crosspoint controls (might be named like 'crosspoint.1.1' or 'input.1.output.1.enable')
  * Input gain/level controls
  * Output gain/mute controls
- Note the exact naming format for your system

Step 1: Get Current State:
- Using discovered control names, get current routing state
- Focus on finding at least 4 input-to-output routing points

Step 2: Mute Outputs:
- Find and mute all discovered output mute controls instantly

Step 3: Cross-fade Inputs (if you found suitable controls):
- Find two input gain controls
- Set one from current value to -60 with 2 second ramp
- Simultaneously set another from -60 to 0 with 2 second ramp

Step 4: Change Routing (using discovered routing control format):
- Modify at least 4 routing points using the control names you discovered
- The actual names might be very different from 'Router.Input.X.Output.Y'

Step 5: Set Output Levels:
- Set discovered output gain controls to different levels with ramps

Step 6: Unmute Outputs:
- Unmute all output controls with 0.5 second ramp
```

## Test 7: Preset Simulation & Rapid Updates
Tests: Preset recall pattern, rapid sequential updates, cache performance
```
Part A - Find a Test Control:
- Use list_components and list_controls to find ANY gain control
- Use that specific control for rapid testing
- Set it to -20, then -19, then -18, etc. up to -10 as fast as possible without validation
- Record total time for all 11 updates

Part B - Discover and Create Preset:
- Use list_components to find components that might be in a conference room:
  * Look for 'Microphone', 'Mic', 'Input' components
  * Look for 'Zone', 'Room', 'Output' components  
  * Look for 'AEC', 'Gate', 'Compressor', 'EQ' processing components
- Use list_controls on found components to get actual control names
- Create a "Conference Room" preset using discovered controls:
  * Set main/master gain to -6
  * Set zone gains to various levels
  * Set microphone gains appropriately
  * Enable any AEC or noise processing you found
  * Adjust any EQ bands you discovered
- Apply all settings with 2 second ramps where applicable

Part C - Verify:
- Get all the controls you just set to confirm values
- Report which controls successfully changed
```

## Test 8: Error Recovery & Edge Cases
Tests: Invalid values, special characters, empty arrays, duplicates
```
PREP - Get Real Controls First:
- Use list_components and list_controls to find at least:
  * One real gain control
  * One real mute control
  * One real position/level control (if available)
- Note their exact names for testing

1. Invalid Values on Real Controls:
   Using your discovered control names, try setting:
   - A real gain control to "not-a-number"
   - A real mute control to "maybe"
   - A real position to 5 (out of range)
   - A real control to -10 with ramp of -1 (negative ramp)

2. Test Unusual Control Names:
   First check if these exist with get_control_values, then try to set them:
   - "control-with-dashes"
   - "control_with_underscores"
   - "control.with.many.dots.in.name"
   - "control with spaces"
   - "" (empty string)
   - Create and test a 200-character control name

3. Duplicate Control Test:
   Using one of your real controls, set it three times in one batch:
   - Same control to -10, -20, -30 in single set_control_values call

4. Boundary Values on Real Controls:
   Using your discovered gain control:
   - Set to -100 (typical minimum)
   - Set to 20 (typical maximum)
   - Set to -1000 (way below minimum)
   - Set to 1000 (way above maximum)
   If you found a position control, test 0, 0.5, 1
```

## Test 9: Real-World Emergency Scenario
Tests: Emergency mute, system recovery, complex state changes
```
PREPARATION:
- Use list_components to identify ALL output-related components
- Look for: 'Main', 'Master', 'Zone', 'Output', 'Monitor', 'Aux', 'Speaker'
- Use list_controls on each to find all mute and gain controls
- Build your emergency mute list from actual discovered controls

EMERGENCY PHASE:
- Using discovered mute controls, immediately mute EVERYTHING without validation
- Include every mute control you found in the system
- Execute as single batch with validate:false for speed

DIAGNOSTIC PHASE:
- Get all discovered gain controls to see current levels
- Document which zones/outputs are at dangerous levels

RECOVERY PHASE:
1. Set all discovered gains to safe -30 dB without ramps
2. If you found monitor controls, unmute those first with 1 second ramp
3. Unmute your first discovered zone/output with 2 second ramp
4. Gradually bring its gain from -30 to -12 with 5 second ramp
5. Unmute remaining discovered zones one by one with 1 second ramps
6. Finally unmute main/master controls with appropriate ramps

VERIFY:
- Get all controls to confirm system is in safe state
```

## Test 10: Comprehensive System Check
Tests: Everything - all value types, all batch sizes, validation, performance
```
Run a complete system diagnostic:

1. DISCOVERY PHASE:
   - Use list_components to get ALL components
   - For each component (up to first 20), use list_controls
   - Build a comprehensive list of all available controls
   - Note: Don't assume generic names like 'control_1' exist

2. CATEGORIZATION:
   - From discovered controls, categorize by apparent type:
     * Gains (containing 'gain', 'level', 'volume')
     * Mutes (containing 'mute', 'enable', 'bypass')
     * Positions (containing 'position', 'pan', 'fader')
     * Others (threshold, ratio, frequency, etc.)

3. TYPE TESTING:
   - Set 5 controls of each type you found with validation
   - Use appropriate values for each type

4. PERFORMANCE TEST:
   - Set 20 discovered controls without validation
   - Compare speed vs validated operations

5. CROSS-FADE TEST:
   - Find two input gain controls from your discovery
   - Create a cross-fade between them over 3 seconds

6-8. STATE MANAGEMENT:
   - Save state of 10 important discovered controls
   - Change them to extreme values
   - Restore to saved values

9. ERROR HANDLING:
   - Try setting definitely fake controls: 'XXX.fake.123', 'NoExist.control'
   - Compare with setting non-existent controls you discovered

10. REPORT:
    - Total real controls found
    - Control types and counts
    - Success rates with/without validation
    - Average operation times
```

## Test 14: Production Workaround Strategy
Tests: Safe patterns for production use
```
PRODUCTION SAFE PATTERNS

PREPARATION:
- Use list_components to get all components
- Use list_controls on each to build complete control inventory
- Save this as your "known good" control list

PATTERN 1 - Always Use validate:false
Test this approach with your discovered controls:
1. Use your discovered control list as validation
2. Always use validate:false for operations
3. Check control names against your discovered list before sending
4. Test with mix of real (discovered) and fake controls
Result: Does this provide reliability?

PATTERN 2 - Verify After Set
Using your discovered controls:
1. Set controls WITHOUT validation
2. Immediately use get_control_values on same controls
3. Compare set vs get to verify success
4. Retry any that didn't match
Result: Does this catch all failures?

PATTERN 3 - Pre-flight Check
Using discovery:
1. At startup, use list_components and list_controls
2. Try get_control_values on all discovered controls
3. Store only the ones that return values successfully
4. Use validate:false for all operations on this verified list
5. Periodically re-check with get_control_values
Result: Is this more reliable than validation?

PATTERN 4 - Component-Based Batching
Using your discovered component structure:
1. Group your discovered controls by component
2. Set each component's controls in separate batches
3. Use validate:false throughout
4. Test with components that have many controls vs few
Result: Better success rate?

PATTERN 5 - Error Detection Without Validation
Using discovered controls:
1. Set mix of real (discovered) and fake controls with validate:false
2. Check return array for any success:false
3. For all success:true results, verify with get_control_values
4. Build your own validation map from results
5. Compare your validation vs built-in validate:true
Result: Can we build better validation than the built-in?

RECOMMENDATION:
Based on results, what's the safest production pattern until the bug is fixed?
```

## Quick Test Sequence

For a rapid but thorough test, run these three prompts in order:

### Quick Test 1: Basic Validation
```
1. Use list_components to find at least one component
2. Use list_controls on that component to find gain, mute, or position controls
3. Get the discovered controls to see current values
4. Set them to appropriate test values (-10 for gain, false for mute, 0.5 for position)
5. Get them again to verify the changes applied
```

### Quick Test 2: Batch Performance
```
1. Use list_components to find components with multiple similar controls
2. Use list_controls to discover at least 30 gain controls
   (might be named like 'input.1.gain', 'input.2.gain', etc.)
3. Set all discovered gain controls to -20 without validation in a single batch
4. Report how long it took and verify changes with get_control_values
```

### Quick Test 3: Complex Operation
```
1. Use list_components to find a main/master component
2. Use list_controls to find its gain and mute controls
3. Save current state by getting these control values
4. Set the gain to -60 with 2 second ramp
5. Set the mute to true
6. Wait 3 seconds
7. Restore original values
8. Verify restoration worked
```

## Expected Results Summary

When running these combined tests, you should observe:

1. **CRITICAL BUG**: validate:true silently fails real controls while only reporting fake control errors
2. **WORKAROUND**: validate:false is MORE RELIABLE - it correctly applies real changes and ignores fake controls
3. **Performance**: Operations without validation are faster AND more reliable (bug workaround bonus)
4. **Batching**: Component controls are grouped automatically for parallel execution
5. **Limits**: Get operations max out at 100 controls
6. **Caching**: 30-second TTL, but may not help due to validation bug
7. **Error Handling**: With validate:false, fake controls report success but are safely ignored
8. **Ramps**: Ramp times don't affect response time, only the transition duration
9. **Value Conversion**: Booleans convert to 0/1, strings like "true"/"on" convert properly
10. **Production Recommendation**: Use validate:false until bug is fixed, implement your own validation

## Test 11: Validation Bug Investigation
Tests: Deep dive into the validation system bug
```
VALIDATION BUG DEEP DIVE

CONTEXT: We discovered validate:true can have issues - let's investigate.

PREPARATION:
- Use list_components to get 5-10 different components
- Use list_controls on each to get real control names
- Note the exact format of the returned control names

TEST 1 - Isolate the Problem:
Using your discovered REAL controls:
a) Set ONE real control WITH validation - does it work?
b) Set TWO real controls WITH validation - do they work?
c) Set FIVE real controls WITH validation - when does it break?
d) Set TEN real controls WITH validation - pattern?

TEST 2 - Format Variations:
Using a real component and control you discovered, try these formats WITH validation:
a) Just control name as returned by list_controls: "input.1.gain"
b) Component.control format: "YourComponent.input.1.gain"
c) Test with components that have spaces in their names
d) Test with different discovered control name patterns

TEST 3 - Mixed Batches Pattern:
Using your discovered real controls, test:
a) 1 real (from discovery) + 1 fake control WITH validation
b) 5 real (from discovery) + 1 fake control WITH validation
c) 10 real (from discovery) + 0 fake controls WITH validation
d) 0 real + 5 fake controls WITH validation
Identify when real controls fail.

TEST 4 - Validation Cache Impact:
Using one of your discovered controls:
a) Set it WITHOUT validation (should work)
b) Immediately set same control WITH validation (cached?)
c) Wait 35 seconds for cache expiry
d) Set same control WITH validation again
Does caching affect the behavior?

TEST 5 - Component-Specific:
Using your discovered components:
a) Test controls from each component type separately WITH validation
b) Group results by component type
c) Identify any patterns (do certain component types fail? others work?)

EXPECTED OUTCOME:
Identify the exact conditions that trigger the validation bug.
```

## Test 12: Comprehensive Validation Discovery
Tests: Deep dive into validate:false behavior based on Test 3 findings
```
VALIDATION BEHAVIOR DEEP DIVE

PART A - Establish Baseline:
1. Use list_components and pick 3 real components with different types
2. Use list_controls to get 5 real control names from each
3. Document the exact control names returned
4. Set these 15 real controls WITH validation (validate:true) - note time
5. Set same 15 controls WITHOUT validation (validate:false) - note time
6. Calculate performance difference

PART B - Fake Control Behavior:
Test what validate:false really accepts:
1. Set these obviously fake controls WITHOUT validation:
   - TotallyFakeComponent.control to -10
   - 😀🎉🔊.gain to 0  (emoji test)
   - "../../../etc/passwd" to 1 (path traversal)
   - "'; DROP TABLE controls; --" to 5 (SQL injection)
   - Control name with 1000 characters
   - Empty string "" to 0

2. For each "successful" fake control:
   - Try to GET its value - what happens?
   - Does it appear in any component listing?

PART C - Mixed Batch Analysis:
Create batch of 50 controls:
- 25 real controls (use the ones you discovered in Part A)
- 25 obviously fake controls (from Part B)
Set WITHOUT validation and analyze:
- Do all report success?
- Use get_control_values on all 50 - which ones actually return values?
- What's the pattern between real and fake?

PART D - Security Test:
Try potentially dangerous names without validation:
- Extremely long strings (10,000 chars)
- Null bytes: "control\x00name"
- Unicode direction changers
- Nested references: "{{{{control}}}}"
- Circular references: "self.self.self"

PART E - Production Safety Assessment:
Based on all results, answer:
1. Does validate:false skip ALL validation or just client-side?
2. Are fake controls stored anywhere or just ignored?
3. What are the actual risks of using validate:false?
4. When is it safe to use in production?
```

## Test 13: Validation Performance & Caching
Tests: Exact performance metrics and cache behavior
```
VALIDATION PERFORMANCE METRICS

Setup: 
- Use list_components to find components with many controls
- Use list_controls to identify exactly 30 real controls
- Document these control names for consistent testing

Round 1 - Cold Cache:
Set all 30 WITH validation - record exact milliseconds

Round 2 - Warm Cache (5 seconds later):
Set same 30 WITH validation - should be faster

Round 3 - No Validation:
Set same 30 WITHOUT validation - should be fastest

Round 4 - Cache Expiry (wait 35 seconds):
Set same 30 WITH validation - should be slow again (cache expired at 30s)

Round 5 - Stress Test:
Rapidly set same control 20 times WITH validation - does cache help?

Calculate:
- Validation overhead percentage
- Cache benefit percentage  
- Per-control validation cost in ms
- Break-even point (when validation becomes worth it)
```

## Testing Tips

- Run tests 1-3 for basic functionality verification
- Run tests 4-6 for advanced features
- Run tests 7-9 for edge cases and real-world scenarios  
- Run test 10 for a complete system check
- Run tests 11-12 for validation behavior deep dive
- Use Quick Tests for rapid validation after changes