// ========================================================================
// TELEMETRY - Parsowanie i wyświetlanie danych telemetrycznych (ES6 Module)
// ========================================================================

import { appStore, AppState, parameterMapping } from './state.js';
import { sendBleMessage } from './communication.js';

// --- Telemetry state ---
export let pitchHistory = [];
export let speedHistory = [];
export const HISTORY_LENGTH = 600;
let lastTelemetryUpdateTime = 0;
const TELEMETRY_UPDATE_INTERVAL = 1000;

// Encoder state (shared with visualization)
export let currentEncoderLeft = 0;
export let currentEncoderRight = 0;

// Firmware trim tracking
let originalFirmwareTrimPitch = null;
let originalFirmwareTrimRoll = null;

/**
 * Normalize short telemetry keys to full names
 */
export function normalizeTelemetryData(d) {
    if (!d || typeof d !== 'object') return d;
    if (d.sp !== undefined && d.speed === undefined) d.speed = d.sp;
    if (d.ts !== undefined && d.target_speed === undefined) d.target_speed = d.ts;
    if (d.el !== undefined && d.encoder_left === undefined) d.encoder_left = d.el;
    if (d.er !== undefined && d.encoder_right === undefined) d.encoder_right = d.er;
    if (d.o !== undefined && d.output === undefined) d.output = d.o;
    if (d.gy !== undefined && d.gyroY === undefined) d.gyroY = d.gy;
    if (d.cs !== undefined && d.calib_sys === undefined) d.calib_sys = d.cs;
    if (d.cg !== undefined && d.calib_gyro === undefined) d.calib_gyro = d.cg;
    if (d.ca !== undefined && d.calib_accel === undefined) d.calib_accel = d.ca;
    if (d.cm !== undefined && d.calib_mag === undefined) d.calib_mag = d.cm;
    if (d.lt !== undefined && d.loop_time === undefined) d.loop_time = d.lt;
    if (d.ta !== undefined && d.trim_angle === undefined) d.trim_angle = d.ta;
    if (d.rt !== undefined && d.roll_trim === undefined) d.roll_trim = d.rt;
    if (d.po !== undefined && d.pitch_offset === undefined) d.pitch_offset = d.po;
    if (d.ro !== undefined && d.roll_offset === undefined) d.roll_offset = d.ro;
    if (d.trim_angle === undefined) d.trim_angle = 0.0;
    if (d.roll_trim === undefined) d.roll_trim = 0.0;
    if (d.pitch_offset === undefined) d.pitch_offset = 0.0;
    if (d.roll_offset === undefined) d.roll_offset = 0.0;
    if (d.states && typeof d.states === 'object') {
        const s = d.states;
        if (s.b !== undefined && s.balancing === undefined) s.balancing = s.b;
        if (s.hp !== undefined && s.holding_pos === undefined) s.holding_pos = s.hp;
        if (s.sm !== undefined && s.speed_mode === undefined) s.speed_mode = s.sm;
        if (s.es !== undefined && s.emergency_stop === undefined) s.emergency_stop = s.es;
    }
    return d;
}

/**
 * Update all telemetry UI elements
 */
