// ========================================================================
// PID TUNING - Moduł edukacyjny PID + Diagnostyka (ES6 Module)
// ========================================================================

// Uwaga: hookPIDToTelemetry() opakowuje window.updateTelemetryUI — nie trzeba importu ES6.

// ========================================================================
// PID EDUCATION - Wizualizacja edukacyjna składowych PID
// ========================================================================

export const PIDEducation = {
    isLiveMode: true,
    isStepMode: false,
    stepHistory: [],
    currentStepIndex: 0,
    maxStepHistory: 100,

    simulator: {
        prevError: 0,
        integral: 0,
        prevPitch: 0,
        lastTimestamp: 0
    },

    chart: null,
    chartData: {
        labels: [],
        pValues: [],
        iValues: [],
        dValues: [],
        sumValues: [],
        errorValues: []
    },

    tips: [
        "Obserwuj, jak zmienia się każda składowa podczas ruchu robota. Składowa P reaguje natychmiast na odchylenie, I rośnie powoli przy stałym błędzie, a D hamuje szybkie zmiany.",
        "Gdy robot odchyla się od pionu, składowa P (czerwona) natychmiast rośnie proporcjonalnie do błędu.",
        "Składowa I (zielona) powoli akumuluje błędy w czasie - obserwuj jej wzrost przy stałym odchyleniu.",
        "Składowa D (niebieska) reaguje na szybkość zmian - zauważ jak 'hamuje' gdy robot szybko się pochyla.",
        "Suma P+I+D (żółta) to finalne wyjście PID, które steruje silnikami.",
        "Zwiększając Kp, zobaczysz większą amplitudę czerwonej linii - robot reaguje mocniej.",
        "Składowa D działa jak amortyzator - porównaj jej wartość przy szybkim i wolnym ruchu.",
        "W trybie krokowym możesz analizować dokładnie jedną iterację pętli sterowania.",
        "🎯 STROJENIE: Zacznij od samego Kp (Ki=0, Kd=0). Zwiększaj aż pojawią się oscylacje.",
        "🎯 STROJENIE: Po znalezieniu Kp zmniejsz go o ~20% i dodaj Kd aby stłumić oscylacje.",
        "🎯 STROJENIE: Ki dodawaj na końcu i tylko jeśli robot ma stałe odchylenie od pionu.",
        "⚠️ Jeśli robot oscyluje szybko (trzęsie się) - zmniejsz Kp lub zwiększ Kd.",
        "⚠️ Jeśli robot oscyluje wolno (kołysze się) - zmniejsz Ki.",
        "⚠️ Jeśli robot reaguje zbyt wolno - zwiększ Kp, ale uważaj na oscylacje.",
        "💡 Typowe wartości startowe dla robota balansującego: Kp=50-100, Ki=0-1, Kd=1-5.",
        "💡 Składowa D jest szczególnie ważna dla stabilności - nie pomijaj jej!",
        "💡 Panel 'Diagnostyka PID' analizuje zachowanie i podpowiada co poprawić."
    ],
    currentTipIndex: 0
};

/**
 * Inicjalizacja modułu PID Education
 */
