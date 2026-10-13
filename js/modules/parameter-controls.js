// ========================================================================
// PARAMETER-CONTROLS.JS - Numeric inputs, parameter listeners, manual tune (ES6)
// ========================================================================
// Extracted from main.js → Etap 2 modularyzacji
// ========================================================================

import { AppState, parameterMapping } from './state.js';

// ========================================================================
// NUMERIC INPUTS (spinner +/- buttons, validation, clamping)
// ========================================================================
export function setupNumericInputs() {
    document.querySelectorAll('.numeric-input-wrapper').forEach(wrapper => {
        const container = wrapper.closest('.setting-container') || wrapper.closest('.pwm-input-row');
        if (!container) return;
        const input = container.querySelector('input[type=number]');
        const minusBtn = wrapper.querySelector('button:first-child');
        const plusBtn = wrapper.querySelector('button:last-child');
        if (!input || !minusBtn || !plusBtn || input.disabled) return;
        const step = parseFloat(input.step) || 1;
        const isFloat = input.step.includes('.');

        const validateAndMark = (inputEl) => {
            const value = parseFloat(inputEl.value);
            const min = parseFloat(inputEl.min);
            const max = parseFloat(inputEl.max);

            if (inputEl.value === '' || inputEl.value === '-') {
                inputEl.style.borderColor = '';
                inputEl.style.backgroundColor = '';
                return;
            }
            if (isNaN(value)) {
                inputEl.style.borderColor = '#ff6b6b';
                inputEl.style.backgroundColor = 'rgba(255, 107, 107, 0.1)';
                return;
            }
            const outOfRange = (!isNaN(min) && value < min) || (!isNaN(max) && value > max);
            if (outOfRange) {
                inputEl.style.borderColor = '#ff6b6b';
                inputEl.style.backgroundColor = 'rgba(255, 107, 107, 0.1)';
            } else {
                inputEl.style.borderColor = '';
                inputEl.style.backgroundColor = '';
            }
        };

        input.addEventListener('input', (e) => validateAndMark(e.target));

        input.addEventListener('blur', (e) => {
            let value = parseFloat(e.target.value);
            const min = parseFloat(e.target.min);
            const max = parseFloat(e.target.max);

            if (e.target.value === '' || isNaN(value)) {
                e.target.value = !isNaN(min) ? min : 0;
                e.target.style.borderColor = '';
                e.target.style.backgroundColor = '';
                e.target.dispatchEvent(new Event('change', { bubbles: true }));
                return;
            }
            let clamped = false;
            if (!isNaN(min) && value < min) { e.target.value = min; clamped = true; }
            if (!isNaN(max) && value > max) { e.target.value = max; clamped = true; }
            if (clamped) {
                e.target.style.borderColor = '';
                e.target.style.backgroundColor = '';
                e.target.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });

        const updateValue = (amount) => {
            let current = parseFloat(input.value);
            if (isNaN(current)) current = 0;
            let newValue = current + amount;
            if (isFloat) {
                const dp = (step.toString().split('.')[1] || '').length;
                newValue = parseFloat(newValue.toFixed(dp));
            }
            const min = parseFloat(input.min);
            const max = parseFloat(input.max);
            if (!isNaN(min)) newValue = Math.max(min, newValue);
            if (!isNaN(max)) newValue = Math.min(max, newValue);
            input.value = newValue;
            input.style.borderColor = '';
            input.style.backgroundColor = '';
            input.dispatchEvent(new Event('change', { bubbles: true }));
        };
        minusBtn.addEventListener('click', () => updateValue(-step));
        plusBtn.addEventListener('click', () => updateValue(step));
    });
}

// ========================================================================
// SEND FULL CONFIG
// ========================================================================
export function sendFullConfigToRobot() {
    const sendBleMessage = window.sendBleMessage;
    const addLogMessage = window.addLogMessage;
    const params = {};
    for (const [inputId, snakeKey] of Object.entries(parameterMapping)) {
        const input = document.getElementById(inputId);
        if (!input) continue;
        let value;
        if (input.type === 'checkbox') value = input.checked;
        else value = parseFloat(input.value);

        if (['turn_factor', 'expo_joystick', 'joystick_sensitivity', 'joystick_deadzone', 'balance_pid_derivative_filter_alpha', 'speed_pid_filter_alpha', 'position_pid_filter_alpha', 'weights_itae', 'weights_overshoot', 'weights_control_effort'].includes(snakeKey)) {
            value /= 100.0;
        }
        if (snakeKey === 'ga_mutation_rate') value /= 100.0;
        if (snakeKey === 'tuning_trial_duration_ms') value = (value * 1000.0);
        params[snakeKey] = value;
    }
    params['trim_angle'] = 0;
    params['roll_trim'] = 0;
    addLogMessage('[UI] Wysylam pelna konfiguracje do robota...', 'info');
    sendBleMessage({ type: 'full_config', params });
}

// ========================================================================
// DEBOUNCE helper
// ========================================================================
function debounce(fn, ms) {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}

// ========================================================================
// PARAMETER LISTENERS
// ========================================================================
export function setupParameterListeners() {
    const sendBleMessage = window.sendBleMessage;
    const addLogMessage = window.addLogMessage;
    const FusionPIDProfiles = window.FusionPIDProfiles;

    const pidKeys = ['kp_b', 'ki_b', 'kd_b', 'balance_pid_derivative_filter_alpha', 'balance_pid_integral_limit',
        'kp_s', 'ki_s', 'kd_s', 'speed_pid_filter_alpha', 'speed_pid_integral_limit',
        'kp_p', 'ki_p', 'kd_p', 'position_pid_filter_alpha', 'position_pid_integral_limit'];

    const sendSingleParam = (inputId, value) => {
        if (AppState.isApplyingConfig) return;
        let snakeKey = parameterMapping[inputId];
        if (snakeKey) {
            if (['turn_factor', 'expo_joystick', 'joystick_sensitivity', 'joystick_deadzone', 'balance_pid_derivative_filter_alpha', 'speed_pid_filter_alpha', 'position_pid_filter_alpha', 'weights_itae', 'weights_overshoot', 'weights_control_effort'].includes(snakeKey)) {
                value /= 100.0;
            }
            if (pidKeys.includes(snakeKey) && typeof FusionPIDProfiles !== 'undefined') {
                snakeKey = FusionPIDProfiles.getParamKey(snakeKey);
            }
            sendBleMessage({ type: 'set_param', key: snakeKey, value: value });
        }
    };
    const debouncedSendSingleParam = debounce(sendSingleParam, 400);

    document.querySelectorAll('.config-value').forEach(input => {
        input.addEventListener('change', (e) => {
            if (e.target.type === 'checkbox') {
                const snakeKey = parameterMapping[e.target.id];
                if (snakeKey) sendBleMessage({ type: 'set_param', key: snakeKey, value: e.target.checked ? 1.0 : 0.0 });
            } else {
                debouncedSendSingleParam(e.target.id, parseFloat(e.target.value));
            }
        });
    });

    // AUTOTUNING parameter listeners
    const sendTuningParam = (snakeKey, rawValue) => {
        if (AppState.isApplyingConfig) return;
        let value = rawValue;
        if (typeof value === 'number' && isNaN(value)) return;
        if (snakeKey && snakeKey.startsWith('weights_')) value = (parseFloat(value) / 100.0);
        if (snakeKey === 'ga_mutation_rate') value = (parseFloat(value) / 100.0);
        if (snakeKey === 'tuning_trial_duration_ms') value = Math.round(parseFloat(value) * 1000.0);
        sendBleMessage({ type: 'set_tuning_config_param', key: snakeKey, value });
    };
    const debouncedSendTuningParam = debounce((inputId, val) => {
        const snakeKey = parameterMapping[inputId];
        if (!snakeKey) return;
        sendTuningParam(snakeKey, val);
    }, 300);

    for (const [inputId, snakeKey] of Object.entries(parameterMapping)) {
        const input = document.getElementById(inputId);
        if (!input) continue;
        if (input.classList.contains('config-value')) continue;
        const isTuningKey = (
            snakeKey.startsWith('ga_') || snakeKey.startsWith('pso_') || snakeKey.startsWith('space_') ||
            snakeKey.startsWith('weights_') || snakeKey === 'tuning_trial_duration_ms' || snakeKey === 'zn_amplitude'
        );
        if (!isTuningKey) continue;
        if (input.type === 'checkbox') {
            input.addEventListener('change', (e) => { sendBleMessage({ type: 'set_tuning_config_param', key: snakeKey, value: e.target.checked }); });
        } else {
            input.addEventListener('change', (e) => { debouncedSendTuningParam(inputId, parseFloat(e.target.value)); });
        }
    }

    // Joystick canvas listeners
    const joystickCanvasEl = document.getElementById('joystickCanvas');
    if (joystickCanvasEl) {
        joystickCanvasEl.addEventListener('mousedown', window.handleJoystickStart);
        document.addEventListener('mousemove', window.handleJoystickMove);
        document.addEventListener('mouseup', window.handleJoystickEnd);
        joystickCanvasEl.addEventListener('touchstart', window.handleJoystickStart, { passive: false });
        document.addEventListener('touchmove', window.handleJoystickMove, { passive: false });
        document.addEventListener('touchend', window.handleJoystickEnd);
        document.addEventListener('touchcancel', window.handleJoystickEnd);
    }

    // Connect BLE button
    document.getElementById('connectBleBtn')?.addEventListener('click', window.connectBLE);

    // QR Code
    if (typeof window.initQRCodeUI === 'function') window.initQRCodeUI();

    // Toggle switches
    ['balanceSwitch', 'holdPositionSwitch', 'speedModeSwitch', 'disableMagnetometerSwitch'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('change', (e) => {
            if (AppState.isApplyingConfig) return;
            const typeMap = { 'balanceSwitch': 'balance_toggle', 'holdPositionSwitch': 'hold_position_toggle', 'speedModeSwitch': 'speed_mode_toggle', 'disableMagnetometerSwitch': 'set_param' };
            if (typeMap[id] === 'set_param') sendBleMessage({ type: 'set_param', key: 'disable_magnetometer', value: e.target.checked ? 1.0 : 0.0 });
            else sendBleMessage({ type: typeMap[id], enabled: e.target.checked });
        });
    });

    // Trim (pitch)
    function updateAndSendTrim(delta) {
        const span = document.getElementById('trimValueDisplay');
        if (!span) return;
        const preview = (parseFloat(span.textContent) || 0) + delta;
        span.textContent = preview.toFixed(2);
        sendBleMessage({ type: 'adjust_zero', value: delta });
        addLogMessage(`[UI] Montaż: Pitch Y+=${delta.toFixed(2)}° (persist)`, 'info');
    }
    document.getElementById('trimMinus01Btn')?.addEventListener('click', () => updateAndSendTrim(-0.1));
    document.getElementById('trimMinus001Btn')?.addEventListener('click', () => updateAndSendTrim(-0.01));
    document.getElementById('trimPlus001Btn')?.addEventListener('click', () => updateAndSendTrim(0.01));
    document.getElementById('trimPlus01Btn')?.addEventListener('click', () => updateAndSendTrim(0.1));

    // Roll trim
    document.getElementById('resetRollZeroBtn')?.addEventListener('click', () => { if (typeof window.setRollZero === 'function') window.setRollZero(); });
    document.getElementById('resetZeroBtn')?.addEventListener('click', () => { if (typeof window.setPitchZero === 'function') window.setPitchZero(); });
    document.getElementById('resetEncodersBtn')?.addEventListener('click', () => {
        if (!AppState.isConnected) { addLogMessage('[UI] Nie połączono z robotem.', 'warn'); return; }
        if (confirm('Czy na pewno chcesz zresetować enkodery (ustawić 0)?')) {
            addLogMessage('[UI] Wysłano żądanie resetu enkoderów.', 'info');
            sendBleMessage({ type: 'reset_encoders' });
        }
    });

    function updateAndSendRollTrim(delta) {
        const span = document.getElementById('rollTrimValueDisplay');
        if (!span) return;
        const preview = (parseFloat(span.textContent) || 0) + delta;
        span.textContent = preview.toFixed(2);
        sendBleMessage({ type: 'adjust_roll_trim', value: delta });
        addLogMessage(`[UI] Montaż: Roll X+=${delta.toFixed(2)}° (persist)`, 'info');
    }
    document.getElementById('rollTrimMinus01Btn')?.addEventListener('click', () => updateAndSendRollTrim(-0.1));
    document.getElementById('rollTrimMinus001Btn')?.addEventListener('click', () => updateAndSendRollTrim(-0.01));
    document.getElementById('rollTrimPlus001Btn')?.addEventListener('click', () => updateAndSendRollTrim(0.01));
    document.getElementById('rollTrimPlus01Btn')?.addEventListener('click', () => updateAndSendRollTrim(0.1));

    // Pitch offset
    function updateAndSendPitchOffset(delta) {
        const span = document.getElementById('pitchOffsetDisplay');
        if (!span) return;
        const preview = (parseFloat(span.textContent) || 0) + delta;
        span.textContent = preview.toFixed(2);
        sendBleMessage({ type: 'adjust_pitch_offset', value: delta });
        addLogMessage(`[UI] Offset pionu (Pitch): ${delta > 0 ? '+' : ''}${delta.toFixed(2)}° (zapisz do EEPROM!)`, 'info');
    }
    function updateAndSendRollOffset(delta) {
        const span = document.getElementById('rollOffsetDisplay');
        if (!span) return;
        const preview = (parseFloat(span.textContent) || 0) + delta;
        span.textContent = preview.toFixed(2);
        sendBleMessage({ type: 'adjust_roll_offset', value: delta });
        addLogMessage(`[UI] Offset pionu (Roll): ${delta > 0 ? '+' : ''}${delta.toFixed(2)}° (zapisz do EEPROM!)`, 'info');
    }
    document.getElementById('pitchOffsetMinus01Btn')?.addEventListener('click', () => updateAndSendPitchOffset(-0.1));
    document.getElementById('pitchOffsetMinus001Btn')?.addEventListener('click', () => updateAndSendPitchOffset(-0.01));
    document.getElementById('pitchOffsetPlus001Btn')?.addEventListener('click', () => updateAndSendPitchOffset(0.01));
    document.getElementById('pitchOffsetPlus01Btn')?.addEventListener('click', () => updateAndSendPitchOffset(0.1));
    document.getElementById('resetPitchOffsetBtn')?.addEventListener('click', () => {
        sendBleMessage({ type: 'reset_pitch_offset' });
        const span = document.getElementById('pitchOffsetDisplay');
        if (span) span.textContent = '0.00';
        addLogMessage('[UI] Offset pionu (Pitch) wyzerowany.', 'success');
    });
    document.getElementById('rollOffsetMinus01Btn')?.addEventListener('click', () => updateAndSendRollOffset(-0.1));
    document.getElementById('rollOffsetMinus001Btn')?.addEventListener('click', () => updateAndSendRollOffset(-0.01));
    document.getElementById('rollOffsetPlus001Btn')?.addEventListener('click', () => updateAndSendRollOffset(0.01));
    document.getElementById('rollOffsetPlus01Btn')?.addEventListener('click', () => updateAndSendRollOffset(0.1));
    document.getElementById('resetRollOffsetBtn')?.addEventListener('click', () => {
        sendBleMessage({ type: 'reset_roll_offset' });
        const span = document.getElementById('rollOffsetDisplay');
        if (span) span.textContent = '0.00';
        addLogMessage('[UI] Offset pionu (Roll) wyzerowany.', 'success');
    });

    // Save/Load config
    document.getElementById('saveBtn')?.addEventListener('click', () => {
        if (AppState.isConnected && confirm("Czy na pewno chcesz trwale zapisać bieżącą konfigurację z panelu do pamięci EEPROM robota?")) {
            addLogMessage('[UI] Wyslano polecenie zapisu konfiguracji do EEPROM...', 'info');
            sendBleMessage({ type: 'save_tunings' });
            if (typeof FusionPIDProfiles !== 'undefined') {
                FusionPIDProfiles.saveCurrentToProfile();
                addLogMessage('[FusionPID] 💾 Profile PID dla Mahony/NDOF zapisane lokalnie', 'success');
            }
        } else if (!AppState.isConnected) { addLogMessage('[UI] Połącz z robotem przed zapisem konfiguracji.', 'warn'); }
    });
    document.getElementById('loadBtn')?.addEventListener('click', () => {
        if (confirm("UWAGA! Spowoduje to nadpisanie wszystkich niezapisanych zmian w panelu. Kontynuowac?")) {
            AppState.isSynced = false; AppState.tempParams = {}; AppState.tempStates = {};
            sendBleMessage({ type: 'request_full_config' });
        }
    });

    // Calibration
    document.getElementById('calibrateMpuBtn')?.addEventListener('click', () => { if (typeof window.showCalibrationModal === 'function') window.showCalibrationModal(); });
    document.getElementById('calibrateZeroPointBtn')?.addEventListener('click', () => {
        if (confirm("Upewnij sie, ze robot stoi na idealnie plaskiej powierzchni. Robot bedzie balansowal przez 10 sekund w celu znalezienia dokladnego punktu rownowagi. Kontynuowac?")) {
            sendBleMessage({ type: 'calibrate_zero_point' });
        }
    });

    // Presets
    document.getElementById('applySelectedPresetBtn')?.addEventListener('click', window.applySelectedPreset);
    document.getElementById('saveCurrentAsPresetBtn')?.addEventListener('click', window.saveCurrentAsPreset);
    document.getElementById('deleteSelectedPresetBtn')?.addEventListener('click', window.deleteSelectedPreset);

    // Help icons
    document.querySelectorAll('.help-icon').forEach(icon => {
        icon.addEventListener('click', (e) => {
            e.stopPropagation();
            const container = icon.closest('.setting-container') || icon.closest('.control-row') || icon.closest('.fitness-weight-item');
            if (!container) return;
            const next = container.nextElementSibling;
            const helpText = (next && next.classList && next.classList.contains('help-text')) ? next : container.querySelector('.help-text');
            if (helpText) {
                helpText.classList.toggle('visible');
                const accordionContent = container.closest('.accordion-content');
                if (accordionContent && typeof window.updateAccordionHeight === 'function') window.updateAccordionHeight(accordionContent);
            }
        });
    });
}