export function updateTelemetryUI(data) {
    data = normalizeTelemetryData(data);

    // Save telemetry globally
    window.telemetryData = {
        ...(window.telemetryData || {}),
        ...data
    };

    // IMU rate from firmware
    if (data.ir !== undefined) {
        window._lastImuRateHz = data.ir;
    }

    if (data.robot_state !== undefined) {
        const el = document.getElementById('robotStateVal');
        if (el) el.textContent = data.robot_state;
    }

    // Fitness paused indicator
    const dash = document.getElementById('autotune-dashboard');
    if (dash) {
        const statusEl = document.getElementById('dashboard-status');
        if (data.fitness_paused && statusEl) {
            statusEl.textContent = 'Test wstrzymany (czekam na ustawienie)';
            dash.style.display = 'block';
        }
    }

    // Loop time
    const loopTimeVal = (data.loop_time !== undefined) ? data.loop_time : data.lt;
    if (loopTimeVal !== undefined) {
        const el = document.getElementById('loopTimeVal');
        if (el) el.textContent = loopTimeVal + ' \u00B5s';
    }

    if (data.loop_load !== undefined) {
        const loopLoadValEl = document.getElementById('loopLoadVal');
        const loopLoadItemEl = document.getElementById('loopLoadItem');
        const loadVal = parseFloat(data.loop_load).toFixed(0);
        if (loopLoadValEl) loopLoadValEl.textContent = loadVal + '%';
        if (loopLoadItemEl) {
            loopLoadItemEl.classList.toggle('warn', loadVal > 70);
            loopLoadItemEl.classList.toggle('error', loadVal > 90);
        }
    }

    // Pitch
    if (typeof data.raw_pitch === 'number' || typeof data.pitch === 'number') {
        const correctedPitch = (data.pitch !== undefined) ? data.pitch : (typeof data.raw_pitch === 'number' ? data.raw_pitch : 0);
        const angleVal = document.getElementById('angleVal');
        if (angleVal) angleVal.textContent = correctedPitch.toFixed(1) + ' \u00B0';
        const vizPitchVal = (data.viz_pitch !== undefined) ? data.viz_pitch : correctedPitch || 0;
        const pitchEl = document.getElementById('robot3d-pitch');
        if (pitchEl) pitchEl.textContent = vizPitchVal.toFixed(1) + '°';
        pitchHistory.push(correctedPitch);
        if (pitchHistory.length > HISTORY_LENGTH) pitchHistory.shift();
    }

    // Roll
    if (typeof data.raw_roll === 'number' || typeof data.roll === 'number') {
        const correctedRoll = (data.roll !== undefined) ? data.roll : (typeof data.raw_roll === 'number' ? data.raw_roll : 0);
        const vizRollVal = (data.viz_roll !== undefined) ? data.viz_roll : correctedRoll || 0;
        const rollEl = document.getElementById('robot3d-roll');
        if (rollEl) rollEl.textContent = vizRollVal.toFixed(1) + '°';
        const rollVal = document.getElementById('rollVal');
        if (rollVal) rollVal.textContent = correctedRoll.toFixed(1) + ' \u00B0';
    }

    // Yaw
    if (data.yaw !== undefined) {
        const yawVal = document.getElementById('yawVal');
        if (yawVal) yawVal.textContent = data.yaw.toFixed(1) + ' °';
        const needle = document.getElementById('compassNeedle');
        if (needle) needle.style.transform = `rotate(${data.yaw}deg)`;
    }

    // Speed
    const speedActual = (data.speed !== undefined) ? data.speed : data.sp;
    if (speedActual !== undefined) {
        const speed = parseFloat(speedActual);
        const speedVal = document.getElementById('speedVal');
        if (speedVal) speedVal.textContent = speed.toFixed(0) + ' imp/s';
        const ppr = parseFloat(document.getElementById('encoderPprInput')?.value) || 820;
        const wheelRpm = (speed / ppr) * 60;
        const wheelSpeedEl = document.getElementById('robot3d-wheel-speed');
        if (wheelSpeedEl) wheelSpeedEl.textContent = wheelRpm.toFixed(0) + ' obr/min';
        speedHistory.push(speed);
        if (speedHistory.length > HISTORY_LENGTH) speedHistory.shift();
    }

    // === Fuzzy Logic — aktualizacja wizualizacji na żywo ===
    {
        const fuzzyAngle = (data.pitch !== undefined) ? data.pitch
            : (typeof data.raw_pitch === 'number' ? data.raw_pitch : null);
        const fuzzyRate = (data.gyroY !== undefined) ? data.gyroY
            : (data.gy !== undefined ? data.gy : null);
        if (fuzzyAngle !== null && fuzzyRate !== null) {
            if (typeof window.FuzzyEditor?.updateFuzzyVisuals === 'function') {
                window.FuzzyEditor.updateFuzzyVisuals(fuzzyAngle, fuzzyRate);
            }
        }
    }

    // Encoders
    const encLeft = (data.encoder_left !== undefined) ? data.encoder_left : data.el;
    if (encLeft !== undefined) {
        currentEncoderLeft = encLeft;
        const el = document.getElementById('encoderLeftVal');
        if (el) el.textContent = encLeft;
    }
    const encRight = (data.encoder_right !== undefined) ? data.encoder_right : data.er;
    if (encRight !== undefined) {
        currentEncoderRight = encRight;
        const el = document.getElementById('encoderRightVal');
        if (el) el.textContent = encRight;
    }

    // Statistics update (throttled)
    if (Date.now() - lastTelemetryUpdateTime > TELEMETRY_UPDATE_INTERVAL) {
        if (pitchHistory.length > 0) {
            const minPitch = Math.min(...pitchHistory);
            const maxPitch = Math.max(...pitchHistory);
            const avgPitch = pitchHistory.reduce((sum, val) => sum + val, 0) / pitchHistory.length;
            const pmn = document.getElementById('pitchMin'); if (pmn) pmn.textContent = minPitch.toFixed(1) + '°';
            const pmx = document.getElementById('pitchMax'); if (pmx) pmx.textContent = maxPitch.toFixed(1) + '°';
            const pav = document.getElementById('pitchAvg'); if (pav) pav.textContent = avgPitch.toFixed(1) + '°';
        }
        if (speedHistory.length > 0) {
            const minSpeed = Math.min(...speedHistory);
            const maxSpeed = Math.max(...speedHistory);
            const avgSpeed = speedHistory.reduce((sum, val) => sum + val, 0) / speedHistory.length;
            const smn = document.getElementById('speedMin'); if (smn) smn.textContent = minSpeed.toFixed(0) + ' imp/s';
            const smx = document.getElementById('speedMax'); if (smx) smx.textContent = maxSpeed.toFixed(0) + ' imp/s';
            const sav = document.getElementById('speedAvg'); if (sav) sav.textContent = avgSpeed.toFixed(0) + ' imp/s';
        }
        lastTelemetryUpdateTime = Date.now();
    }

    // Calibration values
    const calibSys = (data.calib_sys !== undefined) ? data.calib_sys : data.cs;
    if (calibSys !== undefined) {
        const el = document.getElementById('calibSysVal'); if (el) el.textContent = calibSys;
        if (typeof window.updateCalibrationProgress === 'function') window.updateCalibrationProgress('sys', calibSys);
        const systemHealthItem = document.getElementById('systemHealthItem');
        const sysCalibVal = parseInt(calibSys);
        if (systemHealthItem) {
            if (sysCalibVal < 2) { systemHealthItem.classList.add('error'); systemHealthItem.classList.remove('warn'); document.getElementById('systemHealthVal').textContent = 'KRYTYCZNY'; }
            else if (sysCalibVal === 2) { systemHealthItem.classList.add('warn'); systemHealthItem.classList.remove('error'); document.getElementById('systemHealthVal').textContent = 'NISKI'; }
            else { systemHealthItem.classList.remove('warn', 'error'); document.getElementById('systemHealthVal').textContent = 'OK'; }
        }
    }
    const calibAccel = (data.calib_accel !== undefined) ? data.calib_accel : data.ca;
    if (calibAccel !== undefined) { const el = document.getElementById('calibAccelVal'); if (el) el.textContent = calibAccel; if (typeof window.updateCalibrationProgress === 'function') window.updateCalibrationProgress('accel', calibAccel); }
    const calibGyro = (data.calib_gyro !== undefined) ? data.calib_gyro : data.cg;
    if (calibGyro !== undefined) { const el = document.getElementById('calibGyroVal'); if (el) el.textContent = calibGyro; if (typeof window.updateCalibrationProgress === 'function') window.updateCalibrationProgress('gyro', calibGyro); }
    const calibMag = (data.calib_mag !== undefined) ? data.calib_mag : data.cm;
    if (calibMag !== undefined) { const el = document.getElementById('calibMagVal'); if (el) el.textContent = calibMag; if (typeof window.updateCalibrationProgress === 'function') window.updateCalibrationProgress('mag', calibMag); }

    // Trim and offset displays
    const trimPitch = Number(data.trim_angle) || 0;
    const trimRoll = Number(data.roll_trim) || 0;
    const pitchOffset = Number(data.pitch_offset) || 0;
    const rollOffset = Number(data.roll_offset) || 0;

    const angleOffsetValEl = document.getElementById('angleOffsetVal');
    if (angleOffsetValEl) angleOffsetValEl.textContent = trimPitch.toFixed(1) + ' °';
    const rollMountOffsetValEl = document.getElementById('rollMountOffsetVal');
    if (rollMountOffsetValEl) rollMountOffsetValEl.textContent = trimRoll.toFixed(1) + ' °';
    const trimValueDisplay = document.getElementById('trimValueDisplay');
    if (trimValueDisplay) trimValueDisplay.textContent = trimPitch.toFixed(2);
    const rollTrimValueDisplay = document.getElementById('rollTrimValueDisplay');
    if (rollTrimValueDisplay) rollTrimValueDisplay.textContent = trimRoll.toFixed(2);
    const pitchUIOffsetValEl = document.getElementById('pitchUIOffsetVal');
    if (pitchUIOffsetValEl) pitchUIOffsetValEl.textContent = pitchOffset.toFixed(1) + ' °';
    const rollUIOffsetValEl = document.getElementById('rollUIOffsetVal');
    if (rollUIOffsetValEl) rollUIOffsetValEl.textContent = rollOffset.toFixed(1) + ' °';
    const pitchOffsetDisplay = document.getElementById('pitchOffsetDisplay');
    if (pitchOffsetDisplay) pitchOffsetDisplay.textContent = pitchOffset.toFixed(2);
    const rollOffsetDisplay = document.getElementById('rollOffsetDisplay');
    if (rollOffsetDisplay) rollOffsetDisplay.textContent = rollOffset.toFixed(2);

    if (originalFirmwareTrimPitch === null && trimPitch !== 0) originalFirmwareTrimPitch = trimPitch;
    const offsetDelta = originalFirmwareTrimPitch !== null ? (trimPitch - originalFirmwareTrimPitch) : 0;
    const offsetDeltaValEl = document.getElementById('offsetDeltaVal');
    if (offsetDeltaValEl) offsetDeltaValEl.textContent = offsetDelta.toFixed(1) + ' °';

    // States update
    if (data.states && !AppState.isApplyingConfig) {
        AppState.isApplyingConfig = true;
        const s = data.states;
        const stBal = (s.balancing !== undefined) ? s.balancing : s.b;
        const stHold = (s.holding_pos !== undefined) ? s.holding_pos : s.hp;
        const stSpeed = (s.speed_mode !== undefined) ? s.speed_mode : s.sm;
        const stEstop = (s.emergency_stop !== undefined) ? s.emergency_stop : s.es;
        if (stBal !== undefined) { const el = document.getElementById('balanceSwitch'); if (el) el.checked = !!stBal; }
        if (stHold !== undefined) { const el = document.getElementById('holdPositionSwitch'); if (el) el.checked = !!stHold; }
        if (stSpeed !== undefined) { const el = document.getElementById('speedModeSwitch'); if (el) el.checked = !!stSpeed; }
        AppState.isApplyingConfig = false;
        const emergencyBanner = document.getElementById('emergency-banner');
        if (emergencyBanner) emergencyBanner.style.display = stEstop ? 'block' : 'none';
    } else {
        const emergencyBanner = document.getElementById('emergency-banner');
        if (emergencyBanner) emergencyBanner.style.display = data.states && (data.states.emergency_stop || data.states.es) ? 'block' : 'none';
    }
}