export function initPIDEducation() {
    const ctx = document.getElementById('pidComponentsChart');
    if (ctx) {
        PIDEducation.chart = new Chart(ctx.getContext('2d'), {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'P (Proporcjonalna)',
                        data: [],
                        borderColor: '#e74c3c',
                        backgroundColor: 'rgba(231, 76, 60, 0.1)',
                        fill: false,
                        tension: 0.2,
                        pointRadius: 0,
                        borderWidth: 2
                    },
                    {
                        label: 'I (Całkująca)',
                        data: [],
                        borderColor: '#27ae60',
                        backgroundColor: 'rgba(39, 174, 96, 0.1)',
                        fill: false,
                        tension: 0.2,
                        pointRadius: 0,
                        borderWidth: 2
                    },
                    {
                        label: 'D (Różniczkująca)',
                        data: [],
                        borderColor: '#3498db',
                        backgroundColor: 'rgba(52, 152, 219, 0.1)',
                        fill: false,
                        tension: 0.2,
                        pointRadius: 0,
                        borderWidth: 2
                    },
                    {
                        label: 'Suma (Output)',
                        data: [],
                        borderColor: '#f1c40f',
                        backgroundColor: 'rgba(241, 196, 15, 0.1)',
                        fill: false,
                        tension: 0.2,
                        pointRadius: 0,
                        borderWidth: 3
                    },
                    {
                        label: 'Błąd',
                        data: [],
                        borderColor: '#9b59b6',
                        backgroundColor: 'rgba(155, 89, 182, 0.1)',
                        fill: false,
                        tension: 0.2,
                        pointRadius: 0,
                        borderWidth: 1,
                        borderDash: [5, 5],
                        hidden: true
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                scales: {
                    x: {
                        display: true,
                        title: { display: true, text: 'Czas', color: '#888' },
                        ticks: { color: '#888', maxTicksLimit: 10 }
                    },
                    y: {
                        display: true,
                        title: { display: true, text: 'Wartość', color: '#888' },
                        ticks: { color: '#888' },
                        grid: { color: 'rgba(255,255,255,0.1)' }
                    }
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: { color: '#fff', usePointStyle: true, padding: 15 }
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false
                    }
                }
            }
        });
    }

    document.getElementById('pidEduLiveBtn')?.addEventListener('click', () => setLiveMode());
    document.getElementById('pidEduStepBtn')?.addEventListener('click', () => setStepMode());
    document.getElementById('pidEduResetBtn')?.addEventListener('click', () => resetPIDEducation());

    document.getElementById('stepPrevBtn')?.addEventListener('click', () => navigateStep(-1));
    document.getElementById('stepNextBtn')?.addEventListener('click', () => navigateStep(1));
    document.getElementById('stepCaptureBtn')?.addEventListener('click', () => captureCurrentStep());

    document.getElementById('showPComponent')?.addEventListener('change', (e) => toggleDataset(0, e.target.checked));
    document.getElementById('showIComponent')?.addEventListener('change', (e) => toggleDataset(1, e.target.checked));
    document.getElementById('showDComponent')?.addEventListener('change', (e) => toggleDataset(2, e.target.checked));
    document.getElementById('showPIDSum')?.addEventListener('change', (e) => toggleDataset(3, e.target.checked));
    document.getElementById('showPIDError')?.addEventListener('change', (e) => toggleDataset(4, e.target.checked));

    setInterval(() => rotateTip(), 10000);

    document.getElementById('pidEducationHelp')?.addEventListener('click', () => {
        const helpText = document.getElementById('pidEducationHelpText');
        if (helpText) helpText.classList.toggle('visible');
    });

    window.addLogMessage?.('[UI] Moduł Nauka PID zainicjalizowany.', 'info');
}

function setLiveMode() {
    PIDEducation.isLiveMode = true;
    PIDEducation.isStepMode = false;
    document.getElementById('pidEduLiveBtn')?.classList.add('active');
    document.getElementById('pidEduStepBtn')?.classList.remove('active');
    const panel = document.getElementById('pidStepModePanel');
    if (panel) panel.style.display = 'none';
    window.addLogMessage?.('[UI] Tryb PID: Na żywo', 'info');
}

function setStepMode() {
    PIDEducation.isLiveMode = false;
    PIDEducation.isStepMode = true;
    document.getElementById('pidEduLiveBtn')?.classList.remove('active');
    document.getElementById('pidEduStepBtn')?.classList.add('active');
    const panel = document.getElementById('pidStepModePanel');
    if (panel) panel.style.display = 'block';
    updateStepDisplay();
    window.addLogMessage?.('[UI] Tryb PID: Krokowy - użyj przycisków do nawigacji między zapisanymi krokami', 'info');
}

export function resetPIDEducation() {
    PIDEducation.simulator.prevError = 0;
    PIDEducation.simulator.integral = 0;
    PIDEducation.simulator.prevPitch = 0;
    PIDEducation.stepHistory = [];
    PIDEducation.currentStepIndex = 0;
    if (PIDEducation.chart) {
        PIDEducation.chart.data.labels = [];
        PIDEducation.chart.data.datasets.forEach(ds => ds.data = []);
        PIDEducation.chart.update('none');
    }
    updateLiveValues(0, 0, 0, 0);
    updateStepDisplay();
    window.addLogMessage?.('[UI] Moduł Nauka PID zresetowany.', 'info');
}

