// ========================================================================
// AUTO-TUNING ALGORITHMS - CLIENT-SIDE IMPLEMENTATION
// ========================================================================

// Global tuning session management
let fitnessChart = null;
let fitnessChartData = [];

// Baseline PID parameters - stored before tuning session starts
// Used to restore robot to safe state during pause or after emergency stop
let baselinePID = {
    kp: 0,
    ki: 0,
    kd: 0
};

// ========================================================================
// CONSTANTS
// ========================================================================

// Time to wait for new PID parameters to take effect in the robot (milliseconds)
const PARAMETER_SETTLING_TIME_MS = 300;

// ========================================================================
// HELPER FUNCTIONS
// ========================================================================

/**
 * Show notification to user (fallback to console if not defined elsewhere)
 */
function showNotification(message) {
    if (typeof addLogMessage === 'function') {
        addLogMessage(`[Tuning] ${message}`, 'info');
    } else {
        console.log(`[Notification] ${message}`);
    }
}

// Helpers (global scope)
function mean(arr) {
    if (!Array.isArray(arr) || arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
}

// Dynamic timeout calc: clamp(trial+1500, 3000, 15000)
function computeTestTimeout() {
    const trialInput = document.getElementById('tuningTrialDurationInput'); // expect ms value in UI
    let trialMs = 2000;
    if (trialInput) {
        const v = parseInt(trialInput.value, 10);
        if (!isNaN(v)) trialMs = v;
    }
    let t = trialMs + 1500;
    if (t < 3000) t = 3000;
    if (t > 15000) t = 15000;
    return t;
}

/**
 * OLD APPROACH (DEPRECATED): Robot-managed test with fitness calculation on robot side
 * 
 * This function is DEPRECATED and kept only for backward compatibility.
 * New code should use runTelemetryBasedTest() instead.
 * 
 * OLD METHOD:
 * - Sends run_metrics_test command to robot
 * - Robot manages entire test internally
 * - Robot calculates fitness metrics
 * - Robot sends back final metrics_result
 * 
 * This approach made the robot a "smart manager" that knew it was being tested.
 * 
 * @deprecated Use runTelemetryBasedTest() instead
 * @param {number} kp - Proportional gain
 * @param {number} ki - Integral gain
 * @param {number} kd - Derivative gain
 * @returns {Promise<{fitness, itae, overshoot, steady_state_error, raw}>}
 */
function runMetricsTest(kp, ki, kd) {
    return new Promise((resolve, reject) => {
        const testId = (Date.now() ^ Math.floor(Math.random() * 0xFFFF)) >>> 0;
        const timeoutMs = computeTestTimeout();
        let resolved = false;
        let metricsData = null;
        let ackReceived = false;
        let started = false;
        let timeoutHandle = setTimeout(() => {
            if (!resolved) {
                cleanup();
                resolved = true;
                reject(new Error('test_timeout'));
            }
        }, timeoutMs);

        function cleanup() {
            window.removeEventListener('ble_message', handler);
            clearTimeout(timeoutHandle);
        }

        function finishSuccess() {
            if (resolved) return;
            resolved = true;
            cleanup();
            if (!metricsData) {
                // No metrics -> penalize
                resolve({ fitness: Infinity, itae: 0, overshoot: 0, steady_state_error: 0, raw: null });
            } else {
                const itae = Number(metricsData.itae) || 0;
                const overshoot = Number(metricsData.overshoot) || 0;
                const sse = Number(metricsData.steady_state_error) || 0;
                const fitness = itae + overshoot * 10 + sse * 5;
                resolve({ fitness, itae, overshoot, steady_state_error: sse, raw: metricsData });
            }
        }

        function finishFailure(reason) {
            if (resolved) return;
            resolved = true;
            cleanup();
            reject({ reason });
        }

        function handler(evt) {
            const d = evt.detail || evt;
            if (d.type === 'ack' && d.command === 'run_metrics_test' && Number(d.testId) === testId) {
                ackReceived = true;
                if (!d.success) {
                    // Synthetic test_complete
                    finishFailure('ack_failed');
                }
            }
            else if (d.type === 'status_update' && d.message === 'test_started' && Number(d.testId) === testId) {
                started = true;
            }
            else if ((d.type === 'metrics_result' || d.type === 'test_result') && Number(d.testId) === testId) {
                metricsData = d;
            }
            else if (d.type === 'test_complete' && Number(d.testId) === testId) {
                if (d.success) finishSuccess(); else finishFailure(d.reason || 'test_failed');
            }
        }

        window.addEventListener('ble_message', handler);
        // Wyślij komendę
        sendBleCommand('run_metrics_test', { kp, ki, kd, testId });
    });
}

// Use RB.helpers.delay(ms) (provided by js/helpers.js) for delays to avoid redeclaration issues.

/**
 * Helper function to get parameter key names for a given loop type
 * @param {string} loop - Loop type ('balance', 'speed', or 'position')
 * @returns {Object} Object with kp, ki, kd parameter keys
 */
function getPIDParamKeys(loop) {
    let suffix = '';
    if (loop === 'balance') suffix = 'b';
    else if (loop === 'speed') suffix = 's';
    else if (loop === 'position') suffix = 'p';
    else suffix = 'b'; // default to balance

    return {
        kp: `kp_${suffix}`,
        ki: `ki_${suffix}`,
        kd: `kd_${suffix}`
    };
}

/**
 * NEW APPROACH: Telemetry-based fitness evaluation
 * 
 * Instead of asking the robot to run a test and calculate fitness,
 * the interface now:
 * 1. Sets PID parameters via set_param commands
 * 2. Waits for parameters to be applied (small settling delay)
 * 3. Monitors telemetry stream for test duration
 * 4. Calculates fitness based on telemetry data (pitch stability, overshoot, etc.)
 * 
 * The robot is now a "dumb executor" - it doesn't know it's being tested.
 * It just executes commands and reports telemetry.
 * 
 * @param {number} kp - Proportional gain
 * @param {number} ki - Integral gain
 * @param {number} kd - Derivative gain
 * @returns {Promise<{fitness, itae, overshoot, steady_state_error, raw}>}
 */
function runTelemetryBasedTest(kp, ki, kd) {
    return new Promise((resolve, reject) => {
        const testStartTime = Date.now();
        const telemetrySamples = [];
        let resolved = false;

        // Get test duration from UI (default 2000ms)
        const trialInput = document.getElementById('tuningTrialDurationInput');
        let testDurationMs = 2000;
        if (trialInput) {
            const v = parseInt(trialInput.value, 10);
            if (!isNaN(v) && v > 0) testDurationMs = v;
        }

        // Add parameter settling time (time for robot to apply new PID values)
        const settlingTimeMs = PARAMETER_SETTLING_TIME_MS;
        const totalDurationMs = testDurationMs + settlingTimeMs;

        // Timeout safety (2x expected duration)
        const timeoutMs = totalDurationMs * 2;
        let timeoutHandle = setTimeout(() => {
            if (!resolved) {
                cleanup();
                resolved = true;
                reject(new Error('test_timeout'));
            }
        }, timeoutMs);

        function cleanup() {
            window.removeEventListener('ble_message', telemetryHandler);
            clearTimeout(timeoutHandle);
        }

        function telemetryHandler(evt) {
            const d = evt.detail || evt;

            // Only collect telemetry messages
            if (d.type !== 'telemetry') return;

            const elapsedTime = Date.now() - testStartTime;

            // Skip samples during settling period
            if (elapsedTime < settlingTimeMs) return;

            // Collect telemetry sample
            const sample = {
                timestamp: elapsedTime - settlingTimeMs, // Relative to test start (after settling)
                pitch: Number(d.pitch) || 0,
                roll: Number(d.roll) || 0,
                speed: Number(d.speed || d.sp) || 0,
                loopTime: Number(d.loop_time || d.lt) || 0
            };

            telemetrySamples.push(sample);

            // Check if test duration reached
            if (elapsedTime >= totalDurationMs) {
                finishTest();
            }
        }

        function finishTest() {
            if (resolved) return;
            resolved = true;
            cleanup();

            // Calculate fitness from collected telemetry
            if (telemetrySamples.length < 5) {
                // Not enough data - penalize
                resolve({
                    fitness: Infinity,
                    itae: 0,
                    overshoot: 0,
                    steady_state_error: 0,
                    raw: { samples: telemetrySamples.length, reason: 'insufficient_data' }
                });
                return;
            }

            const metrics = calculateFitnessFromTelemetry(telemetrySamples);
            resolve(metrics);
        }

        // Start listening to telemetry
        window.addEventListener('ble_message', telemetryHandler);

        // Apply PID parameters to robot using set_param commands
        const loop = document.getElementById('tuning-loop-selector')?.value || 'balance';
        const paramKeys = getPIDParamKeys(loop);

        // Send parameters (robot applies them immediately)
        sendBleCommand('set_param', { key: paramKeys.kp, value: kp });
        sendBleCommand('set_param', { key: paramKeys.ki, value: ki });
        sendBleCommand('set_param', { key: paramKeys.kd, value: kd });

        try {
            addLogMessage(`[TelemetryTest] Started test with Kp=${kp.toFixed(3)}, Ki=${ki.toFixed(3)}, Kd=${kd.toFixed(3)}, duration=${testDurationMs}ms`, 'info');
        } catch (_) {
            // Logging is optional - don't fail test if addLogMessage not available
        }
    });
}

/**
 * Calculate fitness metrics from collected telemetry samples
 * 
 * Metrics calculated:
 * - ITAE (Integral of Time-weighted Absolute Error)
 * - Overshoot (maximum deviation from target)
 * - Steady State Error (average error in final portion)
 * 
 * @param {Array} samples - Array of telemetry samples
 * @returns {Object} Fitness metrics
 */
function calculateFitnessFromTelemetry(samples) {
    if (!samples || samples.length === 0) {
        return {
            fitness: Infinity,
            itae: 0,
            overshoot: 0,
            steady_state_error: 0,
            raw: { samples: 0 }
        };
    }

    // Target angle for balancing is 0 degrees
    const targetAngle = 0;

    // Calculate ITAE (Integral of Time-weighted Absolute Error)
    let itae = 0;
    for (let i = 0; i < samples.length; i++) {
        const error = Math.abs(samples[i].pitch - targetAngle);
        const timeWeight = samples[i].timestamp / 1000; // Convert to seconds
        itae += error * timeWeight;
    }
    // Normalize by number of samples
    itae = itae / samples.length;

    // Calculate overshoot (maximum absolute deviation from target)
    let maxDeviation = 0;
    for (let i = 0; i < samples.length; i++) {
        const deviation = Math.abs(samples[i].pitch - targetAngle);
        if (deviation > maxDeviation) {
            maxDeviation = deviation;
        }
    }
    const overshoot = maxDeviation;

    // Calculate steady state error (average error in final 30% of test)
    const steadyStateStart = Math.floor(samples.length * 0.7);
    let sseSum = 0;
    let sseCount = 0;
    for (let i = steadyStateStart; i < samples.length; i++) {
        sseSum += Math.abs(samples[i].pitch - targetAngle);
        sseCount++;
    }
    const steadyStateError = sseCount > 0 ? (sseSum / sseCount) : 0;

    // Calculate fitness (same formula as before)
    const fitness = itae + (overshoot * 10) + (steadyStateError * 5);

    // Add stability penalty for oscillations
    let oscillationPenalty = 0;
    if (samples.length > 3) {
        let signChanges = 0;
        for (let i = 1; i < samples.length; i++) {
            const prevError = samples[i - 1].pitch - targetAngle;
            const currError = samples[i].pitch - targetAngle;
            if ((prevError > 0 && currError < 0) || (prevError < 0 && currError > 0)) {
                signChanges++;
            }
        }
        // Penalize excessive oscillations
        const oscillationRate = signChanges / samples.length;
        if (oscillationRate > 0.3) { // More than 30% sign changes
            oscillationPenalty = oscillationRate * 20;
        }
    }

    const finalFitness = fitness + oscillationPenalty;

    try {
        addLogMessage(`[TelemetryTest] Calculated fitness: ITAE=${itae.toFixed(2)}, Overshoot=${overshoot.toFixed(2)}°, SSE=${steadyStateError.toFixed(2)}°, Fitness=${finalFitness.toFixed(2)}`, 'info');
    } catch (_) {
        // Logging is optional - calculation continues even if logging fails
    }

    return {
        fitness: finalFitness,
        itae: itae,
        overshoot: overshoot,
        steady_state_error: steadyStateError,
        raw: {
            samples: samples.length,
            oscillationPenalty: oscillationPenalty
        }
    };
}

function updateBestDisplay(params) {
    if (typeof window.updateBestDisplay === 'function') {
        try { window.updateBestDisplay(params); } catch (e) { console.debug('[tuning_algorithms] updateBestDisplay error', e); }
    } else {
        // Fallback: simply log
        console.debug('[tuning_algorithms] Best params:', params);
    }
}

function updateProgressDisplay(current, total, bestFitness) {
    if (typeof window.updateProgressDisplay === 'function') {
        try { window.updateProgressDisplay(current, total, bestFitness); } catch (e) { console.debug('[tuning_algorithms] updateProgressDisplay error', e); }
    } else {
        fitnessChartData.push({ x: current, y: bestFitness });
        try { if (typeof window.updateFitnessChart === 'function') window.updateFitnessChart(); } catch (_) { }
    }
}

function updateFitnessChart() {
    if (typeof window.updateFitnessChart === 'function') {
        try { window.updateFitnessChart(); } catch (e) { console.debug('[tuning_algorithms] updateFitnessChart error', e); }
        return;
    }
    // fallback: no-op; charting is handled by UI
}

function addTestToResultsTable(testNum, params, fitness, itae, overshoot, testType = 'metrics_test', meta = {}) {
    if (typeof window.addTestToResultsTable === 'function') {
        try { window.addTestToResultsTable(testNum, params, fitness, itae, overshoot, testType, meta); } catch (e) { console.debug('[tuning_algorithms] addTestToResultsTable error', e); }
        return;
    }
    try { if (Array.isArray(window.tuningHistory)) window.tuningHistory.push({ idx: testNum, kp: params.kp, ki: params.ki, kd: params.kd, fitness, itae, overshoot, testType }); } catch (_) { }
}

function applyParameters(kp, ki, kd) {
    const loop = document.getElementById('tuning-loop-selector').value;
    const paramKeys = getPIDParamKeys(loop);

    // Send parameters to robot
    sendBleCommand('set_param', { key: paramKeys.kp, value: kp });
    sendBleCommand('set_param', { key: paramKeys.ki, value: ki });
    sendBleCommand('set_param', { key: paramKeys.kd, value: kd });

    showNotification(`Zastosowano parametry: Kp=${kp.toFixed(3)}, Ki=${ki.toFixed(3)}, Kd=${kd.toFixed(3)}`);
}

/**
 * Send baseline PID parameters to robot
 * Called when pausing tuning to restore safe balancing state
 */
function sendBaselinePIDToRobot() {
    const loop = document.getElementById('tuning-loop-selector')?.value || 'balance';
    const paramKeys = getPIDParamKeys(loop);

    // Send baseline parameters to robot
    sendBleCommand('set_param', { key: paramKeys.kp, value: baselinePID.kp });
    sendBleCommand('set_param', { key: paramKeys.ki, value: baselinePID.ki });
    sendBleCommand('set_param', { key: paramKeys.kd, value: baselinePID.kd });

    console.log(`[Tuning] Restored baseline PID: Kp=${baselinePID.kp.toFixed(3)}, Ki=${baselinePID.ki.toFixed(3)}, Kd=${baselinePID.kd.toFixed(3)}`);
}

/**
 * Capture current PID parameters as baseline
 * Called at the start of tuning session
 */
function captureBaselinePID() {
    const loop = document.getElementById('tuning-loop-selector')?.value || 'balance';

    // Map loop type to input element IDs
    let kpInputId, kiInputId, kdInputId;
    if (loop === 'balance') {
        kpInputId = 'balanceKpInput';
        kiInputId = 'balanceKiInput';
        kdInputId = 'balanceKdInput';
    } else if (loop === 'speed') {
        kpInputId = 'speedKpInput';
        kiInputId = 'speedKiInput';
        kdInputId = 'speedKdInput';
    } else if (loop === 'position') {
        kpInputId = 'positionKpInput';
        kiInputId = 'positionKiInput';
        kdInputId = 'positionKdInput';
    }

    // Read current values from UI
    const kpElement = document.getElementById(kpInputId);
    const kiElement = document.getElementById(kiInputId);
    const kdElement = document.getElementById(kdInputId);

    if (kpElement && kiElement && kdElement) {
        baselinePID.kp = parseFloat(kpElement.value) || 0;
        baselinePID.ki = parseFloat(kiElement.value) || 0;
        baselinePID.kd = parseFloat(kdElement.value) || 0;

        console.log(`[Tuning] Captured baseline PID: Kp=${baselinePID.kp.toFixed(3)}, Ki=${baselinePID.ki.toFixed(3)}, Kd=${baselinePID.kd.toFixed(3)}`);
    } else {
        console.warn('[Tuning] Could not capture baseline PID - input elements not found');
    }
}

// ========================================================================
// GENETIC ALGORITHM
// ========================================================================

class GeneticAlgorithm {
    constructor(config) {
        this.populationSize = config.populationSize || 20;
        this.generations = config.generations || 30;
        this.mutationRate = config.mutationRate || 0.1;
        this.crossoverRate = config.crossoverRate || 0.7;
        this.elitism = config.elitism !== false;
        this.searchSpace = config.searchSpace;

        this.population = [];
        this.generation = 0;
        this.bestIndividual = null;
        this.isRunning = false;
        this.isPaused = false;
        this.testCounter = 0;
        // Debug id to correlate logs for multiple sessions
        this._debugId = (Date.now() >>> 0) & 0xFFFF;
        try { addLogMessage(`[GA:${this._debugId}] Constructed GA session: pop=${this.populationSize} gen=${this.generations}`, 'info'); } catch (e) { console.debug('[GA] log failed', e); }
    }

    initialize() {
        this.population = [];
        for (let i = 0; i < this.populationSize; i++) {
            this.population.push(this.createRandomIndividual());
        }
        // Seed first individual with baseline PID captured from UI (if available)
        if (typeof baselinePID !== 'undefined' && baselinePID && typeof baselinePID.kp === 'number') {
            this.population[0] = { kp: baselinePID.kp, ki: baselinePID.ki, kd: baselinePID.kd, fitness: Infinity };
        }
        this.generation = 0;
        this.testCounter = 0;
        fitnessChartData = [];
        try { addLogMessage(`[GA:${this._debugId}] initialize: population length = ${this.population.length}`, 'info'); } catch (e) { console.debug('GA init log failed', e); }
        // Safety: if population ended up empty for some reason, repopulate with at least 1
        if (!this.population || this.population.length === 0) {
            const fallbackSize = Math.max(1, this.populationSize || 20);
            for (let i = 0; i < fallbackSize; i++) {
                this.population.push(this.createRandomIndividual());
            }
            try { addLogMessage(`[GA:${this._debugId}] Warning: population was empty, repopulated to ${this.population.length}`, 'warn'); } catch (e) { console.debug('GA repopulate warn', e); }
        }
    }

    createRandomIndividual() {
        const includeKi = !!document.getElementById('include-ki-checkbox')?.checked;
        const getRandom = (min, max) => Math.random() * (max - min) + min;
        return {
            kp: getRandom(this.searchSpace.kp_min, this.searchSpace.kp_max),
            ki: includeKi ? getRandom(this.searchSpace.ki_min, this.searchSpace.ki_max) : (baselinePID?.ki ?? ((this.searchSpace.ki_min + this.searchSpace.ki_max) / 2)),
            kd: getRandom(this.searchSpace.kd_min, this.searchSpace.kd_max),
            fitness: Infinity
        };
    }

    async evaluateFitness(individual) {
        this.testCounter++;
        try {
            // NEW: Use telemetry-based test instead of run_metrics_test command
            const res = await runTelemetryBasedTest(individual.kp, individual.ki, individual.kd);
            individual.fitness = res.fitness;
            // Wykres: X = generacja + indeks/populacja
            try { fitnessChartData.push({ x: this.generation + (this.testCounter / Math.max(1, this.population.length)), y: res.fitness }); updateFitnessChart(); } catch (_) { }
            const meta = { gen: this.generation + 1, totalGen: this.generations, individualIdx: this.testCounter, pop: this.population.length };
            addTestToResultsTable(this.testCounter, individual, res.fitness, res.itae, res.overshoot, 'telemetry_test', meta);
            return res.fitness;
        } catch (err) {
            if (err && err.reason === 'interrupted_by_emergency') {
                throw err; // obsługa w runGeneration
            }
            // Penalizuj i kontynuuj
            individual.fitness = Infinity;
            addTestToResultsTable(this.testCounter, individual, Infinity, 0, 0, 'telemetry_test');
            return Infinity;
        }
    }

    async runGeneration() {
        // Evaluate all individuals
        for (let i = 0; i < this.population.length; i++) {
            // Pause handling - keep loop alive while paused
            while (this.isPaused && this.isRunning) {
                await RB.helpers.delay(100);
            }

            if (!this.isRunning) break;

            // Update UI about the currently tested candidate
            try {
                if (typeof updateCurrentTestDisplay === 'function') updateCurrentTestDisplay(this.generation + 1, this.generations, i + 1, this.population.length, this.population[i].kp, this.population[i].ki, this.population[i].kd, this.population[i].fitness);
            } catch (_) { }

            if (this.population[i].fitness === Infinity) {
                try {
                    await this.evaluateFitness(this.population[i], i + 1);
                } catch (error) {
                    console.error('Test failed:', error);
                    // Handle emergency stop - pause and wait for user to resume
                    if (error && error.reason === 'interrupted_by_emergency') {
                        console.log('[GA] Emergency stop detected, entering pause state');
                        this.isPaused = true;
                        sendBaselinePIDToRobot();

                        // Wait for resume
                        while (this.isPaused && this.isRunning) {
                            await RB.helpers.delay(100);
                        }

                        // Retry the same test after resume
                        if (this.isRunning) {
                            console.log('[GA] Retrying interrupted test after resume');
                            i--; // Retry this individual
                            continue;
                        }
                    } else {
                        // Other errors - mark as failed
                        this.population[i].fitness = Infinity;
                    }
                }
            } else {
                // Already has a fitness; refresh UI with its fitness value
                try { if (typeof updateCurrentTestDisplay === 'function') updateCurrentTestDisplay(this.generation + 1, this.generations, i + 1, this.population.length, this.population[i].kp, this.population[i].ki, this.population[i].kd, this.population[i].fitness); } catch (_) { }
            }
        }

        // Sort by fitness
        this.population.sort((a, b) => a.fitness - b.fitness);

        // Update best
        if (!this.bestIndividual || this.population[0].fitness < this.bestIndividual.fitness) {
            this.bestIndividual = { ...this.population[0] };
            updateBestDisplay(this.bestIndividual);
        }

        // Create new population
        const newPopulation = [];

        // Elitism
        if (this.elitism) {
            newPopulation.push({ ...this.population[0] });
        }

        // Selection, crossover, mutation
        while (newPopulation.length < this.populationSize) {
            const parent1 = this.tournamentSelection();
            const parent2 = this.tournamentSelection();

            let offspring;
            if (Math.random() < this.crossoverRate) {
                offspring = this.crossover(parent1, parent2);
            } else {
                offspring = { ...parent1 };
            }

            offspring = this.mutate(offspring);
            offspring.fitness = Infinity;
            newPopulation.push(offspring);
        }

        this.population = newPopulation;
        this.generation++;

        updateProgressDisplay(this.generation, this.generations, this.bestIndividual.fitness);
    }

    tournamentSelection() {
        const tournamentSize = 3;
        let best = null;

        for (let i = 0; i < tournamentSize; i++) {
            const candidate = this.population[Math.floor(Math.random() * this.population.length)];
            if (!best || candidate.fitness < best.fitness) {
                best = candidate;
            }
        }

        return best;
    }

    crossover(parent1, parent2) {
        const alpha = Math.random();
        return {
            kp: alpha * parent1.kp + (1 - alpha) * parent2.kp,
            ki: alpha * parent1.ki + (1 - alpha) * parent2.ki,
            kd: alpha * parent1.kd + (1 - alpha) * parent2.kd,
            fitness: Infinity
        };
    }

    mutate(individual) {
        const mutated = { ...individual };

        if (Math.random() < this.mutationRate) {
            mutated.kp += (Math.random() - 0.5) * (this.searchSpace.kp_max - this.searchSpace.kp_min) * 0.1;
            mutated.kp = Math.max(this.searchSpace.kp_min, Math.min(this.searchSpace.kp_max, mutated.kp));
        }

        const includeKi = !!document.getElementById('include-ki-checkbox')?.checked;
        if (includeKi && Math.random() < this.mutationRate) {
            mutated.ki += (Math.random() - 0.5) * (this.searchSpace.ki_max - this.searchSpace.ki_min) * 0.1;
            mutated.ki = Math.max(this.searchSpace.ki_min, Math.min(this.searchSpace.ki_max, mutated.ki));
        }

        if (Math.random() < this.mutationRate) {
            mutated.kd += (Math.random() - 0.5) * (this.searchSpace.kd_max - this.searchSpace.kd_min) * 0.1;
            mutated.kd = Math.max(this.searchSpace.kd_min, Math.min(this.searchSpace.kd_max, mutated.kd));
        }

        return mutated;
    }

    async run() {
        this.isRunning = true;
        try {
            this.initialize();
            const progressEl = document.getElementById('tuning-progress-panel');
            if (progressEl) progressEl.style.display = 'block';
            try { addLogMessage(`[GA:${this._debugId}] run() started: generations=${this.generations} population=${this.population.length}`, 'info'); } catch (e) { console.debug('[GA] run start log failed', e); }

            while (this.generation < this.generations && this.isRunning) {
                if (!this.isPaused) {
                    await this.runGeneration();
                } else {
                    await RB.helpers.delay(100);
                }
            }

            this.isRunning = false;
            // Be defensive: bestIndividual might be null if initialization failed or no population
            try {
                if (this.bestIndividual && typeof this.bestIndividual.fitness === 'number' && isFinite(this.bestIndividual.fitness)) {
                    showNotification(`Optymalizacja GA zakończona! Najlepsze fitness: ${this.bestIndividual.fitness.toFixed(4)}`);
                } else {
                    showNotification(`Optymalizacja GA zakończona: brak wyników`);
                }
            } catch (err) {
                console.error('[GA] showNotification error:', err);
            }
            try { addLogMessage(`[GA:${this._debugId}] run() finished: generation=${this.generation} population=${this.population.length} best=${this.bestIndividual ? JSON.stringify(this.bestIndividual) : 'null'}`, 'info'); } catch (e) { console.debug('[GA] run finish log failed', e); }
        } catch (err) {
            this.isRunning = false;
            console.error(`[GA:${this._debugId}] run() error:`, err);
            try { addLogMessage(`[GA:${this._debugId}] run() error: ${err && err.message ? err.message : String(err)}`, 'error'); } catch (e) { console.debug('[GA] log failed', e); }
            throw err;
        }
    }

    pause() {
        this.isPaused = true;
        // Restore baseline PID to robot when pausing
        // This happens after current test completes (see runGeneration loop)
        setTimeout(() => {
            if (this.isPaused) {
                sendBaselinePIDToRobot();
            }
        }, 100);
    }

    resume() {
        this.isPaused = false;
    }

    stop() {
        this.isRunning = false;
        // Restore baseline PID when stopping
        sendBaselinePIDToRobot();
    }
}

// ========================================================================
// PSO ALGORITHM
// ========================================================================

class ParticleSwarmOptimization {
    constructor(config) {
        this.numParticles = config.numParticles || 20;
        this.iterations = config.iterations || 30;
        this.inertiaWeight = config.inertiaWeight || 0.7;
        this.cognitiveWeight = config.cognitiveWeight || 1.5;
        this.socialWeight = config.socialWeight || 1.5;
        this.searchSpace = config.searchSpace;

        this.particles = [];
        this.globalBest = null;
        this.iteration = 0;
        this.isRunning = false;
        this.isPaused = false;
        this.testCounter = 0;
        this._debugId = (Date.now() >>> 0) & 0xFFFF;
        try { addLogMessage(`[PSO:${this._debugId}] Constructed PSO: particles=${this.numParticles} iterations=${this.iterations}`, 'info'); } catch (e) { console.debug('[PSO] log failed', e); }
    }

    initialize() {
        this.particles = [];
        for (let i = 0; i < this.numParticles; i++) {
            this.particles.push(this.createRandomParticle());
        }
        // Seed first particle/position with baseline PID if available
        if (typeof baselinePID !== 'undefined' && baselinePID && typeof baselinePID.kp === 'number') {
            this.particles[0] = { position: { kp: baselinePID.kp, ki: baselinePID.ki, kd: baselinePID.kd }, velocity: { kp: 0, ki: 0, kd: 0 }, bestPosition: { kp: baselinePID.kp, ki: baselinePID.ki, kd: baselinePID.kd }, bestFitness: Infinity, fitness: Infinity };
        }
        this.globalBest = null;
        this.iteration = 0;
        this.testCounter = 0;
        fitnessChartData = [];
    }

    createRandomParticle() {
        const includeKi = !!document.getElementById('include-ki-checkbox')?.checked;
        const getRandom = (min, max) => Math.random() * (max - min) + min;
        const position = {
            kp: getRandom(this.searchSpace.kp_min, this.searchSpace.kp_max),
            ki: includeKi ? getRandom(this.searchSpace.ki_min, this.searchSpace.ki_max) : (baselinePID?.ki ?? ((this.searchSpace.ki_min + this.searchSpace.ki_max) / 2)),
            kd: getRandom(this.searchSpace.kd_min, this.searchSpace.kd_max)
        };

        return {
            position: position,
            velocity: { kp: 0, ki: 0, kd: 0 },
            bestPosition: { ...position },
            bestFitness: Infinity,
            fitness: Infinity
        };
    }

    async evaluateFitness(particle, idx = 0) {
        this.testCounter++;

        // Update current test display (when starting)
        try {
            if (typeof updateCurrentTestDisplay === 'function') {
                updateCurrentTestDisplay(this.iteration + 1, this.iterations, idx, this.particles.length, particle.position.kp, particle.position.ki, particle.position.kd, particle.fitness);
            }
        } catch (_) { }

        try {
            // NEW: Use telemetry-based test instead of run_metrics_test command
            const res = await runTelemetryBasedTest(particle.position.kp, particle.position.ki, particle.position.kd);

            const fitness = res.fitness;
            particle.fitness = fitness;

            if (fitness < particle.bestFitness) {
                particle.bestFitness = fitness;
                particle.bestPosition = { ...particle.position };
            }

            if (!this.globalBest || fitness < this.globalBest.fitness) {
                this.globalBest = {
                    position: { ...particle.position },
                    fitness: fitness
                };
                updateBestDisplay(this.globalBest.position);
            }

            const meta = { gen: this.iteration + 1, totalGen: this.iterations, individualIdx: idx, pop: this.particles.length };
            try {
                fitnessChartData.push({ x: this.iteration + (idx / Math.max(1, this.particles.length)), y: fitness });
                updateFitnessChart();
            } catch (_) { }

            addTestToResultsTable(this.testCounter, particle.position, fitness, res.itae, res.overshoot, 'telemetry_test', meta);

            return fitness;
        } catch (error) {
            console.error('[PSO] Test failed:', error);
            particle.fitness = Infinity;
            addTestToResultsTable(this.testCounter, particle.position, Infinity, 0, 0, 'telemetry_test');
            throw error;
        }
    }

    async runIteration() {
        // Evaluate all particles
        for (let i = 0; i < this.particles.length; i++) {
            if (this.isPaused) {
                await RB.helpers.delay(100);
                i--;
                continue;
            }

            if (!this.isRunning) break;

            try {
                try { if (typeof updateCurrentTestDisplay === 'function') updateCurrentTestDisplay(this.iteration + 1, this.iterations, i + 1, this.particles.length, this.particles[i].position.kp, this.particles[i].position.ki, this.particles[i].position.kd, this.particles[i].fitness); } catch (_) { }
                await this.evaluateFitness(this.particles[i], i + 1);
            } catch (error) {
                console.error('Test failed:', error);

                // Handle emergency stop - pause and wait for user to resume
                if (error.reason === 'interrupted_by_emergency') {
                    console.log('[PSO] Emergency stop detected, entering pause state');
                    this.isPaused = true;
                    sendBaselinePIDToRobot();

                    // Wait for resume
                    while (this.isPaused && this.isRunning) {
                        await RB.helpers.delay(100);
                    }

                    // Retry the same test after resume
                    if (this.isRunning) {
                        console.log('[PSO] Retrying interrupted test after resume');
                        i--; // Retry this particle
                        continue;
                    }
                } else {
                    // Other errors - mark as failed
                    this.particles[i].fitness = Infinity;
                }
            }
        }

        // Update velocities and positions
        for (let particle of this.particles) {
            this.updateVelocity(particle);
            this.updatePosition(particle);
        }

        this.iteration++;
        updateProgressDisplay(this.iteration, this.iterations, this.globalBest ? this.globalBest.fitness : Infinity);
    }

    updateVelocity(particle) {
        const r1 = Math.random();
        const r2 = Math.random();

        for (let dim of ['kp', 'ki', 'kd']) {
            const cognitive = this.cognitiveWeight * r1 * (particle.bestPosition[dim] - particle.position[dim]);
            const social = this.socialWeight * r2 * (this.globalBest.position[dim] - particle.position[dim]);
            particle.velocity[dim] = this.inertiaWeight * particle.velocity[dim] + cognitive + social;

            // Velocity clamping
            const maxVel = (this.searchSpace[dim + '_max'] - this.searchSpace[dim + '_min']) * 0.2;
            particle.velocity[dim] = Math.max(-maxVel, Math.min(maxVel, particle.velocity[dim]));
        }
    }

    updatePosition(particle) {
        for (let dim of ['kp', 'ki', 'kd']) {
            particle.position[dim] += particle.velocity[dim];
            // Clamp to search space
            particle.position[dim] = Math.max(this.searchSpace[dim + '_min'],
                Math.min(this.searchSpace[dim + '_max'],
                    particle.position[dim]));
        }
    }

    async run() {
        this.isRunning = true;
        try {
            this.initialize();
            const progressEl = document.getElementById('tuning-progress-panel');
            if (progressEl) progressEl.style.display = 'block';

            while (this.iteration < this.iterations && this.isRunning) {
                if (!this.isPaused) {
                    await this.runIteration();
                } else {
                    await RB.helpers.delay(100);
                }
            }
            this.isRunning = false;
            try {
                if (this.globalBest && typeof this.globalBest.fitness === 'number' && isFinite(this.globalBest.fitness)) {
                    showNotification(`Optymalizacja PSO zakończona! Najlepsze fitness: ${this.globalBest.fitness.toFixed(4)}`);
                } else {
                    showNotification(`Optymalizacja PSO zakonczona: brak wynikow`);
                }
            } catch (err) {
                console.error('[PSO] showNotification error:', err);
            }
            try { addLogMessage(`[PSO] run finished: iteration=${this.iteration} particles=${this.particles.length} globalBest=${this.globalBest ? JSON.stringify(this.globalBest) : 'null'}`, 'info'); } catch (e) { console.debug('[PSO] log failed', e); }
        } catch (err) {
            this.isRunning = false;
            console.error('[PSO] run() error:', err);
            try { addLogMessage(`[PSO] run() error: ${err && err.message ? err.message : String(err)}`, 'error'); } catch (e) { console.debug('[PSO] log failed', e); }
            throw err;
        }
    }

    pause() {
        this.isPaused = true;
        // Restore baseline PID to robot when pausing
        setTimeout(() => {
            if (this.isPaused) {
                sendBaselinePIDToRobot();
            }
        }, 100);
    }

    resume() {
        this.isPaused = false;
    }

    stop() {
        this.isRunning = false;
        // Restore baseline PID when stopping
        sendBaselinePIDToRobot();
    }
}

// ========================================================================
// ZIEGLER-NICHOLS RELAY METHOD
// ========================================================================

class ZieglerNicholsRelay {
    constructor(config) {
        this.amplitude = config.amplitude || 2.0;
        this.minCycles = config.minCycles || 3;
        this.isRunning = false;

        this.oscillationData = [];
        this.peaks = [];
        this.valleys = [];
        this._debugId = (Date.now() >>> 0) & 0xFFFF;
        try { addLogMessage(`[ZN:${this._debugId}] Constructed ZN: amplitude=${this.amplitude} minCycles=${this.minCycles}`, 'info'); } catch (e) { console.debug('[ZN] log failed', e); }
    }

    async run() {
        this.isRunning = true;
        const testId = Date.now() >>> 0;

        this.oscillationData = [];
        this.peaks = [];
        this.valleys = [];

        try {
            const znDisplay = document.getElementById('zn-oscillation-display');
            if (znDisplay) znDisplay.style.display = 'block';

            // Notify UI that ZN test started
            try { if (typeof updateCurrentTestDisplay === 'function') updateCurrentTestDisplay(1, 1, 1, 1, 0, 0, 0, null); } catch (_) { }

            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('ZN test timeout'));
                }, 30000); // 30 second timeout

                const handler = (evt) => {
                    const data = (evt && evt.detail) ? evt.detail : evt;
                    if (data.type === 'relay_state' && Number(data.testId) === testId) {
                        this.oscillationData.push({
                            time: data.time,
                            angle: data.angle,
                            relayOutput: data.relay_output
                        });

                        this.detectPeaksValleys();
                        this.updateRelayChart();

                        const znCyclesEl = document.getElementById('zn-detected-cycles');
                        if (znCyclesEl) {
                            znCyclesEl.textContent = Math.min(this.peaks.length, this.valleys.length);
                        }

                        // Check if we have enough cycles
                        if (this.peaks.length >= this.minCycles && this.valleys.length >= this.minCycles) {
                            clearTimeout(timeout);
                            window.removeEventListener('ble_message', handler);

                            const results = this.calculateZNParameters();
                            this.displayResults(results);
                            // Update UI with derived parameters
                            try { if (typeof updateCurrentTestDisplay === 'function') updateCurrentTestDisplay(1, 1, 1, 1, results.kp, results.ki, results.kd, 0); } catch (_) { }
                            resolve(results);
                        }
                    } else if (data.type === 'test_complete' && Number(data.testId) === testId) {
                        clearTimeout(timeout);
                        window.removeEventListener('ble_message', handler);

                        if (this.peaks.length >= this.minCycles && this.valleys.length >= this.minCycles) {
                            const results = this.calculateZNParameters();
                            this.displayResults(results);
                            try { if (typeof updateCurrentTestDisplay === 'function') updateCurrentTestDisplay(1, 1, 1, 1, results.kp, results.ki, results.kd, 0); } catch (_) { }
                            resolve(results);
                        } else {
                            reject(new Error('Not enough oscillation cycles detected'));
                        }
                    }
                };

                window.addEventListener('ble_message', handler);
                // ACK handler to detect immediate NACK for relay test
                const ackHandlerZN = (evt) => {
                    const d = (evt && evt.detail) ? evt.detail : evt;
                    if (d.type === 'ack' && d.command === 'run_relay_test') {
                        if (!d.success) {
                            clearTimeout(timeout);
                            window.removeEventListener('ble_message', handler);
                            window.removeEventListener('ble_message', ackHandlerZN);
                            try { addLogMessage(`[ZN] run_relay_test ACK failed: ${d.message || 'N/A'}`, 'error'); } catch (e) { console.debug('[ZN] ack log failed', e); }
                            reject({ reason: 'ack_failed', message: d.message });
                            return;
                        } else {
                            window.removeEventListener('ble_message', ackHandlerZN);
                        }
                    }
                };
                window.addEventListener('ble_message', ackHandlerZN);

                try { addLogMessage(`[ZN] Sending run_relay_test: testId=${testId} amplitude=${this.amplitude}`, 'info'); } catch (e) { console.debug('[ZN] log failed', e); }
                sendBleCommand('run_relay_test', {
                    amplitude: this.amplitude,
                    testId: testId
                });
            });
        } catch (err) {
            this.isRunning = false;
            console.error('[ZN] run() error:', err);
            try { addLogMessage(`[ZN] run() error: ${err && err.message ? err.message : String(err)}`, 'error'); } catch (e) { console.debug('[ZN] log failed', e); }
            throw err;
        }
    }

    detectPeaksValleys() {
        const data = this.oscillationData;
        const n = data.length;
        if (n < 3) return;

        const last = data[n - 1];
        const prev = data[n - 2];
        const prevPrev = data[n - 3];

        // Peak detected
        if (prev.angle > prevPrev.angle && prev.angle > last.angle) {
            if (this.peaks.length === 0 || prev.time - this.peaks[this.peaks.length - 1].time > 0.1) {
                this.peaks.push({ time: prev.time, value: prev.angle });
            }
        }

        // Valley detected
        if (prev.angle < prevPrev.angle && prev.angle < last.angle) {
            if (this.valleys.length === 0 || prev.time - this.valleys[this.valleys.length - 1].time > 0.1) {
                this.valleys.push({ time: prev.time, value: prev.angle });
            }
        }
    }

    calculateZNParameters() {
        const peakValues = this.peaks.slice(-this.minCycles).map(p => p.value);
        const valleyValues = this.valleys.slice(-this.minCycles).map(v => v.value);

        const avgAmplitude = (mean(peakValues) - mean(valleyValues)) / 2;
        const ku = (4 * this.amplitude) / (Math.PI * avgAmplitude);

        // Calculate period
        const periods = [];
        for (let i = 1; i < this.peaks.length; i++) {
            periods.push(this.peaks[i].time - this.peaks[i - 1].time);
        }
        const tu = mean(periods);

        // Apply Z-N tuning rules
        return {
            ku: ku,
            tu: tu,
            kp: 0.6 * ku,
            ki: 1.2 * ku / tu,
            kd: 0.075 * ku * tu
        };
    }

    displayResults(results) {
        updateBestDisplay({ kp: results.kp, ki: results.ki, kd: results.kd, fitness: 0 });
        showNotification(`ZN: Ku=${results.ku.toFixed(3)}, Tu=${results.tu.toFixed(3)}s`);
    }

    updateRelayChart() {
        const canvas = document.getElementById('zn-oscillation-chart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (this.oscillationData.length === 0) return;

        const times = this.oscillationData.map(d => d.time);
        const angles = this.oscillationData.map(d => d.angle);

        const minTime = Math.min(...times);
        const maxTime = Math.max(...times);
        const minAngle = Math.min(...angles);
        const maxAngle = Math.max(...angles);

        const padding = 30;
        const width = canvas.width - 2 * padding;
        const height = canvas.height - 2 * padding;

        // Draw axes
        ctx.strokeStyle = '#61dafb';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padding, padding);
        ctx.lineTo(padding, canvas.height - padding);
        ctx.lineTo(canvas.width - padding, canvas.height - padding);
        ctx.stroke();

        // Draw oscillation
        ctx.strokeStyle = '#a2f279';
        ctx.lineWidth = 2;
        ctx.beginPath();

        this.oscillationData.forEach((point, i) => {
            const x = padding + ((point.time - minTime) / (maxTime - minTime + 0.001)) * width;
            const y = canvas.height - padding - ((point.angle - minAngle) / (maxAngle - minAngle + 0.001)) * height;

            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        ctx.stroke();

        // Mark peaks and valleys
        ctx.fillStyle = '#ff6b6b';
        this.peaks.forEach(peak => {
            const x = padding + ((peak.time - minTime) / (maxTime - minTime + 0.001)) * width;
            const y = canvas.height - padding - ((peak.value - minAngle) / (maxAngle - minAngle + 0.001)) * height;
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, 2 * Math.PI);
            ctx.fill();
        });

        ctx.fillStyle = '#4ecdc4';
        this.valleys.forEach(valley => {
            const x = padding + ((valley.time - minTime) / (maxTime - minTime + 0.001)) * width;
            const y = canvas.height - padding - ((valley.value - minAngle) / (maxAngle - minAngle + 0.001)) * height;
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, 2 * Math.PI);
            ctx.fill();
        });
    }

    stop() {
        this.isRunning = false;
        sendBleCommand('cancel_test', {});
        // Restore baseline PID when stopping
        sendBaselinePIDToRobot();
    }
}


