// Simple test to validate testId creation and matching

function createTestId() {
    return Date.now() >>> 0;
}

function simulateServerResponseWithNumber(testId) {
    // server returns numeric testId
    return { type: 'metrics_result', testId: testId, itae: 1.2, overshoot: 3.4, steady_state_error: 0.1 };
}

function simulateServerResponseWithString(testId) {
    // server returns stringified testId
    return { type: 'metrics_result', testId: String(testId), itae: 1.2, overshoot: 3.4, steady_state_error: 0.1 };
}

function test(compare) {
    const testId = createTestId();
    const numericResp = simulateServerResponseWithNumber(testId);
    const stringResp = simulateServerResponseWithString(testId);
    console.log('testId:', testId);
    console.log('numericResp.testId === testId?', numericResp.testId === testId);
    console.log('Number(numericResp.testId) === testId?', Number(numericResp.testId) === testId);
    console.log('stringResp.testId === testId?', stringResp.testId === testId);
    console.log('Number(stringResp.testId) === testId?', Number(stringResp.testId) === testId);
}

try {
    test();
    console.log('Done');
} catch (e) {
    console.error('Error:', e);
}