export function calculatePIDComponents(telemetryData) {
    const sim = PIDEducation.simulator;
    const timestamp = Date.now();
    const Kp = parseFloat(document.getElementById('balanceKpInput')?.value) || 95;
    const Ki = parseFloat(document.getElementById('balanceKiInput')?.value) || 0;
    const Kd = parseFloat(document.getElementById('balanceKdInput')?.value) || 3.23;
    const integralLimit = parseFloat(document.getElementById('balanceIntegralLimitInput')?.value) || 50;
    const pitch = telemetryData.pitch || telemetryData.raw_pitch || 0;
    const setpoint = 0;
    const error = setpoint - pitch;
    const dt = sim.lastTimestamp > 0 ? (timestamp - sim.lastTimestamp) / 1000 : 0.02;

    let P_out, I_out, D_out, output;
    let usingRealData = false;

    if (telemetryData.bp !== undefined && telemetryData.bi !== undefined && telemetryData.bd !== undefined) {
        P_out = telemetryData.bp;
        I_out = telemetryData.bi;
        D_out = telemetryData.bd;
        output = telemetryData.o || (P_out + I_out + D_out);
        usingRealData = true;
        if (Math.abs(Ki) > 0.00001) sim.integral = I_out / Ki;
    } else {
        P_out = Kp * error;
        if (dt > 0 && Ki > 0.00001) {
            sim.integral += error * dt;
            sim.integral = Math.max(-integralLimit, Math.min(integralLimit, sim.integral));
        }
        I_out = Ki * sim.integral;
        D_out = 0;
        if (dt > 0) {
            const pitchDerivative = (pitch - sim.prevPitch) / dt;
            D_out = -Kd * pitchDerivative;
        }
        output = P_out + I_out + D_out;
    }

    sim.prevError = error;
    sim.prevPitch = pitch;
    sim.lastTimestamp = timestamp;

    return { setpoint, input: pitch, error, Kp, Ki, Kd, P_out, I_out, D_out, integral: sim.integral, derivative: dt > 0 ? (pitch - sim.prevPitch) / dt : 0, output, timestamp, usingRealData };
}

export function updatePIDEducation(telemetryData) {
    if (!telemetryData) return;
    const components = calculatePIDComponents(telemetryData);
    PIDEducation.stepHistory.push(components);
    if (PIDEducation.stepHistory.length > PIDEducation.maxStepHistory) PIDEducation.stepHistory.shift();

    const badge = document.getElementById('pidDataSourceBadge');
    if (badge) {
        if (components.usingRealData) {
            badge.textContent = '📡 Dane z robota';
            badge.style.background = '#27ae60';
            badge.style.color = '#fff';
        } else {
            badge.textContent = 'Symulacja';
            badge.style.background = '#555';
            badge.style.color = '#888';
        }
    }

    if (PIDEducation.isLiveMode) {
        updateLiveValues(components.P_out, components.I_out, components.D_out, components.output);
        updatePIDChart(components);
        const stepTotalEl = document.getElementById('stepTotal');
        if (stepTotalEl) stepTotalEl.textContent = PIDEducation.stepHistory.length.toString();
    }
}

function updateLiveValues(P, I, D, output) {
    const format = (v) => v.toFixed(2);
    const liveP = document.getElementById('liveP');
    const liveI = document.getElementById('liveI');
    const liveD = document.getElementById('liveD');
    const liveOutput = document.getElementById('liveOutput');
    if (liveP) { const prev = parseFloat(liveP.textContent) || 0; liveP.textContent = format(P); highlightChange(liveP.parentElement, P, prev); }
    if (liveI) { const prev = parseFloat(liveI.textContent) || 0; liveI.textContent = format(I); highlightChange(liveI.parentElement, I, prev); }
    if (liveD) { const prev = parseFloat(liveD.textContent) || 0; liveD.textContent = format(D); highlightChange(liveD.parentElement, D, prev); }
    if (liveOutput) liveOutput.textContent = format(output);
}