// ========================================================================
// BAYESIAN OPTIMIZATION
// ========================================================================

class BayesianOptimization {
    constructor(config) {
        this.iterations = config.iterations || 25;
        this.initialSamples = config.initialSamples || 5;
        this.searchSpace = config.searchSpace;
        this.acquisitionFunction = config.acquisitionFunction || 'ei'; // ei, ucb, pi
        this.xi = config.xi || 0.01; // exploration parameter

        this.samples = [];
        this.iteration = 0;
        this.isRunning = false;
        this.neuralNetwork = null;
        this.testCounter = 0;
    }

    async initialize() {
        this.samples = [];
        this.iteration = 0;
        this.testCounter = 0;
        fitnessChartData = [];

        // Collect initial random samples
        for (let i = 0; i < this.initialSamples; i++) {
            const sample = this.sampleRandom();
            try {
                const fitness = await this.evaluateSample(sample);
                this.samples.push({ ...sample, fitness });
            } catch (error) {
                console.error('Initial sample failed:', error);
                this.samples.push({ ...sample, fitness: Infinity });
            }
        }

        // Optionally seed baseline PID as a sample to initialize surrogate
        if (typeof baselinePID !== 'undefined' && baselinePID && typeof baselinePID.kp === 'number') {
            const baseSample = { kp: baselinePID.kp, ki: baselinePID.ki, kd: baselinePID.kd };
            try {
                const fitness = await this.evaluateSample(baseSample);
                this.samples.push({ ...baseSample, fitness });
            } catch (error) {
                console.warn('Baseline sample evaluation failed:', error);
                this.samples.push({ ...baseSample, fitness: Infinity });
            }
        }
        // Train initial surrogate model
        await this.trainSurrogate();

        // Show visualization
        document.getElementById('bayesian-visualization').style.display = 'block';
        this.updateVisualization();
    }

