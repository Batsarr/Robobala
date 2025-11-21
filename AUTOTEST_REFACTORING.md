# Autotest Logic Refactoring

**Date:** 2025-11-21  
**Status:** ✅ Complete  
**Breaking Changes:** No (backward compatible)

---

## Summary

The autotest logic has been refactored from a **robot-managed** approach to a **telemetry-based** approach. This makes the robot a "dumb executor" and the interface a "smart controller".

## What Changed?

### Old Method (Robot-Managed Tests)

**How it worked:**
1. Interface sent `run_metrics_test` command with PID parameters
2. Robot entered special test mode
3. Robot internally managed the entire test
4. Robot collected data and calculated fitness metrics (ITAE, overshoot, SSE)
5. Robot sent back final `metrics_result` with fitness score
6. Interface used the score for optimization

**Characteristics:**
- ✅ Robot had full control and awareness of testing
- ✅ Robot calculated fitness metrics internally
- ❌ Robot needed complex test management logic
- ❌ Interface depended on robot's fitness calculation
- ❌ Robot was a "smart manager" that knew it was being tested

### New Method (Telemetry-Based Tests)

**How it works:**
1. Interface sends `set_param` commands to change PID parameters
2. Robot applies parameters immediately (no special test mode)
3. Interface waits for settling time (300ms)
4. Interface listens to continuous telemetry stream
5. Interface collects telemetry samples during test duration
6. Interface calculates fitness from telemetry data
7. Interface uses the score for optimization

**Characteristics:**
- ✅ Robot is "dumb executor" - no test awareness
- ✅ Robot just executes commands and reports telemetry
- ✅ Interface has full control over testing
- ✅ Interface calculates fitness from raw telemetry
- ✅ Simpler robot firmware (less test logic needed)
- ✅ More flexible (can change fitness calculation without robot update)

## Technical Implementation

### New Functions

#### `runTelemetryBasedTest(kp, ki, kd)`

Replaces `runMetricsTest()` with telemetry-based approach.

**Parameters:**
- `kp` - Proportional gain
- `ki` - Integral gain
- `kd` - Derivative gain

**Returns:**
```javascript
{
    fitness: Number,         // Combined fitness score
    itae: Number,            // Integral of Time-weighted Absolute Error
    overshoot: Number,       // Maximum deviation from target (degrees)
    steady_state_error: Number, // Average error in final 30% of test
    raw: {
        samples: Number,     // Number of telemetry samples collected
        oscillationPenalty: Number // Penalty for unstable behavior
    }
}
```

**How it works:**
1. Gets test duration from UI (default 2000ms)
2. Adds settling time (300ms) for parameters to take effect
3. Sends `set_param` commands to robot
4. Listens to `ble_message` events for telemetry
5. Collects samples after settling period
6. Calculates fitness when test duration reached
7. Cleans up event listeners

#### `calculateFitnessFromTelemetry(samples)`

Calculates fitness metrics from collected telemetry samples.

**Metrics calculated:**

1. **ITAE (Integral of Time-weighted Absolute Error)**
   - Measures how quickly the error decreases over time
   - Lower is better
   - Formula: `Σ(|error| * time) / sample_count`

2. **Overshoot**
   - Maximum deviation from target angle (0°)
   - Lower is better
   - Formula: `max(|pitch - target|)`

3. **Steady State Error**
   - Average error in final 30% of test
   - Lower is better
   - Formula: `mean(|pitch - target|)` for last 30% of samples

4. **Oscillation Penalty**
   - Penalizes excessive oscillations
   - Applied when >30% of samples have sign changes
   - Formula: `oscillation_rate * 20`

5. **Final Fitness**
   - Combined score (lower is better)
   - Formula: `ITAE + (overshoot * 10) + (SSE * 5) + oscillation_penalty`

### Updated Algorithms

All three optimization algorithms have been updated:

