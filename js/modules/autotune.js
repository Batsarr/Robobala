// ========================================================================
// AUTOTUNE - Moduł automatycznego strojenia PID (ES6 Module)
// ========================================================================
//
// Zawiera: GA, PSO, Bayesian Optimization, chart helpers, session management,
// dynamic tests, fitness modal, search space, UI lock, tabs.
//
// Cross-module calls via window.*:
//   sendBleMessage, addLogMessage, commLayer, appStore, AppState,
//   relocateAutotuneChart, setSignButtons, RB, tuningHistory, refreshRecentList,
//   initSystemIdentification, initFusionPIDProfiles
// ========================================================================

// ========================================================================
// CHART
// ========================================================================

let autotuneTuningChart; let autotuneChartData = { labels: [], datasets: [] };
function initAutotuneTuningChart() {
    const canvas = document.getElementById('autotuneTuningChart');
    if (!canvas) { return; }
    const ctx = canvas.getContext('2d');
    autotuneTuningChart = new Chart(ctx, { type: 'line', data: autotuneChartData, options: { animation: false, responsive: true, maintainAspectRatio: false, scales: { x: { display: false }, y: { type: 'linear', display: true, position: 'left', ticks: { color: '#61dafb' } } }, plugins: { legend: { labels: { color: '#fff' } } } } });
}
function updateAutotuneTuningChart(data) {
    if (!autotuneTuningChart) return;
    if (autotuneTuningChart.data.labels.length >= 200) { autotuneTuningChart.data.labels.shift(); autotuneTuningChart.data.datasets.forEach(dataset => dataset.data.shift()); }
    autotuneTuningChart.data.labels.push(data.timestamp || '');
    const mapDataToDataset = (label, value, color) => {
        let dataset = autotuneTuningChart.data.datasets.find(ds => ds.label === label);
        if (!dataset) { dataset = { label: label, data: [], borderColor: color, fill: false, tension: 0.1, pointRadius: 0 }; autotuneTuningChart.data.datasets.push(dataset); }
        dataset.data.push(value);
    };
    if (data.pitch !== undefined) mapDataToDataset('Pitch', data.pitch, '#61dafb');
    if (data.target_pitch !== undefined) mapDataToDataset('Target Pitch', data.target_pitch, '#a2f279');
    autotuneTuningChart.update('none');
}

// ========================================================================
// TABS
// ========================================================================

// Ujednolicony przełącznik zakładek metod (zapobiega dublowaniu listenerów)
function activateMethodTab(method) {
    if (!method) return;
    if (AppState.isTuningActive) return; // blokada podczas strojenia

    const btn = document.querySelector(`.method-tab[data-method="${method}"]`);
    const content = document.querySelector(`.method-content[data-method="${method}"]`);
    if (!btn || !content) return;

    document.querySelectorAll('.method-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.method-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    content.classList.add('active');

    // Reset danych wykresu dla nowej karty
    try { autotuneChartData.labels = []; autotuneChartData.datasets = []; autotuneTuningChart.update(); } catch (e) { }

    // Stabilizacja wysokości akordeonu (kilkukrotne wymuszenie)
    const accordionContent = document.querySelector('#autotuning-card-content')?.closest('.accordion-content');
    if (accordionContent && !accordionContent.classList.contains('autotune-pane')) {
        let attempts = 0; let lastHeight = 0;
        const intervalId = setInterval(() => {
            const currentHeight = accordionContent.scrollHeight;
            if (currentHeight >= lastHeight) {
                accordionContent.style.maxHeight = (currentHeight + 30) + 'px';
                lastHeight = currentHeight;
            }
            attempts++;
            if (attempts >= 5) clearInterval(intervalId);
        }, 30);
    }

    // Ustaw pozycję wykresu względem wybranej metody
    relocateAutotuneChart(method);

    // Odblokuj Start po wyborze metody
    const startBtn = document.getElementById('start-tuning-btn');
    if (startBtn) startBtn.disabled = false;
    // If Bayesian tab is selected, ensure ml5 is available
    if (method === 'bayesian') {
        ensureTuningDependencies('bayesian').then(() => { try { addLogMessage('[UI] Bayesian support (ml5) zaladowany.', 'info'); } catch (_) { } }).catch(err => { try { addLogMessage('[UI] Nie mozna zaladowac ml5: ' + err.message, 'warn'); } catch (_) { } });
    }
}

function setupAutotuningTabs() {
    document.querySelectorAll('.method-tab').forEach(tab => {
        tab.addEventListener('click', function () {
            activateMethodTab(this.dataset.method);
        });
    });
    document.querySelectorAll('input[type="range"]').forEach(range => {
        const valueDisplay = document.getElementById(range.id + '-val');
        if (valueDisplay) {
            range.addEventListener('input', () => {
                let unit = valueDisplay.dataset.unit || '';
                valueDisplay.textContent = range.value + unit;
                if (range.id === 'ga-generations') document.getElementById('ga-gen-total').textContent = range.value;
                if (range.id === 'pso-iterations') document.getElementById('pso-it-total').textContent = range.value;
                if (range.id.includes('-weight-')) valueDisplay.textContent = range.value + '%';
            });
            range.dispatchEvent(new Event('input'));
        }
    });
    // Legacy przyciski (GA/PSO/ZN sterowane przez robota) – usunięte
    // Obsługa testów dynamicznych (impuls, prędkość)
    const impulseBtn = document.getElementById('run-impulse-test');
    if (impulseBtn) impulseBtn.addEventListener('click', function () {
        const power = parseInt(document.getElementById('impulsePowerInput').value) || 40;
        sendBleMessage({ type: 'execute_position_test_impulse', impulse_power: power });
        addLogMessage('[UI] Wysłano test impulsu pozycji.', 'info');
    });
    const speedBtn = document.getElementById('run-speed-test');
    if (speedBtn) speedBtn.addEventListener('click', function () {
        const dist = parseFloat(document.getElementById('distanceCmInput').value) || 50;
        const speed = parseFloat(document.getElementById('speedCmpsInput').value) || 20;
        sendBleMessage({ type: 'execute_speed_test_run', distance_cm: dist, speed_cmps: speed });
        addLogMessage('[UI] Wysłano test prędkości.', 'info');
    });
    document.querySelectorAll('.run-test-btn').forEach(btn => btn.addEventListener('click', function () { runDynamicTest(this.dataset.testType); }));
    const __loopSel = document.getElementById('tuning-loop-selector');
    if (__loopSel) __loopSel.addEventListener('change', updateSearchSpaceInputs);
    updateSearchSpaceInputs();
}

// Główne zakładki w panelu optymalizacji (Konfiguracja/Metody)
function setupMainAutotuneTabs() {
    const tabs = document.querySelectorAll('.autotune-main-tab');
    const panes = document.querySelectorAll('.autotune-main-content');
    const controlsBar = document.getElementById('tuning-controls-bar');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const target = tab.dataset.tab;
            tabs.forEach(t => t.classList.remove('active'));
            panes.forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            document.querySelector(`.autotune-main-content[data-tab="${target}"]`)?.classList.add('active');
            // Pokaż przyciski sterujące na zakładce 'methods' lub zawsze, gdy sesja strojenia jest aktywna
            if (controlsBar) controlsBar.style.display = (target === 'methods' || AppState.isTuningActive) ? 'flex' : 'none';
        });
    });
    // Ustaw widoczność kontrolek zgodnie z aktywną zakładką na starcie
    const activeMain = document.querySelector('.autotune-main-tab.active')?.dataset.tab || 'config';
    if (controlsBar) controlsBar.style.display = (activeMain === 'methods' || AppState.isTuningActive) ? 'flex' : 'none';
}

// ========================================================================
// ALGORITHM LOADING
// ========================================================================

// Ensure algorithm classes (GA/PSO/ZN/Bayesian) and optional ML dependencies (ml5) are available.
function ensureTuningDependencies(method) {
    return new Promise(async (resolve, reject) => {
        // If we've already flagged the algorithms as loaded (inlined or previously set), only ensure ml5 if Bayesian is requested
        if (window.__tuning_algos_loaded) {
            if (method === 'bayesian' && typeof window.ml5 === 'undefined') {
                try { await loadMl5(); resolve(true); } catch (e) { reject(e); }
                return;
            }
            resolve(true);
            return;
        }

        // When the code is inlined in main.js we simply mark them as loaded and optionally load ml5
        window.__tuning_algos_loaded = true;
        if (method === 'bayesian' && typeof window.ml5 === 'undefined') {
            try { await loadMl5(); resolve(true); } catch (e) { reject(e); }
            return;
        }
        resolve(true);
    });
}

function loadMl5() {
    return new Promise((resolve, reject) => {
        if (typeof window.ml5 !== 'undefined') return resolve(true);
        const src = 'https://unpkg.com/ml5@0.6.1/dist/ml5.min.js';
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        let handled = false;
        const to = setTimeout(() => { if (!handled) { handled = true; reject(new Error('Timed out loading ml5')); } }, 15000);
        script.onload = () => { clearTimeout(to); handled = true; console.info('[UI] ml5 loaded'); resolve(true); };
        script.onerror = (e) => { clearTimeout(to); if (!handled) { handled = true; reject(new Error('Failed to load ml5')); } };
        document.head.appendChild(script);
    });
}

// ========================================================================
// FITNESS & TUNING HELPERS
// ========================================================================

// Global tuning session management
let fitnessChartData = [];

// Baseline PID parameters (captured from UI)
let baselinePID = { kp: 0, ki: 0, kd: 0 };
const PARAMETER_SETTLING_TIME_MS = 300;

function showNotification(message) {
    if (typeof addLogMessage === 'function') {
        addLogMessage(`[Tuning] ${message}`, 'info');
    } else {
        console.log(`[Notification] ${message}`);
    }
}