/**
 * Apply a single parameter value to the corresponding UI element
 */
export function applySingleParam(snakeKey, value) {
    const inputId = Object.keys(parameterMapping).find(key => parameterMapping[key] === snakeKey);
    if (inputId) {
        const el = document.getElementById(inputId);
        if (el) {
            let displayValue = value;
            if (['turn_factor', 'expo_joystick', 'joystick_sensitivity', 'joystick_deadzone', 'balance_pid_derivative_filter_alpha', 'speed_pid_filter_alpha', 'position_pid_filter_alpha'].includes(snakeKey)) {
                displayValue = (value * 100);
            }
            if (el.tagName === 'INPUT' || el.tagName === 'SELECT') {
                if (el.type === 'checkbox') {
                    el.checked = !!displayValue;
                    if (inputId === 'include-ki-checkbox' && typeof window.updateSearchSpaceInputs === 'function') window.updateSearchSpaceInputs();
                } else {
                    el.value = displayValue;
                }
            } else if (el.tagName === 'SPAN') {
                el.textContent = (typeof displayValue === 'number') ? parseFloat(displayValue).toFixed(2) : displayValue;
            }
        }
    }

    // Feedback sign params
    if (snakeKey === 'balance_feedback_sign') {
        const v = parseInt(value);
        if (typeof window.setSignButtons === 'function') window.setSignButtons('balanceSign', v);
        if (typeof window.updateSignBadge === 'function') window.updateSignBadge('balanceSignBadge', v);
    } else if (snakeKey === 'speed_feedback_sign') {
        const v = parseInt(value);
        if (typeof window.setSignButtons === 'function') window.setSignButtons('speedSign', v);
        if (typeof window.updateSignBadge === 'function') window.updateSignBadge('speedSignBadge', v);
    } else if (snakeKey === 'position_feedback_sign') {
        const v = parseInt(value);
        if (typeof window.setSignButtons === 'function') window.setSignButtons('positionSign', v);
        if (typeof window.updateSignBadge === 'function') window.updateSignBadge('positionSignBadge', v);
    }
}