1. **Genetic Algorithm (GA)**
   - `evaluateFitness()` now uses `runTelemetryBasedTest()`
   - Test type changed to `'telemetry_test'`

2. **Particle Swarm Optimization (PSO)**
   - `evaluateFitness()` completely rewritten
   - Removed complex event listener management
   - Simplified to use `runTelemetryBasedTest()`

3. **Bayesian Optimization**
   - `evaluateSample()` completely rewritten
   - Same telemetry-based approach
   - Cleaner code with less boilerplate

## Backward Compatibility

### Old Function Preserved

The old `runMetricsTest()` function is **preserved but deprecated**:
- Marked with `@deprecated` JSDoc tag
- Includes detailed comments explaining the old approach
- Not used by any algorithm anymore
- Can be removed in future if robot firmware no longer supports it

### No Breaking Changes

✅ **All changes are additive**:
- No existing code needs to be modified
- Robot firmware can continue to support `run_metrics_test` for other purposes
- UI can still receive `metrics_result` messages (just not used by tuning algorithms)

## Benefits

### For Robot Firmware

1. **Simpler Code**
   - No need for test management logic
   - No need to calculate fitness metrics
   - No special test states or modes
   - Just apply parameters and report telemetry

2. **More Reliable**
   - Less code = fewer bugs
   - No complex timing logic
   - No test state machine

3. **More Flexible**
   - Can add new telemetry fields without breaking tests
   - Fitness calculation can be changed without robot update

### For Interface

1. **Full Control**
   - Interface decides how long tests run
   - Interface decides what constitutes "good" performance
   - Interface can adjust fitness formula on the fly

2. **Better Debugging**
   - Can see all telemetry samples during test
   - Can analyze test data after completion
   - Can visualize test progression

3. **More Flexible**
   - Can test different fitness formulas
   - Can adjust weights (overshoot vs SSE)
   - Can add new metrics without robot changes

### For Users

1. **Better Tests**
   - More accurate fitness calculation
   - Can tune fitness formula to specific needs
   - Better handling of edge cases

2. **Faster Iteration**
   - No need to update robot firmware to change tests
   - Can experiment with different test durations
   - Can adjust fitness weights in real-time

## Migration Guide

### For Robot Firmware Developers

**You can simplify your firmware!**

The robot no longer needs to:
- Implement `run_metrics_test` command handler (optional)
- Track test state internally
- Calculate ITAE, overshoot, SSE
- Send `metrics_result` messages
- Manage test timeouts

The robot should:
- ✅ Continue to accept `set_param` commands
- ✅ Continue to send telemetry at regular intervals
- ✅ Continue to report pitch, roll, speed, etc.

### For Interface Developers

**No changes needed!**

The tuning algorithms automatically use the new approach:
- GA, PSO, and Bayesian all updated
- Same public API for starting/stopping tuning
- Same UI controls work as before

### For Advanced Users

**Can customize fitness calculation:**

```javascript
// Adjust weights in calculateFitnessFromTelemetry()
const fitness = itae + (overshoot * 10) + (steadyStateError * 5);
//                              ^^^ can change these weights ^^^

// Adjust oscillation penalty threshold
if (oscillationRate > 0.3) { // can change 0.3 to other values
    oscillationPenalty = oscillationRate * 20;
}
```

## Testing

### Test File

Created: `js/test/testTelemetryBasedTuning.html`

**Tests included:**
1. ✅ Fitness calculation logic
2. ✅ Telemetry collection mechanism
3. ✅ Parameter setting via set_param
4. ✅ Event listener setup/cleanup

**To run tests:**
```bash
# Open in browser
open js/test/testTelemetryBasedTuning.html

# Or serve locally
python -m http.server 8000
# Then open http://localhost:8000/js/test/testTelemetryBasedTuning.html
```

### Manual Testing