function mean(arr) { if (!Array.isArray(arr) || arr.length === 0) return 0; return arr.reduce((a, b) => a + b, 0) / arr.length; }

function computeTestTimeout() {
    const trialInput = document.getElementById('tuningTrialDurationInput');
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

function getPIDParamKeys(loop) {
    let suffix = '';
    if (loop === 'balance') suffix = 'b';
    else if (loop === 'speed') suffix = 's';
    else if (loop === 'position') suffix = 'p';
    else suffix = 'b';
    return { kp: `kp_${suffix}`, ki: `ki_${suffix}`, kd: `kd_${suffix}` };
}

async function runTelemetryBasedTest(kp, ki, kd) {
    return new Promise((resolve, reject) => {
        const testStartTime = Date.now();
        const telemetrySamples = [];
        let resolved = false;

        const trialInput = document.getElementById('tuningTrialDurationInput');
        let testDurationMs = 2000;
        if (trialInput) {
            const v = parseInt(trialInput.value, 10);
            if (!isNaN(v) && v > 0) testDurationMs = v;
        }

        const settlingTimeMs = PARAMETER_SETTLING_TIME_MS;
        const totalDurationMs = testDurationMs + settlingTimeMs;
        const timeoutMs = totalDurationMs * 2;

        let timeoutHandle = setTimeout(() => {
            if (!resolved) { cleanup(); resolved = true; reject(new Error('test_timeout')); }
        }, timeoutMs);

        function cleanup() { window.removeEventListener('ble_message', telemetryHandler); clearTimeout(timeoutHandle); }

        function telemetryHandler(evt) {
            const d = evt.detail || evt;
            if (d.type !== 'telemetry') return;
            const elapsedTime = Date.now() - testStartTime;
            if (elapsedTime < settlingTimeMs) return;
            const sample = { timestamp: elapsedTime - settlingTimeMs, pitch: Number(d.pitch) || 0, roll: Number(d.roll) || 0, speed: Number(d.speed || d.sp) || 0, loopTime: Number(d.loop_time || d.lt) || 0 };
            telemetrySamples.push(sample);
            if (telemetrySamples.length % 12 === 0 && typeof updateCurrentTelemetryPlot === 'function') { try { updateCurrentTelemetryPlot(telemetrySamples); } catch (_) { } }
            if (elapsedTime >= totalDurationMs) finishTest();
        }

        function finishTest() {
            if (resolved) return; resolved = true; cleanup();
            if (telemetrySamples.length < 5) { resolve({ fitness: Infinity, itae: 0, overshoot: 0, steady_state_error: 0, raw: { samples: telemetrySamples.length, reason: 'insufficient_data' } }); return; }
            const metrics = calculateFitnessFromTelemetry(telemetrySamples);
            resolve(metrics);
        }

        window.addEventListener('ble_message', telemetryHandler);
        const loop = document.getElementById('tuning-loop-selector')?.value || 'balance';
        const paramKeys = getPIDParamKeys(loop);
        sendBleCommand('set_param', { key: paramKeys.kp, value: kp });
        sendBleCommand('set_param', { key: paramKeys.ki, value: ki });
        sendBleCommand('set_param', { key: paramKeys.kd, value: kd });
        try { addLogMessage(`[TelemetryTest] Started test with Kp=${kp.toFixed(3)}, Ki=${ki.toFixed(3)}, Kd=${kd.toFixed(3)}, duration=${testDurationMs}ms`, 'info'); } catch (_) { }
    });
}

function calculateFitnessFromTelemetry(samples) {
    if (!samples || samples.length === 0) return { fitness: Infinity, itae: 0, overshoot: 0, steady_state_error: 0, raw: { samples: 0 } };
    const targetAngle = 0; let itae = 0;
    for (let i = 0; i < samples.length; i++) { const error = Math.abs(samples[i].pitch - targetAngle); const timeWeight = samples[i].timestamp / 1000; itae += error * timeWeight; }
    itae = itae / samples.length;
    let maxDeviation = 0; for (let i = 0; i < samples.length; i++) { const deviation = Math.abs(samples[i].pitch - targetAngle); if (deviation > maxDeviation) maxDeviation = deviation; }
    const overshoot = maxDeviation;
    const steadyStateStart = Math.floor(samples.length * 0.7); let sseSum = 0; let sseCount = 0;
    for (let i = steadyStateStart; i < samples.length; i++) { sseSum += Math.abs(samples[i].pitch - targetAngle); sseCount++; }
    const steadyStateError = sseCount > 0 ? (sseSum / sseCount) : 0;
    let oscillationPenalty = 0;
    if (samples.length > 3) { let signChanges = 0; for (let i = 1; i < samples.length; i++) { const prevError = samples[i - 1].pitch - targetAngle; const currError = samples[i].pitch - targetAngle; if ((prevError > 0 && currError < 0) || (prevError < 0 && currError > 0)) signChanges++; } const oscillationRate = signChanges / samples.length; if (oscillationRate > 0.3) oscillationPenalty = oscillationRate * 20; }

    const weightsState = appStore.getState('tuning.weights') || { itae: 50, overshoot: 30, sse: 20 };
    const totalPoints = (weightsState.itae || 0) + (weightsState.overshoot || 0) + (weightsState.sse || 0) || 100;
    const wItae = (weightsState.itae || 0) / totalPoints; const wOvershoot = (weightsState.overshoot || 0) / totalPoints; const wSse = (weightsState.sse || 0) / totalPoints;
    const compItae = itae; const compOvershoot = overshoot * 10; const compSse = steadyStateError * 5;
    const weighted = wItae * compItae + wOvershoot * compOvershoot + wSse * compSse; const finalFitness = weighted + oscillationPenalty;
    try { addLogMessage(`[TelemetryTest] Calculated fitness: ITAE=${itae.toFixed(2)}, Overshoot=${overshoot.toFixed(2)}°, SSE=${steadyStateError.toFixed(2)}°, Fitness=${finalFitness.toFixed(2)} (weights:${wItae.toFixed(2)},${wOvershoot.toFixed(2)},${wSse.toFixed(2)})`, 'info'); } catch (_) { }
    return { fitness: finalFitness, itae: itae, overshoot: overshoot, steady_state_error: steadyStateError, raw: { samples: samples.length, oscillationPenalty: oscillationPenalty } };
}

// ========================================================================
// UI UPDATES
// ========================================================================

function updateBestDisplay(params) {
    const elKp = document.getElementById('best-kp'); const elKi = document.getElementById('best-ki'); const elKd = document.getElementById('best-kd'); const elF = document.getElementById('best-fitness');
    if (elKp) elKp.textContent = params.kp.toFixed(3); if (elKi) elKi.textContent = params.ki.toFixed(3); if (elKd) elKd.textContent = params.kd.toFixed(3);
    if (elF && params.fitness !== undefined && params.fitness !== Infinity) elF.textContent = params.fitness.toFixed(4);
    const applyBtn = document.getElementById('apply-best-btn'); if (applyBtn) applyBtn.disabled = false;
}

function updateProgressDisplay(current, total, bestFitness) {
    const itEl = document.getElementById('current-iteration'); const totEl = document.getElementById('total-iterations'); const fEl = document.getElementById('best-fitness');
    if (itEl) itEl.textContent = current; if (totEl) totEl.textContent = total; if (fEl && bestFitness !== undefined && bestFitness !== Infinity) fEl.textContent = bestFitness.toFixed(4);
    fitnessChartData.push({ x: current, y: bestFitness }); try { updateFitnessChart(); } catch (_) { }
}

function updateFitnessChart() {
    const canvas = document.getElementById('fitness-chart'); if (!canvas) return; const ctx = canvas.getContext('2d'); if (!ctx) return; ctx.clearRect(0, 0, canvas.width, canvas.height); if (!Array.isArray(fitnessChartData) || fitnessChartData.length === 0) return; const minFitness = Math.min(...fitnessChartData.map(d => d.y)); const maxFitness = Math.max(...fitnessChartData.map(d => d.y)); const maxIteration = Math.max(...fitnessChartData.map(d => d.x)); const padding = 40; const width = canvas.width - 2 * padding; const height = canvas.height - 2 * padding; ctx.strokeStyle = '#61dafb'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(padding, padding); ctx.lineTo(padding, canvas.height - padding); ctx.lineTo(canvas.width - padding, canvas.height - padding); ctx.stroke(); ctx.fillStyle = '#ffffff'; ctx.font = '12px Arial'; ctx.fillText('Fitness', 5, padding); ctx.fillText('Iteracja', canvas.width - padding, canvas.height - padding + 20); ctx.strokeStyle = '#a2f279'; ctx.lineWidth = 2; ctx.beginPath(); fitnessChartData.forEach((p, i) => { const x = padding + (p.x / (maxIteration || 1)) * width; const y = canvas.height - padding - ((p.y - minFitness) / ((maxFitness - minFitness) || 0.0001)) * height; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }); ctx.stroke(); ctx.fillStyle = '#a2f279'; fitnessChartData.forEach((p) => { const x = padding + (p.x / (maxIteration || 1)) * width; const y = canvas.height - padding - ((p.y - minFitness) / ((maxFitness - minFitness) || 0.0001)) * height; ctx.beginPath(); ctx.arc(x, y, 3, 0, 2 * Math.PI); ctx.fill(); });
}

function addTestToResultsTable(testNum, params, fitness, itae, overshoot, testType = 'metrics_test', meta = {}) {
    const tbody = document.getElementById('results-table-body'); try { if (Array.isArray(tuningHistory)) { tuningHistory.push({ idx: testNum, kp: params.kp, ki: params.ki, kd: params.kd, fitness, itae, overshoot, testType }); if (typeof refreshRecentList === 'function') refreshRecentList(); } } catch (_) { }
    if (!tbody) return; const metaText = (meta && meta.gen && meta.individualIdx) ? ` (Gen ${meta.gen}/${meta.totalGen}, Osobnik ${meta.individualIdx}/${meta.pop})` : ''; const row = tbody.insertRow(0); row.innerHTML = `<td>${testNum}${metaText}</td><td>${params.kp.toFixed(3)}</td><td>${params.ki.toFixed(3)}</td><td>${params.kd.toFixed(3)}</td><td>${(fitness === Infinity || isNaN(fitness)) ? '---' : fitness.toFixed(4)}</td><td>${(isNaN(itae) ? '---' : itae.toFixed(2))}</td><td>${isNaN(overshoot) ? '---' : overshoot.toFixed(2)}${(testType === 'metrics_test') ? '°' : '%'}</td><td><button onclick="applyParameters(${params.kp}, ${params.ki}, ${params.kd})" class="btn-small">Zastosuj</button></td>`;
    const method = AppState.activeTuningMethod; let blockContainer; if (method && method.startsWith('ga')) blockContainer = document.getElementById('ga-results-blocks'); else if (method && method.startsWith('pso')) blockContainer = document.getElementById('pso-results-blocks'); if (blockContainer) { const block = document.createElement('div'); block.className = 'result-entry'; const header = document.createElement('div'); header.className = 'result-header'; const genInfo = (meta.gen && meta.totalGen) ? `Gen ${meta.gen}/${meta.totalGen}` : ''; const indInfo = (meta.individualIdx && meta.pop) ? ` · Osobnik ${meta.individualIdx}/${meta.pop}` : ''; header.innerHTML = `<strong>Wynik #${testNum} ${genInfo}${indInfo}:</strong> Fitness = ${(fitness !== undefined && fitness !== Infinity) ? fitness.toFixed(4) : '---'}`; const paramsDiv = document.createElement('div'); paramsDiv.className = 'result-params'; paramsDiv.textContent = `Kp: ${params.kp !== undefined ? params.kp.toFixed(4) : '---'}, Ki: ${params.ki !== undefined ? params.ki.toFixed(4) : '---'}, Kd: ${params.kd !== undefined ? params.kd.toFixed(4) : '---'}`; const metricsDiv = document.createElement('div'); metricsDiv.className = 'result-metrics'; metricsDiv.textContent = `Overshoot: ${overshoot !== undefined ? overshoot.toFixed(2) + '%' : '---'}, ITAE: ${itae !== undefined ? itae.toFixed(2) : '---'}`; const applyBtnBlock = document.createElement('button'); applyBtnBlock.textContent = 'Zastosuj'; applyBtnBlock.className = 'test-btn'; applyBtnBlock.addEventListener('click', () => { applyParameters(params.kp, params.ki, params.kd); addLogMessage('[UI] Zastosowano parametry z historii strojenia.', 'info'); }); block.appendChild(header); block.appendChild(paramsDiv); block.appendChild(metricsDiv); block.appendChild(applyBtnBlock); blockContainer.insertBefore(block, blockContainer.firstChild); }
}

// Update the UI details for the currently testing individual (visible in tuning-progress-panel)
function updateCurrentTestDisplay(gen, totalGen, individualIdx, populationSize, kp, ki, kd, fitness) {
    try {
        const genEl = document.getElementById('current-generation');
        const totGenEl = document.getElementById('ga-gen-total');
        const indivEl = document.getElementById('current-individual');
        const popEl = document.getElementById('population-size');
        const kpEl = document.getElementById('current-kp');
        const kiEl = document.getElementById('current-ki');
        const kdEl = document.getElementById('current-kd');
        const fitnessEl = document.getElementById('current-fitness');
        const statusEl = document.getElementById('tuning-status-text');
        if (genEl && gen !== undefined) genEl.textContent = gen;
        if (totGenEl && totalGen !== undefined) totGenEl.textContent = totalGen;
        if (indivEl && individualIdx !== undefined) indivEl.textContent = individualIdx;
        if (popEl && populationSize !== undefined) popEl.textContent = populationSize;
        if (kpEl && kp !== undefined) kpEl.textContent = (typeof kp === 'number' ? kp.toFixed(3) : '---');
        if (kiEl && ki !== undefined) kiEl.textContent = (typeof ki === 'number' ? ki.toFixed(3) : '---');
        if (kdEl && kd !== undefined) kdEl.textContent = (typeof kd === 'number' ? kd.toFixed(3) : '---');
        if (fitnessEl) fitnessEl.textContent = (isFinite(fitness) ? Number(fitness).toFixed(4) : (fitness === Infinity ? '---' : (fitness === undefined ? '---' : fitness)));
        if (statusEl) statusEl.textContent = `Pokolenie ${gen}/${totalGen} · Osobnik ${individualIdx}/${populationSize}`;
    } catch (e) {
        console.debug('[UI] updateCurrentTestDisplay error', e);
    }
}

function addResultToTable(tableBody, data) {
    // Add table row (for desktop)
    const row = tableBody.insertRow(0);
    row.insertCell().textContent = tableBody.rows.length;
    row.insertCell().textContent = (data.kp !== undefined ? data.kp.toFixed(4) : '---');
    row.insertCell().textContent = (data.ki !== undefined ? data.ki.toFixed(4) : '---');
    row.insertCell().textContent = (data.kd !== undefined ? data.kd.toFixed(4) : '---');
    row.insertCell().textContent = (data.fitness !== undefined ? data.fitness.toFixed(4) : '---');
    row.insertCell().textContent = (data.overshoot !== undefined ? data.overshoot.toFixed(2) : '---');
    row.insertCell().textContent = (data.rise_time !== undefined ? data.rise_time.toFixed(2) : '---');
    const actionsCell = row.insertCell();
    const applyBtn = document.createElement('button');
    applyBtn.textContent = 'Zastosuj';
    applyBtn.classList.add('test-btn');
    applyBtn.addEventListener('click', () => {
        document.getElementById('balanceKpInput').value = data.kp;
        document.getElementById('balanceKiInput').value = data.ki;
        document.getElementById('balanceKdInput').value = data.kd;
        sendBleMessage({ type: 'set_param', key: 'kp_b', value: data.kp });
        sendBleMessage({ type: 'set_param', key: 'ki_b', value: data.ki });
        sendBleMessage({ type: 'set_param', key: 'kd_b', value: data.kd });
        addLogMessage('[UI] Zastosowano parametry z historii strojenia.', 'info');
    });
    actionsCell.appendChild(applyBtn);

    // Also add block entry (for mobile)
    const method = AppState.activeTuningMethod;
    let blockContainer;
    if (method.startsWith('ga')) {
        blockContainer = document.getElementById('ga-results-blocks');
    } else if (method.startsWith('pso')) {
        blockContainer = document.getElementById('pso-results-blocks');
    }

    if (blockContainer) {
        const block = document.createElement('div');
        block.className = 'result-entry';

        const header = document.createElement('div');
        header.className = 'result-header';
        header.innerHTML = `<strong>Wynik #${tableBody.rows.length}:</strong> Fitness = ${data.fitness !== undefined ? data.fitness.toFixed(4) : '---'}`;

        const params = document.createElement('div');
        params.className = 'result-params';
        params.textContent = `Kp: ${data.kp !== undefined ? data.kp.toFixed(4) : '---'}, Ki: ${data.ki !== undefined ? data.ki.toFixed(4) : '---'}, Kd: ${data.kd !== undefined ? data.kd.toFixed(4) : '---'}`;

        const metrics = document.createElement('div');
        metrics.className = 'result-metrics';
        metrics.textContent = `Overshoot: ${data.overshoot !== undefined ? data.overshoot.toFixed(2) + '%' : '---'}, Rise Time: ${data.rise_time !== undefined ? data.rise_time.toFixed(2) + 'ms' : '---'}`;

        const applyBtnBlock = document.createElement('button');
        applyBtnBlock.textContent = 'Zastosuj';
        applyBtnBlock.classList.add('test-btn');
        applyBtnBlock.addEventListener('click', () => {
            document.getElementById('balanceKpInput').value = data.kp;
            document.getElementById('balanceKiInput').value = data.ki;
            document.getElementById('balanceKdInput').value = data.kd;
            sendBleMessage({ type: 'set_param', key: 'kp_b', value: data.kp });
            sendBleMessage({ type: 'set_param', key: 'ki_b', value: data.ki });
            sendBleMessage({ type: 'set_param', key: 'kd_b', value: data.kd });
            addLogMessage('[UI] Zastosowano parametry z historii strojenia.', 'info');
        });

        block.appendChild(header);
        block.appendChild(params);
        block.appendChild(metrics);
        block.appendChild(applyBtnBlock);

        blockContainer.insertBefore(block, blockContainer.firstChild);
    }
}

// Draw a mini telemetry plot for the currently tested candidate
function updateCurrentTelemetryPlot(samples) {
    const canvas = document.getElementById('current-telemetry-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!Array.isArray(samples) || samples.length === 0) return;

    const padding = 6;
    const w = canvas.width - padding * 2;
    const h = canvas.height - padding * 2;
    const pitches = samples.map(s => s.pitch);
    const minVal = Math.min(...pitches);
    const maxVal = Math.max(...pitches);
    const range = (maxVal - minVal) || 1;

    ctx.strokeStyle = '#61dafb';
    ctx.lineWidth = 2;
    ctx.beginPath();
    samples.forEach((s, i) => {
        const x = padding + (i / (samples.length - 1)) * w;
        const y = padding + h - (((s.pitch - minVal) / range) * h);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
    // Mark last sample
    const last = samples[samples.length - 1];
    const lastX = padding + w;
    const lastY = padding + h - (((last.pitch - minVal) / range) * h);
    ctx.fillStyle = '#a2f279';
    ctx.beginPath();
    ctx.arc(lastX - 2, lastY, 3, 0, 2 * Math.PI);
    ctx.fill();
}

// ========================================================================
// APPLY / BASELINE HELPERS
// ========================================================================

function applyParameters(kp, ki, kd) {
    const loop = document.getElementById('tuning-loop-selector').value;
    const paramKeys = getPIDParamKeys(loop);
    sendBleCommand('set_param', { key: paramKeys.kp, value: kp }); sendBleCommand('set_param', { key: paramKeys.ki, value: ki }); sendBleCommand('set_param', { key: paramKeys.kd, value: kd }); showNotification(`Zastosowano parametry: Kp=${kp.toFixed(3)}, Ki=${ki.toFixed(3)}, Kd=${kd.toFixed(3)}`);
}

function sendBaselinePIDToRobot() {
    const loop = document.getElementById('tuning-loop-selector')?.value || 'balance';
    const paramKeys = getPIDParamKeys(loop);
    sendBleCommand('set_param', { key: paramKeys.kp, value: baselinePID.kp }); sendBleCommand('set_param', { key: paramKeys.ki, value: baselinePID.ki }); sendBleCommand('set_param', { key: paramKeys.kd, value: baselinePID.kd }); console.log(`[Tuning] Restored baseline PID: Kp=${baselinePID.kp.toFixed(3)}, Ki=${baselinePID.ki.toFixed(3)}, Kd=${baselinePID.kd.toFixed(3)}`);
}

function captureBaselinePID() {
    const loop = document.getElementById('tuning-loop-selector')?.value || 'balance';
    let kpInputId, kiInputId, kdInputId;
    if (loop === 'balance') { kpInputId = 'balanceKpInput'; kiInputId = 'balanceKiInput'; kdInputId = 'balanceKdInput'; } else if (loop === 'speed') { kpInputId = 'speedKpInput'; kiInputId = 'speedKiInput'; kdInputId = 'speedKdInput'; } else if (loop === 'position') { kpInputId = 'positionKpInput'; kiInputId = 'positionKiInput'; kdInputId = 'positionKdInput'; }
    const kpElement = document.getElementById(kpInputId); const kiElement = document.getElementById(kiInputId); const kdElement = document.getElementById(kdInputId);
    if (kpElement && kiElement && kdElement) { baselinePID.kp = parseFloat(kpElement.value) || 0; baselinePID.ki = parseFloat(kiElement.value) || 0; baselinePID.kd = parseFloat(kdElement.value) || 0; console.log(`[Tuning] Captured baseline PID: Kp=${baselinePID.kp.toFixed(3)}, Ki=${baselinePID.ki.toFixed(3)}, Kd=${baselinePID.kd.toFixed(3)}`); } else { console.warn('[Tuning] Could not capture baseline PID - input elements not found'); }

}

// ========================================================================
// ALGORITHM CLASSES
// ========================================================================

// Inserted original, well-formatted GeneticAlgorithm class
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
        this.particles = []; this.globalBest = null; this.iteration = 0; this.isRunning = false; this.isPaused = false; this.testCounter = 0; this._debugId = (Date.now() >>> 0) & 0xFFFF; try { addLogMessage(`[PSO:${this._debugId}] Constructed PSO: particles=${this.numParticles} iterations=${this.iterations}`, 'info'); } catch (e) { console.debug('[PSO] log failed', e); }
    }

    initialize() { this.particles = []; for (let i = 0; i < this.numParticles; i++) this.particles.push(this.createRandomParticle()); if (typeof baselinePID !== 'undefined' && baselinePID && typeof baselinePID.kp === 'number') this.particles[0] = { position: { kp: baselinePID.kp, ki: baselinePID.ki, kd: baselinePID.kd }, velocity: { kp: 0, ki: 0, kd: 0 }, bestPosition: { kp: baselinePID.kp, ki: baselinePID.ki, kd: baselinePID.kd }, bestFitness: Infinity, fitness: Infinity }; this.globalBest = null; this.iteration = 0; this.testCounter = 0; fitnessChartData = []; }

    createRandomParticle() { const includeKi = !!document.getElementById('include-ki-checkbox')?.checked; const getRandom = (min, max) => Math.random() * (max - min) + min; const position = { kp: getRandom(this.searchSpace.kp_min, this.searchSpace.kp_max), ki: includeKi ? getRandom(this.searchSpace.ki_min, this.searchSpace.ki_max) : (baselinePID?.ki ?? ((this.searchSpace.ki_min + this.searchSpace.ki_max) / 2)), kd: getRandom(this.searchSpace.kd_min, this.searchSpace.kd_max) }; return { position: position, velocity: { kp: 0, ki: 0, kd: 0 }, bestPosition: { ...position }, bestFitness: Infinity, fitness: Infinity }; }

    async evaluateFitness(particle, idx = 0) { this.testCounter++; try { if (typeof updateCurrentTestDisplay === 'function') updateCurrentTestDisplay(this.iteration + 1, this.iterations, idx, this.particles.length, particle.position.kp, particle.position.ki, particle.position.kd, particle.fitness); } catch (_) { } try { const res = await runTelemetryBasedTest(particle.position.kp, particle.position.ki, particle.position.kd); const fitness = res.fitness; particle.fitness = fitness; if (fitness < particle.bestFitness) { particle.bestFitness = fitness; particle.bestPosition = { ...particle.position }; } if (!this.globalBest || fitness < this.globalBest.fitness) { this.globalBest = { position: { ...particle.position }, fitness: fitness }; updateBestDisplay(this.globalBest.position); } const meta = { gen: this.iteration + 1, totalGen: this.iterations, individualIdx: idx, pop: this.particles.length }; try { fitnessChartData.push({ x: this.iteration + (idx / Math.max(1, this.particles.length)), y: fitness }); updateFitnessChart(); } catch (_) { } addTestToResultsTable(this.testCounter, particle.position, fitness, res.itae, res.overshoot, 'telemetry_test', meta); return fitness; } catch (error) { console.error('[PSO] Test failed:', error); particle.fitness = Infinity; addTestToResultsTable(this.testCounter, particle.position, Infinity, 0, 0, 'telemetry_test'); throw error; } }

    async runIteration() { for (let i = 0; i < this.particles.length; i++) { if (this.isPaused) { await RB.helpers.delay(100); i--; continue; } if (!this.isRunning) break; try { if (typeof updateCurrentTestDisplay === 'function') updateCurrentTestDisplay(this.iteration + 1, this.iterations, i + 1, this.particles.length, this.particles[i].position.kp, this.particles[i].position.ki, this.particles[i].position.kd, this.particles[i].fitness); await this.evaluateFitness(this.particles[i], i + 1); } catch (error) { console.error('Test failed:', error); if (error.reason === 'interrupted_by_emergency') { console.log('[PSO] Emergency stop detected, entering pause state'); this.isPaused = true; sendBaselinePIDToRobot(); while (this.isPaused && this.isRunning) await RB.helpers.delay(100); if (this.isRunning) { console.log('[PSO] Retrying interrupted test after resume'); i--; continue; } } else { this.particles[i].fitness = Infinity; } } } for (let particle of this.particles) { this.updateVelocity(particle); this.updatePosition(particle); } this.iteration++; updateProgressDisplay(this.iteration, this.iterations, this.globalBest ? this.globalBest.fitness : Infinity); }

    updateVelocity(particle) { const r1 = Math.random(); const r2 = Math.random(); for (let dim of ['kp', 'ki', 'kd']) { const cognitive = this.cognitiveWeight * r1 * (particle.bestPosition[dim] - particle.position[dim]); const social = this.socialWeight * r2 * (this.globalBest.position[dim] - particle.position[dim]); particle.velocity[dim] = this.inertiaWeight * particle.velocity[dim] + cognitive + social; const maxVel = (this.searchSpace[dim + '_max'] - this.searchSpace[dim + '_min']) * 0.2; particle.velocity[dim] = Math.max(-maxVel, Math.min(maxVel, particle.velocity[dim])); } }

    updatePosition(particle) { for (let dim of ['kp', 'ki', 'kd']) { particle.position[dim] += particle.velocity[dim]; particle.position[dim] = Math.max(this.searchSpace[dim + '_min'], Math.min(this.searchSpace[dim + '_max'], particle.position[dim])); } }

    async run() { this.isRunning = true; try { this.initialize(); const progressEl = document.getElementById('tuning-progress-panel'); if (progressEl) progressEl.style.display = 'block'; while (this.iteration < this.iterations && this.isRunning) { if (!this.isPaused) await this.runIteration(); else await RB.helpers.delay(100); } this.isRunning = false; try { if (this.globalBest && typeof this.globalBest.fitness === 'number' && isFinite(this.globalBest.fitness)) showNotification(`Optymalizacja PSO zakończona! Najlepsze fitness: ${this.globalBest.fitness.toFixed(4)}`); else showNotification(`Optymalizacja PSO zakonczona: brak wynikow`); } catch (err) { console.error('[PSO] showNotification error:', err); } try { addLogMessage(`[PSO] run finished: iteration=${this.iteration} particles=${this.particles.length} globalBest=${this.globalBest ? JSON.stringify(this.globalBest) : 'null'}`, 'info'); } catch (e) { console.debug('[PSO] log failed', e); } } catch (err) { this.isRunning = false; console.error('[PSO] run() error:', err); try { addLogMessage(`[PSO] run() error: ${err && err.message ? err.message : String(err)}`, 'error'); } catch (e) { console.debug('[PSO] log failed', e); } throw err; } }

    pause() { this.isPaused = true; setTimeout(() => { if (this.isPaused) sendBaselinePIDToRobot(); }, 100); }
    resume() { this.isPaused = false; }
    stop() { this.isRunning = false; sendBaselinePIDToRobot(); }
}

// ========================================================================
// BAYESIAN OPTIMIZATION
// ========================================================================

class BayesianOptimization {
    constructor(config) { this.iterations = config.iterations || 25; this.initialSamples = config.initialSamples || 5; this.searchSpace = config.searchSpace; this.acquisitionFunction = config.acquisitionFunction || 'ei'; this.xi = config.xi || 0.01; this.samples = []; this.iteration = 0; this.isRunning = false; this.neuralNetwork = null; this.testCounter = 0; }

    async initialize() { this.samples = []; this.iteration = 0; this.testCounter = 0; fitnessChartData = []; for (let i = 0; i < this.initialSamples; i++) { const sample = this.sampleRandom(); try { const fitness = await this.evaluateSample(sample); this.samples.push({ ...sample, fitness }); } catch (error) { console.error('Initial sample failed:', error); this.samples.push({ ...sample, fitness: Infinity }); } } if (typeof baselinePID !== 'undefined' && baselinePID && typeof baselinePID.kp === 'number') { const baseSample = { kp: baselinePID.kp, ki: baselinePID.ki, kd: baselinePID.kd }; try { const fitness = await this.evaluateSample(baseSample); this.samples.push({ ...baseSample, fitness }); } catch (error) { console.warn('Baseline sample evaluation failed:', error); this.samples.push({ ...baseSample, fitness: Infinity }); } } await this.trainSurrogate(); document.getElementById('bayesian-visualization').style.display = 'block'; this.updateVisualization(); }

    async trainSurrogate() { if (!this.neuralNetwork) { this.neuralNetwork = ml5.neuralNetwork({ inputs: 3, outputs: 1, task: 'regression', layers: [{ type: 'dense', units: 32, activation: 'relu' }, { type: 'dense', units: 16, activation: 'relu' }] }); } this.neuralNetwork.data.data.raw = []; const validSamples = this.samples.filter(s => s.fitness !== Infinity); validSamples.forEach(sample => { this.neuralNetwork.addData({ kp: sample.kp, ki: sample.ki, kd: sample.kd }, { fitness: sample.fitness }); }); if (validSamples.length < 2) { console.warn('Not enough valid samples to train surrogate'); return; } await this.neuralNetwork.normalizeData(); const trainingOptions = { epochs: 30, batchSize: Math.min(8, validSamples.length), validationSplit: 0.1 }; await this.neuralNetwork.train(trainingOptions); }

    async acquireNext() { let bestAcquisition = -Infinity; let bestSample = null; const gridSize = 8; for (let i = 0; i < gridSize; i++) { for (let j = 0; j < gridSize; j++) { for (let k = 0; k < gridSize; k++) { const kp = this.searchSpace.kp_min + (i / (gridSize - 1)) * (this.searchSpace.kp_max - this.searchSpace.kp_min); const ki = this.searchSpace.ki_min + (j / (gridSize - 1)) * (this.searchSpace.ki_max - this.searchSpace.ki_min); const kd = this.searchSpace.kd_min + (k / (gridSize - 1)) * (this.searchSpace.kd_max - this.searchSpace.kd_min); const acquisition = await this.calculateAcquisition({ kp, ki, kd }); if (acquisition > bestAcquisition) { bestAcquisition = acquisition; bestSample = { kp, ki, kd }; } } } } return bestSample; }

    async calculateAcquisition(sample) { const prediction = await this.neuralNetwork.predict({ kp: sample.kp, ki: sample.ki, kd: sample.kd }); const predictedFitness = prediction[0].fitness; const validSamples = this.samples.filter(s => s.fitness !== Infinity); if (validSamples.length === 0) return 0; const currentBest = Math.min(...validSamples.map(s => s.fitness)); if (this.acquisitionFunction === 'ei') { const improvement = currentBest - predictedFitness; return Math.max(0, improvement + this.xi); } else if (this.acquisitionFunction === 'ucb') { const uncertainty = 1.0; return -predictedFitness + 2.0 * uncertainty; } else if (this.acquisitionFunction === 'pi') { const improvement = currentBest - predictedFitness; return improvement > 0 ? 1 : 0; } return -predictedFitness; }

    async evaluateSample(sample) { this.testCounter++; try { if (typeof updateCurrentTestDisplay === 'function') updateCurrentTestDisplay(this.iteration + 1, this.iterations, this.testCounter, this.initialSamples + 1, sample.kp, sample.ki, sample.kd, null); } catch (_) { } try { const res = await runTelemetryBasedTest(sample.kp, sample.ki, sample.kd); const fitness = res.fitness; try { if (typeof updateCurrentTestDisplay === 'function') updateCurrentTestDisplay(this.iteration + 1, this.iterations, this.testCounter, this.initialSamples + 1, sample.kp, sample.ki, sample.kd, fitness); } catch (_) { } addTestToResultsTable(this.testCounter, sample, fitness, res.itae, res.overshoot, 'telemetry_test'); return fitness; } catch (error) { console.error('[Bayesian] Test failed:', error); addTestToResultsTable(this.testCounter, sample, Infinity, 0, 0, 'telemetry_test'); throw error; } }

    sampleRandom() { const includeKi = !!document.getElementById('include-ki-checkbox')?.checked; const getRandom = (min, max) => Math.random() * (max - min) + min; return { kp: getRandom(this.searchSpace.kp_min, this.searchSpace.kp_max), ki: includeKi ? getRandom(this.searchSpace.ki_min, this.searchSpace.ki_max) : (baselinePID?.ki ?? ((this.searchSpace.ki_min + this.searchSpace.ki_max) / 2)), kd: getRandom(this.searchSpace.kd_min, this.searchSpace.kd_max) }; }

    updateVisualization() { const canvas = document.getElementById('bayesian-space-chart'); const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, canvas.width, canvas.height); if (this.samples.length === 0) return; const padding = 40; const width = canvas.width - 2 * padding; const height = canvas.height - 2 * padding; ctx.strokeStyle = '#61dafb'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(padding, padding); ctx.lineTo(padding, canvas.height - padding); ctx.lineTo(canvas.width - padding, canvas.height - padding); ctx.stroke(); ctx.fillStyle = '#ffffff'; ctx.font = '12px Arial'; ctx.fillText('Kp', canvas.width - padding + 5, canvas.height - padding + 5); ctx.fillText('Kd', padding - 30, padding); const validSamples = this.samples.filter(s => s.fitness !== Infinity); const bestSample = validSamples.length > 0 ? validSamples.reduce((a, b) => a.fitness < b.fitness ? a : b) : null; this.samples.forEach(sample => { if (sample.fitness === Infinity) return; const x = padding + ((sample.kp - this.searchSpace.kp_min) / (this.searchSpace.kp_max - this.searchSpace.kp_min)) * width; const y = canvas.height - padding - ((sample.kd - this.searchSpace.kd_min) / (this.searchSpace.kd_max - this.searchSpace.kd_min)) * height; const minFitness = Math.min(...validSamples.map(s => s.fitness)); const maxFitness = Math.max(...validSamples.map(s => s.fitness)); const normalized = (sample.fitness - minFitness) / (maxFitness - minFitness + 0.001); const hue = (1 - normalized) * 240; ctx.fillStyle = `hsl(${hue}, 70%, 50%)`; ctx.beginPath(); ctx.arc(x, y, 5, 0, 2 * Math.PI); ctx.fill(); }); if (bestSample) { const x = padding + ((bestSample.kp - this.searchSpace.kp_min) / (this.searchSpace.kp_max - this.searchSpace.kp_min)) * width; const y = canvas.height - padding - ((bestSample.kd - this.searchSpace.kd_min) / (this.searchSpace.kd_max - this.searchSpace.kd_min)) * height; ctx.strokeStyle = '#a2f279'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 8, 0, 2 * Math.PI); ctx.stroke(); } }

    async run() { this.isRunning = true; try { const progressEl = document.getElementById('tuning-progress-panel'); if (progressEl) progressEl.style.display = 'block'; try { showNotification('Inicjalizacja Bayesian Optimization...'); } catch (e) { console.debug('[Bayes] notify init failed', e); } await this.initialize(); while (this.iteration < this.iterations && this.isRunning) { const nextSample = await this.acquireNext(); if (!nextSample) { console.error('Failed to acquire next sample'); break; } try { const fitness = await this.evaluateSample(nextSample); this.samples.push({ ...nextSample, fitness }); } catch (error) { console.error('Sample evaluation failed:', error); this.samples.push({ ...nextSample, fitness: Infinity }); } await this.trainSurrogate(); const validSamples = this.samples.filter(s => s.fitness !== Infinity); const best = validSamples.length > 0 ? validSamples.reduce((a, b) => a.fitness < b.fitness ? a : b) : null; if (best) { updateBestDisplay(best); updateProgressDisplay(this.iteration + 1, this.iterations, best.fitness); } this.updateVisualization(); this.iteration++; } this.isRunning = false; const validSamples = this.samples.filter(s => s.fitness !== Infinity); const best = validSamples.length > 0 ? validSamples.reduce((a, b) => a.fitness < b.fitness ? a : b) : null; if (best) { try { if (best && typeof best.fitness === 'number' && isFinite(best.fitness)) { showNotification(`Bayesian Optimization zakończona! Najlepsze fitness: ${best.fitness.toFixed(4)}`); } else { showNotification('Bayesian Optimization zakończona - brak udanych testów'); } } catch (err) { console.error('[Bayes] showNotification error:', err); } } else { showNotification('Bayesian Optimization zakończona - brak udanych testów'); } } catch (err) { this.isRunning = false; console.error('[Bayes] run() error:', err); try { addLogMessage(`[Bayes] run() error: ${err && err.message ? err.message : String(err)}`, 'error'); } catch (e) { console.debug('[Bayes] log failed', e); } throw err; } }

    stop() { this.isRunning = false; sendBaselinePIDToRobot(); }
}