    async trainSurrogate() {
        // Use ml5.js neural network as surrogate for Gaussian Process
        // In a real implementation, you'd use a proper GP library

        if (!this.neuralNetwork) {
            this.neuralNetwork = ml5.neuralNetwork({
                inputs: 3,
                outputs: 1,
                task: 'regression',
                layers: [
                    { type: 'dense', units: 32, activation: 'relu' },
                    { type: 'dense', units: 16, activation: 'relu' }
                ]
            });
        }

        // Clear previous data
        this.neuralNetwork.data.data.raw = [];

        // Add training data (filter out failed samples)
        const validSamples = this.samples.filter(s => s.fitness !== Infinity);
        validSamples.forEach(sample => {
            this.neuralNetwork.addData(
                { kp: sample.kp, ki: sample.ki, kd: sample.kd },
                { fitness: sample.fitness }
            );
        });

        if (validSamples.length < 2) {
            console.warn('Not enough valid samples to train surrogate');
            return;
        }

        await this.neuralNetwork.normalizeData();

        // Train with fewer epochs for faster iteration
        const trainingOptions = {
            epochs: 30,
            batchSize: Math.min(8, validSamples.length),
            validationSplit: 0.1
        };

        await this.neuralNetwork.train(trainingOptions);
    }

    async acquireNext() {
        // Use acquisition function to select next sample point
        let bestAcquisition = -Infinity;
        let bestSample = null;

        // Grid search over search space (coarse grid for speed)
        const gridSize = 8; // 8^3 = 512 points

        for (let i = 0; i < gridSize; i++) {
            for (let j = 0; j < gridSize; j++) {
                for (let k = 0; k < gridSize; k++) {
                    const kp = this.searchSpace.kp_min + (i / (gridSize - 1)) * (this.searchSpace.kp_max - this.searchSpace.kp_min);
                    const ki = this.searchSpace.ki_min + (j / (gridSize - 1)) * (this.searchSpace.ki_max - this.searchSpace.ki_min);
                    const kd = this.searchSpace.kd_min + (k / (gridSize - 1)) * (this.searchSpace.kd_max - this.searchSpace.kd_min);

                    const acquisition = await this.calculateAcquisition({ kp, ki, kd });
                    if (acquisition > bestAcquisition) {
                        bestAcquisition = acquisition;
                        bestSample = { kp, ki, kd };
                    }
                }
            }
        }

        return bestSample;
    }