function highlightChange(element, newVal, oldVal) {
    if (!element) return;
    element.classList.remove('highlight-positive', 'highlight-negative');
    const diff = newVal - oldVal;
    if (Math.abs(diff) > 0.1) element.classList.add(diff > 0 ? 'highlight-positive' : 'highlight-negative');
}

function updatePIDChart(components) {
    if (!PIDEducation.chart) return;
    const chart = PIDEducation.chart;
    const maxPoints = 100;
    const timeLabel = ((components.timestamp % 100000) / 1000).toFixed(1);
    chart.data.labels.push(timeLabel);
    chart.data.datasets[0].data.push(components.P_out);
    chart.data.datasets[1].data.push(components.I_out);
    chart.data.datasets[2].data.push(components.D_out);
    chart.data.datasets[3].data.push(components.output);
    chart.data.datasets[4].data.push(components.error);
    if (chart.data.labels.length > maxPoints) {
        chart.data.labels.shift();
        chart.data.datasets.forEach(ds => ds.data.shift());
    }
    chart.update('none');
}

function toggleDataset(index, visible) {
    if (PIDEducation.chart && PIDEducation.chart.data.datasets[index]) {
        PIDEducation.chart.data.datasets[index].hidden = !visible;
        PIDEducation.chart.update();
    }
}

function navigateStep(direction) {
    const newIndex = PIDEducation.currentStepIndex + direction;
    if (newIndex >= 0 && newIndex < PIDEducation.stepHistory.length) {
        PIDEducation.currentStepIndex = newIndex;
        updateStepDisplay();
    }
}

function captureCurrentStep() {
    if (PIDEducation.stepHistory.length > 0) {
        PIDEducation.currentStepIndex = PIDEducation.stepHistory.length - 1;
        updateStepDisplay();
        window.addLogMessage?.('[UI] Zapisano bieżący krok PID.', 'success');
    }
}

function updateStepDisplay() {
    const history = PIDEducation.stepHistory;
    const index = PIDEducation.currentStepIndex;
    const counterEl = document.getElementById('stepCounter');
    const totalEl = document.getElementById('stepTotal');
    if (counterEl) counterEl.textContent = history.length > 0 ? (index + 1).toString() : '0';
    if (totalEl) totalEl.textContent = history.length.toString();
    if (history.length === 0 || index >= history.length) {
        setStepValues({ setpoint: 0, input: 0, error: 0, Kp: 0, Ki: 0, Kd: 0, P_out: 0, I_out: 0, D_out: 0, integral: 0, derivative: 0, output: 0 });
        return;
    }
    setStepValues(history[index]);
}

function setStepValues(step) {
    const format = (v, decimals = 2) => (v || 0).toFixed(decimals);
    const el = (id) => document.getElementById(id);
    if (el('stepSetpoint')) el('stepSetpoint').textContent = format(step.setpoint) + '°';
    if (el('stepInput')) el('stepInput').textContent = format(step.input) + '°';
    if (el('stepError')) el('stepError').textContent = format(step.error) + '°';
    if (el('stepKp')) el('stepKp').textContent = format(step.Kp);
    if (el('stepErrorP')) el('stepErrorP').textContent = format(step.error);
    if (el('stepPOut')) el('stepPOut').textContent = '= ' + format(step.P_out);
    if (el('stepKi')) el('stepKi').textContent = format(step.Ki);
    if (el('stepIntegral')) el('stepIntegral').textContent = format(step.integral);
    if (el('stepIOut')) el('stepIOut').textContent = '= ' + format(step.I_out);
    if (el('stepKd')) el('stepKd').textContent = format(step.Kd);
    if (el('stepDerivative')) el('stepDerivative').textContent = format(step.derivative);
    if (el('stepDOut')) el('stepDOut').textContent = '= ' + format(step.D_out);
    if (el('stepPVal')) el('stepPVal').textContent = format(step.P_out);
    if (el('stepIVal')) el('stepIVal').textContent = format(step.I_out);
    if (el('stepDVal')) el('stepDVal').textContent = format(step.D_out);
    if (el('stepOutput')) el('stepOutput').textContent = format(step.output);
}