// ========================================================================
// BLE COMMAND HELPER
// ========================================================================

// Ujednolicone API: prosta warstwa nad sendBleMessage w stylu (type,payload)
function sendBleCommand(type, payload) {
    const msg = Object.assign({ type }, payload || {});
    sendBleMessage(msg);
}

// ========================================================================
// DYNAMIC TESTS
// ========================================================================

// Refaktoryzacja: wykorzystuj Simple Test API (run_metrics_test)
async function runDynamicTest(testType) {
    if (!(await checkTuningPrerequisites())) return;
    addLogMessage(`[Test] Uruchamianie testu: ${testType}`, 'info');

    const testId = Date.now() >>> 0;
    // Nasłuch zakończenia aby odblokować UI, nawet jeśli nie otrzymamy metryk (np. anulowanie)
    const onMsg = (evt) => {
        const data = evt.detail || evt;
        if (!data || !data.type) return;
        if ((data.type === 'test_complete' && Number(data.testId) === testId) || (data.type === 'test_result' && Number(data.testId) === testId)) {
            // Gdy dostaniemy komplet lub zakończenie, odblokuj UI
            setTuningUiLock(false, '');
            window.removeEventListener('ble_message', onMsg);
        }
    };
    window.addEventListener('ble_message', onMsg);

    // Dla prostoty wszystkie testy dynamiczne w tej karcie mapujemy na test metryk step-response
    // UI algorytmów (GA/PSO/ZN) i tak wywołuje run_metrics_test z odpowiednimi PID.
    // Tu używamy aktualnych wartości z formularza PID balansu jako wejście testu.
    const kp = parseFloat(document.getElementById('balanceKpInput')?.value) || 0;
    const ki = parseFloat(document.getElementById('balanceKiInput')?.value) || 0;
    const kd = parseFloat(document.getElementById('balanceKdInput')?.value) || 0;
    // Ujednolicenie: firmware oczekuje komendy 'run_metrics_test' - ZAKOMENTOWANE, bo robot nie obsługuje
    // sendBleCommand('run_metrics_test', { kp, ki, kd, testId });
    setTuningUiLock(true, 'single-tests');
}