    async calculateAcquisition(sample) {
        // Predict mean using neural network
        const prediction = await this.neuralNetwork.predict({ kp: sample.kp, ki: sample.ki, kd: sample.kd });
        const predictedFitness = prediction[0].fitness;

        // Find current best
        const validSamples = this.samples.filter(s => s.fitness !== Infinity);
        if (validSamples.length === 0) return 0;

        const currentBest = Math.min(...validSamples.map(s => s.fitness));

        // Calculate acquisition based on selected function
        if (this.acquisitionFunction === 'ei') {
            // Expected Improvement (simplified without proper GP uncertainty)
            const improvement = currentBest - predictedFitness;
            return Math.max(0, improvement + this.xi);
        } else if (this.acquisitionFunction === 'ucb') {
            // Upper Confidence Bound (simplified)
            // In real GP, we'd have proper uncertainty estimates
            const uncertainty = 1.0; // Placeholder - would come from GP
            return -predictedFitness + 2.0 * uncertainty;
        } else if (this.acquisitionFunction === 'pi') {
            // Probability of Improvement (simplified)
            const improvement = currentBest - predictedFitness;
            return improvement > 0 ? 1 : 0;
        }

        return -predictedFitness;
    }

    async evaluateSample(sample) {
        this.testCounter++;

        // Update UI about starting this sample
        try {
            if (typeof updateCurrentTestDisplay === 'function') {
                updateCurrentTestDisplay(this.iteration + 1, this.iterations, this.testCounter, this.initialSamples + 1, sample.kp, sample.ki, sample.kd, null);
            }
        } catch (_) { }

        try {
            // NEW: Use telemetry-based test instead of run_metrics_test command
            const res = await runTelemetryBasedTest(sample.kp, sample.ki, sample.kd);

            const fitness = res.fitness;

            // Update UI with resulting fitness for this sample
            try {
                if (typeof updateCurrentTestDisplay === 'function') {
                    updateCurrentTestDisplay(this.iteration + 1, this.iterations, this.testCounter, this.initialSamples + 1, sample.kp, sample.ki, sample.kd, fitness);
                }
            } catch (_) { }

            addTestToResultsTable(this.testCounter, sample, fitness, res.itae, res.overshoot, 'telemetry_test');

            return fitness;
        } catch (error) {
            console.error('[Bayesian] Test failed:', error);
            addTestToResultsTable(this.testCounter, sample, Infinity, 0, 0, 'telemetry_test');
            throw error;
        }
    }

