// ========================================================================
// SYSID.JS - System Identification Module (ES6)
// ========================================================================
// Telemetry Recording & Analysis for Model Identification
// Extracted from main.js → Etap 2 modularyzacji
// ========================================================================

import { appStore, AppState, parameterMapping } from './state.js';

// ========================================================================
// STATE
// ========================================================================
export const SysIdState = {
    isRecording: false,
    data: [],
    startTime: 0,
    duration: 5000,
    sampleRate: 50,
    kp: 50,
    impulse: 200,
    impulseDuration: 100,
    impulseApplied: false,
    impulseStartTime: 0,
    chart: null,
    chartCtx: null,
    telemetryHandler: null,
    testType: 'balance',
    stepValue: 50,
    stepApplied: false,
    savedPID: null,
    savedSpeedPID: null,
    savedPositionPID: null,
    currentSetpoint: 0
};

// ========================================================================
// INIT
// ========================================================================
export function initSystemIdentification() {
    const startBtn = document.getElementById('sysid-start-btn');
    const stopBtn = document.getElementById('sysid-stop-btn');
    const exportCsvBtn = document.getElementById('sysid-export-csv-btn');
    const importCsvBtn = document.getElementById('sysid-import-csv-btn');
    const clearBtn = document.getElementById('sysid-clear-btn');
    const testImpulseBtn = document.getElementById('sysid-test-impulse-btn');
    const testTypeSelect = document.getElementById('sysid-test-type');
    const analyzeBtn = document.getElementById('sysid-analyze-btn');

    if (startBtn) startBtn.addEventListener('click', startSysIdRecording);
    if (stopBtn) stopBtn.addEventListener('click', stopSysIdRecording);
    if (exportCsvBtn) exportCsvBtn.addEventListener('click', exportSysIdCSV);
    if (importCsvBtn) importCsvBtn.addEventListener('click', importSysIdCSV);
    if (clearBtn) clearBtn.addEventListener('click', clearSysIdData);
    if (testImpulseBtn) testImpulseBtn.addEventListener('click', testSysIdImpulse);
    if (testTypeSelect) testTypeSelect.addEventListener('change', handleSysIdTestTypeChange);
    if (analyzeBtn) analyzeBtn.addEventListener('click', analyzeSysIdData);

    const canvas = document.getElementById('sysid-preview-chart');
    if (canvas) {
        SysIdState.chartCtx = canvas.getContext('2d');
    }

    handleSysIdTestTypeChange();
}

// ========================================================================
// TEST TYPE CHANGE
// ========================================================================
function handleSysIdTestTypeChange() {
    const testType = document.getElementById('sysid-test-type')?.value || 'balance';
    SysIdState.testType = testType;

    const impulseContainer = document.getElementById('sysid-impulse-container');
    const impulseDurationContainer = document.getElementById('sysid-impulse-duration-container');
    const stepContainer = document.getElementById('sysid-step-container');
    const stepInput = document.getElementById('sysid-step-value');

    if (testType === 'balance') {
        if (impulseContainer) impulseContainer.style.display = '';
        if (impulseDurationContainer) impulseDurationContainer.style.display = '';
        if (stepContainer) stepContainer.style.display = 'none';
    } else if (testType === 'speed') {
        if (impulseContainer) impulseContainer.style.display = '';
        if (impulseDurationContainer) impulseDurationContainer.style.display = 'none';
        if (stepContainer) {
            stepContainer.style.display = '';
            const label = stepContainer.querySelector('label');
            if (label) label.innerHTML = 'Setpoint prędkości [imp/s]<span class="help-icon">?</span>';
            if (stepInput) { stepInput.value = 100; stepInput.min = 10; stepInput.max = 500; stepInput.step = 10; }
        }
    } else if (testType === 'position') {
        if (impulseContainer) impulseContainer.style.display = '';
        if (impulseDurationContainer) impulseDurationContainer.style.display = 'none';
        if (stepContainer) {
            stepContainer.style.display = '';
            const label = stepContainer.querySelector('label');
            if (label) label.innerHTML = 'Setpoint pozycji [cm]<span class="help-icon">?</span>';
            if (stepInput) { stepInput.value = 30; stepInput.min = 5; stepInput.max = 200; stepInput.step = 5; }
        }
    }
}

// ========================================================================
// TEST IMPULSE (without recording)
// ========================================================================
function testSysIdImpulse() {
    const sendBleMessage = window.sendBleMessage;
    const addLogMessage = window.addLogMessage;

    if (!AppState.isConnected) {
        addLogMessage('[SysID] Błąd: Połącz się z robotem.', 'error');
        return;
    }

    if (!['BALANSUJE', 'TRZYMA_POZYCJE'].includes(AppState.lastKnownRobotState)) {
        addLogMessage(`[SysID] Robot musi balansować. Aktualny stan: '${AppState.lastKnownRobotState}'.`, 'warn');
        return;
    }

    const impulsePercent = (parseFloat(document.getElementById('sysid-impulse')?.value) || 25) / 100;
    const impulseDuration = parseInt(document.getElementById('sysid-impulse-duration')?.value) || 100;
    const testBtn = document.getElementById('sysid-test-impulse-btn');

    if (testBtn) { testBtn.disabled = true; testBtn.textContent = '⏳ Test...'; }

    addLogMessage(`[SysID] Test impulsu: Joystick ${impulsePercent * 100}%, czas fazy ${impulseDuration}ms (podwójny: przód→tył)`, 'info');

    sendBleMessage({ type: 'joystick', x: 0, y: impulsePercent });

    setTimeout(() => {
        sendBleMessage({ type: 'joystick', x: 0, y: -impulsePercent });
    }, impulseDuration);

    setTimeout(() => {
        sendBleMessage({ type: 'joystick', x: 0, y: 0 });
        addLogMessage(`[SysID] Test impulsu zakończony (całkowity czas: ${impulseDuration * 2}ms)`, 'success');
        if (testBtn) { testBtn.disabled = false; testBtn.textContent = '🔧 Testuj'; }
    }, impulseDuration * 2);
}

