// ui_core.js - Minimalny moduł inicjalizacyjny przywracający joystick i wizualizację 3D po usunięciu monolitycznego main.js
// Ładowany po: state_manager.js, communication_layer.js, helpers.js, ui_components.js, path_visualization.js
// Zawiera tylko brakujące globalne zmienne i funkcje animacji 3D + inicjalizację po DOMContentLoaded.

(function () {
    // ==== BRAKUJĄCE GLOBALNE ZMIENNE JOYSTICKA (unik ReferenceError) ====
    if (typeof window.joystickCenter === 'undefined') window.joystickCenter = { x: 0, y: 0 };
    if (typeof window.joystickRadius === 'undefined') window.joystickRadius = 0;
    if (typeof window.knobRadius === 'undefined') window.knobRadius = 0;
    if (typeof window.isDragging === 'undefined') window.isDragging = false;
    if (typeof window.lastJoystickSendTime === 'undefined') window.lastJoystickSendTime = 0;

    // Jeśli istnieją już symbole (np. z wcześniejszego bundle), nie nadpisuj.
    if (typeof window.JOYSTICK_SEND_INTERVAL === 'undefined') {
        window.JOYSTICK_SEND_INTERVAL = 20;
    }

    // Proste logowanie (fallback jeśli addLogMessage nie istnieje jeszcze)
    if (typeof window.addLogMessage === 'undefined') {
        window.addLogMessage = function (msg, level) {
            console.log('[LOG][' + (level || 'info') + '] ' + msg);
        };
    }

    // Globalne zmienne 3D jeśli brak
    window.scene3D = window.scene3D || null;
    window.camera3D = window.camera3D || null;
    window.renderer3D = window.renderer3D || null;
    window.controls3D = window.controls3D || null;
    window.robotPivot = window.robotPivot || null;
    window.leftWheel = window.leftWheel || null;
    window.rightWheel = window.rightWheel || null;
    window.groundMesh = window.groundMesh || null;
    window.groundTexture = window.groundTexture || null;
    window.skyDome = window.skyDome || null;
    window.robotPerspectiveZoom = window.robotPerspectiveZoom || 40;
    window.isAnimation3DEnabled = window.isAnimation3DEnabled !== undefined ? window.isAnimation3DEnabled : true;
    window.isMovement3DEnabled = window.isMovement3DEnabled !== undefined ? window.isMovement3DEnabled : false;
    window.lastEncoderAvg = window.lastEncoderAvg || 0;
    window.currentEncoderLeft = window.currentEncoderLeft || 0;
    window.currentEncoderRight = window.currentEncoderRight || 0;
    window.modelMapping = window.modelMapping || { pitch: { source: 0, sign: 1 }, yaw: { source: 1, sign: 1 }, roll: { source: 2, sign: 1 } };

    // Bezpieczne helpery mapowania (jeśli nie zdefiniowane w innym module)
    if (typeof window.applyModelMappingToEuler === 'undefined') {
        window.applyModelMappingToEuler = function (e) {
            const arr = [e.pitch, e.yaw, e.roll];
            return {
                pitch: (arr[window.modelMapping.pitch.source] || 0) * window.modelMapping.pitch.sign,
                yaw: (arr[window.modelMapping.yaw.source] || 0) * window.modelMapping.yaw.sign,
                roll: (arr[window.modelMapping.roll.source] || 0) * window.modelMapping.roll.sign
            };
        };
    }

    if (typeof window.computeEulerFromQuaternion === 'undefined') {
        window.computeEulerFromQuaternion = function (qw, qx, qy, qz) {
            try {
                if ([qw, qx, qy, qz].some(v => typeof v !== 'number' || Number.isNaN(v))) return null;
                const n = Math.hypot(qw, qx, qy, qz) || 1; qw /= n; qx /= n; qy /= n; qz /= n;
                const siny_cosp = 2 * (qw * qz + qx * qy);
                const cosy_cosp = 1 - 2 * (qy * qy + qz * qz);
                const yaw = Math.atan2(siny_cosp, cosy_cosp);
                const sinp = 2 * (qw * qy - qz * qx);
                const pitch = Math.abs(sinp) >= 1 ? Math.sign(sinp) * (Math.PI / 2) : Math.asin(sinp);
                const sinr_cosp = 2 * (qw * qx + qy * qz);
                const cosr_cosp = 1 - 2 * (qx * qx + qy * qy);
                const roll = Math.atan2(sinr_cosp, cosr_cosp);
                return { yaw: THREE.MathUtils.radToDeg(yaw), pitch: THREE.MathUtils.radToDeg(pitch), roll: THREE.MathUtils.radToDeg(roll) };
            } catch (e) { return null; }
        };
    }

    // Aktualizacja animacji 3D (uproszczona wersja z main.js)
    if (typeof window.update3DAnimation === 'undefined') {
        window.update3DAnimation = function () {
            if (!window.isAnimation3DEnabled || !window.robotPivot) return;
            if (typeof window.telemetryData?.qw === 'number') {
                try {
                    const eulRaw = window.computeEulerFromQuaternion(window.telemetryData.qw, window.telemetryData.qx, window.telemetryData.qy, window.telemetryData.qz);
                    const mapped = eulRaw ? window.applyModelMappingToEuler(eulRaw) : { pitch: 0, yaw: 0, roll: 0 };
                    // Używamy tylko pitch jako przechył dla prostoty; pełne odwzorowanie kwaternionu można dodać później
                    // Tworzymy kwaternion z mapped (kolejność YXZ jak w oryginale)
                    const qMappedEuler = new THREE.Quaternion().setFromEuler(new THREE.Euler(
                        THREE.MathUtils.degToRad(mapped.pitch),
                        THREE.MathUtils.degToRad(mapped.yaw),
                        THREE.MathUtils.degToRad(mapped.roll),
                        'YXZ'
                    ));
                    window.robotPivot.quaternion.slerp(qMappedEuler, 0.35);
                    // Debug log - usuń po sprawdzeniu
                    console.log('[3D] Robot rotation updated:', { raw: eulRaw, mapped, quaternion: window.robotPivot.quaternion });
                } catch (err) { console.error('[3D] Error updating rotation:', err); }
            } else {
                console.log('[3D] No quaternion data in telemetryData');
            }
            window.robotPivot.position.y = 4.4;
            const ppr = parseFloat(document.getElementById('encoderPprInput')?.value) || 820;
            const wheelRotationL = (window.currentEncoderLeft / ppr) * 2 * Math.PI;
            const wheelRotationR = (window.currentEncoderRight / ppr) * 2 * Math.PI;
            if (window.leftWheel) window.leftWheel.rotation.z = -wheelRotationL;
            if (window.rightWheel) window.rightWheel.rotation.z = -wheelRotationR;
            // Debug log for wheels
            console.log('[3D] Wheel rotations:', { left: wheelRotationL, right: wheelRotationR, encoders: { left: window.currentEncoderLeft, right: window.currentEncoderRight } });
        };
    }

    if (typeof window.animate3D === 'undefined') {
        window.animate3D = function () {
            requestAnimationFrame(window.animate3D);
            try { window.update3DAnimation(); } catch (_) { }
            if (window.skyDome) window.skyDome.rotation.y += 0.00005;
            if (window.controls3D && window.renderer3D && window.scene3D && window.camera3D) {
                window.controls3D.update();
                window.renderer3D.render(window.scene3D, window.camera3D);
            }
        };
    }

    // ==== IMPLEMENTACJA setupControls3D JEŚLI BRAK ====
    if (typeof window.setupControls3D === 'undefined') {
        window.setupControls3D = function () {
            const resetBtn = document.getElementById('reset3dViewBtn') || document.getElementById('reset3DViewBtn');
            const animBtn = document.getElementById('toggle3dAnimationBtn') || document.getElementById('toggle3DAnimationBtn');
            const moveBtn = document.getElementById('toggle3dMovementBtn') || document.getElementById('toggle3DMovement') || document.getElementById('toggle3dMovement');
            if (resetBtn && !resetBtn.__rbBound) {
                resetBtn.__rbBound = true;
                resetBtn.addEventListener('click', () => {
                    if (!window.camera3D || !window.controls3D) return;
                    window.camera3D.position.set(28, 22, 48);
                    window.controls3D.target.set(0, 8, 0);
                    window.controls3D.update();
                });
            }
            if (animBtn && !animBtn.__rbBound) {
                animBtn.__rbBound = true;
                animBtn.addEventListener('click', () => { window.isAnimation3DEnabled = !window.isAnimation3DEnabled; });
            }
            if (moveBtn && !moveBtn.__rbBound) {
                moveBtn.__rbBound = true;
                moveBtn.addEventListener('click', () => {
                    window.isMovement3DEnabled = !window.isMovement3DEnabled;
                    // Reset baseline to avoid visual jumps when toggling movement
                    window.lastEncoderAvg = (window.currentEncoderLeft + window.currentEncoderRight) / 2;
                    try { addLogMessage(`[UI] 3D movement ${window.isMovement3DEnabled ? 'enabled' : 'disabled'}`, 'info'); } catch (e) { }
                });
            }
        };
    }
    // Fallback: update connection dot/text if main bundle isn't present and appStore exists
    try {
        if (typeof appStore !== 'undefined' && typeof appStore.subscribe === 'function') {
            appStore.subscribe('connection.isConnected', (value) => {
                try {
                    document.body.classList.toggle('ui-locked', !value);
                    const connDot = document.getElementById('connectionDot');
                    if (connDot) connDot.className = 'status-dot ' + (value ? 'status-ok' : 'status-disconnected');
                    const connText = document.getElementById('connectionText');
                    if (connText) connText.textContent = value ? 'Połączony' : 'Rozłączony';
                    document.querySelectorAll('.dpad-btn').forEach(btn => { try { btn.disabled = !value; } catch (e) { } });
                } catch (e) { /* no-op */ }
            });
        }
    } catch (e) { /* ignore if appStore missing */ }

    // ==== FALLBACK KOMUNIKACJI sendBleMessage / sendBleCommand / connectBLE JEŚLI BRAK ====
    if (typeof window.sendBleMessage === 'undefined') {
        window.sendBleMessage = function (msg) {
            try {
                // Prefer the new communication layer if available and actually connected
                if (typeof commLayer !== 'undefined' && commLayer && typeof commLayer.send === 'function' && typeof commLayer.getConnectionStatus === 'function') {
                    if (commLayer.getConnectionStatus()) {
                        commLayer.send(msg);
                        return;
                    }
                }
                // Also allow using appStore if present
                if (typeof appStore !== 'undefined' && appStore.getState && appStore.getState('connection.isConnected')) {
                    if (typeof commLayer !== 'undefined' && commLayer && typeof commLayer.send === 'function') {
                        commLayer.send(msg);
                        return;
                    }
                }
            } catch (err) {
                console.warn('[ui_core] sendBleMessage forwarding to commLayer failed:', err, 'Message=', msg);
            }
            // Fallback behaviour: warn and keep compatibility
            console.warn('[ui_core] sendBleMessage fallback (brak warstwy BLE lub brak połączenia). Message=', msg);
        };
    }

    // === BACKWARDS COMPATIBILITY: parameterMapping and generic handlers ===
    if (typeof window.parameterMapping === 'undefined') {
        window.parameterMapping = {
            // Balance PID
            'balanceKp': 'kp_b', 'balanceKi': 'ki_b', 'balanceKd': 'kd_b', 'balanceFilterAlpha': 'balance_pid_derivative_filter_alpha', 'balanceIntegralLimit': 'balance_pid_integral_limit',
            // Trim
            'manualPitchCorrectionInput': 'trim_angle', 'manualRollCorrectionInput': 'roll_trim',
            // Speed PID
            'speedKp': 'kp_s', 'speedKi': 'ki_s', 'speedKd': 'kd_s', 'speedFilterAlpha': 'speed_pid_filter_alpha', 'maxTargetAngle': 'max_target_angle_from_speed_pid', 'speedIntegralLimit': 'speed_pid_integral_limit', 'speedDeadband': 'speed_pid_deadband',
            // Position PID
            'positionKp': 'kp_p', 'positionKi': 'ki_p', 'positionKd': 'kd_p', 'positionFilterAlpha': 'position_pid_filter_alpha', 'maxTargetSpeed': 'max_target_speed_from_pos_pid', 'positionIntegralLimit': 'position_pid_integral_limit', 'positionDeadband': 'position_pid_deadband',
            // Rotation/Heading/Other
            'rotationKp': 'kp_r', 'rotationKd': 'kd_r', 'headingKp': 'kp_h', 'headingKi': 'ki_h', 'headingKd': 'kd_h', 'rotationToPwmScale': 'rotation_to_pwm_scale',
            // Joystick & mechanical
            'joystickAngleSensitivityInput': 'joystick_angle_sensitivity', 'joystickSensitivityInput': 'joystick_sensitivity', 'expoJoystickInput': 'expo_joystick', 'maxSpeedJoystickInput': 'max_speed_joystick', 'maxAccelJoystickInput': 'max_accel_joystick', 'turnFactorInput': 'turn_factor', 'joystickDeadzoneInput': 'joystick_deadzone',
            'wheelDiameterInput': 'wheel_diameter_cm', 'trackWidthInput': 'track_width_cm', 'encoderPprInput': 'encoder_ppr', 'minPwmLeftFwdInput': 'min_pwm_left_fwd', 'minPwmLeftBwdInput': 'min_pwm_left_bwd', 'minPwmRightFwdInput': 'min_pwm_right_fwd', 'minPwmRightBwdInput': 'min_pwm_right_bwd',
            // Autotuning search space
            'search-kp-min': 'space_kp_min', 'search-kp-max': 'space_kp_max', 'search-ki-min': 'space_ki_min', 'search-ki-max': 'space_ki_max', 'search-kd-min': 'space_kd_min', 'search-kd-max': 'space_kd_max', 'include-ki-checkbox': 'search_ki',
            // Safety/weights
            'safetyMaxAngle': 'safety_max_angle', 'safetyMaxSpeed': 'safety_max_speed', 'safetyMaxPwm': 'safety_max_pwm',
            'ga-weight-itae': 'weights_itae', 'ga-weight-overshoot': 'weights_overshoot', 'ga-weight-control-effort': 'weights_control_effort',
            'ga-generations': 'ga_generations', 'ga-population': 'ga_population', 'ga-elitism': 'ga_elitism', 'ga-adaptive': 'ga_adaptive', 'ga-convergence-check': 'ga_convergence_check',
            // Backward-compatible id: UI shows 'ga-mutation' id (percent) -> firmware 'ga_mutation_rate'
            'ga-mutation': 'ga_mutation_rate',
            // Additional tuning controls (note: some are runtime-only and not EEPROM stored)
            'pso-iterations': 'pso_iterations', 'pso-particles': 'pso_particles', 'pso-inertia': 'pso_inertia', 'pso-adaptive-inertia': 'pso_adaptive_inertia', 'pso-velocity-clamp': 'pso_velocity_clamp', 'pso-neighborhood': 'pso_neighborhood',
            'zn-amplitude': 'zn_amplitude', 'tuning_trial_duration_ms': 'tuning_trial_duration_ms',
            // Madgwick/IMU
            'useMadgwickFilterInput': 'use_madgwick_filter', 'madgwickBetaInput': 'madgwick_beta', 'madgwickZetaInput': 'madgwick_zeta',
            // Magnetometer (UI is positive = enabled) -> firmware is disable_magnetometer (inverse)
            'magnetometerEnabledInput': 'disable_magnetometer'
        };
    }

    // Debounce helper fallback
    if (typeof window.debounce === 'undefined') {
        window.debounce = function (func, delay) {
            let timeout;
            return function (...args) {
                const context = this;
                clearTimeout(timeout);
                timeout = setTimeout(() => func.apply(context, args), delay);
            };
        };
    }

    if (typeof window.getDecimalPlaces === 'undefined') {
        window.getDecimalPlaces = function (num) {
            const match = ('' + num).match(/(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/);
            if (!match) return 0;
            return Math.max(0, (match[1] ? match[1].length : 0) - (match[2] ? +match[2] : 0));
        };
    }

    if (typeof window.applySingleParam === 'undefined') {
        window.applySingleParam = function (snakeKey, value) {
            try {
                // Map to inputId
                const inputId = Object.keys(window.parameterMapping).find(id => window.parameterMapping[id] === snakeKey);
                if (!inputId) return;
                const el = document.getElementById(inputId);
                if (!el) return;
                // Special conversion for some keys
                let displayValue = value;
                const multiply100Keys = ['turn_factor', 'expo_joystick', 'joystick_sensitivity', 'joystick_deadzone', 'balance_pid_derivative_filter_alpha', 'speed_pid_filter_alpha', 'position_pid_filter_alpha', 'weights_itae', 'weights_overshoot', 'weights_control_effort'];
                if (multiply100Keys.includes(snakeKey)) displayValue = Number(value) * 100.0;
                if (snakeKey === 'tuning_trial_duration_ms') displayValue = Number(value) / 1000.0; // ms -> s
                if (snakeKey === 'disable_magnetometer' && el.type === 'checkbox') { // inverse
                    el.checked = !Boolean(value);
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    return;
                }
                if (el.type === 'checkbox') {
                    el.checked = !!displayValue;
                } else if (el.tagName === 'SELECT') {
                    el.value = String(displayValue);
                } else {
                    el.value = (typeof displayValue === 'number') ? Number(displayValue).toFixed(getDecimalPlaces(el.step || '1')) : displayValue;
                }
                // Update UI and trigger change to let existing listeners handle persistence
                try { el.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) { /* no-op */ }
            } catch (err) {
                console.warn('[ui_core] applySingleParam error', err, snakeKey, value);
            }
        };
    }

    if (typeof window.applySingleAutotuneParam === 'undefined') {
        window.applySingleAutotuneParam = function (snakeKey, value) {
            try {
                const inputId = Object.keys(window.parameterMapping).find(id => window.parameterMapping[id] === snakeKey);
                if (!inputId) return;
                const el = document.getElementById(inputId);
                if (!el) return;
                let displayValue = value;
                if (snakeKey.startsWith('weights_')) displayValue = Number(value) * 100.0;
                if (snakeKey === 'ga_mutation_rate' || snakeKey === 'ga_crossover_rate') displayValue = Number(value) * 100.0;
                if (snakeKey === 'tuning_trial_duration_ms') displayValue = Number(value) / 1000.0;
                if (el.type === 'checkbox') el.checked = !!displayValue; else el.value = displayValue;
                try { el.dispatchEvent(new Event('change', { bubbles: true })); } catch (_) { }
            } catch (err) {
                console.warn('[ui_core] applySingleAutotuneParam error', err, snakeKey, value);
            }
        };
    }

    if (typeof window.applyFullConfig === 'undefined') {
        window.applyFullConfig = function (params) {
            if (!params || typeof params !== 'object') return;
            for (const [key, value] of Object.entries(params)) {
                // Tuning params handled separately
                if ((key || '').toString().startsWith('space_') || key.startsWith('ga_') || key.startsWith('pso_') || key.startsWith('zn_') || key.startsWith('weights_') || key === 'search_ki' || key === 'tuning_trial_duration_ms') {
                    window.applySingleAutotuneParam(key, value);
                } else {
                    window.applySingleParam(key, value);
                }
            }
        };
    }

    if (typeof window.setupParameterListeners === 'undefined') {
        window.setupParameterListeners = function () {
            const sendParam = (snakeKey, rawValue) => {
                if (AppState && AppState.isApplyingConfig) return;
                let value = rawValue;
                // Convert display value back to firmware units
                const divide100Keys = ['turn_factor', 'expo_joystick', 'joystick_sensitivity', 'joystick_deadzone', 'balance_pid_derivative_filter_alpha', 'speed_pid_filter_alpha', 'position_pid_filter_alpha', 'weights_itae', 'weights_overshoot', 'weights_control_effort', 'ga_mutation_rate', 'ga_crossover_rate'];
                if (divide100Keys.includes(snakeKey)) value = Number(rawValue) / 100.0;
                if (snakeKey === 'tuning_trial_duration_ms') value = Math.round(Number(rawValue) * 1000.0);
                if (snakeKey === 'disable_magnetometer' && typeof rawValue === 'boolean') value = rawValue ? 0.0 : 1.0; // invert: UI true -> disable=0
                // Identify whether it's tuning config
                if (snakeKey && (snakeKey.startsWith('space_') || snakeKey.startsWith('ga_') || snakeKey.startsWith('pso_') || snakeKey.startsWith('zn_') || snakeKey.startsWith('weights_') || snakeKey === 'search_ki' || snakeKey === 'tuning_trial_duration_ms')) {
                    sendBleMessage({ type: 'set_tuning_config_param', key: snakeKey, value });
                } else {
                    sendBleMessage({ type: 'set_param', key: snakeKey, value });
                }
            };

            const debouncedSendParam = window.debounce(sendParam, 300);
            for (const [inputId, snakeKey] of Object.entries(window.parameterMapping)) {
                const el = document.getElementById(inputId);
                if (!el) continue;
                if (el.type === 'checkbox') {
                    el.addEventListener('change', (e) => {
                        const checked = e.target.checked;
                        debouncedSendParam(snakeKey, checked);
                    });
                } else if (el.tagName === 'SELECT') {
                    el.addEventListener('change', (e) => { debouncedSendParam(snakeKey, e.target.value); });
                } else {
                    el.addEventListener('change', (e) => {
                        const v = parseFloat(e.target.value);
                        debouncedSendParam(snakeKey, isFinite(v) ? v : e.target.value);
                    });
                }
            }
            // Special handling: joystick/manual buttons already wired elsewhere; ensure they use sendBleMessage
            // Autotune toggles (include-ki-checkbox) - ensure change sends set_tuning_config_param
            const kiChk = document.getElementById('include-ki-checkbox'); if (kiChk) kiChk.addEventListener('change', (e) => { sendBleMessage({ type: 'set_tuning_config_param', key: 'search_ki', value: e.target.checked }); });

            // Fallback listeners for IMU & Model mapping (set_imu_mapping/set_model_mapping)
            if (typeof window.gatherIMUMappingFromUI === 'undefined') {
                window.getActiveSign = function (containerId) {
                    try {
                        const cont = document.getElementById(containerId);
                        if (!cont) return 1;
                        const active = cont.querySelector('button.active');
                        if (!active) return 1;
                        return parseInt(active.dataset.sign) || 1;
                    } catch (e) { return 1; }
                };
                window.gatherIMUMappingFromUI = function () {
                    return {
                        pitch: { source: parseInt(document.getElementById('imuPitchSource')?.value || '0'), sign: parseInt(window.getActiveSign('imuPitchSign')) },
                        yaw: { source: parseInt(document.getElementById('imuYawSource')?.value || '1'), sign: parseInt(window.getActiveSign('imuYawSign')) },
                        roll: { source: parseInt(document.getElementById('imuRollSource')?.value || '2'), sign: parseInt(window.getActiveSign('imuRollSign')) }
                    };
                };
            }
            if (typeof window.gatherModelMappingFromUI === 'undefined') {
                window.gatherModelMappingFromUI = function () {
                    return {
                        pitch: { source: parseInt(document.getElementById('modelPitchSource')?.value || '0'), sign: parseInt(window.getActiveSign('modelPitchSign')) },
                        yaw: { source: parseInt(document.getElementById('modelYawSource')?.value || '1'), sign: parseInt(window.getActiveSign('modelYawSign')) },
                        roll: { source: parseInt(document.getElementById('modelRollSource')?.value || '2'), sign: parseInt(window.getActiveSign('modelRollSign')) }
                    };
                };
            }

            // Attach listeners for IMU mapping selects and sign toggles (if not already bound by main.js)
            ['imuPitchSource', 'imuYawSource', 'imuRollSource'].forEach((id) => {
                const el = document.getElementById(id);
                if (!el) return;
                if (el.__rbBound) return;
                el.__rbBound = true;
                el.addEventListener('change', () => {
                    try {
                        const mapping = window.gatherIMUMappingFromUI();
                        window.sendBleMessage({ type: 'set_imu_mapping', mapping });
                        addLogMessage('[UI] Wyslano mapowanie IMU (set_imu_mapping)', 'info');
                    } catch (e) { /* ignore if no comm layer */ }
                });
            });
            ['imuPitchSign', 'imuYawSign', 'imuRollSign'].forEach((containerId) => {
                const cont = document.getElementById(containerId);
                if (!cont) return;
                if (cont.__rbBound) return;
                cont.__rbBound = true;
                cont.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
                    // toggle active class
                    cont.querySelectorAll('button').forEach(bb => bb.classList.remove('active'));
                    b.classList.add('active');
                    try { const mapping = window.gatherIMUMappingFromUI(); window.sendBleMessage({ type: 'set_imu_mapping', mapping }); addLogMessage('[UI] Wyslano mapowanie IMU (set_imu_mapping)', 'info'); } catch (e) { }
                }));
            });

            // Attach listeners for Model mapping selects and sign toggles
            ['modelPitchSource', 'modelYawSource', 'modelRollSource'].forEach((id) => {
                const el = document.getElementById(id);
                if (!el) return;
                if (el.__rbBound) return;
                el.__rbBound = true;
                el.addEventListener('change', () => {
                    try { const mapping = window.gatherModelMappingFromUI(); window.sendBleMessage({ type: 'set_model_mapping', mapping }); addLogMessage('[UI] Wyslano mapowanie modelu (set_model_mapping)', 'info'); } catch (e) { }
                });
            });
            // Fallback axis selectors for gamepad mapping
            ['axis-x-select', 'axis-y-select'].forEach((id) => {
                const el = document.getElementById(id);
                if (!el) return;
                if (el.__rbBound) return;
                el.__rbBound = true;
                el.addEventListener('change', (e) => {
                    try {
                        window.gamepadAxisMapping = window.gamepadAxisMapping || { x: -1, y: -1 };
                        if (id === 'axis-x-select') window.gamepadAxisMapping.x = parseInt(e.target.value || -1);
                        else window.gamepadAxisMapping.y = parseInt(e.target.value || -1);
                        addLogMessage(`[UI] Gamepad axis mapping updated: ${JSON.stringify(window.gamepadAxisMapping)}`, 'info');
                    } catch (e) { /* no-op */ }
                });
            });
            ['modelPitchSign', 'modelYawSign', 'modelRollSign'].forEach((containerId) => {
                const cont = document.getElementById(containerId);
                if (!cont) return;
                if (cont.__rbBound) return;
                cont.__rbBound = true;
                cont.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
                    cont.querySelectorAll('button').forEach(bb => bb.classList.remove('active'));
                    b.classList.add('active');
                    try { const mapping = window.gatherModelMappingFromUI(); window.sendBleMessage({ type: 'set_model_mapping', mapping }); addLogMessage('[UI] Wyslano mapowanie modelu (set_model_mapping)', 'info'); } catch (e) { }
                }));
            });
        };
    }

    // If DOM is already loaded, ensure listeners set up, otherwise add a hook
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        try { window.setupParameterListeners(); } catch (e) { /* no-op */ }
    } else {
        document.addEventListener('DOMContentLoaded', () => { try { window.setupParameterListeners(); } catch (e) { /* no-op */ } });
    }
    if (typeof window.sendBleCommand === 'undefined') {
        window.sendBleCommand = function (type, payload) {
            window.sendBleMessage(Object.assign({ type: type }, payload || {}));
        };
    }
    if (typeof window.connectBLE === 'undefined') {
        window.connectBLE = async function () {
            addLogMessage('[UI] Fallback connectBLE: brak warstwy BLE.', 'warn');
            return false;
        };
    }

    // Inicjalizacja po DOM
    document.addEventListener('DOMContentLoaded', () => {
        // Diagnostyka obecności przycisku i modala BLE
        const dbgConnectBtn = document.getElementById('connectBleBtn');
        const dbgExistingModal = document.getElementById('ble-connect-modal');
        console.log('[UI_CORE] BLE connect button found:', !!dbgConnectBtn, 'modal present:', !!dbgExistingModal);
        if (!dbgExistingModal) {
            console.warn('[UI_CORE] #ble-connect-modal nie istnieje w HTML – tworzę fallback dynamicznie.');
            const m = document.createElement('div');
            m.id = 'ble-connect-modal';
            m.className = 'modal-backdrop';
            m.style.display = 'none';
            m.innerHTML = '<div class="modal-content" style="max-width:420px;">\n                <h2>Połącz z Robotem (BLE)</h2>\n                <p style="text-align:left; font-size:0.9em; line-height:1.4;">Upewnij się, że robot jest włączony i widoczny pod nazwą <strong>RoboBala</strong>. Kliknij <em>Skanuj</em>, a następnie wybierz urządzenie.</p>\n                <div id="ble-status-line" style="margin:8px 0; color:#61dafb; font-family:monospace;">Status: Oczekuje...</div>\n                <div style="display:flex; gap:10px; margin-top:4px;">\n                    <button id="ble-scan-btn" style="flex:1; background:#61dafb;">Skanuj</button>\n                    <button id="ble-cancel-btn" style="flex:1; background:#ff6347;">Zamknij</button>\n                </div>\n                <div style="margin-top:12px; font-size:0.75em; color:#aaa; text-align:left;">Wymagana obsługa Web Bluetooth (Chrome / Edge). W środowisku bez HTTPS połączenie może być blokowane.</div>\n            </div>';
            document.body.appendChild(m);
        }
        // Joystick (funkcja initJoystick dostarczona przez ui_components.js)
        if (typeof window.initJoystick === 'function') {
            try { window.initJoystick(); } catch (e) { console.warn('initJoystick error', e); }
            window.addEventListener('resize', () => { try { window.initJoystick(); } catch (e) { } });
            // Podpięcie eventów ruchu (o ile nie zrobił tego inny moduł)
            const jc = document.getElementById('joystickCanvas');
            if (jc && !jc.__rbBound) {
                jc.__rbBound = true;
                jc.addEventListener('mousedown', handleJoystickStart); document.addEventListener('mousemove', handleJoystickMove); document.addEventListener('mouseup', handleJoystickEnd);
                jc.addEventListener('touchstart', handleJoystickStart, { passive: false }); document.addEventListener('touchmove', handleJoystickMove, { passive: false }); document.addEventListener('touchend', handleJoystickEnd); document.addEventListener('touchcancel', handleJoystickEnd);
            }
        }
        // Wizualizacja 3D
        if (typeof window.init3DVisualization === 'function') {
            try { window.init3DVisualization(); window.setupControls3D?.(); window.animate3D(); addLogMessage('[UI] 3D wizualizacja zainicjalizowana.', 'info'); } catch (e) { console.warn('init3DVisualization error', e); }
        }

        // ==== Fallback modal BLE (otwieranie) ====
        const bleBtn = document.getElementById('connectBleBtn');
        const bleModal = document.getElementById('ble-connect-modal');
        if (bleBtn && bleModal && !bleBtn.__rbBleBound) {
            bleBtn.__rbBleBound = true;
            bleBtn.addEventListener('click', () => {
                bleModal.style.display = 'flex';
                const line = document.getElementById('ble-status-line');
                if (line) line.textContent = 'Status: Oczekuje na akcję...';
                console.log('[UI_CORE] Otwarto modal BLE.');
            });
            const scanBtn = document.getElementById('ble-scan-btn');
            const cancelBtn = document.getElementById('ble-cancel-btn');
            if (scanBtn && !scanBtn.__rbBleBound) {
                scanBtn.__rbBleBound = true;
                scanBtn.addEventListener('click', async () => {
                    const line = document.getElementById('ble-status-line');
                    if (line) line.textContent = 'Status: Łączenie...';
                    let ok = false;
                    if (typeof window.connectBLE === 'function') {
                        try { ok = await window.connectBLE(); } catch (e) { console.warn('connectBLE error', e); }
                    }
                    if (line) line.textContent = ok ? 'Status: Połączono.' : 'Status: Błąd połączenia.';
                    if (ok) setTimeout(() => { bleModal.style.display = 'none'; }, 800);
                    console.log('[UI_CORE] Wynik próby połączenia BLE:', ok);
                });
            }
            if (cancelBtn && !cancelBtn.__rbBleBound) {
                cancelBtn.__rbBleBound = true;
                cancelBtn.addEventListener('click', () => { bleModal.style.display = 'none'; });
            }
        }
    });

    // ==== VIEW PAGER - Dwustronicowy pager ====
    let currentPage = 1; // 1 = main-page, 2 = dynamic-page
    let touchStartX = 0;
    let touchStartY = 0;
    let isSwiping = false;
    let currentDeltaX = 0; // Aktualne przesunięcie w px

    const viewPager = document.getElementById('view-pager');

    window.switchToPage = function (page, instant = false) {
        if (page === currentPage) return;
        currentPage = page;

        const mainPage = document.getElementById('main-page');
        const dynamicPage = document.getElementById('dynamic-page');

        if (page === 1) {
            mainPage.classList.add('main-visible');
            mainPage.classList.remove('main-hidden');
            dynamicPage.classList.add('dynamic-hidden');
            dynamicPage.classList.remove('dynamic-visible');
        } else {
            mainPage.classList.add('main-hidden');
            mainPage.classList.remove('main-visible');
            dynamicPage.classList.add('dynamic-visible');
            dynamicPage.classList.remove('dynamic-hidden');
        }

        // Wyczyść inline transformy natychmiast po przełączeniu
        mainPage.style.transform = '';
        dynamicPage.style.transform = '';

        currentDeltaX = 0;
        console.log('[VIEW_PAGER] Przełączono na stronę:', page);
    };

    // Obsługa swipe gestów z płynną animacją
    document.addEventListener('touchstart', (e) => {
        const screenWidth = window.innerWidth;
        const touchX = e.touches[0].clientX;

        // Swipe tylko przy krawędziach ekranu (50px od brzegu)
        const isNearEdge = touchX < 50 || touchX > screenWidth - 50;
        if (!isNearEdge) return; // Ignoruj swipe nie przy krawędzi

        touchStartX = touchX;
        touchStartY = e.touches[0].clientY;
        isSwiping = false;
        // Usuń transition podczas drag
        const mainPage = document.getElementById('main-page');
        const dynamicPage = document.getElementById('dynamic-page');
        mainPage.style.transition = 'none';
        dynamicPage.style.transition = 'none';
    });

    document.addEventListener('touchmove', (e) => {
        if (!touchStartX || !touchStartY) return;
        const touchX = e.touches[0].clientX;
        const touchY = e.touches[0].clientY;
        const deltaX = touchX - touchStartX;
        const deltaY = touchY - touchStartY;

        // Sprawdź czy to poziomy swipe
        if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) {
            isSwiping = true;
            e.preventDefault(); // Zapobiegaj scrollowaniu

            const mainPage = document.getElementById('main-page');
            const dynamicPage = document.getElementById('dynamic-page');
            const screenWidth = window.innerWidth;

            // Oblicz przesunięcie z ograniczeniami
            let translateX = deltaX;
            currentDeltaX = translateX;

            if (currentPage === 1) {
                // Na stronie głównej: można swipować tylko w lewo (do strony 2), w prawo - brak przesunięcia
                if (translateX > 0) {
                    translateX = 0; // Pełne ograniczenie - brak przesunięcia w prawo
                } else {
                    translateX = Math.max(-screenWidth, translateX); // Ogranicz do maksymalnie szerokości ekranu w lewo
                }
                mainPage.style.transform = `translateX(${translateX}px)`;
                dynamicPage.style.transform = `translateX(${screenWidth + translateX}px)`;
            } else {
                // Na stronie dynamicznej: można swipować tylko w prawo (do strony 1), w lewo - brak przesunięcia
                if (translateX < 0) {
                    translateX = 0; // Pełne ograniczenie - brak przesunięcia w lewo
                } else {
                    translateX = Math.min(screenWidth, translateX); // Ogranicz do maksymalnie szerokości ekranu w prawo
                }
                dynamicPage.style.transform = `translateX(${translateX}px)`;
                mainPage.style.transform = `translateX(${-screenWidth + translateX}px)`;
            }
        }
    });

    document.addEventListener('touchend', (e) => {
        if (!isSwiping || !touchStartX) return;
        const touchEndX = e.changedTouches[0].clientX;
        const deltaX = touchEndX - touchStartX;

        // Przywróć transition
        const mainPage = document.getElementById('main-page');
        const dynamicPage = document.getElementById('dynamic-page');
        mainPage.style.transition = 'transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
        dynamicPage.style.transition = 'transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)';

        if (Math.abs(deltaX) > window.innerWidth * 0.1) { // Minimalny dystans dla przełączenia (10% szerokości ekranu)
            if (deltaX > 0 && currentPage === 2) {
                // Swipe w prawo - wróć do strony głównej
                window.switchToPage(1);
            } else if (deltaX < 0 && currentPage === 1) {
                // Swipe w lewo - przejdź do dynamicznej strony
                window.switchToPage(2);
            } else {
                // Wróć do aktualnej strony
                window.switchToPage(currentPage);
            }
        } else {
            // Wróć do aktualnej strony
            window.switchToPage(currentPage);
        }
        touchStartX = 0;
        touchStartY = 0;
        isSwiping = false;
    });

    // Funkcja do ładowania treści na dynamicznej stronie
    window.loadDynamicContent = function (tabId) {
        const dynamicPage = document.getElementById('dynamic-page');
        if (!dynamicPage) return;

        // Mapowanie tabId na ID sekcji
        const viewIdMap = {
            'pid-tuning': 'viewPidTuning',
            'calibration': 'viewCalibration',
            'autonomous': 'viewAutonomous',
            'autotuning': 'viewAutotuning',
            'diagnostics': 'viewDiagnostics',
            '3d': 'view3D',
            'settings': 'viewSettings'
        };

        const sectionId = viewIdMap[tabId];
        if (!sectionId) {
            dynamicPage.innerHTML = `
                <div class="card" style="text-align: center; padding: 2rem;">
                    <h2>Zakładka: ${tabId}</h2>
                    <p>Nie znaleziono treści dla tej zakładki.</p>
                    <button onclick="switchToPage(1)" class="btn btn-secondary">Wróć do pulpitu</button>
                </div>
            `;
            console.log('[VIEW_PAGER] Nieznana zakładka:', tabId);
            return;
        }

        const sourceSection = document.getElementById(sectionId);
        if (!sourceSection) {
            dynamicPage.innerHTML = `
                <div class="card" style="text-align: center; padding: 2rem;">
                    <h2>Zakładka: ${tabId}</h2>
                    <p>Sekcja ${sectionId} nie została znaleziona.</p>
                    <button onclick="switchToPage(1)" class="btn btn-secondary">Wróć do pulpitu</button>
                </div>
            `;
            console.log('[VIEW_PAGER] Sekcja nie znaleziona:', sectionId);
            return;
        }

        // Skopiuj zawartość sekcji
        dynamicPage.innerHTML = sourceSection.innerHTML;
        console.log('[VIEW_PAGER] Załadowano zakładkę:', tabId, 'z sekcji:', sectionId);
    };

})();