function rotateTip() {
    PIDEducation.currentTipIndex = (PIDEducation.currentTipIndex + 1) % PIDEducation.tips.length;
    const tipEl = document.getElementById('pidTipText');
    if (tipEl) tipEl.textContent = PIDEducation.tips[PIDEducation.currentTipIndex];
}

// ========================================================================
// PID DIAGNOSTICS - Inteligentna analiza i podpowiedzi strojenia
// ========================================================================

export const PIDDiagnostics = {
    errorHistory: [],
    outputHistory: [],
    pitchHistory: [],
    maxHistoryLength: 200,
    analysis: {
        oscillationDetected: false,
        oscillationFrequency: 0,
        oscillationAmplitude: 0,
        steadyStateError: 0,
        responseTime: 0,
        overshoot: 0,
        stability: 'unknown'
    },
    recommendations: [],
    lastAnalysisTime: 0,
    analysisInterval: 500,
    isBalancing: false
};

export function initPIDDiagnostics() {
    document.getElementById('diagResetStatsBtn')?.addEventListener('click', () => {
        resetPIDDiagnostics();
        window.addLogMessage?.('[Diagnostyka] Statystyki zresetowane.', 'info');
    });
    document.getElementById('diagExplainBtn')?.addEventListener('click', () => showDiagnosticExplanation());
    window.addLogMessage?.('[UI] Moduł diagnostyki PID zainicjalizowany.', 'info');
}

export function resetPIDDiagnostics() {
    PIDDiagnostics.errorHistory = [];
    PIDDiagnostics.outputHistory = [];
    PIDDiagnostics.pitchHistory = [];
    PIDDiagnostics.analysis = { oscillationDetected: false, oscillationFrequency: 0, oscillationAmplitude: 0, steadyStateError: 0, responseTime: 0, overshoot: 0, stability: 'unknown' };
    PIDDiagnostics.recommendations = [];
    updateDiagnosticsUI();
}

export function updatePIDDiagnostics(components) {
    if (!components) return;
    PIDDiagnostics.errorHistory.push(components.error);
    PIDDiagnostics.outputHistory.push(components.output);
    PIDDiagnostics.pitchHistory.push(components.input);
    if (PIDDiagnostics.errorHistory.length > PIDDiagnostics.maxHistoryLength) {
        PIDDiagnostics.errorHistory.shift();
        PIDDiagnostics.outputHistory.shift();
        PIDDiagnostics.pitchHistory.shift();
    }
    const balanceSwitch = document.getElementById('balanceSwitch');
    PIDDiagnostics.isBalancing = balanceSwitch?.checked || false;
    const now = Date.now();
    if (now - PIDDiagnostics.lastAnalysisTime >= PIDDiagnostics.analysisInterval) {
        PIDDiagnostics.lastAnalysisTime = now;
        analyzePIDPerformance();
        generateRecommendations(components);
        updateDiagnosticsUI();
    }
}