// ========================================================================
// START RECORDING
// ========================================================================
async function startSysIdRecording() {
    if (SysIdState.isRecording) return;

    const sendBleMessage = window.sendBleMessage;
    const addLogMessage = window.addLogMessage;
    const normalizeTelemetryData = window.normalizeTelemetryData;
    const computeEulerFromQuaternion = window.computeEulerFromQuaternion;

    if (!AppState.isConnected) {
        addLogMessage('[SysID] Błąd: Połącz się z robotem.', 'error');
        return;
    }

    SysIdState.testType = document.getElementById('sysid-test-type')?.value || 'balance';
    const currentState = AppState.lastKnownRobotState;

    if (SysIdState.testType === 'position') {
        if (currentState !== 'TRZYMA_POZYCJE') {
            const ok = confirm(`Test pozycji wymaga trybu TRZYMA_POZYCJE.\nAktualny stan: '${currentState}'.\nCzy włączyć trzymanie pozycji?`);
            if (ok) {
                const bsEl = document.getElementById('balanceSwitch');
                const hpEl = document.getElementById('holdPositionSwitch');
                if (bsEl && !bsEl.checked) { bsEl.checked = true; bsEl.dispatchEvent(new Event('change')); }
                await new Promise(r => setTimeout(r, 500));
                if (hpEl && !hpEl.checked) { hpEl.checked = true; hpEl.dispatchEvent(new Event('change')); }
                await new Promise(r => setTimeout(r, 2000));
            } else { return; }
        }
    } else {
        if (!['BALANSUJE', 'TRZYMA_POZYCJE'].includes(currentState)) {
            const ok = confirm(`Robot musi balansować. Aktualny stan: '${currentState}'.\nCzy włączyć balansowanie?`);
            if (ok) {
                const bsEl = document.getElementById('balanceSwitch');
                if (bsEl) { bsEl.checked = true; bsEl.dispatchEvent(new Event('change')); }
                await new Promise(r => setTimeout(r, 2000));
            } else { return; }
        }
    }

    SysIdState.duration = (parseFloat(document.getElementById('sysid-duration')?.value) || 5) * 1000;
    SysIdState.sampleRate = 50;
    SysIdState.stepApplied = false;
    SysIdState.impulseApplied = false;
    SysIdState.impulseStartTime = 0;
    SysIdState.impulsePhase = 0;
    SysIdState.currentSetpoint = 0;

    if (SysIdState.testType === 'balance') {
        SysIdState.kp = parseFloat(document.getElementById('balanceKpInput')?.value) || 50;
        SysIdState.impulse = (parseFloat(document.getElementById('sysid-impulse')?.value) || 25) / 100;
        SysIdState.impulseDuration = parseInt(document.getElementById('sysid-impulse-duration')?.value) || 100;

        const currentKp = parseFloat(document.getElementById('balanceKpInput')?.value) || SysIdState.kp;
        const currentKi = parseFloat(document.getElementById('balanceKiInput')?.value) || 0;
        const currentKd = parseFloat(document.getElementById('balanceKdInput')?.value) || 0;
        SysIdState.savedPID = { kp: currentKp, ki: currentKi, kd: currentKd };

        addLogMessage(`[SysID Balance] 📊 Pasywne nagrywanie: impuls=${(SysIdState.impulse * 100).toFixed(0)}%, czas fazy=${SysIdState.impulseDuration}ms, czas całkowity=${SysIdState.duration / 1000}s`, 'info');
        addLogMessage(`[SysID Balance] ℹ️ Robot nie wie że jest testowany - używam standardowego joysticka`, 'info');
    } else if (SysIdState.testType === 'speed') {
        SysIdState.stepValue = parseFloat(document.getElementById('sysid-step-value')?.value) || 100;
        SysIdState.impulse = Math.min(1.0, Math.max(0.1, SysIdState.stepValue / 500));
        addLogMessage(`[SysID Speed] 📊 Pasywne nagrywanie: setpoint≈${SysIdState.stepValue} imp/s (joystick ${(SysIdState.impulse * 100).toFixed(0)}%), czas=${SysIdState.duration / 1000}s`, 'info');
        addLogMessage(`[SysID Speed] ℹ️ Robot nie wie że jest testowany - używam standardowego joysticka`, 'info');
    } else if (SysIdState.testType === 'position') {
        SysIdState.stepValue = parseFloat(document.getElementById('sysid-step-value')?.value) || 30;
        SysIdState.impulse = 0.3;
        addLogMessage(`[SysID Position] 📊 Pasywne nagrywanie: setpoint≈${SysIdState.stepValue} cm, czas=${SysIdState.duration / 1000}s`, 'info');
        addLogMessage(`[SysID Position] ℹ️ Robot nie wie że jest testowany - używam standardowego joysticka`, 'info');
    }

    SysIdState.data = [];
    SysIdState.isRecording = true;
    SysIdState.startTime = performance.now();
    SysIdState._sysidTelemetryWarningShown = false;

    updateSysIdUI('recording');

    SysIdState.telemetryHandler = (evt) => {
        if (!SysIdState.isRecording) return;
        const data = evt.detail || evt;
        if (data.type === 'telemetry') {
            const elapsed = performance.now() - SysIdState.startTime;
            const elapsedSec = elapsed / 1000;

            const normData = (typeof normalizeTelemetryData === 'function') ? normalizeTelemetryData(data) : data;

            let pitchValue = normData.pitch;
            if (pitchValue === undefined && typeof normData.qw === 'number') {
                if (typeof computeEulerFromQuaternion === 'function') {
                    const eul = computeEulerFromQuaternion(normData.qw, normData.qx, normData.qy, normData.qz);
                    if (eul) pitchValue = eul.pitch;
                }
                if (pitchValue === undefined) {
                    const n = Math.hypot(normData.qw, normData.qx, normData.qy, normData.qz) || 1;
                    const qw = normData.qw / n, qx = normData.qx / n, qy = normData.qy / n, qz = normData.qz / n;
                    const sinp = 2 * (qw * qy - qz * qx);
                    const pitchRad = Math.abs(sinp) >= 1 ? Math.sign(sinp) * (Math.PI / 2) : Math.asin(sinp);
                    pitchValue = pitchRad * 180 / Math.PI;
                }
            }
            if (pitchValue === undefined || Number.isNaN(pitchValue)) pitchValue = normData.angle ?? 0;

            const record = {
                time: elapsedSec,
                angle: pitchValue,
                speed: normData.speed ?? 0,
                encoder_left: normData.encoder_left ?? 0,
                encoder_right: normData.encoder_right ?? 0,
                gyroY: normData.gyroY ?? normData.gyro_y ?? 0,
                pwm_output: normData.output ?? normData.balance_output ?? 0,
                target_angle: normData.target_angle ?? 0,
                target_speed: normData.target_speed ?? 0,
                firmware_timestamp_ms: normData.timestamp_ms ?? normData.ts ?? null,
                test_type: SysIdState.testType,
                setpoint: SysIdState.currentSetpoint,
                input_signal: 0
            };

            if (SysIdState.testType === 'balance') {
                const BLE_LATENCY_MS = 50;
                const phaseDuration = SysIdState.impulseDuration || 100;
                let currentImpulse = 0;
                if (SysIdState.impulseApplied && SysIdState.impulseStartTime > 0) {
                    const impulseElapsed = elapsed - SysIdState.impulseStartTime - BLE_LATENCY_MS;
                    if (impulseElapsed >= 0 && impulseElapsed < phaseDuration) {
                        currentImpulse = SysIdState.impulse * 100;
                    } else if (impulseElapsed >= phaseDuration && impulseElapsed < phaseDuration * 2) {
                        currentImpulse = -SysIdState.impulse * 100;
                    }
                }
                record.input_signal = currentImpulse;
                record.impulse_pwm = currentImpulse;
                record.impulse_duration_ms = SysIdState.impulseDuration || 100;
            } else if (SysIdState.testType === 'speed') {
                const effectiveSetpoint = SysIdState.currentSetpoint;
                record.input_signal = effectiveSetpoint;
                record.setpoint_speed = effectiveSetpoint;
                record.speed_error = effectiveSetpoint - record.speed;
            } else if (SysIdState.testType === 'position') {
                const avgEncoder = (record.encoder_left + record.encoder_right) / 2;
                const encoderPpr = parseFloat(document.getElementById('encoderPprInput')?.value) || 820;
                const wheelDiameter = parseFloat(document.getElementById('wheelDiameterInput')?.value) || 8.2;
                const wheelCircum = Math.PI * wheelDiameter;
                const positionCm = (avgEncoder / encoderPpr) * wheelCircum;
                record.position_cm = positionCm;
                const uiSetpoint = SysIdState.stepApplied ? SysIdState.stepValue : 0;
                record.input_signal = uiSetpoint;
                record.setpoint_position = uiSetpoint;
                record.position_error = uiSetpoint - positionCm;
            }

            SysIdState.data.push(record);

            const progress = Math.min(100, (elapsed / SysIdState.duration) * 100);
            const progressEl = document.getElementById('sysid-progress');
            if (progressEl) progressEl.value = progress;
            const countEl = document.getElementById('sysid-sample-count');
            if (countEl) countEl.textContent = SysIdState.data.length;

            if (elapsed >= SysIdState.duration) {
                stopSysIdRecording();
            }
        }
    };
    window.addEventListener('ble_message', SysIdState.telemetryHandler);

    // Apply impulse after 1 second
    setTimeout(() => {
        if (!SysIdState.isRecording) return;

        if (SysIdState.testType === 'balance') {
            SysIdState.impulseApplied = true;
            SysIdState.impulseStartTime = performance.now() - SysIdState.startTime;
            const impulsePercent = SysIdState.impulse;
            const phaseDuration = SysIdState.impulseDuration || 100;

            addLogMessage(`[SysID] 🎮 Impuls joystick ${(impulsePercent * 100).toFixed(0)}%, faza ${phaseDuration}ms (przód→tył)`, 'info');
            sendBleMessage({ type: 'joystick', x: 0, y: impulsePercent });
            setTimeout(() => {
                if (SysIdState.isRecording) sendBleMessage({ type: 'joystick', x: 0, y: -impulsePercent });
            }, phaseDuration);
            setTimeout(() => {
                if (SysIdState.isRecording) {
                    sendBleMessage({ type: 'joystick', x: 0, y: 0 });
                    addLogMessage(`[SysID] ✅ Impuls zakończony (całkowity czas: ${phaseDuration * 2}ms)`, 'info');
                }
            }, phaseDuration * 2);
        } else if (SysIdState.testType === 'speed') {
            SysIdState.stepApplied = true;
            SysIdState.currentSetpoint = SysIdState.stepValue;
            const impulsePercent = SysIdState.impulse;
            addLogMessage(`[SysID] 🎮 Joystick do przodu ${(impulsePercent * 100).toFixed(0)}% (setpoint≈${SysIdState.stepValue} imp/s)`, 'info');
            sendBleMessage({ type: 'joystick', x: 0, y: impulsePercent });
            setTimeout(() => {
                if (SysIdState.isRecording) {
                    SysIdState.currentSetpoint = 0;
                    sendBleMessage({ type: 'joystick', x: 0, y: 0 });
                    addLogMessage(`[SysID] ⏹️ Joystick zeruje`, 'info');
                }
            }, SysIdState.duration / 2 - 1000);
        } else if (SysIdState.testType === 'position') {
            SysIdState.stepApplied = true;
            SysIdState.currentSetpoint = SysIdState.stepValue;
            const impulsePercent = SysIdState.impulse;
            addLogMessage(`[SysID] 🎮 Impuls joystick ${(impulsePercent * 100).toFixed(0)}% (setpoint≈${SysIdState.stepValue} cm)`, 'info');
            sendBleMessage({ type: 'joystick', x: 0, y: impulsePercent });
            setTimeout(() => {
                if (SysIdState.isRecording) {
                    sendBleMessage({ type: 'joystick', x: 0, y: 0 });
                    addLogMessage(`[SysID] ✅ Impuls pozycji zakończony`, 'info');
                }
            }, 500);
            setTimeout(() => {
                if (SysIdState.isRecording) SysIdState.currentSetpoint = 0;
            }, SysIdState.duration / 2 - 1000);
        }
    }, 1000);

    const testNames = { balance: 'Balans', speed: 'Prędkość', position: 'Pozycja' };
    addLogMessage(`[SysID] Nagrywanie ${testNames[SysIdState.testType]} (${SysIdState.duration / 1000}s). Skok za 1s.`, 'info');
}