function handleDynamicTestResult(raw) {
    // Ujednolicenie: obsłuż zarówno legacy 'test_result' jak i nowoczesne 'metrics_result'
    const data = {
        kp: raw.kp ?? raw.params?.kp,
        ki: raw.ki ?? raw.params?.ki,
        kd: raw.kd ?? raw.params?.kd,
        itae: raw.itae ?? raw.metrics?.itae,
        overshoot: raw.overshoot ?? raw.metrics?.overshoot,
        rise_time: raw.rise_time ?? raw.metrics?.rise_time,
        settling_time: raw.settling_time ?? raw.metrics?.settling_time,
        steady_state_error: raw.steady_state_error ?? raw.metrics?.steady_state_error,
        testId: raw.testId
    };

    setTuningUiLock(false, '');

    // Aktualizacja historii wyników jeżeli tabela istnieje
    try {
        if (typeof addTestToResultsTable === 'function' && data.kp !== undefined && data.kd !== undefined) {
            const nextIdx = (document.getElementById('results-table-body')?.children.length || 0) + 1;
            addTestToResultsTable(nextIdx, { kp: data.kp, ki: data.ki ?? 0, kd: data.kd }, data.itae ?? Infinity, data.itae ?? NaN, data.overshoot ?? NaN, data.test_type || 'metrics_test');
            // pokaż kontener wyników
            const cont = document.getElementById('results-container');
            if (cont) cont.style.display = 'block';
        }
    } catch (_) { }

    // Lekka notyfikacja do logów
    addLogMessage(`[Test] Wyniki: ITAE=${data.itae?.toFixed?.(4) ?? '---'}, Overshoot=${data.overshoot?.toFixed?.(2) ?? '---'}%`, 'info');
}

