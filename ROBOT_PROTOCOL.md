# Robot Communication Protocol - Test Results

## Problem: Tests Without Fitness Evaluation

### Symptoms
When running automatic tuning (GA, PSO, or Bayesian optimization), you may see log messages like:
```
[GA:41845] Sending run_metrics_test: testId=2667976877 Kp=59.624 Ki=0.000 Kd=0.722 testCounter=4
[ROBOT] [MetricsTest] Started test ID=2667976877 with Kp=59.624, Ki=0.000, Kd=0.722
[GA:41845] Test timeout after 30s - testId=2667976877... Robot nie przesłał metrics_result. Test pominięty.
```

This indicates that:
1. ✅ The UI successfully sends test commands to the robot
2. ✅ The robot receives and acknowledges the test
3. ❌ The robot does NOT send back test results
4. ❌ No fitness evaluation can occur without test results

### Root Cause
The robot firmware must send back a `metrics_result` or `test_result` message after completing each test. If this message is not sent within 30 seconds, the test times out and no fitness is calculated.

## Expected Protocol

### 1. Test Request (UI → Robot)
The UI sends a `run_metrics_test` command:
```json
{
  "type": "run_metrics_test",
  "kp": 59.624,
  "ki": 0.0,
  "kd": 0.722,
  "testId": 2667976877
}
```

### 2. Test Acknowledgment (Robot → UI)
The robot should send an acknowledgment:
```json
{
  "type": "ack",
  "command": "run_metrics_test",
  "success": true
}
```

### 3. Test Results (Robot → UI) - CRITICAL
**This is the missing message!** After the test completes, the robot MUST send:
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

Alternatively, the robot can send:
```json
{
  "type": "test_result",
  "testId": 2667976877,
  "itae": 1.2345,
  "overshoot": 15.67,
  "steady_state_error": 0.123
}
```

### Required Fields
- `type`: Must be `"metrics_result"` or `"test_result"`
- `testId`: The same testId from the request (can be number or string)
- `itae`: Integral of Time-weighted Absolute Error (number)
- `overshoot`: Maximum overshoot in degrees (number)
- `steady_state_error`: Steady state error (number)

### Optional Fields
- `rise_time`: Time to reach 90% of setpoint (number)
- `settling_time`: Time to settle within 2% of setpoint (number)
- `test_type`: Type of test, defaults to `"metrics_test"` (string)

## Fitness Calculation

When the UI receives the test results, it calculates fitness as:
```javascript
fitness = itae + (overshoot * 10) + (steady_state_error * 5)
```

Lower fitness values are better. The algorithm uses this fitness to guide the optimization process.

## Timeout Handling

- **Timeout Duration**: 30 seconds (increased from 10 seconds as of 2024-11-20)
- **Behavior on Timeout**: Test is skipped, fitness set to Infinity, optimization continues
- **Log Message**: Detailed error message logged to help diagnose the issue

## Troubleshooting

### If Tests Keep Timing Out

1. **Check Robot Firmware**: Ensure the robot firmware is programmed to send `metrics_result` or `test_result` messages after completing tests.

2. **Check Test Duration**: If tests take longer than 30 seconds, you may need to increase the timeout in `js/tuning_algorithms.js`:
   ```javascript
   }, 30000); // Increase this value (in milliseconds)
   ```

3. **Check Robot Logs**: Look for any errors or exceptions on the robot side that might prevent it from sending results.

4. **Check BLE Connection**: Ensure the Bluetooth connection is stable and not dropping messages.

5. **Manual Test**: Try a single manual test first to verify the robot can complete tests and send results before running automatic optimization.

## Example Robot Firmware Implementation (Pseudo-code)

```cpp
void handleRunMetricsTest(JsonObject& cmd) {
    // Extract parameters
    float kp = cmd["kp"];
    float ki = cmd["ki"];
    float kd = cmd["kd"];
    uint32_t testId = cmd["testId"];
    
    // Send acknowledgment
    sendAck("run_metrics_test", true);
    
    // Log start
    Serial.printf("[MetricsTest] Started test ID=%u with Kp=%.3f, Ki=%.3f, Kd=%.3f\n", 
                  testId, kp, ki, kd);
    
    // Run test and collect metrics
    TestMetrics metrics = runBalanceTest(kp, ki, kd);
    
    // CRITICAL: Send results back to UI
    JsonDocument doc;
    doc["type"] = "metrics_result";
    doc["testId"] = testId;
    doc["itae"] = metrics.itae;
    doc["overshoot"] = metrics.overshoot;
    doc["steady_state_error"] = metrics.steadyStateError;
    doc["rise_time"] = metrics.riseTime;
    doc["settling_time"] = metrics.settlingTime;
    sendBleMessage(doc);
    
    Serial.printf("[MetricsTest] Sent results for test ID=%u\n", testId);
}
```

## Version History

- **2024-11-20**: Increased timeout from 10s to 30s, added detailed logging
- Initial implementation: 10s timeout

## See Also

- `js/tuning_algorithms.js` - Contains the test evaluation logic
- `js/test/testParseTestId.js` - Test for testId parsing
- `js/main.js` - Message processing and broadcasting