// ========================================================================
// STOP RECORDING
// ========================================================================
function stopSysIdRecording() {
    if (!SysIdState.isRecording) return;

    const sendBleMessage = window.sendBleMessage;
    const addLogMessage = window.addLogMessage;

    SysIdState.isRecording = false;
    SysIdState.impulseApplied = false;
    SysIdState.stepApplied = false;
    SysIdState.impulseStartTime = 0;
    SysIdState.currentSetpoint = 0;

    if (SysIdState.telemetryHandler) {
        window.removeEventListener('ble_message', SysIdState.telemetryHandler);
        SysIdState.telemetryHandler = null;
    }

    sendBleMessage({ type: 'joystick', x: 0, y: 0 });
    updateSysIdUI('stopped');
    drawSysIdChart();

    const testNames = { balance: 'Balans', speed: 'Prędkość', position: 'Pozycja' };
    addLogMessage(`[SysID ${testNames[SysIdState.testType]}] ✅ Zakończone. Zebrano ${SysIdState.data.length} próbek (pasywnie).`, 'success');
}

// ========================================================================
// UI UPDATE
// ========================================================================
function updateSysIdUI(state) {
    const startBtn = document.getElementById('sysid-start-btn');
    const stopBtn = document.getElementById('sysid-stop-btn');
    const exportCsvBtn = document.getElementById('sysid-export-csv-btn');
    const clearBtn = document.getElementById('sysid-clear-btn');
    const analyzeBtn = document.getElementById('sysid-analyze-btn');
    const statusText = document.getElementById('sysid-status-text');

    if (state === 'recording') {
        if (startBtn) startBtn.disabled = true;
        if (stopBtn) stopBtn.disabled = false;
        if (exportCsvBtn) exportCsvBtn.disabled = true;
        if (clearBtn) clearBtn.disabled = true;
        if (analyzeBtn) analyzeBtn.disabled = true;
        if (statusText) { statusText.textContent = 'Nagrywanie...'; statusText.style.color = '#61dafb'; }
    } else if (state === 'stopped') {
        if (startBtn) startBtn.disabled = false;
        if (stopBtn) stopBtn.disabled = true;
        const hasData = SysIdState.data.length > 0;
        if (exportCsvBtn) exportCsvBtn.disabled = !hasData;
        if (clearBtn) clearBtn.disabled = !hasData;
        if (analyzeBtn) analyzeBtn.disabled = !hasData;
        if (statusText) { statusText.textContent = hasData ? 'Gotowy do eksportu' : 'Gotowy'; statusText.style.color = hasData ? '#a2f279' : '#aaa'; }
    }
}