/**
 * Apply a single autotuning parameter
 */
export function applySingleAutotuneParam(snakeKey, value) {
    const inputId = Object.keys(parameterMapping).find(key => parameterMapping[key] === snakeKey);
    if (inputId) {
        const input = document.getElementById(inputId);
        if (input) {
            let displayValue = value;
            if (snakeKey.startsWith('weights_')) displayValue = (value * 100);
            if (snakeKey === 'ga_mutation_rate') displayValue = (value * 100);
            if (snakeKey === 'tuning_trial_duration_ms') displayValue = (value / 1000.0);
            if (input.type === 'checkbox') {
                input.checked = displayValue;
            } else {
                input.value = displayValue;
            }
            if (snakeKey === 'search_ki' && typeof window.updateSearchSpaceInputs === 'function') {
                window.updateSearchSpaceInputs();
            }
            // Sync shared fields between GA/PSO tabs
            const sharedFields = ['kp-min', 'kp-max', 'ki-min', 'ki-max', 'kd-min', 'kd-max', 'weight-itae', 'weight-overshoot', 'weight-control-effort'];
            const sharedField = sharedFields.find(f => inputId.endsWith(f));
            if (sharedField) {
                const prefix = inputId.startsWith('ga-') ? 'pso-' : 'ga-';
                const otherInput = document.getElementById(`${prefix}${sharedField}`);
                if (otherInput) otherInput.value = input.value;
            }
            if (input.type === 'range') input.dispatchEvent(new Event('input'));
        }
    }
}

