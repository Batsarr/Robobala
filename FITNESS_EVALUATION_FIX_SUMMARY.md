# Fitness Evaluation Fix Summary

**Date:** 2024-11-20  
**Issue:** Robot tests not receiving fitness evaluation  
**Status:** ✅ UI-side improvements complete, robot firmware update required

---

## What Was the Problem?

When running automatic PID tuning (Genetic Algorithm, PSO, or Bayesian Optimization), tests were being sent to the robot but no fitness values were being calculated. This meant:

- Robot would start tests ✅
- Robot would NOT send back results ❌
- Tests would timeout after 10 seconds ⏱️
- No fitness could be calculated without results 📊
- Optimization couldn't improve PID parameters 🚫

**Log Example:**
```
[03:09:18] [ROBOT] [MetricsTest] Started test ID=2667966872 with Kp=110.312, Ki=0.000, Kd=1.308
[03:09:28] [GA:41845] Sending run_metrics_test: testId=2667976877 Kp=59.624 Ki=0.000 Kd=0.722 testCounter=4
[03:09:28] [UI -> ROBOT] Sending: run_metrics_test {"type":"run_metrics_test","kp":59.623861725426025,"ki":0,"kd":0.72212153634641,"testId":2667976877}
[03:09:28] [ROBOT ACK] run_metrics_test: OK 
[03:09:28] [ROBOT] [MetricsTest] Started test ID=2667976877 with Kp=59.624, Ki=0.000, Kd=0.722
```

Notice: No test results are being sent back!

---

## What Was Fixed?

### 1. Increased Timeout (10s → 30s)
- **Why:** Some tests may take longer than 10 seconds to complete
- **Impact:** Tests now have 3x more time to finish before timing out
- **Files:** `js/tuning_algorithms.js`

### 2. Added Detailed Logging
- **Timeout Messages:** Now clearly indicate when a test times out and what PID values were being tested
- **Success Messages:** Confirm when metrics are successfully received
- **Impact:** Users can immediately see what's wrong

**Example Timeout Log:**
```
[GA:41845] Test timeout after 30s - testId=2667976877, Kp=59.624, Ki=0.000, Kd=0.722. 
Robot nie przesłał metrics_result. Test pominięty.
```

**Example Success Log:**
```
[GA:41845] Otrzymano metrics_result dla testId=2667976877
[GA:41845] Fitness calculated: ITAE=1.2345, Overshoot=15.67, SSE=0.123, Fitness=158.7890
```

### 3. Improved Event Handler Cleanup
- **Why:** Prevent memory leaks from accumulating event listeners
- **Impact:** More stable long-running optimization sessions
- **Files:** `js/tuning_algorithms.js`

### 4. Created Comprehensive Documentation
- **File:** `ROBOT_PROTOCOL.md`
- **Contents:**
  - Complete protocol specification
  - Expected message formats
  - Troubleshooting guide
  - Example firmware implementation

---

## What Still Needs to Be Done?

### Robot Firmware Update Required ⚠️

The robot firmware must be updated to send test results back to the UI. After completing a test, the robot should send:

```json
{
  "type": "metrics_result",
  "testId": 2667976877,
  "itae": 1.2345,
  "overshoot": 15.67,
  "steady_state_error": 0.123,
  "rise_time": 0.456,
  "settling_time": 1.234
}
```

**See `ROBOT_PROTOCOL.md` for:**
- Complete message format specification
- All required and optional fields
- Example firmware implementation in C++
- Detailed troubleshooting steps

---

## How to Test the Fix

### Step 1: Check Current Behavior
1. Open the web interface
2. Connect to the robot via Bluetooth
3. Start a GA/PSO/Bayesian optimization
4. Watch the log messages

### Step 2: Expected Logs (After Fix)
You should see one of these patterns:

**Success Pattern:**
```
[GA:12345] Sending run_metrics_test: testId=... Kp=... Ki=... Kd=...
[GA:12345] Otrzymano metrics_result dla testId=...
[GA:12345] Fitness calculated: ITAE=..., Overshoot=..., SSE=..., Fitness=...
```

**Timeout Pattern (Robot firmware not updated):**
```
[GA:12345] Sending run_metrics_test: testId=... Kp=... Ki=... Kd=...
[GA:12345] Test timeout after 30s - testId=..., Kp=..., Ki=..., Kd=... 
Robot nie przesłał metrics_result. Test pominięty.
```

### Step 3: Verify Fitness Table
- Open the "Wyniki Strojenia" (Tuning Results) section
- Check if fitness values are shown (not "---")
- Verify ITAE and Overshoot values are populated

---

## Troubleshooting Guide

### If Tests Keep Timing Out After 30 Seconds

1. **Check Robot Firmware:**
   - Ensure it sends `metrics_result` messages
   - Check for exceptions during test execution
   - Verify BLE message sending code

2. **Check Test Duration:**
   - If tests genuinely take >30s, increase timeout in code
   - Location: `js/tuning_algorithms.js`, search for `30000`

3. **Check BLE Connection:**
   - Ensure stable connection throughout test
   - Check for dropped messages
   - Monitor connection quality

4. **Try Manual Test First:**
   - Use single manual test to verify basics work
   - Then try automatic optimization

### If Fitness Shows "---"

This means no metrics were received. Check:
- Robot firmware sends `metrics_result` message
- Message contains required fields: `testId`, `itae`, `overshoot`, `steady_state_error`
- testId matches the request testId

---

## Technical Details

### Fitness Calculation Formula
```javascript
fitness = itae + (overshoot * 10) + (steady_state_error * 5)
```

Lower values are better. The weights (10x for overshoot, 5x for SSE) prioritize:
1. Minimizing overshoot (most important)
2. Minimizing steady-state error (important)
3. Minimizing time-weighted error (baseline)

### Files Modified
- `js/tuning_algorithms.js` - 38 lines changed (timeout, logging, cleanup)
- `ROBOT_PROTOCOL.md` - 159 lines added (new documentation)
- `FITNESS_EVALUATION_FIX_SUMMARY.md` - This file

### Algorithms Updated
All three optimization algorithms were updated identically:
- ✅ Genetic Algorithm (GA)
- ✅ Particle Swarm Optimization (PSO)
- ✅ Bayesian Optimization

---

## Security Analysis

✅ **CodeQL Scan:** Passed with 0 vulnerabilities  
✅ **No XSS risks:** All logging properly escaped  
✅ **No injection risks:** No eval() or similar dangerous patterns  
✅ **Clean implementation:** Following best practices

---

## Next Actions for Developer

1. **Update Robot Firmware:**
   - Implement `metrics_result` message sending
   - Use `ROBOT_PROTOCOL.md` as specification
   - Test with single manual test first

2. **Verify Implementation:**
   - Check logs show "Otrzymano metrics_result"
   - Verify fitness values appear in results table
   - Run full optimization to confirm continuous operation

3. **Optional Improvements:**
   - Add firmware logging for test completion
   - Consider adding progress updates during long tests
   - Implement test cancellation handling

---

## Support Resources

- **Protocol Specification:** `ROBOT_PROTOCOL.md`
- **Code Changes:** `js/tuning_algorithms.js`
- **Test Example:** `js/test/testParseTestId.js`
- **Message Processing:** `js/main.js` (processCompleteMessage function)

---

## Version History

- **2024-11-20:** Initial fix - timeout increase, logging, documentation
- **Previous:** 10s timeout, minimal error reporting

---

**Need Help?**
- Review `ROBOT_PROTOCOL.md` for complete protocol details
- Check browser console for detailed debug messages
- Monitor robot serial logs during test execution
