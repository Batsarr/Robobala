// ========================================================================
// CALIBRATION.JS - IMU Calibration modal (ES6)
// ========================================================================
// Extracted from main.js → Etap 2 modularyzacji
// ========================================================================

import { AppState } from './state.js';

let isCalibrationModalShown = false;

export function refreshCalibrationFromTelemetry() {
    const td = window.telemetryData || {};
    const sys = Number.isFinite(td.calib_sys) ? td.calib_sys : (Number.isFinite(td.calibSystem) ? td.calibSystem : 0);
    const accel = Number.isFinite(td.calib_accel) ? td.calib_accel : (Number.isFinite(td.calibAccel) ? td.calibAccel : 0);
    const gyro = Number.isFinite(td.calib_gyro) ? td.calib_gyro : (Number.isFinite(td.calibGyro) ? td.calibGyro : 0);
    const mag = Number.isFinite(td.calib_mag) ? td.calib_mag : (Number.isFinite(td.calibMag) ? td.calibMag : 0);
    const sysBar = document.getElementById('calib-sys-bar'); const sysTxt = document.getElementById('calib-sys-text');
    const accBar = document.getElementById('calib-accel-bar'); const accTxt = document.getElementById('calib-accel-text');
    const gyrBar = document.getElementById('calib-gyro-bar'); const gyrTxt = document.getElementById('calib-gyro-text');
    const magBar = document.getElementById('calib-mag-bar'); const magTxt = document.getElementById('calib-mag-text');
    if (sysBar) sysBar.value = sys; if (sysTxt) sysTxt.textContent = sys;
    if (accBar) accBar.value = accel; if (accTxt) accTxt.textContent = accel;
    if (gyrBar) gyrBar.value = gyro; if (gyrTxt) gyrTxt.textContent = gyro;
    if (magBar) magBar.value = mag; if (magTxt) magTxt.textContent = mag;
}

export function setupCalibrationModal() {
    const sendBleMessage = window.sendBleMessage;
    const addLogMessage = window.addLogMessage;

    const upd = document.getElementById('calib-update-btn');
    if (upd) upd.addEventListener('click', refreshCalibrationFromTelemetry);
    const close = document.getElementById('calib-close-btn');
    if (close) close.addEventListener('click', () => {
        const sys = parseInt(document.getElementById('calib-sys-text').textContent) || 0;
        if (sys >= 3 || confirm('Poziom kalibracji systemu jest niski (<3). Czy na pewno chcesz zamknac?')) {
            hideCalibrationModal();
        }
    });
    const saveBtn = document.getElementById('calib-save-btn');
    if (saveBtn) saveBtn.addEventListener('click', () => {
        if (!AppState.isConnected) { addLogMessage('[UI] Musisz się połączyć z robotem, aby zapisać kalibrację.', 'warn'); return; }
        if (!confirm('Czy na pewno chcesz zapisać bieżącą kalibrację IMU do EEPROM robota?')) return;
        addLogMessage('[UI] Wysłano żądanie zapisania kalibracji IMU do EEPROM...', 'info');
        sendBleMessage({ type: 'calibrate_mpu' });
    });
}

export function showCalibrationModal() {
    const sendBleMessage = window.sendBleMessage;
    const addLogMessage = window.addLogMessage;
    document.getElementById('calibration-modal').style.display = 'flex';
    isCalibrationModalShown = true;
    sendBleMessage({ type: 'set_rgb_blink', colors: ['00FF00', 'FFA500'] });
    addLogMessage('[UI] Rozpocznij proces kalibracji IMU - obracaj robota powoli we wszystkich kierunkach.', 'info');
}

export function hideCalibrationModal() {
    const sendBleMessage = window.sendBleMessage;
    const addLogMessage = window.addLogMessage;
    document.getElementById('calibration-modal').style.display = 'none';
    isCalibrationModalShown = false;
    sendBleMessage({ type: 'stop_rgb_blink' });
    addLogMessage('[UI] Asystent kalibracji zamkniety.', 'info');
}

export function updateCalibrationProgress(axis, value) {
    if (document.getElementById('calibration-modal').style.display === 'none') return;
    const barId = `calib-${axis}-bar`;
    const textId = `calib-${axis}-text`;
    const bar = document.getElementById(barId);
    const text = document.getElementById(textId);
    if (bar && text) {
        bar.value = value;
        text.textContent = value;
        const sys = parseInt(document.getElementById('calib-sys-text').textContent) || 0;
        const saveBtn = document.getElementById('calib-save-btn');
        if (sys >= 3) {
            if (saveBtn) saveBtn.style.display = 'inline-block';
        } else {
            if (saveBtn) saveBtn.style.display = 'none';
        }
    }
}

export function getIsCalibrationModalShown() {
    return isCalibrationModalShown;
}

// Window bridge
window.setupCalibrationModal = setupCalibrationModal;
window.showCalibrationModal = showCalibrationModal;
window.hideCalibrationModal = hideCalibrationModal;
window.updateCalibrationProgress = updateCalibrationProgress;
window.refreshCalibrationFromTelemetry = refreshCalibrationFromTelemetry;
window.getIsCalibrationModalShown = getIsCalibrationModalShown;