    sampleRandom() {
        const includeKi = !!document.getElementById('include-ki-checkbox')?.checked;
        const getRandom = (min, max) => Math.random() * (max - min) + min;
        return {
            kp: getRandom(this.searchSpace.kp_min, this.searchSpace.kp_max),
            ki: includeKi ? getRandom(this.searchSpace.ki_min, this.searchSpace.ki_max) : (baselinePID?.ki ?? ((this.searchSpace.ki_min + this.searchSpace.ki_max) / 2)),
            kd: getRandom(this.searchSpace.kd_min, this.searchSpace.kd_max)
        };
    }

    updateVisualization() {
        const canvas = document.getElementById('bayesian-space-chart');
        const ctx = canvas.getContext('2d');

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (this.samples.length === 0) return;

        // For visualization, we'll plot Kp vs Kd (most important dimensions)
        const padding = 40;
        const width = canvas.width - 2 * padding;
        const height = canvas.height - 2 * padding;

        // Draw axes
        ctx.strokeStyle = '#61dafb';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padding, padding);
        ctx.lineTo(padding, canvas.height - padding);
        ctx.lineTo(canvas.width - padding, canvas.height - padding);
        ctx.stroke();

        // Labels
        ctx.fillStyle = '#ffffff';
        ctx.font = '12px Arial';
        ctx.fillText('Kp', canvas.width - padding + 5, canvas.height - padding + 5);
        ctx.fillText('Kd', padding - 30, padding);