// ========================================================================
// CHART
// ========================================================================
function drawSysIdChart() {
    const canvas = document.getElementById('sysid-preview-chart');
    if (!canvas || !SysIdState.chartCtx) return;

    const ctx = SysIdState.chartCtx;
    const data = SysIdState.data;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (data.length < 2) return;

    const padding = { left: 50, right: 60, top: 20, bottom: 30 };
    const width = canvas.width - padding.left - padding.right;
    const height = canvas.height - padding.top - padding.bottom;

    const times = data.map(d => d.time);
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);

    let primaryData, secondaryData, primaryLabel, secondaryLabel;
    const testType = SysIdState.testType || 'balance';

    if (testType === 'balance') {
        primaryData = data.map(d => d.angle);
        secondaryData = data.map(d => d.impulse_pwm || d.input_signal || 0);
        primaryLabel = '● Kąt'; secondaryLabel = '● Impuls';
    } else if (testType === 'speed') {
        primaryData = data.map(d => d.speed);
        secondaryData = data.map(d => d.setpoint_speed || d.input_signal || 0);
        primaryLabel = '● Prędkość'; secondaryLabel = '● Setpoint';
    } else if (testType === 'position') {
        primaryData = data.map(d => d.position_cm || 0);
        secondaryData = data.map(d => d.setpoint_position || d.input_signal || 0);
        primaryLabel = '● Pozycja'; secondaryLabel = '● Setpoint';
    }

    const minPrimary = Math.min(...primaryData) - 1;
    const maxPrimary = Math.max(...primaryData) + 1;
    const maxSecondary = Math.max(...secondaryData.map(Math.abs), 1);

    const scaleX = (t) => padding.left + ((t - minTime) / (maxTime - minTime + 0.001)) * width;
    const scaleYPrimary = (v) => padding.top + height - ((v - minPrimary) / (maxPrimary - minPrimary + 0.001)) * height;
    const scaleYSecondary = (v) => padding.top + height - (v / maxSecondary) * height * 0.5;

    // Grid
    ctx.strokeStyle = '#333'; ctx.lineWidth = 0.5; ctx.beginPath();
    for (let i = 0; i <= 5; i++) { const y = padding.top + (height / 5) * i; ctx.moveTo(padding.left, y); ctx.lineTo(canvas.width - padding.right, y); }
    ctx.stroke();

    // Zero line
    if (minPrimary < 0 && maxPrimary > 0) {
        ctx.strokeStyle = '#666'; ctx.lineWidth = 1; ctx.beginPath();
        const zeroY = scaleYPrimary(0); ctx.moveTo(padding.left, zeroY); ctx.lineTo(canvas.width - padding.right, zeroY); ctx.stroke();
    }

    // Secondary data (filled area)
    ctx.fillStyle = 'rgba(247, 183, 49, 0.3)'; ctx.strokeStyle = '#f7b731'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(scaleX(data[0].time), padding.top + height);
    data.forEach((d, i) => ctx.lineTo(scaleX(d.time), scaleYSecondary(secondaryData[i])));
    ctx.lineTo(scaleX(data[data.length - 1].time), padding.top + height); ctx.closePath(); ctx.fill(); ctx.stroke();

    // Primary data (solid line)
    ctx.strokeStyle = '#a2f279'; ctx.lineWidth = 2; ctx.beginPath();
    data.forEach((d, i) => { const x = scaleX(d.time); const y = scaleYPrimary(primaryData[i]); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
    ctx.stroke();

    // Labels
    ctx.fillStyle = '#aaa'; ctx.font = '10px monospace'; ctx.textAlign = 'center';
    ctx.fillText(`${minTime.toFixed(1)}s`, padding.left, canvas.height - 5);
    ctx.fillText(`${maxTime.toFixed(1)}s`, canvas.width - padding.right, canvas.height - 5);
    ctx.textAlign = 'right';
    const unitSuffix = testType === 'balance' ? '°' : (testType === 'speed' ? '' : 'cm');
    ctx.fillText(`${maxPrimary.toFixed(1)}${unitSuffix}`, padding.left - 5, padding.top + 10);
    ctx.fillText(`${minPrimary.toFixed(1)}${unitSuffix}`, padding.left - 5, canvas.height - padding.bottom);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#a2f279'; ctx.fillText(primaryLabel, canvas.width - 70, 15);
    ctx.fillStyle = '#f7b731'; ctx.fillText(secondaryLabel, canvas.width - 70, 28);
}

// ========================================================================
// CSV IMPORT
// ========================================================================
function importSysIdCSV() {
    const addLogMessage = window.addLogMessage;
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.csv';

    input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const csvText = event.target.result;
                const { data, metadata } = parseSysIdCSV(csvText);
                if (data.length < 10) { addLogMessage('[SysID Import] Za mało danych w pliku CSV', 'error'); return; }

                SysIdState.data = data;
                SysIdState.testType = metadata.test_type || 'balance';
                SysIdState.kp = metadata.kp_used || 50;
                SysIdState.impulse = (metadata.impulse_joystick_percent || 25) / 100;
                SysIdState.impulseDuration = metadata.impulse_phase_duration_ms || 100;
                SysIdState.sampleRate = metadata.sample_rate_hz || 200;
                SysIdState.duration = (metadata.recording_duration_s || 5) * 1000;

                addLogMessage(`[SysID Import] Załadowano ${data.length} próbek z pliku ${file.name}`, 'success');
                addLogMessage(`[SysID Import] Typ testu: ${SysIdState.testType}, Kp: ${SysIdState.kp}, czas impulsu: ${SysIdState.impulseDuration}ms`, 'info');
                updateSysIdUI('stopped');
                drawSysIdChart();
                setTimeout(() => analyzeSysIdData(), 100);
            } catch (err) {
                addLogMessage(`[SysID Import] Błąd parsowania CSV: ${err.message}`, 'error');
                console.error('CSV parse error:', err);
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

function parseSysIdCSV(csvText) {
    const lines = csvText.split('\n');
    const metadata = { test_type: 'balance', kp_used: 50, impulse_joystick_percent: 25, impulse_phase_duration_ms: 100, sample_rate_hz: 200, recording_duration_s: 5 };
    let headerLine = null; let dataStartIdx = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('#')) {
            const match = line.match(/^#\s*(\w+):\s*(.+)$/);
            if (match) {
                const key = match[1].toLowerCase().replace(/ /g, '_');
                let value = match[2].trim();
                if (!isNaN(parseFloat(value)) && isFinite(value)) value = value.includes('.') ? parseFloat(value) : parseInt(value);
                metadata[key] = value;
            }
        } else if (line && !headerLine) { headerLine = line; dataStartIdx = i + 1; break; }
    }

    if (!headerLine) throw new Error('Nie znaleziono nagłówka CSV');

    const headers = headerLine.split(',').map(h => h.trim());
    const data = [];
    for (let i = dataStartIdx; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const values = line.split(',').map(v => parseFloat(v.trim()));
        if (values.length !== headers.length) continue;
        const row = {};
        headers.forEach((h, idx) => { row[h] = values[idx]; });

        data.push({
            time: row.time_s ?? row.time ?? 0,
            angle: row.angle_deg ?? row.angle ?? 0,
            impulse_pwm: row.impulse_percent ?? row.impulse_pwm ?? 0,
            pwm_output: row.pwm_output ?? 0,
            speed: row.speed_enc ?? row.speed_actual ?? row.speed ?? 0,
            encoder_left: row.encoder_left ?? 0,
            encoder_right: row.encoder_right ?? 0,
            gyroY: row.gyro_y ?? 0,
            setpoint_speed: row.setpoint_speed ?? 0,
            setpoint_position: row.setpoint_position ?? 0,
            position_cm: row.position_actual ?? 0,
            speed_error: row.speed_error ?? 0,
            position_error: row.position_error ?? 0,
            input_signal: row.impulse_percent ?? row.setpoint_speed ?? row.setpoint_position ?? 0
        });
    }
    return { data, metadata };
}

// ========================================================================
// CSV EXPORT
// ========================================================================
function exportSysIdCSV() {
    const addLogMessage = window.addLogMessage;
    if (SysIdState.data.length === 0) { addLogMessage('[SysID] Brak danych do eksportu.', 'warn'); return; }

    const encoderPpr = document.getElementById('encoderPprInput')?.value || 820;
    const wheelDiameter = document.getElementById('wheelDiameterInput')?.value || 8.2;
    const trackWidth = document.getElementById('trackWidthInput')?.value || 15;
    const testType = SysIdState.testType || 'balance';
    const fusionMode = (typeof window.FusionPIDProfiles !== 'undefined') ? window.FusionPIDProfiles.currentFusionMode : 'unknown';
    const fusionHz = fusionMode === 'mahony' ? '~500' : '~100';

    const metadataLines = [
        `# RoboBala System Identification Data`,
        `# generated: ${new Date().toISOString()}`,
        `# test_type: ${testType}`,
        `# fusion_mode: ${fusionMode}`,
        `# fusion_rate_hz: ${fusionHz}`,
        `# sample_rate_hz: ${SysIdState.sampleRate}`,
        `# recording_duration_s: ${SysIdState.duration / 1000}`,
        `# encoder_ppr: ${encoderPpr}`,
        `# wheel_diameter_cm: ${wheelDiameter}`,
        `# track_width_cm: ${trackWidth}`,
        `# samples_count: ${SysIdState.data.length}`
    ];
    if (testType === 'balance') {
        metadataLines.push(`# kp_used: ${SysIdState.kp}`, `# passive_mode: true`, `# note: Robot nie wie że był testowany - użyto standardowych komend joysticka`, `# impulse_joystick_percent: ${SysIdState.impulse * 100}`, `# impulse_type: double_pulse_fwd_bwd`, `# impulse_phase_duration_ms: ${SysIdState.impulseDuration || 100}`, `# impulse_total_duration_ms: ${(SysIdState.impulseDuration || 100) * 2}`);
    } else if (testType === 'speed') {
        metadataLines.push(`# passive_mode: true`, `# step_value_speed: ${SysIdState.stepValue}`, `# joystick_percent: ${SysIdState.impulse * 100}`);
    } else if (testType === 'position') {
        metadataLines.push(`# passive_mode: true`, `# step_value_position: ${SysIdState.stepValue}`, `# joystick_percent: ${SysIdState.impulse * 100}`);
    }
    metadataLines.push('');
    const metadata = metadataLines.join('\n');

    let header, rows;
    if (testType === 'balance') {
        header = 'time_s,angle_deg,impulse_percent,pwm_output,speed_enc,encoder_left,encoder_right,gyro_y\n';
        rows = SysIdState.data.map(d => `${d.time.toFixed(4)},${d.angle.toFixed(4)},${(d.impulse_pwm || 0).toFixed(2)},${d.pwm_output.toFixed(2)},${d.speed.toFixed(2)},${d.encoder_left},${d.encoder_right},${d.gyroY.toFixed(4)}`).join('\n');
    } else if (testType === 'speed') {
        header = 'time_s,setpoint_speed,speed_actual,speed_error,angle_deg,pwm_output,encoder_left,encoder_right\n';
        rows = SysIdState.data.map(d => `${d.time.toFixed(4)},${(d.setpoint_speed || d.input_signal || 0).toFixed(2)},${d.speed.toFixed(2)},${(d.speed_error || 0).toFixed(2)},${d.angle.toFixed(4)},${d.pwm_output.toFixed(2)},${d.encoder_left},${d.encoder_right}`).join('\n');
    } else if (testType === 'position') {
        header = 'time_s,setpoint_position,position_actual,position_error,speed_enc,angle_deg,encoder_left,encoder_right\n';
        rows = SysIdState.data.map(d => `${d.time.toFixed(4)},${(d.setpoint_position || d.input_signal || 0).toFixed(2)},${(d.position_cm || 0).toFixed(2)},${(d.position_error || 0).toFixed(2)},${d.speed.toFixed(2)},${d.angle.toFixed(4)},${d.encoder_left},${d.encoder_right}`).join('\n');
    }

    const csv = metadata + header + rows;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `sysid_data_${new Date().toISOString().slice(0, 19).replace(/[:-]/g, '')}.csv`;
    a.click(); URL.revokeObjectURL(url);
    addLogMessage(`[SysID] Eksportowano ${SysIdState.data.length} próbek do CSV (z parametrami mechanicznymi).`, 'success');
}

// ========================================================================
// ANALYSIS
// ========================================================================
export function analyzeSysIdData() {
    const addLogMessage = window.addLogMessage;
    if (SysIdState.data.length < 20) { addLogMessage('[SysID Analiza] Za mało danych do analizy (min. 20 próbek).', 'error'); return; }

    addLogMessage(`[SysID Analiza] Rozpoczynam analizę ${SysIdState.data.length} próbek...`, 'info');

    const testType = SysIdState.testType || 'balance';
    let params = null; let pidSuggestions = {};

    const impulseData = SysIdState.data.map(d => d.impulse_pwm || d.input_signal || 0);
    const hasImpulse = impulseData.some(v => Math.abs(v) > 5);
    if (!hasImpulse && testType === 'balance') {
        addLogMessage('[SysID Analiza] Brak wykrytego impulsu w danych! Sprawdź czy impuls był wykonany.', 'warn');
    }

    try {
        if (testType === 'balance') {
            params = identifyBalanceLoop(SysIdState.data, SysIdState.kp);
            if (params) pidSuggestions = calculatePIDFromModel(params, SysIdState.kp, 'balance');
            else addLogMessage('[SysID Analiza] Nie wykryto impulsu - sprawdź czy dane zawierają sygnał zakłócenia.', 'warn');
        } else if (testType === 'speed') {
            params = identifySpeedLoop(SysIdState.data);
            if (params) pidSuggestions = calculatePIDFromModel(params, 0, 'speed');
        } else if (testType === 'position') {
            params = identifyPositionLoop(SysIdState.data);
            if (params) pidSuggestions = calculatePIDFromModel(params, 0, 'position');
        }

        displayAnalysisResults(params, pidSuggestions, testType);

        if (params) addLogMessage(`[SysID Analiza] Zakończono. Przeregulowanie: ${(params.overshoot * 100).toFixed(1)}%`, 'success');
        else addLogMessage('[SysID Analiza] Nie udało się zidentyfikować parametrów modelu. Spróbuj z silniejszym impulsem.', 'warn');
    } catch (err) {
        addLogMessage(`[SysID Analiza] Błąd: ${err.message}`, 'error');
        console.error('SysID Analysis error:', err);
    }
}

// ========================================================================
// ANALYSIS HELPERS
// ========================================================================
function findImpulseTime(time, inputSignal, threshold = 5) {
    for (let i = 0; i < inputSignal.length; i++) {
        if (Math.abs(inputSignal[i]) > threshold) return { time: time[i], index: i };
    }
    return null;
}

function detectImpulseType(inputSignal) {
    const hasPositive = inputSignal.some(v => v > 5);
    const hasNegative = inputSignal.some(v => v < -5);
    if (hasPositive && hasNegative) {
        const firstPos = inputSignal.findIndex(v => v > 5);
        const firstNeg = inputSignal.findIndex(v => v < -5);
        return firstPos < firstNeg ? 'double_fwd_bwd' : 'double_bwd_fwd';
    } else if (hasPositive) return 'single_fwd';
    else if (hasNegative) return 'single_bwd';
    return 'unknown';
}

function findPeaks(arr, minProminence = 0) {
    const peaks = [];
    for (let i = 1; i < arr.length - 1; i++) {
        if (arr[i] > arr[i - 1] && arr[i] > arr[i + 1]) {
            if (minProminence > 0) {
                const leftMin = Math.min(...arr.slice(Math.max(0, i - 10), i));
                const rightMin = Math.min(...arr.slice(i + 1, Math.min(arr.length, i + 11)));
                const prominence = arr[i] - Math.max(leftMin, rightMin);
                if (prominence < minProminence) continue;
            }
            peaks.push(i);
        }
    }
    return peaks;
}

function identifyBalanceLoop(data, kpUsed) {
    const time = data.map(d => d.time);
    const inputSignal = data.map(d => d.impulse_pwm || d.input_signal || 0);
    const outputSignal = data.map(d => d.angle);
    const warnings = [];

    const impulseType = detectImpulseType(inputSignal);
    const impulseInfo = findImpulseTime(time, inputSignal);
    if (!impulseInfo) return null;

    const impulseTime = impulseInfo.time;
    const impulseIdx = impulseInfo.index;
    const preImpulseData = outputSignal.slice(0, impulseIdx);
    const baseline = preImpulseData.length > 0 ? preImpulseData.reduce((a, b) => a + b, 0) / preImpulseData.length : 0;
    const adjustedOutput = outputSignal.map(v => v - baseline);
    const impulseAmplitude = Math.max(...inputSignal.map(Math.abs));

    let impulseEndTime = time[time.length - 1];
    if (impulseType.startsWith('double')) {
        const impulseIndices = [];
        for (let i = 0; i < inputSignal.length; i++) { if (Math.abs(inputSignal[i]) > 5) impulseIndices.push(i); }
        if (impulseIndices.length > 1) {
            for (let i = 1; i < impulseIndices.length; i++) {
                if (inputSignal[impulseIndices[i]] * inputSignal[impulseIndices[i - 1]] < 0) {
                    impulseEndTime = time[impulseIndices[i]] + 0.5; break;
                }
            }
        }
    }

    const postImpulseIndices = [];
    for (let i = 0; i < time.length; i++) { if (time[i] >= impulseTime && time[i] <= impulseEndTime) postImpulseIndices.push(i); }
    const tResponse = postImpulseIndices.map(i => time[i] - impulseTime);
    const yResponse = postImpulseIndices.map(i => adjustedOutput[i]);
    if (yResponse.length < 10) return null;

    const yAbsMax = Math.max(...yResponse.map(Math.abs));
    const quarterLen = Math.max(1, Math.floor(yResponse.length / 4));
    const yFinal = yResponse.slice(-quarterLen).reduce((a, b) => a + b, 0) / quarterLen;
    const K = impulseAmplitude > 0 ? yAbsMax / impulseAmplitude : 0;

    const peaksPos = findPeaks(yResponse);
    const peaksNeg = findPeaks(yResponse.map(v => -v));
    let overshoot = 0;
    if (peaksPos.length >= 2) {
        const firstPeak = Math.abs(yResponse[peaksPos[0]]);
        const secondPeak = Math.abs(yResponse[peaksPos[1]]);
        overshoot = firstPeak > 0.01 ? secondPeak / firstPeak : 0;
    } else if (peaksPos.length >= 1 && peaksNeg.length >= 1) {
        const peak1 = Math.abs(yResponse[peaksPos[0]]);
        const peak2 = Math.abs(yResponse[peaksNeg[0]]);
        const maxPeak = Math.max(peak1, peak2);
        const minPeak = Math.min(peak1, peak2);
        overshoot = maxPeak > 0.01 ? minPeak / maxPeak : 0;
    }

    const settlingThreshold = 0.05 * yAbsMax;
    let settlingTime = tResponse[tResponse.length - 1] || 0.5;
    const settled = yResponse.map(v => Math.abs(v - yFinal) < settlingThreshold);
    for (let i = 0; i < settled.length; i++) {
        if (settled[i]) {
            let staysSettled = true;
            for (let j = i; j < Math.min(i + 10, settled.length); j++) { if (!settled[j]) { staysSettled = false; break; } }
            if (staysSettled) { settlingTime = tResponse[i]; break; }
        }
    }

    let zeta, wn;
    if (overshoot > 0.01 && overshoot < 1.0) {
        const logDecrement = -Math.log(overshoot);
        zeta = logDecrement / Math.sqrt(4 * Math.PI * Math.PI + logDecrement * logDecrement);
    } else if (overshoot >= 1.0) { zeta = 0.1; }
    else { zeta = 1.0; }

    if (settlingTime > 0.01) { wn = zeta < 1.0 ? 4 / (zeta * settlingTime) : 3 / settlingTime; }
    else { wn = 10.0; }

    if (zeta <= 0 || zeta > 2) { zeta = Math.max(0.1, Math.min(1.5, Math.abs(zeta))); }
    if (wn <= 0 || wn > 500) { wn = Math.max(2.0, Math.min(100.0, Math.abs(wn))); }

    return { K, zeta, wn, overshoot, settlingTime, impulseAmplitude, impulseType, warnings, loopType: 'balance' };
}

function identifySpeedLoop(data) {
    const time = data.map(d => d.time);
    const setpoint = data.map(d => d.setpoint_speed || d.input_signal || 0);
    const speed = data.map(d => d.speed);
    const warnings = [];

    const stepIdx = setpoint.findIndex(v => v > 1);
    if (stepIdx < 0) return null;
    const stepTime = time[stepIdx];
    const stepValue = Math.max(...setpoint);

    const postStepIndices = [];
    for (let i = 0; i < time.length; i++) { if (time[i] >= stepTime) postStepIndices.push(i); }
    if (postStepIndices.length < 20) return null;

    const tResponse = postStepIndices.map(i => time[i] - stepTime);
    const yResponse = postStepIndices.map(i => speed[i]);

    const halfIdx = Math.floor(yResponse.length * 0.5);
    const stableStart = Math.floor(halfIdx * 0.6);
    const stableRegion = yResponse.slice(stableStart, halfIdx);
    let yFinal;
    if (stableRegion.length > 5) yFinal = stableRegion.reduce((a, b) => a + b, 0) / stableRegion.length;
    else {
        const fallbackRegion = yResponse.slice(Math.floor(yResponse.length * 0.2), Math.floor(yResponse.length * 0.4));
        yFinal = fallbackRegion.length > 0 ? fallbackRegion.reduce((a, b) => a + b, 0) / fallbackRegion.length : yResponse[Math.floor(yResponse.length * 0.3)] || 0;
    }

    const K = stepValue > 0 ? yFinal / stepValue : 1.0;
    const y10 = 0.1 * yFinal; const y90 = 0.9 * yFinal;
    const t10Idx = yResponse.findIndex(v => v >= y10);
    const t90Idx = yResponse.findIndex(v => v >= y90);
    const riseTime = (t10Idx >= 0 && t90Idx >= 0 && t90Idx > t10Idx) ? tResponse[t90Idx] - tResponse[t10Idx] : 0.5;
    const tau = riseTime / 2.2;

    const halfLen = Math.floor(yResponse.length * 0.5);
    const yMax = Math.max(...yResponse.slice(0, halfLen));
    const overshoot = yFinal > 0.1 ? Math.max(0, (yMax - yFinal) / yFinal) : 0;

    let zeta, wn;
    if (overshoot > 0.05) {
        zeta = overshoot < 1.0 ? (-Math.log(overshoot)) / Math.sqrt(4 * Math.PI * Math.PI + Math.pow(-Math.log(overshoot), 2)) : 0.3;
        wn = riseTime > 0.01 ? 1.8 / riseTime : 20;
    } else { zeta = 1.0; wn = tau > 0.01 ? 1 / tau : 10; }

    return { K, tau, zeta, wn, overshoot, riseTime, stepValue, steadyState: yFinal, loopType: 'speed', warnings };
}

function identifyPositionLoop(data) {
    const time = data.map(d => d.time);
    const setpoint = data.map(d => d.setpoint_position || d.input_signal || 0);
    const position = data.map(d => d.position_cm || 0);
    const warnings = [];

    const stepIdx = setpoint.findIndex(v => v > 1);
    if (stepIdx < 0) return null;
    const stepTime = time[stepIdx];
    const stepValue = Math.max(...setpoint);

    const preStepStart = Math.max(0, stepIdx - 10);
    const positionStart = stepIdx > 10 ? position.slice(preStepStart, stepIdx).reduce((a, b) => a + b, 0) / (stepIdx - preStepStart) : position[0];

    const postStepIndices = [];
    for (let i = 0; i < time.length; i++) { if (time[i] >= stepTime) postStepIndices.push(i); }
    if (postStepIndices.length < 20) return null;

    const tResponse = postStepIndices.map(i => time[i] - stepTime);
    const yResponse = postStepIndices.map(i => position[i] - positionStart);

    const halfIdx = Math.floor(yResponse.length * 0.5);
    const stableStart = Math.floor(halfIdx * 0.6);
    const stableRegion = yResponse.slice(stableStart, halfIdx);
    let yFinal;
    if (stableRegion.length > 5) yFinal = stableRegion.reduce((a, b) => a + b, 0) / stableRegion.length;
    else {
        const fallbackRegion = yResponse.slice(Math.floor(yResponse.length * 0.2), Math.floor(yResponse.length * 0.4));
        yFinal = fallbackRegion.length > 0 ? fallbackRegion.reduce((a, b) => a + b, 0) / fallbackRegion.length : yResponse[Math.floor(yResponse.length * 0.3)] || 0;
    }

    const ssError = stepValue - yFinal;
    const K = stepValue > 0 ? yFinal / stepValue : 1.0;
    const y10 = 0.1 * yFinal; const y90 = 0.9 * yFinal;
    const t10Idx = yResponse.findIndex(v => v >= y10);
    const t90Idx = yResponse.findIndex(v => v >= y90);
    const riseTime = (t10Idx >= 0 && t90Idx >= 0 && t90Idx > t10Idx) ? tResponse[t90Idx] - tResponse[t10Idx] : 1.0;

    const halfLen = Math.floor(yResponse.length * 0.5);
    const yMax = Math.max(...yResponse.slice(0, halfLen));
    const overshoot = yFinal > 0.5 ? Math.max(0, (yMax - yFinal) / yFinal) : 0;

    const settlingThreshold = Math.abs(0.05 * yFinal);
    let settlingTime = tResponse[tResponse.length - 1];
    for (let i = 0; i < yResponse.length; i++) {
        if (Math.abs(yResponse[i] - yFinal) < settlingThreshold) {
            let stays = true;
            for (let j = i; j < Math.min(i + 5, yResponse.length); j++) { if (Math.abs(yResponse[j] - yFinal) >= settlingThreshold) { stays = false; break; } }
            if (stays) { settlingTime = tResponse[i]; break; }
        }
    }

    let zeta, wn;
    if (overshoot > 0.05) {
        zeta = overshoot < 1.0 ? (-Math.log(overshoot)) / Math.sqrt(4 * Math.PI * Math.PI + Math.pow(-Math.log(overshoot), 2)) : 0.3;
        wn = riseTime > 0.01 ? 1.8 / riseTime : 5;
    } else { zeta = 1.0; wn = settlingTime > 0.1 ? 3 / settlingTime : 3; }

    return { K, zeta, wn, overshoot, riseTime, settlingTime, stepValue, steadyState: yFinal, ssError, loopType: 'position', warnings };
}

// ========================================================================
// PID CALCULATION FROM MODEL
// ========================================================================
function calculatePIDFromModel(params, kpUsed, loopType) {
    const overshoot = params.overshoot || 0;
    const settlingTime = params.settlingTime || 0.5;
    const riseTime = params.riseTime || 0.3;
    const K = params.K || 1.0;
    const zeta = params.zeta || 0.7;
    const wn = params.wn || 10;
    const tau = params.tau || 0.5;
    const suggestions = {};

    if (loopType === 'balance') {
        const KP_MIN = 20, KP_MAX = 200, KD_MIN = 0.5, KD_MAX = 15;
        let kpNew, kdNew, comment;

        if (overshoot > 2.0) { kpNew = kpUsed * 0.5; kdNew = kpUsed * 0.06; comment = "Silne oscylacje - znacznie zmniejsz Kp, dodaj Kd"; }
        else if (overshoot > 1.0) { kpNew = kpUsed * 0.7; kdNew = kpUsed * 0.05; comment = "Oscylacje - zmniejsz Kp, dodaj Kd"; }
        else if (overshoot > 0.5) { kpNew = kpUsed * 0.85; kdNew = kpUsed * 0.04; comment = "Lekkie oscylacje - delikatna korekta"; }
        else if (overshoot > 0.2) { kpNew = kpUsed * 0.95; kdNew = kpUsed * 0.03; comment = "OK - minimalna korekta"; }
        else { kpNew = kpUsed * 1.1; kdNew = kpUsed * 0.02; comment = "Mało oscylacji - można zwiększyć Kp"; }

        kpNew = Math.max(KP_MIN, Math.min(KP_MAX, kpNew));
        kdNew = Math.max(KD_MIN, Math.min(KD_MAX, kdNew));

        suggestions['Zalecane'] = { Kp: parseFloat(kpNew.toFixed(1)), Ki: 0, Kd: parseFloat(kdNew.toFixed(2)), comment };

        if (K > 0.001) {
            const zetaTarget = 0.7, wnTarget = wn * 1.2;
            suggestions['Model_based'] = {
                Kp: parseFloat(Math.max(KP_MIN, Math.min(KP_MAX, (wnTarget * wnTarget) / K)).toFixed(1)),
                Ki: 0,
                Kd: parseFloat(Math.max(KD_MIN, Math.min(KD_MAX, (2 * zetaTarget * wnTarget) / K)).toFixed(2)),
                comment: `Pole placement (ζ=${zetaTarget}, ωₙ=${wnTarget.toFixed(1)})`
            };
        }
        suggestions['Konserwatywne'] = { Kp: parseFloat(Math.max(KP_MIN, kpUsed * 0.6).toFixed(1)), Ki: 0, Kd: parseFloat(Math.max(KD_MIN, Math.min(5, kpUsed * 0.03)).toFixed(2)), comment: "Bezpieczny start" };
        if (overshoot < 1.0) {
            suggestions['Agresywne'] = { Kp: parseFloat(Math.min(KP_MAX, kpUsed * 1.2).toFixed(1)), Ki: 0, Kd: parseFloat(Math.max(KD_MIN, Math.min(KD_MAX, kpUsed * 0.04)).toFixed(2)), comment: "Szybsza reakcja" };
        }
    } else if (loopType === 'speed') {
        const KP_MIN = 0.001, KP_MAX = 2.0, KI_MIN = 0.0001, KI_MAX = 0.5, KD_MIN = 0.0, KD_MAX = 0.1;
        let kpNew, kiNew, kdNew, comment;
        const lambda = tau * 2;

        if (K > 0.001 && tau > 0.01) {
            kpNew = tau / (K * lambda); kiNew = 1 / (K * lambda); kdNew = 0;
            comment = `Lambda tuning (λ=${lambda.toFixed(2)}s)`;
        } else {
            const kpBase = K > 0.01 ? Math.min(KP_MAX, 0.5 / K) : 0.5;
            if (overshoot > 0.5) { kpNew = kpBase * 0.6; kiNew = tau > 0.01 ? kpBase * 0.1 / tau : 0.05; kdNew = kpBase * 0.05; comment = "Oscylacje"; }
            else if (overshoot > 0.2) { kpNew = kpBase * 0.8; kiNew = tau > 0.01 ? kpBase * 0.15 / tau : 0.08; kdNew = kpBase * 0.03; comment = "Lekkie oscylacje"; }
            else { kpNew = kpBase; kiNew = tau > 0.01 ? kpBase * 0.2 / tau : 0.1; kdNew = 0; comment = "Dobra odpowiedź"; }
        }
        kpNew = Math.max(KP_MIN, Math.min(KP_MAX, kpNew));
        kiNew = Math.max(KI_MIN, Math.min(KI_MAX, kiNew));
        kdNew = Math.max(KD_MIN, Math.min(KD_MAX, kdNew));
        suggestions['Zalecane'] = { Kp: parseFloat(kpNew.toFixed(4)), Ki: parseFloat(kiNew.toFixed(5)), Kd: parseFloat(kdNew.toFixed(4)), comment };

        if (K > 0.001 && tau > 0.01) {
            const tauC = tau * 1.5;
            const kpItae = (0.586 / K) * Math.pow(tau / tauC, -0.916);
            const kiItae = kpItae / (1.03 * tau);
            suggestions['ITAE_optimal'] = { Kp: parseFloat(Math.max(KP_MIN, Math.min(KP_MAX, kpItae)).toFixed(4)), Ki: parseFloat(Math.max(KI_MIN, Math.min(KI_MAX, kiItae)).toFixed(5)), Kd: 0, comment: `ITAE optimal (τc=${tauC.toFixed(2)}s)` };
        }
        suggestions['PI_wolny'] = { Kp: parseFloat((kpNew * 0.5).toFixed(4)), Ki: parseFloat((kiNew * 0.5).toFixed(5)), Kd: 0, comment: "Wolniejszy ale stabilny" };
        suggestions['PI_szybki'] = { Kp: parseFloat(Math.min(KP_MAX, kpNew * 1.5).toFixed(4)), Ki: parseFloat(Math.min(KI_MAX, kiNew * 1.5).toFixed(5)), Kd: 0, comment: "Szybszy - możliwe oscylacje" };
    } else if (loopType === 'position') {
        const KP_MIN = 0.01, KP_MAX = 10.0, KI_MIN = 0.0, KI_MAX = 0.5;
        const ssError = params.ssError || 0;
        let kpNew, kiNew, comment;
        const tsDesired = settlingTime * 0.8;
        let kpBase = (K > 0.01 && tsDesired > 0.1) ? 1 / (K * tsDesired) : (K > 0.01 ? Math.min(KP_MAX, 2.0 / K) : 2.0);
        kiNew = Math.abs(ssError) > 0.5 ? 0.1 : 0;
        comment = Math.abs(ssError) > 0.5 ? `Błąd pozycji ${ssError.toFixed(1)}cm - dodano Ki` : "Dobra dokładność - tylko P";
        if (overshoot > 0.3) { kpNew = kpBase * 0.6; comment = "Przeregulowanie - zmniejsz Kp"; }
        else if (riseTime > 2.0) { kpNew = kpBase * 1.3; comment = "Wolna odpowiedź - zwiększ Kp"; }
        else { kpNew = kpBase; }
        kpNew = Math.max(KP_MIN, Math.min(KP_MAX, kpNew));
        kiNew = Math.max(KI_MIN, Math.min(KI_MAX, kiNew));
        suggestions['Zalecane'] = { Kp: parseFloat(kpNew.toFixed(3)), Ki: parseFloat(kiNew.toFixed(4)), Kd: 0, comment };
        suggestions['P_tylko'] = { Kp: parseFloat((kpNew * 0.8).toFixed(3)), Ki: 0, Kd: 0, comment: "Tylko P" };
        suggestions['PI_precyzyjny'] = { Kp: parseFloat(kpNew.toFixed(3)), Ki: parseFloat(Math.max(0.05, kiNew).toFixed(4)), Kd: 0, comment: "PI - lepsza dokładność" };
    }
    return suggestions;
}

// ========================================================================
// DISPLAY RESULTS
// ========================================================================
function displayAnalysisResults(params, pidSuggestions, testType) {
    const resultsDiv = document.getElementById('sysid-analysis-results');
    const warningsDiv = document.getElementById('sysid-warnings');
    const suggestionsDiv = document.getElementById('sysid-pid-suggestions');
    if (!resultsDiv) return;
    if (!params) { resultsDiv.style.display = 'none'; return; }

    resultsDiv.style.display = 'block';
    const loopNames = { balance: 'Pętla Balansu', speed: 'Pętla Prędkości', position: 'Pętla Pozycji' };
    const loopColors = { balance: '#61dafb', speed: '#f7b731', position: '#a2f279' };
    const loopModels = { balance: 'G(s) = K / (s² + 2ζωₙs + ωₙ²)', speed: 'G(s) = K / (τs + 1)', position: 'G(s) = K / s(τs + 1)' };

    const fusionMode = (typeof window.FusionPIDProfiles !== 'undefined') ? window.FusionPIDProfiles.currentFusionMode : 'unknown';
    const fusionInfo = fusionMode === 'mahony' ? '<span style="color: #2ecc71;">⚡ Mahony (~500Hz)</span>' : '<span style="color: #9b59b6;">🔄 NDOF (~100Hz)</span>';

    const fusionWarning = document.getElementById('sysid-fusion-warning');
    if (fusionWarning) {
        let modelInfo = `<div style="background: #1a2a3a; border-radius: 6px; padding: 12px; margin-bottom: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <span style="color: ${loopColors[testType]}; font-weight: bold; font-size: 1.1em;">📊 ${loopNames[testType]}</span>
                ${testType === 'balance' ? fusionInfo : ''}
            </div>
            <div style="color: #888; font-size: 0.85em; font-family: monospace; margin-bottom: 10px;">Model: ${loopModels[testType]}</div>`;

        if (testType === 'balance') {
            modelInfo += `<div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; font-size: 0.9em;">
                <div><span style="color: #888;">Wzmocnienie K:</span> <span style="color: #fff;">${params.K.toFixed(6)} °/%</span></div>
                <div><span style="color: #888;">Tłumienie ζ:</span> <span style="color: #fff;">${params.zeta.toFixed(4)}</span></div>
                <div><span style="color: #888;">Częst. własna ωₙ:</span> <span style="color: #fff;">${params.wn.toFixed(2)} rad/s</span></div>
                <div><span style="color: #888;">Przeregulowanie:</span> <span style="color: ${params.overshoot > 0.5 ? '#e74c3c' : '#2ecc71'};">${(params.overshoot * 100).toFixed(1)}%</span></div>
                <div><span style="color: #888;">Czas ustalania:</span> <span style="color: #fff;">${params.settlingTime.toFixed(3)} s</span></div>
                <div><span style="color: #888;">Typ impulsu:</span> <span style="color: #fff;">${params.impulseType || 'unknown'}</span></div>
            </div>`;
        } else if (testType === 'speed') {
            modelInfo += `<div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; font-size: 0.9em;">
                <div><span style="color: #888;">Wzmocnienie K:</span> <span style="color: #fff;">${params.K.toFixed(4)}</span></div>
                <div><span style="color: #888;">Stała czasowa τ:</span> <span style="color: #fff;">${(params.tau || 0).toFixed(3)} s</span></div>
                <div><span style="color: #888;">Tłumienie ζ:</span> <span style="color: #fff;">${params.zeta.toFixed(4)}</span></div>
                <div><span style="color: #888;">Częst. własna ωₙ:</span> <span style="color: #fff;">${params.wn.toFixed(2)} rad/s</span></div>
                <div><span style="color: #888;">Przeregulowanie:</span> <span style="color: ${params.overshoot > 0.3 ? '#e74c3c' : '#2ecc71'};">${(params.overshoot * 100).toFixed(1)}%</span></div>
                <div><span style="color: #888;">Czas narastania:</span> <span style="color: #fff;">${(params.riseTime || 0).toFixed(3)} s</span></div>
                <div><span style="color: #888;">Wartość setpoint:</span> <span style="color: #fff;">${(params.stepValue || 0).toFixed(1)} imp/s</span></div>
                <div><span style="color: #888;">Stan ustalony:</span> <span style="color: #fff;">${(params.steadyState || 0).toFixed(1)} imp/s</span></div>
            </div>`;
        } else if (testType === 'position') {
            modelInfo += `<div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; font-size: 0.9em;">
                <div><span style="color: #888;">Wzmocnienie K:</span> <span style="color: #fff;">${params.K.toFixed(4)}</span></div>
                <div><span style="color: #888;">Tłumienie ζ:</span> <span style="color: #fff;">${params.zeta.toFixed(4)}</span></div>
                <div><span style="color: #888;">Częst. własna ωₙ:</span> <span style="color: #fff;">${params.wn.toFixed(2)} rad/s</span></div>
                <div><span style="color: #888;">Przeregulowanie:</span> <span style="color: ${params.overshoot > 0.2 ? '#e74c3c' : '#2ecc71'};">${(params.overshoot * 100).toFixed(1)}%</span></div>
                <div><span style="color: #888;">Czas narastania:</span> <span style="color: #fff;">${(params.riseTime || 0).toFixed(3)} s</span></div>
                <div><span style="color: #888;">Czas ustalania:</span> <span style="color: #fff;">${(params.settlingTime || 0).toFixed(3)} s</span></div>
                <div><span style="color: #888;">Setpoint pozycji:</span> <span style="color: #fff;">${(params.stepValue || 0).toFixed(1)} cm</span></div>
                <div><span style="color: #888;">Błąd SS:</span> <span style="color: ${Math.abs(params.ssError || 0) > 1 ? '#e74c3c' : '#2ecc71'};">${(params.ssError || 0).toFixed(2)} cm</span></div>
            </div>`;
        }
        modelInfo += `</div>`;
        if (testType === 'balance') {
            modelInfo += `<div style="color: #f7b731; font-size: 0.8em; margin-bottom: 8px; padding: 8px; background: #332200; border-radius: 4px;">
                ⚠️ Te wartości PID są optymalne dla trybu ${fusionMode === 'mahony' ? 'Mahony' : 'NDOF'}. Przełączenie trybu fuzji wymaga nowej identyfikacji!</div>`;
        }
        fusionWarning.innerHTML = modelInfo;
        fusionWarning.style.display = 'block';
    }

    if (params.warnings && params.warnings.length > 0) {
        warningsDiv.style.display = 'block';
        warningsDiv.innerHTML = params.warnings.map(w => `<div>⚠️ ${w}</div>`).join('');
    } else { warningsDiv.style.display = 'none'; }

    ['sysid-result-k', 'sysid-result-zeta', 'sysid-result-wn', 'sysid-result-overshoot', 'sysid-result-settling'].forEach(id => {
        const el = document.getElementById(id);
        if (el && el.parentElement) el.parentElement.style.display = 'none';
    });

    suggestionsDiv.innerHTML = '';
    const sortedSuggestions = Object.entries(pidSuggestions).sort(([a], [b]) => { if (a === 'Zalecane') return -1; if (b === 'Zalecane') return 1; return 0; });
    for (const [method, pid] of sortedSuggestions) {
        const card = document.createElement('div');
        const isRecommended = method === 'Zalecane';
        card.style.cssText = `background: #20232a; border: ${isRecommended ? '2px' : '1px'} solid ${loopColors[testType] || '#61dafb'}; border-radius: 6px; padding: 12px; ${isRecommended ? 'box-shadow: 0 0 10px rgba(97, 218, 251, 0.3);' : ''}`;
        const methodLabel = isRecommended ? '⭐ Zalecane' : method.replace(/_/g, ' ');
        card.innerHTML = `
            <div style="font-weight: bold; color: ${loopColors[testType] || '#61dafb'}; margin-bottom: 8px;">${methodLabel}</div>
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 8px;">
                <div style="text-align: center;"><div style="color: #888; font-size: 0.8em;">Kp</div><div style="font-weight: bold; font-size: 1.1em;">${pid.Kp}</div></div>
                <div style="text-align: center;"><div style="color: #888; font-size: 0.8em;">Ki</div><div style="font-weight: bold; font-size: 1.1em;">${pid.Ki}</div></div>
                <div style="text-align: center;"><div style="color: #888; font-size: 0.8em;">Kd</div><div style="font-weight: bold; font-size: 1.1em;">${pid.Kd}</div></div>
            </div>
            <div style="font-size: 0.85em; color: #aaa; margin-bottom: 8px;">→ ${pid.comment || ''}</div>
            <button onclick="applySuggestedPID('${testType}', ${pid.Kp}, ${pid.Ki}, ${pid.Kd})" 
                    style="width: 100%; padding: 8px; background: ${loopColors[testType] || '#61dafb'}; color: #000; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">
                📥 Zastosuj</button>`;
        suggestionsDiv.appendChild(card);
    }
}

// ========================================================================
// APPLY SUGGESTED PID
// ========================================================================
export function applySuggestedPID(loopType, kp, ki, kd) {
    const sendBleMessage = window.sendBleMessage;
    const addLogMessage = window.addLogMessage;
    const loopConfig = {
        balance: { kpId: 'balanceKpInput', kiId: 'balanceKiInput', kdId: 'balanceKdInput', kpKey: 'kp_b', kiKey: 'ki_b', kdKey: 'kd_b' },
        speed: { kpId: 'speedKpInput', kiId: 'speedKiInput', kdId: 'speedKdInput', kpKey: 'kp_s', kiKey: 'ki_s', kdKey: 'kd_s' },
        position: { kpId: 'positionKpInput', kiId: 'positionKiInput', kdId: 'positionKdInput', kpKey: 'kp_p', kiKey: 'ki_p', kdKey: 'kd_p' }
    };
    const cfg = loopConfig[loopType];
    if (!cfg) return;

    [{ id: cfg.kpId, val: kp }, { id: cfg.kiId, val: ki }, { id: cfg.kdId, val: kd }].forEach(({ id, val }) => {
        const el = document.getElementById(id);
        if (el) { el.value = val; el.dispatchEvent(new Event('change')); }
    });
    sendBleMessage({ type: 'set_param', key: cfg.kpKey, value: kp });
    sendBleMessage({ type: 'set_param', key: cfg.kiKey, value: ki });
    sendBleMessage({ type: 'set_param', key: cfg.kdKey, value: kd });
    addLogMessage(`[SysID] Zastosowano PID ${loopType}: Kp=${kp}, Ki=${ki}, Kd=${kd}`, 'success');
}

function clearSysIdData() {
    const addLogMessage = window.addLogMessage;
    SysIdState.data = [];
    updateSysIdUI('stopped');
    const canvas = document.getElementById('sysid-preview-chart');
    if (canvas && SysIdState.chartCtx) SysIdState.chartCtx.clearRect(0, 0, canvas.width, canvas.height);
    const resultsDiv = document.getElementById('sysid-analysis-results');
    if (resultsDiv) resultsDiv.style.display = 'none';
    const countEl = document.getElementById('sysid-sample-count');
    if (countEl) countEl.textContent = '0';
    const progressEl = document.getElementById('sysid-progress');
    if (progressEl) progressEl.value = 0;
    addLogMessage('[SysID] Dane wyczyszczone.', 'info');
}

// ========================================================================
// WINDOW BRIDGE
// ========================================================================
window.SysIdState = SysIdState;
window.initSystemIdentification = initSystemIdentification;
window.applySuggestedPID = applySuggestedPID;
window.importSysIdCSV = importSysIdCSV;
window.analyzeSysIdData = analyzeSysIdData;
