// ========================================================================
// STATE MANAGER - Centralized State Management (ES6 Module)
// ========================================================================
// Centralny magazyn stanu aplikacji z wzorcem observer dla reaktywnych
// aktualizacji. Zastępuje rozproszone zmienne globalne jednym źródłem prawdy.
// ========================================================================

// Helpers
export function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * AppStore - Centralny menedżer stanu aplikacji
 * Implementuje wzorzec observer dla reaktywnych aktualizacji stanu
 */
export class AppStore {
    constructor() {
        this.state = {
            // Telemetry data
            telemetry: {
                pitch: 0, roll: 0, yaw: 0, speed: 0,
                encoderLeft: 0, encoderRight: 0, loopTime: 0,
                qw: 0, qx: 0, qy: 0, qz: 0
            },
            // Tuning state
            tuning: {
                isActive: false, activeMethod: '', isPaused: false
            },
            // Sequence state
            sequence: {
                isRunning: false, currentStep: 0
            },
            // Temporary sync data
            sync: {
                tempParams: {}, tempTuningParams: {}, tempStates: {}
            },
            // Joystick state
            joystick: {
                isDragging: false, lastSendTime: 0
            },
            // Gamepad state
            gamepad: {
                index: null, lastState: [], mappings: {},
                isMappingButton: false, actionToMap: null
            }
        };
        this.listeners = new Map();
        this.nextListenerId = 0;
    }

    getState(path = null) {
        if (!path) return this.state;
        const keys = path.split('.');
        let value = this.state;
        for (const key of keys) {
            if (value && typeof value === 'object' && key in value) {
                value = value[key];
            } else {
                return undefined;
            }
        }
        return value;
    }

    setState(path, value = undefined) {
        let updates = {};
        if (typeof path === 'object' && value === undefined) {
            updates = path;
        } else {
            updates[path] = value;
        }

        const changedPaths = [];
        for (const [updatePath, updateValue] of Object.entries(updates)) {
            const keys = updatePath.split('.');
            let current = this.state;
            for (let i = 0; i < keys.length - 1; i++) {
                const key = keys[i];
                if (!(key in current)) {
                    current[key] = {};
                }
                current = current[key];
            }
            const lastKey = keys[keys.length - 1];
            if (current[lastKey] !== updateValue) {
                current[lastKey] = updateValue;
                changedPaths.push(updatePath);
            }
        }

        if (changedPaths.length > 0) {
            this.notifyListeners(changedPaths);
        }
    }

    subscribe(paths, callback) {
        const id = this.nextListenerId++;
        const pathArray = Array.isArray(paths) ? paths : [paths];
        this.listeners.set(id, { paths: pathArray, callback });
        return id;
    }

    unsubscribe(id) {
        this.listeners.delete(id);
    }

    notifyListeners(changedPaths) {
        for (const [id, listener] of this.listeners.entries()) {
            const { paths, callback } = listener;
            for (const watchPath of paths) {
                for (const changedPath of changedPaths) {
                    if (changedPath === watchPath ||
                        changedPath.startsWith(watchPath + '.') ||
                        watchPath.startsWith(changedPath + '.')) {
                        try {
                            const newValue = this.getState(changedPath);
                            callback(newValue, changedPath);
                        } catch (error) {
                            console.error(`Error in state listener ${id}:`, error);
                        }
                        break;
                    }
                }
            }
        }
    }

    reset() {
        this.setState({
            'connection.isConnected': false,
            'connection.isSynced': false,
            'connection.deviceName': null,
            'robot.state': 'IDLE',
            'robot.balancing': false,
            'robot.holdingPosition': false,
            'robot.speedMode': false,
            'ui.isLocked': true,
            'tuning.isActive': false,
            'tuning.activeMethod': '',
            'tuning.isPaused': false,
            'sequence.isRunning': false,
            'sequence.currentStep': 0
        });
    }

    batchUpdate(updates) {
        this.setState(updates);
    }
}

// Singleton instance
export const appStore = new AppStore();

// AppState proxy - backward compatibility wrapper
const stateMap = {
    'isConnected': 'connection.isConnected',
    'isSynced': 'connection.isSynced',
    'isApplyingConfig': 'ui.isApplyingConfig',
    'lastKnownRobotState': 'robot.state',
    'isSequenceRunning': 'sequence.isRunning',
    'isTuningActive': 'tuning.isActive',
    'activeTuningMethod': 'tuning.activeMethod',
    'syncTimeout': 'connection.syncTimeout',
    'isSyncingConfig': 'ui.isSyncingConfig',
    'tempParams': 'sync.tempParams',
    'tempTuningParams': 'sync.tempTuningParams',
    'tempStates': 'sync.tempStates'
};