        // Find best sample
        const validSamples = this.samples.filter(s => s.fitness !== Infinity);
        const bestSample = validSamples.length > 0 ?
            validSamples.reduce((a, b) => a.fitness < b.fitness ? a : b) : null;

        // Plot all samples
        this.samples.forEach(sample => {
            if (sample.fitness === Infinity) return;

            const x = padding + ((sample.kp - this.searchSpace.kp_min) / (this.searchSpace.kp_max - this.searchSpace.kp_min)) * width;
            const y = canvas.height - padding - ((sample.kd - this.searchSpace.kd_min) / (this.searchSpace.kd_max - this.searchSpace.kd_min)) * height;

            // Color based on fitness (gradient from red=bad to blue=good)
            const minFitness = Math.min(...validSamples.map(s => s.fitness));
            const maxFitness = Math.max(...validSamples.map(s => s.fitness));
            const normalized = (sample.fitness - minFitness) / (maxFitness - minFitness + 0.001);
            const hue = (1 - normalized) * 240; // 240=blue (good), 0=red (bad)

            ctx.fillStyle = `hsl(${hue}, 70%, 50%)`;
            ctx.beginPath();
            ctx.arc(x, y, 5, 0, 2 * Math.PI);
            ctx.fill();
        });

        // Highlight best sample
        if (bestSample) {
            const x = padding + ((bestSample.kp - this.searchSpace.kp_min) / (this.searchSpace.kp_max - this.searchSpace.kp_min)) * width;
            const y = canvas.height - padding - ((bestSample.kd - this.searchSpace.kd_min) / (this.searchSpace.kd_max - this.searchSpace.kd_min)) * height;

            ctx.strokeStyle = '#a2f279';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(x, y, 8, 0, 2 * Math.PI);
            ctx.stroke();
        }
    }

    async run() {
        this.isRunning = true;
        try {
            const progressEl = document.getElementById('tuning-progress-panel');
            if (progressEl) progressEl.style.display = 'block';
            try { showNotification('Inicjalizacja Bayesian Optimization...'); } catch (e) { console.debug('[Bayes] notify init failed', e); }

            await this.initialize();

            while (this.iteration < this.iterations && this.isRunning) {
                // 1. Select next sample using acquisition function
                const nextSample = await this.acquireNext();

                if (!nextSample) {
                    console.error('Failed to acquire next sample');
                    break;
                }

                // 2. Evaluate it
                try {
                    const fitness = await this.evaluateSample(nextSample);
                    this.samples.push({ ...nextSample, fitness });
                } catch (error) {
                    console.error('Sample evaluation failed:', error);
                    this.samples.push({ ...nextSample, fitness: Infinity });
                }

                // 3. Update surrogate model
                await this.trainSurrogate();

                // 4. Update visualization and display
                const validSamples = this.samples.filter(s => s.fitness !== Infinity);
                const best = validSamples.length > 0 ?
                    validSamples.reduce((a, b) => a.fitness < b.fitness ? a : b) : null;

                if (best) {
                    updateBestDisplay(best);
                    updateProgressDisplay(this.iteration + 1, this.iterations, best.fitness);
                }

                this.updateVisualization();

                this.iteration++;
            }

            this.isRunning = false;

            const validSamples = this.samples.filter(s => s.fitness !== Infinity);
            const best = validSamples.length > 0 ?
                validSamples.reduce((a, b) => a.fitness < b.fitness ? a : b) : null;

            if (best) {
                try {
                    if (best && typeof best.fitness === 'number' && isFinite(best.fitness)) {
                        showNotification(`Bayesian Optimization zakończona! Najlepsze fitness: ${best.fitness.toFixed(4)}`);
                    } else {
                        showNotification('Bayesian Optimization zakończona - brak udanych testów');
                    }
                } catch (err) {
                    console.error('[Bayes] showNotification error:', err);
                }
            } else {
                showNotification('Bayesian Optimization zakończona - brak udanych testów');
            }
        } catch (err) {
            this.isRunning = false;
            console.error('[Bayes] run() error:', err);
            try { addLogMessage(`[Bayes] run() error: ${err && err.message ? err.message : String(err)}`, 'error'); } catch (e) { console.debug('[Bayes] log failed', e); }
            throw err;
        }
    }

    stop() {
        this.isRunning = false;
        // Restore baseline PID when stopping
        sendBaselinePIDToRobot();
    }
}