function analyzePIDPerformance() {
    const errors = PIDDiagnostics.errorHistory;
    const outputs = PIDDiagnostics.outputHistory;
    if (errors.length < 20) { PIDDiagnostics.analysis.stability = 'collecting'; return; }
    const recentErrors = errors.slice(-100);

    let zeroCrossings = 0;
    for (let i = 1; i < recentErrors.length; i++) {
        if ((recentErrors[i - 1] > 0 && recentErrors[i] < 0) || (recentErrors[i - 1] < 0 && recentErrors[i] > 0)) zeroCrossings++;
    }
    const oscillationFreq = zeroCrossings / (recentErrors.length / 50);
    PIDDiagnostics.analysis.oscillationFrequency = oscillationFreq;
    PIDDiagnostics.analysis.oscillationDetected = oscillationFreq > 5;

    const meanError = recentErrors.reduce((a, b) => a + b, 0) / recentErrors.length;
    const variance = recentErrors.reduce((a, b) => a + Math.pow(b - meanError, 2), 0) / recentErrors.length;
    PIDDiagnostics.analysis.oscillationAmplitude = Math.sqrt(variance);

    const avgAbsError = recentErrors.reduce((a, b) => a + Math.abs(b), 0) / recentErrors.length;
    PIDDiagnostics.analysis.steadyStateError = avgAbsError;

    if (PIDDiagnostics.analysis.oscillationAmplitude > 5) PIDDiagnostics.analysis.stability = 'unstable';
    else if (PIDDiagnostics.analysis.oscillationAmplitude > 2) PIDDiagnostics.analysis.stability = 'marginal';
    else if (PIDDiagnostics.analysis.oscillationAmplitude > 0.5) PIDDiagnostics.analysis.stability = 'acceptable';
    else PIDDiagnostics.analysis.stability = 'good';

    let maxOvershoot = 0;
    let lastSign = Math.sign(recentErrors[0]);
    let peakAfterCrossing = 0;
    for (let i = 1; i < recentErrors.length; i++) {
        const currentSign = Math.sign(recentErrors[i]);
        if (currentSign !== lastSign && currentSign !== 0) peakAfterCrossing = Math.abs(recentErrors[i]);
        else if (currentSign === -lastSign) peakAfterCrossing = Math.max(peakAfterCrossing, Math.abs(recentErrors[i]));
        lastSign = currentSign || lastSign;
        maxOvershoot = Math.max(maxOvershoot, peakAfterCrossing);
    }
    PIDDiagnostics.analysis.overshoot = maxOvershoot;
}

function generateRecommendations(components) {
    const recommendations = [];
    const analysis = PIDDiagnostics.analysis;

    if (!PIDDiagnostics.isBalancing) {
        recommendations.push({ type: 'info', text: 'Włącz balansowanie, aby rozpocząć analizę PID.', priority: 0 });
        PIDDiagnostics.recommendations = recommendations;
        return;
    }
    if (analysis.stability === 'collecting') {
        recommendations.push({ type: 'info', text: 'Zbieranie danych do analizy... Poczekaj kilka sekund.', priority: 0 });
        PIDDiagnostics.recommendations = recommendations;
        return;
    }

    const Kp = parseFloat(document.getElementById('balanceKpInput')?.value) || 0;
    const Ki = parseFloat(document.getElementById('balanceKiInput')?.value) || 0;
    const Kd = parseFloat(document.getElementById('balanceKdInput')?.value) || 0;

    if (analysis.oscillationDetected && analysis.oscillationAmplitude > 3) {
        recommendations.push({ type: 'critical', text: `🔴 SILNE OSCYLACJE wykryte (amplituda: ${analysis.oscillationAmplitude.toFixed(1)}°). Zmniejsz Kp o 10-20% (obecnie ${Kp.toFixed(1)}) lub zwiększ Kd (obecnie ${Kd.toFixed(2)}).`, priority: 10 });
    } else if (analysis.oscillationDetected && analysis.oscillationAmplitude > 1) {
        recommendations.push({ type: 'warning', text: `🟡 Lekkie oscylacje (amplituda: ${analysis.oscillationAmplitude.toFixed(2)}°). Spróbuj zwiększyć Kd o 10-20% (obecnie ${Kd.toFixed(2)}) aby je stłumić.`, priority: 7 });
    }
    if (analysis.steadyStateError > 2 && Ki < 0.1) {
        recommendations.push({ type: 'warning', text: `🟡 Stały błąd ${analysis.steadyStateError.toFixed(2)}° od pionu. Rozważ zwiększenie Ki (obecnie ${Ki.toFixed(3)}) lub sprawdź offset montażu.`, priority: 6 });
    }
    const avgOutput = PIDDiagnostics.outputHistory.slice(-50).reduce((a, b) => a + Math.abs(b), 0) / 50;
    if (avgOutput > 200) {
        recommendations.push({ type: 'warning', text: `🟡 Wysokie średnie wyjście PID (${avgOutput.toFixed(0)}). Może to oznaczać zbyt agresywne ustawienia lub problem z mechanicznym balansem.`, priority: 5 });
    }
    if (Math.abs(components.P_out) > 10 * Math.abs(components.D_out) && Math.abs(components.P_out) > 50) {
        recommendations.push({ type: 'info', text: `ℹ️ Składowa P dominuje nad D (${Math.abs(components.P_out).toFixed(1)} vs ${Math.abs(components.D_out).toFixed(1)}). Rozważ zwiększenie Kd dla lepszego tłumienia.`, priority: 4 });
    }
    if (Math.abs(components.I_out) > 30) {
        recommendations.push({ type: 'warning', text: `🟡 Składowa I jest duża (${components.I_out.toFixed(1)}). Może występować wind-up. Zmniejsz Ki lub zwiększ limit całki.`, priority: 6 });
    }
    if (analysis.stability === 'good' && analysis.steadyStateError < 0.5) {
        recommendations.push({ type: 'good', text: `✅ Bardzo dobra stabilność! Błąd średni: ${analysis.steadyStateError.toFixed(2)}°, oscylacje minimalne.`, priority: 3 });
    } else if (analysis.stability === 'acceptable') {
        recommendations.push({ type: 'good', text: `✅ Akceptowalna stabilność. Możesz próbować drobnych korekt dla poprawy.`, priority: 2 });
    }
    if (Kp === 0 && Ki === 0 && Kd === 0) {
        recommendations.push({ type: 'info', text: `ℹ️ Wszystkie parametry PID są zerowe. Zacznij od ustawienia Kp na ~50-100.`, priority: 8 });
    }

    recommendations.sort((a, b) => b.priority - a.priority);
    PIDDiagnostics.recommendations = recommendations.slice(0, 4);
}