**With real robot:**
1. Connect to robot via Bluetooth
2. Start any tuning algorithm (GA, PSO, or Bayesian)
3. Observe log messages:
   - Should see `[TelemetryTest] Started test with Kp=... Ki=... Kd=...`
   - Should see `[TelemetryTest] Calculated fitness: ITAE=... Overshoot=... SSE=...`
   - Should NOT see `run_metrics_test` commands
4. Verify tests complete successfully
5. Verify fitness values are calculated and displayed

**Without robot (mock mode):**
1. Open test file in browser
2. Run all tests
3. Verify all pass
4. Check log for correct command flow

## Performance

### Test Duration

- **Settling time:** 300ms (configurable)
- **Test duration:** 2000ms default (configurable via UI)
- **Total duration:** ~2300ms per test
- **Timeout:** 2x test duration (safety margin)

### Telemetry Collection

- **Sample rate:** Depends on robot telemetry rate (~50-100 Hz)
- **Expected samples:** 100-200 per test (2 seconds)
- **Minimum samples:** 5 (test fails if less)
- **Memory usage:** ~1KB per test (samples array)

### Fitness Calculation

- **Complexity:** O(n) where n = number of samples
- **Time:** <1ms for typical test (200 samples)
- **No robot processing:** All calculation on UI side

## Future Improvements

### Possible Enhancements

1. **Configurable Fitness Weights**
   - Add UI controls for overshoot/SSE weights
   - Save user preferences
   - Preset profiles (smooth, aggressive, balanced)

2. **Advanced Metrics**
   - Peak time
   - Settling percentage
   - Control effort (motor power usage)
   - Energy consumption

3. **Real-time Visualization**
   - Live plot of pitch during test
   - Fitness components breakdown
   - Comparison with previous tests

4. **Test Data Export**
   - Save telemetry samples to CSV
   - Export fitness progression
   - Batch analysis tools

5. **Adaptive Test Duration**
   - End test early if stable
   - Extend test if oscillating
   - Dynamic timeout based on settling

## Troubleshooting

### Tests Always Timeout

**Problem:** `runTelemetryBasedTest` times out after 2x test duration

**Solutions:**
- Check if robot is sending telemetry messages
- Verify BLE connection is stable
- Check browser console for errors
- Increase test duration in UI

### Fitness Always Infinity

**Problem:** Calculated fitness is always `Infinity`

**Solutions:**
- Check if enough samples collected (need >5)
- Verify telemetry contains `pitch` field
- Check if settling time is too long
- Verify robot is in balance mode

### Oscillation Penalty Too High

**Problem:** Fitness always includes large oscillation penalty

**Solutions:**
- Robot may be unstable with current PID
- Try different PID ranges in search space
- Adjust oscillation threshold (currently 0.3)
- Check if robot is on stable surface

### Tests Complete But No Results

**Problem:** Tests finish but no fitness displayed

**Solutions:**
- Check browser console for JavaScript errors
- Verify `addTestToResultsTable()` is called
- Check if results table exists in HTML
- Verify fitness chart is updating

## References

- **Main Implementation:** `js/tuning_algorithms.js`
- **Test Suite:** `js/test/testTelemetryBasedTuning.html`
- **Related Docs:** `ROBOT_PROTOCOL.md`, `ARCHITEKTURA.md`

## Version History

- **2025-11-21:** Initial implementation
  - Added `runTelemetryBasedTest()`
  - Added `calculateFitnessFromTelemetry()`
  - Updated GA, PSO, Bayesian algorithms
  - Deprecated `runMetricsTest()`
  - Created test suite
  - Created documentation

---

## Support

**Need help?**
1. Check test suite: `js/test/testTelemetryBasedTuning.html`
2. Review code comments in `js/tuning_algorithms.js`
3. Check browser console for detailed logs
4. File an issue on GitHub

**Questions about the refactoring?**
- See "Migration Guide" section above
- Review "What Changed?" section
- Check "Benefits" section for rationale