/**
 * Apply full config to all UI elements
 */
export function applyFullConfig(params) {
    for (const [inputId, snakeKey] of Object.entries(parameterMapping)) {
        const input = document.getElementById(inputId);
        if (input && params[snakeKey] !== undefined) {
            let value = params[snakeKey];
            if (['turn_factor', 'expo_joystick', 'joystick_sensitivity', 'joystick_deadzone', 'balance_pid_derivative_filter_alpha', 'speed_pid_filter_alpha', 'position_pid_filter_alpha', 'weights_itae', 'weights_overshoot', 'weights_control_effort'].includes(snakeKey)) {
                value = (value * 100);
            }
            input.value = value;
        }
    }
}

// IMU Rate UI updater
(function setupImuRateUpdater() {
    function updateImuRateUI() {
        try {
            const el = document.getElementById('imuRateValue');
            if (!el) return;
            const imuRate = window._lastImuRateHz;
            if (imuRate !== undefined && imuRate > 0) {
                el.textContent = imuRate;
            } else {
                el.textContent = '--';
            }
        } catch (e) { /* no-op */ }
    }
    setInterval(updateImuRateUI, 200);
})();

// Backward compatibility - expose on window
window.normalizeTelemetryData = normalizeTelemetryData;
window.updateTelemetryUI = updateTelemetryUI;
window.applySingleParam = applySingleParam;
window.applySingleAutotuneParam = applySingleAutotuneParam;
window.applyFullConfig = applyFullConfig;
window.telemetryData = window.telemetryData || {};