function updateDiagnosticsUI() {
    const analysis = PIDDiagnostics.analysis;
    const recommendations = PIDDiagnostics.recommendations;

    const diagStatus = document.getElementById('diagStatus');
    if (diagStatus) {
        if (!PIDDiagnostics.isBalancing) { diagStatus.textContent = 'Nieaktywne'; diagStatus.className = ''; }
        else if (analysis.stability === 'collecting') { diagStatus.textContent = 'Analizowanie...'; diagStatus.className = 'analyzing'; }
        else { diagStatus.textContent = 'Aktywne'; diagStatus.className = 'active'; }
    }

    const diagOsc = document.getElementById('diagOscillation');
    const diagOscValue = document.getElementById('diagOscValue');
    if (diagOsc && diagOscValue) {
        if (analysis.oscillationDetected) {
            diagOscValue.textContent = `${analysis.oscillationAmplitude.toFixed(1)}°`;
            diagOsc.className = 'diag-indicator ' + (analysis.oscillationAmplitude > 3 ? 'diag-error pulsing' : 'diag-warning');
        } else { diagOscValue.textContent = 'Brak'; diagOsc.className = 'diag-indicator diag-ok'; }
    }

    const diagSteady = document.getElementById('diagSteadyError');
    const diagSteadyValue = document.getElementById('diagSteadyValue');
    if (diagSteady && diagSteadyValue) {
        diagSteadyValue.textContent = `${analysis.steadyStateError.toFixed(2)}°`;
        diagSteady.className = 'diag-indicator ' + (analysis.steadyStateError > 2 ? 'diag-warning' : 'diag-ok');
    }

    const diagResponse = document.getElementById('diagResponse');
    const diagResponseValue = document.getElementById('diagResponseValue');
    if (diagResponse && diagResponseValue) {
        if (analysis.overshoot > 5) { diagResponseValue.textContent = 'Agresywna'; diagResponse.className = 'diag-indicator diag-warning'; }
        else if (analysis.overshoot > 2) { diagResponseValue.textContent = 'Normalna'; diagResponse.className = 'diag-indicator diag-ok'; }
        else { diagResponseValue.textContent = 'Łagodna'; diagResponse.className = 'diag-indicator diag-ok'; }
    }

    const diagStability = document.getElementById('diagStability');
    const diagStabilityValue = document.getElementById('diagStabilityValue');
    if (diagStability && diagStabilityValue) {
        const stabilityLabels = { 'unknown': '---', 'collecting': '...', 'unstable': 'Niestabilny', 'marginal': 'Marginalny', 'acceptable': 'Akceptowalny', 'good': 'Dobry' };
        const stabilityClasses = { 'unknown': '', 'collecting': '', 'unstable': 'diag-error pulsing', 'marginal': 'diag-warning', 'acceptable': 'diag-ok', 'good': 'diag-ok' };
        diagStabilityValue.textContent = stabilityLabels[analysis.stability] || '---';
        diagStability.className = 'diag-indicator ' + (stabilityClasses[analysis.stability] || '');
    }

    const recList = document.getElementById('pidRecommendationsList');
    if (recList) {
        if (recommendations.length === 0) {
            recList.innerHTML = '<li class="rec-info">Rozpocznij balansowanie, aby zobaczyć analizę.</li>';
        } else {
            recList.innerHTML = recommendations.map(rec => {
                const classMap = { 'critical': 'rec-critical', 'warning': 'rec-warning', 'good': 'rec-good', 'info': 'rec-info' };
                return `<li class="${classMap[rec.type] || 'rec-info'}">${rec.text}</li>`;
            }).join('');
        }
    }
}