// ========================================================================
// UI LOCK
// ========================================================================

function setTuningUiLock(isLocked, method) {
    AppState.isTuningActive = isLocked;
    AppState.activeTuningMethod = isLocked ? method : '';

    // Globalny tryb strojenia (odblokowane: Sterowanie, Optymalizacja, Logi)
    // Dla pojedynczych testów nie blokuj UI, tylko dla algorytmów optymalizacji
    if (method !== 'single-tests') {
        document.body.classList.toggle('tuning-active', isLocked);
    }

    // Wyłączamy przełączanie zakładek. Disable run test buttons OUTSIDE of autotune card only
    document.querySelectorAll('.run-test-btn').forEach(btn => {
        try {
            btn.disabled = isLocked && !btn.closest('#autotuning-card');
        } catch (e) { btn.disabled = isLocked; }
    });
    document.querySelectorAll('.method-tab').forEach(tab => tab.disabled = isLocked);
    // Dashboard legacy usunięty

    // Przełącz widoki w panelu optymalizacji
    const cfgPanel = document.getElementById('autotuning-config-panel');
    const progress = document.getElementById('tuning-progress-panel');
    if (cfgPanel) cfgPanel.classList.toggle('autotune-config-hide', isLocked);
    if (progress) progress.style.display = isLocked ? 'block' : 'none';
    // Keep controls bar visible during active tuning so user can Pause/Stop without switching tabs
    const controlsBar = document.getElementById('tuning-controls-bar');
    try {
        if (controlsBar) controlsBar.style.display = (isLocked ? 'flex' : (document.querySelector('.autotune-main-tab.active')?.dataset.tab === 'methods' ? 'flex' : 'none'));
    } catch (e) { /* ignore DOM errors */ }
}