// ========================================================================
// MANUAL TUNE BUTTONS
// ========================================================================
export function setupManualTuneButtons() {
    const sendBleMessage = window.sendBleMessage;
    const addLogMessage = window.addLogMessage;
    const activeTestTimers = new Map();

    document.querySelectorAll('.manual-tune-row').forEach(row => {
        const motor = row.dataset.motor;
        const direction = row.dataset.direction;
        const rowKey = `${motor}-${direction}`;
        const input = row.querySelector('.tune-input');
        const testBtn = row.querySelector('.test-btn');
        const stopBtn = row.querySelector('.stop-btn');
        const autoBtn = row.querySelector('.auto-btn');

        testBtn.addEventListener('click', () => {
            const pwm = parseInt(input.value) || 0;
            if (pwm <= 0) { addLogMessage('[UI] Wpisz dodatni PWM do testu.', 'warn'); return; }
            sendBleMessage({ type: 'manual_tune_motor', motor, direction, pwm });
            addLogMessage(`[UI] Test ${motor} ${direction} rozpoczęty na 5s (PWM=${pwm}).`, 'info');
            if (activeTestTimers.has(rowKey)) clearTimeout(activeTestTimers.get(rowKey));
            const timeoutId = setTimeout(() => {
                sendBleMessage({ type: 'manual_tune_motor', motor, direction, pwm: 0 });
                addLogMessage(`[UI] Test ${motor} ${direction} zakończony automatycznie po 5s.`, 'info');
                activeTestTimers.delete(rowKey);
            }, 5000);
            activeTestTimers.set(rowKey, timeoutId);
        });

        stopBtn.addEventListener('click', () => {
            if (activeTestTimers.has(rowKey)) { clearTimeout(activeTestTimers.get(rowKey)); activeTestTimers.delete(rowKey); }
            sendBleMessage({ type: 'manual_tune_motor', motor, direction, pwm: 0 });
            addLogMessage(`[UI] Test ${motor} ${direction} zatrzymany.`, 'warn');
        });

        autoBtn.addEventListener('click', (e) => {
            if (confirm("UWAGA! Upewnij sie, ze robot jest uniesiony, a kola moga sie swobodnie obracac. Kontynuowac?")) {
                const startValue = parseInt(document.getElementById('pwmTuneStartInput').value);
                sendBleMessage({ type: 'autotune_single_pwm', motor, direction, start_pwm: startValue });
                e.target.disabled = true; e.target.textContent = 'Szukanie...';
                addLogMessage(`[UI] Rozpoczynam auto-strojenie dla ${motor} ${direction}...`, 'info');
            }
        });
    });

    document.getElementById('manualTuneStopAll')?.addEventListener('click', () => {
        sendBleMessage({ type: 'manual_tune_stop_all' });
        addLogMessage('[UI] Zatrzymano wszystkie silniki.', 'warn');
    });
}

// Window bridge
window.setupNumericInputs = setupNumericInputs;
window.setupParameterListeners = setupParameterListeners;
window.setupManualTuneButtons = setupManualTuneButtons;
window.sendFullConfigToRobot = sendFullConfigToRobot;