function showDiagnosticExplanation() {
    const analysis = PIDDiagnostics.analysis;
    let explanation = '📖 WYJAŚNIENIE AKTUALNEGO STANU:\n\n';
    if (analysis.stability === 'unknown' || analysis.stability === 'collecting') {
        explanation += 'Trwa zbieranie danych. Włącz balansowanie i poczekaj kilka sekund.\n';
        alert(explanation);
        return;
    }
    if (analysis.oscillationDetected) {
        explanation += '〰️ OSCYLACJE:\n';
        explanation += `Wykryto oscylacje o amplitudzie ${analysis.oscillationAmplitude.toFixed(2)}°.\n`;
        explanation += 'Oscylacje oznaczają, że robot "huśta się" wokół punktu równowagi.\n\n';
        explanation += 'PRZYCZYNY:\n• Za duży Kp - robot reaguje zbyt mocno na odchylenia\n• Za mały Kd - brak wystarczającego tłumienia\n\n';
        explanation += 'ROZWIĄZANIE:\n1. Zmniejsz Kp o 10-20%\n2. Zwiększ Kd o 20-50%\n3. Powtarzaj aż oscylacje znikną\n\n';
    }
    if (analysis.steadyStateError > 1) {
        explanation += '📍 BŁĄD USTALONY:\n';
        explanation += `Robot ma średnie odchylenie ${analysis.steadyStateError.toFixed(2)}° od pionu.\n\n`;
        explanation += 'PRZYCZYNY:\n• Za mały Ki - brak korekcji stałego offsetu\n• Nieprawidłowy offset montażu IMU\n• Niesymetryczny rozkład masy\n\n';
        explanation += 'ROZWIĄZANIE:\n1. Najpierw sprawdź mechaniczny balans robota\n2. Użyj funkcji "Ustaw punkt 0" aby skorygować offset\n3. Jeśli powyższe nie pomoże, zwiększ Ki\n\n';
    }
    if (analysis.stability === 'good') {
        explanation += '✅ DOBRA STABILNOŚĆ:\nRobot jest dobrze wyregulowany!\nMożesz eksperymentować z małymi zmianami dla dalszej optymalizacji.\n\n';
    }
    alert(explanation);
}

// ========================================================================
// Hook: wire PID Education + Diagnostics to updateTelemetryUI
// ========================================================================

/**
 * Sets up the hook that calls updatePIDEducation and updatePIDDiagnostics
 * after every telemetry UI update. Called once from app.js during init.
 */
export function hookPIDToTelemetry() {
    const originalUpdateTelemetryUI = window.updateTelemetryUI || function () { };
    window.updateTelemetryUI = function (data) {
        originalUpdateTelemetryUI(data);
        updatePIDEducation(data);
        if (PIDEducation.stepHistory.length > 0) {
            const lastStep = PIDEducation.stepHistory[PIDEducation.stepHistory.length - 1];
            updatePIDDiagnostics(lastStep);
        }
    };
}

// Backward compatibility
window.PIDEducation = PIDEducation;
window.PIDDiagnostics = PIDDiagnostics;
window.initPIDEducation = initPIDEducation;
window.initPIDDiagnostics = initPIDDiagnostics;
window.updatePIDEducation = updatePIDEducation;
window.updatePIDDiagnostics = updatePIDDiagnostics;