// ========================================================================
// SEARCH SPACE & PREREQUISITES
// ========================================================================

function updateSearchSpaceInputs() {
    const __loopEl = document.getElementById('tuning-loop-selector');
    const selectedLoop = __loopEl ? __loopEl.value : 'balance';
    const includeKi = !!document.getElementById('include-ki-checkbox')?.checked;
    const showKi = includeKi && ['speed', 'position', 'heading', 'balance', 'rotation'].includes(selectedLoop);
    ['ga', 'pso'].forEach(prefix => {
        const kiMinEl = document.getElementById(`${prefix}-ki-min`);
        if (!kiMinEl) return; // element nie istnieje w tej wersji UI
        const kiMinWrap = kiMinEl.closest('.search-space-param');
        if (kiMinWrap) kiMinWrap.style.display = showKi ? 'block' : 'none';
    });
}

// Wait for one of desired robot states to appear on appStore
function waitForRobotState(desiredStates = ['BALANSUJE', 'TRZYMA_POZYCJE'], timeoutMs = 5000) {
    return new Promise((resolve) => {
        try {
            if (desiredStates.includes(AppState.lastKnownRobotState)) { resolve(true); return; }
            const id = appStore.subscribe('robot.state', (newVal) => {
                try {
                    if (desiredStates.includes(newVal)) {
                        appStore.unsubscribe(id);
                        resolve(true);
                    }
                } catch (e) { /* ignore */ }
            });
            setTimeout(() => { try { appStore.unsubscribe(id); } catch (e) { } resolve(false); }, timeoutMs);
        } catch (e) { resolve(false); }
    });
}

// Asynchronous check of prerequisites - shows clearer messages and optionally toggles balancing on user consent.
async function checkTuningPrerequisites() {
    if (!AppState.isConnected || !AppState.isSynced) {
        addLogMessage('[UI] Blad: Polacz i zsynchronizuj z robotem.', 'error');
        const statusEl = document.getElementById('tuning-status-text'); if (statusEl) statusEl.textContent = 'Blad: brak polaczenia/synchronizacji';
        return false;
    }

    if (!['BALANSUJE', 'TRZYMA_POZYCJE'].includes(AppState.lastKnownRobotState)) {
        // Ask user whether we should try to enable balance automatically
        const msg = `Robot musi byc w stanie BALANSUJE lub TRZYMA_POZYCJE aby uruchomic testy. Aktualny stan: '${AppState.lastKnownRobotState}'.\nCzy wlaczyc balansowanie teraz?`;
        const ok = confirm(msg);
        if (!ok) {
            addLogMessage(`[UI] Wymagany stan 'BALANSUJE'. Aktualny: '${AppState.lastKnownRobotState}'.`, 'error');
            const statusEl = document.getElementById('tuning-status-text'); if (statusEl) statusEl.textContent = 'Wymagany stan: BALANSUJE';
            return false;
        }

        // Try to enable balancing via UI or direct command, then wait for the robot to switch state
        try {
            const bsEl = document.getElementById('balanceSwitch');
            if (bsEl) {
                bsEl.checked = true;
                // dispatch change to trigger standard handler
                bsEl.dispatchEvent(new Event('change'));
            } else {
                // fallback: direct command
                sendBleMessage({ type: 'balance_toggle', enabled: true });
            }
            addLogMessage('[UI] Wlaczono balansowanie. Oczekiwanie na stan BALANSUJE...', 'info');
            const success = await waitForRobotState(['BALANSUJE', 'TRZYMA_POZYCJE'], 8000);
            if (!success) {
                addLogMessage('[UI] Robot nie przeszedl do stanu BALANSUJE po wlaczeniu balansowania.', 'error');
                const statusEl = document.getElementById('tuning-status-text'); if (statusEl) statusEl.textContent = 'Brak oczekiwanego stanu BALANSUJE';
                return false;
            }
            return true;
        } catch (e) {
            addLogMessage('[UI] Blad przy probie wlaczenia balansowania: ' + (e && e.message ? e.message : String(e)), 'error');
            return false;
        }
    }

    if (AppState.isTuningActive) {
        addLogMessage('[UI] Blad: Inna sesja strojenia jest juz w toku.', 'warn');
        return false;
    }
    return true;
}