export const AppState = new Proxy({}, {
    get(target, prop) {
        if (prop in stateMap) {
            return appStore.getState(stateMap[prop]);
        }
        return undefined;
    },
    set(target, prop, value) {
        if (prop in stateMap) {
            appStore.setState(stateMap[prop], value);
            return true;
        }
        return false;
    }
});

// REFACTORED: Consolidated parameter mapping - includes ALL configurable parameters
export const parameterMapping = {
    // PID parameters
    'balanceKpInput': 'kp_b', 'balanceKiInput': 'ki_b', 'balanceKdInput': 'kd_b',
    'balanceFilterAlphaInput': 'balance_pid_derivative_filter_alpha',
    'balanceIntegralLimitInput': 'balance_pid_integral_limit',
    'joystickAngleSensitivityInput': 'joystick_angle_sensitivity',
    'speedKpInput': 'kp_s', 'speedKiInput': 'ki_s', 'speedKdInput': 'kd_s',
    'speedFilterAlphaInput': 'speed_pid_filter_alpha',
    'maxTargetAngleInput': 'max_target_angle_from_speed_pid',
    'speedIntegralLimitInput': 'speed_pid_integral_limit',
    'speedDeadbandInput': 'speed_pid_deadband',
    'positionKpInput': 'kp_p', 'positionKiInput': 'ki_p', 'positionKdInput': 'kd_p',
    'positionFilterAlphaInput': 'position_pid_filter_alpha',
    'maxTargetSpeedInput': 'max_target_speed_from_pos_pid',
    'positionIntegralLimitInput': 'position_pid_integral_limit',
    'positionDeadbandInput': 'position_pid_deadband',
    'rotationKpInput': 'kp_r', 'rotationKdInput': 'kd_r',
    'headingKpInput': 'kp_h', 'headingKiInput': 'ki_h', 'headingKdInput': 'kd_h',
    'rotationToPwmScaleInput': 'rotation_to_pwm_scale',
    // Joystick and mechanical parameters
    'joystickSensitivityInput': 'joystick_sensitivity', 'expoJoystickInput': 'expo_joystick',
    'maxSpeedJoystickInput': 'max_speed_joystick', 'maxAccelJoystickInput': 'max_accel_joystick',
    'turnFactorInput': 'turn_factor', 'joystickDeadzoneInput': 'joystick_deadzone',
    'wheelDiameterInput': 'wheel_diameter_cm', 'trackWidthInput': 'track_width_cm',
    'encoderPprInput': 'encoder_ppr',
    'minPwmLeftFwdInput': 'min_pwm_left_fwd', 'minPwmLeftBwdInput': 'min_pwm_left_bwd',
    'minPwmRightFwdInput': 'min_pwm_right_fwd', 'minPwmRightBwdInput': 'min_pwm_right_bwd',
    // Auto-tuning parameters
    'safetyMaxAngle': 'safety_max_angle', 'safetyMaxSpeed': 'safety_max_speed',
    'safetyMaxPwm': 'safety_max_pwm',
    'ga-kp-min': 'space_kp_min', 'ga-kp-max': 'space_kp_max',
    'ga-ki-min': 'space_ki_min', 'ga-ki-max': 'space_ki_max',
    'ga-kd-min': 'space_kd_min', 'ga-kd-max': 'space_kd_max',
    'include-ki-checkbox': 'search_ki',
    'disableMagnetometerSwitch': 'disable_magnetometer',
    'ga-weight-itae': 'weights_itae', 'ga-weight-overshoot': 'weights_overshoot',
    'ga-weight-control-effort': 'weights_control_effort',
    'ga-generations': 'ga_generations', 'ga-population': 'ga_population',
    'ga-mutation-rate': 'ga_mutation_rate', 'ga-elitism': 'ga_elitism',
    'ga-adaptive': 'ga_adaptive', 'ga-convergence-check': 'ga_convergence_check',
    'pso-iterations': 'pso_iterations', 'pso-particles': 'pso_particles',
    'pso-inertia': 'pso_inertia', 'pso-adaptive-inertia': 'pso_adaptive_inertia',
    'pso-velocity-clamp': 'pso_velocity_clamp', 'pso-neighborhood': 'pso_neighborhood',
    // Mahony filter parameters
    'useMahonyFilterInput': 'use_mahony_filter', 'mahonyKpInput': 'mahony_kp',
    'mahonyKiInput': 'mahony_ki',
    // Angle prediction parameters
    'predictionModeInput': 'prediction_mode', 'predictionTimeMsInput': 'prediction_time_ms'
};

// Backward compatibility - expose on window
window.RB = window.RB || {};
window.RB.helpers = window.RB.helpers || {};
window.RB.helpers.delay = delay;
if (typeof window.delay === 'undefined') {
    window.delay = delay;
}
window.appStore = appStore;
window.AppState = AppState;
window.AppStore = AppStore;
window.parameterMapping = parameterMapping;