// ========================================================================
// FITNESS MODAL
// ========================================================================

// Initialize the fitness weights modal and wire controls
function initFitnessModal() {
    const TOTAL_POINTS = 100;
    const openBtn = document.getElementById('open-fitness-modal-btn');
    const modal = document.getElementById('fitness-modal');
    const closeBtn = document.getElementById('close-fitness-modal');
    const applyBtn = document.getElementById('apply-fitness-btn');
    const itaeInput = document.getElementById('weight-itae');
    const overshootInput = document.getElementById('weight-overshoot');
    const sseInput = document.getElementById('weight-sse');
    const remainingEl = document.getElementById('weight-remaining');

    if (!modal || !openBtn || !closeBtn || !applyBtn || !itaeInput || !overshootInput || !sseInput || !remainingEl) return;

    function sanitizeAndClamp(v) { let n = parseInt(v, 10); if (Number.isNaN(n)) n = 0; if (n < 0) n = 0; if (n > TOTAL_POINTS) n = TOTAL_POINTS; return n; }

    function updateWeightUi() {
        const itae = sanitizeAndClamp(itaeInput.value);
        const overs = sanitizeAndClamp(overshootInput.value);
        const sse = sanitizeAndClamp(sseInput.value);
        itaeInput.value = itae; overshootInput.value = overs; sseInput.value = sse;
        const sum = itae + overs + sse;
        const remaining = TOTAL_POINTS - sum;
        remainingEl.textContent = remaining;
        // Show negative remainder in red
        remainingEl.style.color = remaining === 0 ? '#61dafb' : '#ff6347';
        applyBtn.disabled = (remaining !== 0);
    }

    // Initialize values from appStore or defaults
    function initValuesFromState() {
        const stateWeights = appStore.getState('tuning.weights') || { itae: 50, overshoot: 30, sse: 20 };
        itaeInput.value = sanitizeAndClamp(stateWeights.itae);
        overshootInput.value = sanitizeAndClamp(stateWeights.overshoot);
        sseInput.value = sanitizeAndClamp(stateWeights.sse);
        updateWeightUi();
    }

    openBtn.addEventListener('click', () => { initValuesFromState(); modal.style.display = 'flex'; });
    closeBtn.addEventListener('click', () => { modal.style.display = 'none'; });
    [itaeInput, overshootInput, sseInput].forEach(inp => inp.addEventListener('input', updateWeightUi));

    applyBtn.addEventListener('click', () => {
        const itae = sanitizeAndClamp(itaeInput.value);
        const overs = sanitizeAndClamp(overshootInput.value);
        const sse = sanitizeAndClamp(sseInput.value);
        const sum = itae + overs + sse;
        if (sum !== TOTAL_POINTS) {
            addLogMessage('[UI] Musisz rozdzielić dokładnie 100 punktów pomiędzy wagi.', 'warn');
            return;
        }
        appStore.setState('tuning.weights', { itae, overshoot: overs, sse });
        // Send to robot as set_tuning_config_param keys - map sse to control effort key name
        sendBleCommand('set_tuning_config_param', { key: 'weights_itae', value: itae });
        sendBleCommand('set_tuning_config_param', { key: 'weights_overshoot', value: overs });
        sendBleCommand('set_tuning_config_param', { key: 'weights_control_effort', value: sse });
        addLogMessage('[UI] Wagi fitness zastosowane.', 'info');
        modal.style.display = 'none';
    });
}

// ========================================================================
// SESSION MANAGEMENT
// ========================================================================

let currentTuningSession = null;

async function requestFullConfigAndSync(timeoutMs = 20000) {
    return new Promise((resolve, reject) => {
        let resolved = false;
        const onSync = (evt) => {
            const data = (evt && evt.detail) ? evt.detail : evt;
            if (!data || !data.type) return;
            if (data.type === 'sync_complete' || data.type === 'sync_end') {
                if (!resolved) {
                    resolved = true;
                    window.removeEventListener('ble_message', onSync);
                    resolve(true);
                }
            }
        };
        window.addEventListener('ble_message', onSync);
        // Send a request for full configuration
        sendBleCommand('request_full_config', {});
        setTimeout(() => {
            if (!resolved) {
                window.removeEventListener('ble_message', onSync);
                reject(new Error('request_full_config timeout'));
            }
        }, timeoutMs);
    });
}

async function startTuning() {
    if (!(await checkTuningPrerequisites())) return;

    const method = document.querySelector('.method-tab.active')?.dataset.method;
    const startBtn = document.getElementById('start-tuning-btn');
    if (startBtn) startBtn.disabled = true; // Prevent double-click while loading deps
    if (!method) {
        addLogMessage('[UI] Nie wybrano metody optymalizacji.', 'warn');
        return;
    }

    // CRITICAL: Request tuning dependencies (algorithms, ml5 for Bayesian) and full configuration from robot
    try {
        await ensureTuningDependencies(method);
    } catch (err) {
        addLogMessage('[UI] Blad: nie udalo sie zaladowac zaleznosci strojenia. Sprobuj ponownie lub otworz debug konsole.', 'error');
        setTuningUiLock(false, '');
        return;
    }

    // CRITICAL: Request full configuration from robot and capture baseline PID
    // This ensures baseline reflects the actual runtime parameters on the robot
    try {
        await requestFullConfigAndSync(5000);
    } catch (err) {
        addLogMessage('[UI] Ostrzezenie: synchronizacja konfiguracji nie powiodla sie. Zastosuje lokalne wartosci UI.', 'warn');
    }
    captureBaselinePID();

    const searchSpace = {
        kp_min: parseFloat(document.getElementById('search-kp-min')?.value || 0),
        kp_max: parseFloat(document.getElementById('search-kp-max')?.value || 50),
        ki_min: parseFloat(document.getElementById('search-ki-min')?.value || 0),
        ki_max: parseFloat(document.getElementById('search-ki-max')?.value || 1),
        kd_min: parseFloat(document.getElementById('search-kd-min')?.value || 0),
        kd_max: parseFloat(document.getElementById('search-kd-max')?.value || 5)
    };

    setTuningUiLock(true, method);
    // Ensure UI shows last attempts and current progress at start
    try { if (typeof refreshRecentList === 'function') refreshRecentList(); } catch (e) { /* no-op */ }
    document.getElementById('tuning-status-text').textContent = `Uruchamianie (${method || 'N/A'})...`;
    document.getElementById('current-iteration').textContent = '0';
    fitnessChartData = [];
    updateFitnessChart();
    document.getElementById('start-tuning-btn').disabled = true;
    document.getElementById('pause-tuning-btn').disabled = false;
    document.getElementById('stop-tuning-btn').disabled = false;

    addLogMessage(`[UI] Rozpoczynam strojenie po stronie UI metodą: ${method.toUpperCase()}`, 'info');

    try {
        let config;
        if (method === 'ga' || method === 'ga-genetic') {
            config = {
                populationSize: parseInt(document.getElementById('ga-population').value),
                generations: parseInt(document.getElementById('ga-generations').value),
                mutationRate: parseFloat(document.getElementById('ga-mutation').value) / 100.0,
                crossoverRate: parseFloat(document.getElementById('ga-crossover').value) / 100.0,
                elitism: document.getElementById('ga-elitism').checked,
                searchSpace: searchSpace
            };
            currentTuningSession = new GeneticAlgorithm(config);
            if (isNaN(config.populationSize) || config.populationSize <= 0 || isNaN(config.generations) || config.generations <= 0) {
                addLogMessage('[UI] Niepoprawna konfiguracja GA: populationSize i generations muszą być > 0', 'error');
                setTuningUiLock(false, '');
                return;
            }
            try { addLogMessage(`[UI] GA config: pop=${config.populationSize} gen=${config.generations} mut=${config.mutationRate} xo=${config.crossoverRate}`, 'info'); } catch (e) { console.debug('[UI] GA config log failed', e); }
        } else if (method === 'pso' || method === 'pso-particle') {
            config = {
                numParticles: parseInt(document.getElementById('pso-particles').value),
                iterations: parseInt(document.getElementById('pso-iterations').value),
                inertiaWeight: parseFloat(document.getElementById('pso-inertia').value),
                cognitiveWeight: parseFloat(document.getElementById('pso-cognitive').value),
                socialWeight: parseFloat(document.getElementById('pso-social').value),
                searchSpace: searchSpace
            };
            currentTuningSession = new ParticleSwarmOptimization(config);
            if (isNaN(config.numParticles) || config.numParticles <= 0 || isNaN(config.iterations) || config.iterations <= 0) {
                addLogMessage('[UI] Niepoprawna konfiguracja PSO: numParticles i iterations muszą być > 0', 'error');
                setTuningUiLock(false, '');
                return;
            }
        } else if (method === 'bayesian') {
            config = {
                iterations: parseInt(document.getElementById('bayesian-iterations').value),
                initialSamples: parseInt(document.getElementById('bayesian-initial').value),
                acquisitionFunction: document.getElementById('bayesian-acquisition').value,
                xi: parseFloat(document.getElementById('bayesian-xi').value),
                searchSpace: searchSpace
            };
            currentTuningSession = new BayesianOptimization(config);
            if (isNaN(config.iterations) || config.iterations <= 0 || isNaN(config.initialSamples) || config.initialSamples <= 0) {
                addLogMessage('[UI] Niepoprawna konfiguracja Bayes: iterations i initialSamples muszą być > 0', 'error');
                setTuningUiLock(false, '');
                return;
            }
        } else {
            throw new Error(`Nieznana metoda: ${method}`);
        }

        try { addLogMessage(`[UI] currentTuningSession: ${currentTuningSession.constructor.name} debugId=${currentTuningSession._debugId || 'N/A'} config=${JSON.stringify(config)}`, 'info'); } catch (e) { console.debug('[UI] tuning session log failed', e); }

        // Start the tuning session
        currentTuningSession.run().catch((err) => {
            console.error('[UI] Autostrojenie error:', err);
            addLogMessage(`[UI] Błąd podczas sesji strojenia: ${err?.message ?? String(err)}`, 'error');
        }).finally(() => {
            stopTuning(false);
        });

    } catch (error) {
        console.error('Błąd inicjalizacji strojenia:', error);
        addLogMessage('Błąd inicjalizacji strojenia: ' + error.message, 'error');
        stopTuning(false);
        if (startBtn) startBtn.disabled = false;
    }
}

function pauseTuning() {
    if (currentTuningSession && typeof currentTuningSession.pause === 'function') {
        currentTuningSession.pause();
        document.getElementById('tuning-status-text').textContent = 'Wstrzymany';
        addLogMessage('[UI] Strojenie wstrzymane.', 'info');
        document.getElementById('pause-tuning-btn').style.display = 'none';
        document.getElementById('resume-tuning-btn').style.display = 'inline-block';
        document.getElementById('resume-tuning-btn').disabled = false;
    }
}

// Unified cancel handler used by events like disconnection or remote tuner end
function handleCancel(showPrompt = true) {
    // Cancel active tuning session (client-side) and unlock UI
    if (currentTuningSession && typeof currentTuningSession.stop === 'function') {
        try { currentTuningSession.stop(); } catch (err) { console.error('handleCancel: currentTuningSession.stop error', err); }
    }
    currentTuningSession = null;
    setTuningUiLock(false, '');
    // Inform the UI and finalize stop logic (no confirmation if showPrompt=false)
    stopTuning(showPrompt === true);
    addLogMessage('[UI] Strojenie przerwane (handleCancel).', 'warn');
}

function resumeTuning() {
    if (currentTuningSession && typeof currentTuningSession.resume === 'function') {
        currentTuningSession.resume();
        document.getElementById('tuning-status-text').textContent = 'W trakcie';
        addLogMessage('[UI] Strojenie wznowione.', 'info');
        document.getElementById('resume-tuning-btn').style.display = 'none';
        document.getElementById('pause-tuning-btn').style.display = 'inline-block';
        document.getElementById('pause-tuning-btn').disabled = false;
    }
}

function stopTuning(showPrompt = true) {
    if (showPrompt && !confirm('Czy na pewno chcesz zatrzymać proces strojenia?')) {
        return;
    }
    if (currentTuningSession && typeof currentTuningSession.stop === 'function') {
        currentTuningSession.stop();
    }
    currentTuningSession = null;
    setTuningUiLock(false, '');
    document.getElementById('tuning-status-text').textContent = 'Zatrzymany';
    addLogMessage('[UI] Strojenie zatrzymane.', 'warn');

    document.getElementById('start-tuning-btn').disabled = false;
    document.getElementById('pause-tuning-btn').disabled = true;
    document.getElementById('stop-tuning-btn').disabled = true;
    document.getElementById('resume-tuning-btn').style.display = 'none';
    document.getElementById('pause-tuning-btn').style.display = 'inline-block';
}

// ========================================================================
// INIT
// ========================================================================

function initAutoTuningUI() {
    // Zakładki już obsługiwane przez setupAutotuningTabs()+activateMethodTab
    // Upewnij się że domyślnie aktywna karta jest poprawnie ustawiona
    const initial = document.querySelector('.method-tab.active')?.dataset.method || 'ga';
    activateMethodTab(initial);
}

/**
 * initAutotune() — master init function.
 * Calls all setup functions, wires start/pause/resume/stop buttons,
 * BLE message listener bridge, ML accordion bridge.
 */
function initAutotune() {
    // Setup tabs and chart
    initAutotuneTuningChart();
    setupAutotuningTabs();
    setupMainAutotuneTabs();
    initFitnessModal();
    initAutoTuningUI();

    // Listen for BLE messages
    window.addEventListener('message', function (event) {
        if (event.data && event.data.type) {
            // Dispatch custom event for algorithm handlers
            const bleEvent = new CustomEvent('ble_message', { detail: event.data });
            window.dispatchEvent(bleEvent);
        }
    });

    // ML accordion helpers: bridge to Bayesian tab
    const openBayesianBtn = document.getElementById('ml-open-bayesian');
    if (openBayesianBtn) openBayesianBtn.addEventListener('click', () => {
        activateMethodTab('bayesian');
        document.querySelector('#autotuning-card-content')?.scrollIntoView({ behavior: 'smooth' });
    });
    const startBayesianBtn = document.getElementById('ml-start-bayesian');
    if (startBayesianBtn) startBayesianBtn.addEventListener('click', () => {
        activateMethodTab('bayesian');
        document.getElementById('start-tuning-btn')?.click();
    });

    // Wire start/pause/resume/stop buttons
    const startBtn = document.getElementById('start-tuning-btn');
    const pauseBtn = document.getElementById('pause-tuning-btn');
    const resumeBtn = document.getElementById('resume-tuning-btn');
    const stopBtn = document.getElementById('stop-tuning-btn');

    if (startBtn) startBtn.addEventListener('click', startTuning);
    if (pauseBtn) pauseBtn.addEventListener('click', pauseTuning);
    if (resumeBtn) resumeBtn.addEventListener('click', resumeTuning);
    if (stopBtn) stopBtn.addEventListener('click', () => stopTuning(true));

    // Apply best found parameters to the robot
    const applyBestBtn = document.getElementById('apply-best-btn');
    if (applyBestBtn) {
        applyBestBtn.addEventListener('click', () => {
            const kp = parseFloat(document.getElementById('best-kp')?.textContent) || 0;
            const ki = parseFloat(document.getElementById('best-ki')?.textContent) || 0;
            const kd = parseFloat(document.getElementById('best-kd')?.textContent) || 0;
            applyParameters(kp, ki, kd);
            addLogMessage('[UI] Zastosowano najlepsze parametry (Apply Best).', 'info');
        });
    }

    // Preload algorithms in background to avoid delay on first start
    ensureTuningDependencies().then(() => {
        try { addLogMessage('[UI] Moduly strojenia (GA/PSO) zaladowane i gotowe.', 'info'); } catch (e) { }
    }).catch((err) => {
        try { addLogMessage('[UI] Ostrzezenie: Nie mozna wstępnie zaladowac modulow strojenia: ' + err.message, 'warn'); } catch (e) { }
    });
}

// ========================================================================
// WINDOW EXPORTS (backward compatibility)
// ========================================================================

window.GeneticAlgorithm = GeneticAlgorithm;
window.ParticleSwarmOptimization = ParticleSwarmOptimization;
window.BayesianOptimization = BayesianOptimization;
window.runTelemetryBasedTest = runTelemetryBasedTest;
window.calculateFitnessFromTelemetry = calculateFitnessFromTelemetry;
window.addTestToResultsTable = addTestToResultsTable;
window.applyParameters = applyParameters;
window.captureBaselinePID = captureBaselinePID;
window.sendBaselinePIDToRobot = sendBaselinePIDToRobot;
window.updateBestDisplay = updateBestDisplay;
window.updateFitnessChart = updateFitnessChart;
window.updateCurrentTestDisplay = updateCurrentTestDisplay;
window.updateCurrentTelemetryPlot = updateCurrentTelemetryPlot;
window.sendBleCommand = sendBleCommand;
window.activateMethodTab = activateMethodTab;
window.handleCancel = handleCancel;
window.initAutotune = initAutotune;
window.startTuning = startTuning;
window.pauseTuning = pauseTuning;
window.resumeTuning = resumeTuning;
window.stopTuning = stopTuning;
window.setTuningUiLock = setTuningUiLock;
window.initAutotuneTuningChart = initAutotuneTuningChart;
window.setupAutotuningTabs = setupAutotuningTabs;
window.updateSearchSpaceInputs = updateSearchSpaceInputs;
window.initFitnessModal = initFitnessModal;
window.showNotification = showNotification;
window.setupMainAutotuneTabs = setupMainAutotuneTabs;

// ========================================================================
// ES6 EXPORTS
// ========================================================================

export {
    // Chart
    initAutotuneTuningChart,
    updateAutotuneTuningChart,
    // Tabs
    activateMethodTab,
    setupAutotuningTabs,
    setupMainAutotuneTabs,
    // Algorithm loading
    ensureTuningDependencies,
    loadMl5,
    // Fitness
    fitnessChartData,
    calculateFitnessFromTelemetry,
    initFitnessModal,
    updateFitnessChart,
    // Helpers
    showNotification,
    mean,
    computeTestTimeout,
    getPIDParamKeys,
    runTelemetryBasedTest,
    PARAMETER_SETTLING_TIME_MS,
    // UI updates
    updateBestDisplay,
    updateProgressDisplay,
    addTestToResultsTable,
    updateCurrentTestDisplay,
    addResultToTable,
    updateCurrentTelemetryPlot,
    // Classes
    GeneticAlgorithm,
    ParticleSwarmOptimization,
    BayesianOptimization,
    // Apply / Baseline helpers
    applyParameters,
    sendBaselinePIDToRobot,
    captureBaselinePID,
    // BLE command helper
    sendBleCommand,
    // Dynamic tests
    runDynamicTest,
    handleDynamicTestResult,
    // Lock
    setTuningUiLock,
    // Search space & prerequisites
    updateSearchSpaceInputs,
    waitForRobotState,
    checkTuningPrerequisites,
    // Session management
    currentTuningSession,
    requestFullConfigAndSync,
    startTuning,
    pauseTuning,
    handleCancel,
    resumeTuning,
    stopTuning,
    // Init
    initAutoTuningUI,
    initAutotune
};
