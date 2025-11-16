// ========================================================================
// MAIN APPLICATION - Logika główna aplikacji
// ========================================================================
// Ten plik zawiera:
// - Inicjalizację globalnych zmiennych i stanu aplikacji (AppState)
// - Logikę połączenia Bluetooth (connectBLE, onDisconnected)
// - Główny parser wiadomości od robota (processCompleteMessage)
// - Logikę zarządzania sesją strojenia (startTuning, pauseTuning, stopTuning)
// - Główny event listener DOMContentLoaded, który łączy wszystkie moduły
// ========================================================================

// ========================================================================
// NEW: State Management & Communication Layer Integration
// ========================================================================
// Initialize communication layer
const SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
const RX_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a9";
const TX_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a8";
const commLayer = new BLECommunication(SERVICE_UUID, RX_UUID, TX_UUID);

// Backward compatibility wrapper for AppState
// This allows existing code to continue using AppState.property syntax
// while internally using the new state manager
const AppState = new Proxy({}, {
    get(target, prop) {
        // Map old property names to new state paths
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

        if (prop in stateMap) {
            return appStore.getState(stateMap[prop]);
        }
        return undefined;
    },
    set(target, prop, value) {
        // Map old property names to new state paths
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

        if (prop in stateMap) {
            appStore.setState(stateMap[prop], value);
            return true;
        }
        return false;
    }
});

let currentSequenceStep = 0; const MAX_SEQUENCE_STEPS = 15;

// === Montaż: proste przyciski wysyłające komendy do firmware ===
function openMountCalibModal() { document.getElementById('mount-calib-modal').style.display = 'flex'; }
function closeMountCalibModal() { document.getElementById('mount-calib-modal').style.display = 'none'; }
// Legacy IMU axis mapping wizard – completely removed in Quaternion-First UI
// (previous functions runWizardStep/processWizardTelemetry/finalizeMapping deleted)

// REFACTORED: Consolidated parameter mapping - includes ALL configurable parameters
const parameterMapping = {
    // PID parameters
    'balanceKpInput': 'kp_b', 'balanceKiInput': 'ki_b', 'balanceKdInput': 'kd_b', 'balanceFilterAlphaInput': 'balance_pid_derivative_filter_alpha', 'balanceIntegralLimitInput': 'balance_pid_integral_limit', 'joystickAngleSensitivityInput': 'joystick_angle_sensitivity', 'speedKpInput': 'kp_s', 'speedKiInput': 'ki_s', 'speedKdInput': 'kd_s', 'speedFilterAlphaInput': 'speed_pid_filter_alpha', 'maxTargetAngleInput': 'max_target_angle_from_speed_pid', 'speedIntegralLimitInput': 'speed_pid_integral_limit', 'speedDeadbandInput': 'speed_pid_deadband', 'positionKpInput': 'kp_p', 'positionKiInput': 'ki_p', 'positionKdInput': 'kd_p', 'positionFilterAlphaInput': 'position_pid_filter_alpha', 'maxTargetSpeedInput': 'max_target_speed_from_pos_pid', 'positionIntegralLimitInput': 'position_pid_integral_limit', 'positionDeadbandInput': 'position_pid_deadband', 'rotationKpInput': 'kp_r', 'rotationKdInput': 'kd_r', 'headingKpInput': 'kp_h', 'headingKiInput': 'ki_h', 'headingKdInput': 'kd_h', 'rotationToPwmScaleInput': 'rotation_to_pwm_scale',
    // Joystick and mechanical parameters
    'joystickSensitivityInput': 'joystick_sensitivity', 'expoJoystickInput': 'expo_joystick', 'maxSpeedJoystickInput': 'max_speed_joystick', 'turnFactorInput': 'turn_factor', 'joystickDeadzoneInput': 'joystick_deadzone', 'wheelDiameterInput': 'wheel_diameter_cm', 'trackWidthInput': 'track_width_cm', 'encoderPprInput': 'encoder_ppr', 'minPwmLeftFwdInput': 'min_pwm_left_fwd', 'minPwmLeftBwdInput': 'min_pwm_left_bwd', 'minPwmRightFwdInput': 'min_pwm_right_fwd', 'minPwmRightBwdInput': 'min_pwm_right_bwd',
    // Trim parameters
    'trimValueDisplay': 'trim_angle', 'rollTrimValueDisplay': 'roll_trim',
    // Auto-tuning parameters (safety, space, weights, GA, PSO, ZN)
    'safetyMaxAngle': 'safety_max_angle', 'safetyMaxSpeed': 'safety_max_speed', 'safetyMaxPwm': 'safety_max_pwm',
    'ga-kp-min': 'space_kp_min', 'ga-kp-max': 'space_kp_max', 'ga-ki-min': 'space_ki_min', 'ga-ki-max': 'space_ki_max', 'ga-kd-min': 'space_kd_min', 'ga-kd-max': 'space_kd_max',
    'include-ki-checkbox': 'search_ki',
    'ga-weight-itae': 'weights_itae', 'ga-weight-overshoot': 'weights_overshoot', 'ga-weight-control-effort': 'weights_control_effort',
    'ga-generations': 'ga_generations', 'ga-population': 'ga_population', 'ga-mutation-rate': 'ga_mutation_rate', 'ga-elitism': 'ga_elitism', 'ga-adaptive': 'ga_adaptive', 'ga-convergence-check': 'ga_convergence_check',
    'pso-iterations': 'pso_iterations', 'pso-particles': 'pso_particles', 'pso-inertia': 'pso_inertia', 'pso-adaptive-inertia': 'pso_adaptive_inertia', 'pso-velocity-clamp': 'pso_velocity_clamp', 'pso-neighborhood': 'pso_neighborhood',
    'zn-trial-duration': 'tuning_trial_duration_ms', 'zn-max-amplitude': 'zn_amplitude'
};

// Backward compatibility: keep these for any direct references
let bleDevice, rxCharacteristic, txCharacteristic;
let bleBuffer = '', bleMessageQueue = [], isSendingBleMessage = false; const bleChunks = new Map();
const BLE_SEND_INTERVAL = 20;

let joystickCenter, joystickRadius, knobRadius, isDragging = false, lastJoystickSendTime = 0;
const JOYSTICK_SEND_INTERVAL = 20;

let gamepadIndex = null, lastGamepadState = [], gamepadMappings = {}; const GAMEPAD_MAPPING_KEY = 'pid_gamepad_mappings_v3';
let isMappingButton = false, actionToMap = null;

const CUSTOM_PRESET_PREFIX = 'pid_custom_preset_v4_';
// Pitch trim: UI pokazuje wartości w stopniach. Firmware stosuje TRIM w kwaternionie (Quaternion-First),
// więc ustawienie trim = -raw_pitch zeruje wskazanie pitch i wpływa na balans zgodnie z oczekiwaniem.
// Podstawowe przełączniki
const availableActions = {
    'toggle_balance': { label: 'Wlacz/Wylacz Balansowanie', elementId: 'balanceSwitch' },
    'toggle_hold_position': { label: 'Wlacz/Wylacz Trzymanie Pozycji', elementId: 'holdPositionSwitch' },
    'toggle_speed_mode': { label: 'Wlacz/Wylacz Tryb Predkosci', elementId: 'speedModeSwitch' },
    'emergency_stop': { label: 'STOP AWARYJNY', elementId: 'emergencyStopBtn' },
    'reset_pitch': { label: 'Ustaw punkt 0 (Pitch)', elementId: 'resetZeroBtn' },
    'reset_roll': { label: 'Ustaw punkt 0 (Roll)', elementId: 'resetRollZeroBtn' }
};
const availableTelemetry = { 'pitch': { label: 'Pitch (Kat)', color: '#61dafb' }, 'roll': { label: 'Roll (Przechyl)', color: '#a2f279' }, 'speed': { label: 'Predkosc', color: '#f7b731' }, 'target_speed': { label: 'Predkosc Zadana', color: '#ff9f43' }, 'output': { label: 'Wyjscie PID', color: '#ff6347' }, 'encoder_left': { label: 'Enkoder L', color: '#9966ff' }, 'encoder_right': { label: 'Enkoder P', color: '#cc66ff' } };
const builtInPresetsData = { '1': { name: "1. PID Zbalansowany (Startowy)", params: { balanceKpInput: 95.0, balanceKiInput: 0.0, balanceKdInput: 3.23 } }, '2': { name: "2. PID Mieciutki (Plynny)", params: { balanceKpInput: 80.0, balanceKiInput: 0.0, balanceKdInput: 2.8 } }, '3': { name: "3. PID Agresywny (Sztywny)", params: { balanceKpInput: 110.0, balanceKiInput: 0.0, balanceKdInput: 4.0 } } };
let skyDome;
let scene3D, camera3D, renderer3D, controls3D, robotPivot, leftWheel, rightWheel, groundMesh, groundTexture, robotPerspectiveZoom = 40;
let currentEncoderLeft = 0, currentEncoderRight = 0;
let isAnimation3DEnabled = true, isMovement3DEnabled = false, lastEncoderAvg = 0;
window.telemetryData = {};
let isCalibrationModalShown = false;
// UI base for 'Set Zero' feature — apparent trim is actualTrim - uiTrimZeroBase
// Uwaga: baseline UI działa tylko jako przesunięcie wizualne (nie zmienia firmware).
// uiTrimZeroBase* = ile "udajemy" w UI, że trim wynosi 0; firmware nadal trzyma realny trim.
let uiTrimZeroBasePitch = 0.0;
let uiTrimZeroBaseRoll = 0.0;
// uiZeroBaselineAngle* = surowy kąt (raw_* + firmware_trim) w momencie naciśnięcia "Ustaw punkt 0",
// odejmowany potem tylko od wyświetlanego kąta – NIE wchodzi do logiki wysyłania trimów.
let uiZeroBaselineAnglePitch = 0.0;
let uiZeroBaselineAngleRoll = 0.0;
let originalFirmwareTrimPitch = null;
let originalFirmwareTrimRoll = null;

let pitchHistory = [], speedHistory = [];
const HISTORY_LENGTH = 600;
let lastTelemetryUpdateTime = 0;
const TELEMETRY_UPDATE_INTERVAL = 1000;

document.addEventListener('DOMContentLoaded', () => {
    // Setup communication layer message handlers
    setupCommunicationHandlers();

    initJoystick();
    initSignalAnalyzerChart();
    setupSignalChartControls();
    setupSignalAnalyzerControls();
    populatePresetSelect();
    setupNumericInputs();
    // Zamiana legacy: wywołujemy nowy zestaw listenerów parametrów zamiast usuniętej funkcji.
    if (typeof setupParameterListeners === 'function') {
        setupParameterListeners();
    }
    setupManualTuneButtons();
    // Nowy modal Mapowanie Czujnika – korzysta z istniejących komend mount_calib2_* (backend już implementuje kwaternion-first)
    // Sekwencyjny kreator mapowania czujnika (auto-wykrycie rotacji ≥ 90°)
    let sensorWizard = { step: 0, rotStartYaw: null, monitorId: null, progress: { upright: false, rotation: false, saved: false } };
    let sensorModalTelemetryMonitorId = null;
    function openSensorMappingModal() {
        const m = document.getElementById('sensor-mapping-modal'); if (!m) return; m.style.display = 'flex';
        sensorWizard = { step: 0, rotStartYaw: null, monitorId: null, progress: { upright: false, rotation: false, saved: false } };
        updateSensorWizardUI();
        initSensorMappingPreview();
        // Load IMU mapping from EEPROM when opening the modal
        sendBleMessage({ type: 'get_imu_mapping' });
        if (!sensorModalTelemetryMonitorId) sensorModalTelemetryMonitorId = setInterval(updateModalTelemetryDisplay, 200);
    }
    function closeSensorMappingModal() { const m = document.getElementById('sensor-mapping-modal'); if (!m) return; if (sensorWizard.monitorId) { clearInterval(sensorWizard.monitorId); sensorWizard.monitorId = null; } if (sensorModalTelemetryMonitorId) { clearInterval(sensorModalTelemetryMonitorId); sensorModalTelemetryMonitorId = null; } m.style.display = 'none'; }
    function setWizardProgress() {
        const el = document.getElementById('sensorWizardProgress');
        if (!el) return;
        const p = sensorWizard.progress;
        el.textContent = `[${p.upright ? 'x' : ' '}] Pion | [${p.rotation ? 'x' : ' '}] Rotacja ≥ 90° | [${p.saved ? 'x' : ' '}] Zapis`;
        // Jeśli mamy zapisaną korekcję, pokaż skrócony kwaternion
        if (p.saved && window.lastMountCorr) {
            const { qw, qx, qy, qz } = window.lastMountCorr;
            const preview = `\nqcorr: w=${qw.toFixed(3)} x=${qx.toFixed(3)} y=${qy.toFixed(3)} z=${qz.toFixed(3)}`;
            el.textContent += preview;
        }
    }
    function setWizardStepNo() { const n = document.getElementById('sensorWizardStepNo'); if (n) n.textContent = (sensorWizard.step + 1).toString(); }
    function getCurrentYawDeg() {
        const td = window.telemetryData || {}; const { qw, qx, qy, qz } = td; if (typeof qw !== 'number') return null;
        const eul = computeEulerFromQuaternion(qw, qx, qy, qz); return eul ? eul.yaw : null;
    }
    function angleDeltaDeg(a, b) { if (a === null || b === null) return null; let d = ((a - b + 540) % 360) - 180; return Math.abs(d); }
    function updateSensorWizardUI() {
        setWizardStepNo(); setWizardProgress();
        const t = document.getElementById('sensorWizardText'); const hint = document.getElementById('sensorWizardHint');
        const back = document.getElementById('sensorWizardBackBtn'); const next = document.getElementById('sensorWizardNextBtn');
        if (!t || !hint || !back || !next) return;
        if (sensorWizard.step === 0) {
            back.disabled = true; next.disabled = false; next.textContent = 'Dalej';
            t.innerHTML = '1) Postaw robota pionowo (koła w dół, prosto) na stabilnej powierzchni i poczekaj aż się uspokoi.<br>Po kliknięciu Dalej zarejestrujemy bazową orientację.';
            hint.textContent = 'Warunek: kalibracja IMU (Sys=3). Jeśli nie, wykonaj kalibrację przed kontynuacją.';
        } else if (sensorWizard.step === 1) {
            back.disabled = false; next.disabled = true; next.textContent = 'Czekam na ≥ 90°';
            t.innerHTML = '2) Obracaj robota powoli zgodnie z ruchem wskazówek zegara (poziomo).<br>Krok zakończy się automatycznie po wykryciu obrotu ≥ 90°.';
            hint.textContent = 'Nie podnoś robota – trzymaj koła w dół. Możesz obracać więcej (180–360°) – wystarczy przekroczyć 90°.';
        } else {
            back.disabled = false; next.disabled = false; next.textContent = 'Zapisz';
            let extra = '';
            if (window.lastMountCorr) { const { qw, qx, qy, qz } = window.lastMountCorr; extra = `<div style="margin-top:8px; font-size:0.8em; color:#9fa;">Aktualne (ostatnie) qcorr:<br>w=${qw.toFixed(4)} x=${qx.toFixed(4)} y=${qy.toFixed(4)} z=${qz.toFixed(4)}</div>`; }
            t.innerHTML = '3) Zapisz ustawienia mapowania. Zmiany zostaną utrwalone w pamięci i zaczną działać natychmiast.' + extra;
            hint.textContent = 'Po zapisie osie w Dashboard i w modelu 3D będą już skorygowane.';
        }
    }
    function startRotationMonitor() {
        // zapamiętaj yaw startowy i rozpocznij monitoring co 100ms
        sensorWizard.rotStartYaw = getCurrentYawDeg();
        if (sensorWizard.monitorId) { clearInterval(sensorWizard.monitorId); sensorWizard.monitorId = null; }
        sensorWizard.monitorId = setInterval(() => {
            const cy = getCurrentYawDeg(); const d = angleDeltaDeg(cy, sensorWizard.rotStartYaw);
            if (d !== null && d >= 90) {
                clearInterval(sensorWizard.monitorId); sensorWizard.monitorId = null;
                // auto-zamknięcie kroku rotacji
                sendBleMessage({ type: 'sensor_map_capture_rot_end' });
                sensorWizard.progress.rotation = true;
                sensorWizard.step = 2; updateSensorWizardUI(); setWizardProgress();
                addLogMessage('[UI] Wykryto rotację ≥ 90°. Przechodzę do kroku Zapis.', 'success');
            }
        }, 100);
    }
    document.getElementById('sensorMappingBtn')?.addEventListener('click', () => { openSensorMappingModal(); });
    // IMU mapping load/save controls
    document.getElementById('imuMappingLoadBtn')?.addEventListener('click', () => { sendBleMessage({ type: 'get_imu_mapping' }); });
    document.getElementById('imuMappingSaveBtn')?.addEventListener('click', () => {
        if (!AppState.isConnected) { addLogMessage('[UI] Musisz być połączony z robotem aby zapisać mapowanie IMU.', 'warn'); return; }
        if (!confirm('Zapisz mapowanie IMU do pamięci EEPROM robota?')) return;
        const mapping = gatherIMUMappingFromUI();
        sendBleMessage({ type: 'set_imu_mapping', mapping });
        addLogMessage('[UI] Wysłano mapowanie IMU do robota (set_imu_mapping).', 'info');
    });
    // Add change handler for selects to apply runtime mapping for immediate feedback (no EEPROM save)
    ['imuPitchSource', 'imuYawSource', 'imuRollSource'].forEach(selectId => {
        const s = document.getElementById(selectId);
        if (!s) return;
        s.addEventListener('change', () => {
            if (AppState.isConnected) {
                const mapping = gatherIMUMappingFromUI();
                sendBleMessage({ type: 'set_imu_mapping', mapping });
            }
        });
    });
    // Sign toggle wiring for IMU remap controls
    ['imuPitchSign', 'imuYawSign', 'imuRollSign'].forEach(containerId => {
        const el = document.getElementById(containerId);
        if (!el) return;
        el.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', () => { const sign = parseInt(btn.dataset.sign); setSignButtons(containerId, sign); });
        });
    });
    // Toggle preview face indicator
    document.getElementById('markFrontFaceChk')?.addEventListener('change', (e) => {
        try { if (sensorPreview && sensorPreview.faceIndicator) sensorPreview.faceIndicator.visible = e.target.checked; } catch (err) { /* no-op */ }
    });
    document.getElementById('sensorWizardCancelBtn')?.addEventListener('click', () => { sendBleMessage({ type: 'sensor_map_cancel' }); closeSensorMappingModal(); });
    document.getElementById('sensorWizardBackBtn')?.addEventListener('click', () => {
        if (sensorWizard.step === 0) return; // nic
        if (sensorWizard.step === 1) { if (sensorWizard.monitorId) { clearInterval(sensorWizard.monitorId); sensorWizard.monitorId = null; } }
        sensorWizard.step -= 1; updateSensorWizardUI();
    });
    document.getElementById('sensorWizardNextBtn')?.addEventListener('click', async () => {
        if (sensorWizard.step === 0) {
            // Start i rejestracja pozycji pionowej
            sendBleMessage({ type: 'sensor_map_start' });
            await delay(80);
            sendBleMessage({ type: 'sensor_map_capture_upright' });
            sensorWizard.progress.upright = true; setWizardProgress();
            // Rozpocznij krok rotacji i monitoring
            sendBleMessage({ type: 'sensor_map_capture_rot_start' });
            sensorWizard.step = 1; updateSensorWizardUI(); startRotationMonitor();
        } else if (sensorWizard.step === 2) {
            // Zapis
            sendBleMessage({ type: 'sensor_map_commit' });
            sensorWizard.progress.saved = true; setWizardProgress();
            closeSensorMappingModal();
        }
    });
    setupGamepadMappingModal();
    setupDpadControls();
    setupSequenceControls();
    initPathVisualization();
    loadGamepadMappings();
    renderMappingModal();
    // Toggle pomocy dla mapowania czujnika
    const smHelp = document.getElementById('sensorMappingHelp');
    const smHelpBox = document.getElementById('sensorMappingHelpText');
    if (smHelp && smHelpBox) {
        smHelp.addEventListener('click', () => {
            smHelpBox.classList.toggle('visible');
            smHelpBox.setAttribute('aria-hidden', smHelpBox.classList.contains('visible') ? 'false' : 'true');
        });
    }
    pollGamepad();
    window.addEventListener('resize', initJoystick);
    init3DVisualization();
    animate3D();
    setTuningUiLock(false, '');
    // Initialize sensor mapping preview (Three.js cube) and controls
    initSensorMappingPreview();
    initAutotuneTuningChart();
    // Start strojenia dostępny dopiero po wyborze metody
    const startBtnInit = document.getElementById('start-tuning-btn');
    if (startBtnInit) startBtnInit.disabled = true;
    setupAutotuningTabs();
    // Pinned bottom logs panel wiring (toggle + clear)
    const logToggleBar = document.getElementById('log-toggle-bar');
    const logHistoryBox = document.getElementById('log-history');
    const logsAutoscroll = document.getElementById('logsAutoscroll');
    document.getElementById('clearLogsBtn')?.addEventListener('click', () => { allLogsBuffer.length = 0; renderAllLogs(true); });
    if (logToggleBar && logHistoryBox) {
        const logCard = document.getElementById('log-card');
        const updateBodyPadding = () => {
            // Ustal łączną wysokość paska tytułu i zawartości logów, aby nie zasłaniać elementów na dole (np. Wczytaj/Zapisz)
            const barH = logToggleBar.getBoundingClientRect().height;
            const listH = logCard.classList.contains('open') ? logHistoryBox.getBoundingClientRect().height : 0;
            const total = Math.ceil(barH + listH);
            // Ustaw zmienną CSS na body (zmienne dziedziczą w dół, nie do góry)
            document.body.style.setProperty('--log-card-total', total + 'px');
            document.body.classList.toggle('logs-open', logCard.classList.contains('open'));
        };
        logToggleBar.addEventListener('click', (e) => {
            if (e.target && (e.target.id === 'logsAutoscroll' || e.target.id === 'clearLogsBtn' || e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON')) return;
            logCard.classList.toggle('open');
            if (logCard.classList.contains('open')) {
                renderAllLogs(true);
            }
            // Po przełączeniu zaktualizuj padding
            setTimeout(updateBodyPadding, 0);
        });
        // Reaguj na resize aby trzymać poprawny padding
        window.addEventListener('resize', updateBodyPadding);
    }
    // Przyciski robotowe (loadBtn/saveBtn) mają własne listenery dalej w kodzie (setupParameterListeners)
    // Drugi wywołanie setupParameterListeners usunięte (pierwsze już wykonane wyżej) aby uniknąć podwójnych listenerów.
    // Domyślnie nie szukamy Ki
    const kiChk = document.getElementById('include-ki-checkbox');
    if (kiChk) {
        kiChk.checked = false;
        kiChk.addEventListener('change', () => {
            updateSearchSpaceInputs();
            // Wyślij do robota preferencję szukania Ki
            sendBleMessage({ type: 'set_tuning_config_param', key: 'search_ki', value: kiChk.checked });
        });
    }

    // Obsługa modala historii prób
    const openHistBtn = document.getElementById('open-tuning-history-btn');
    const histModal = document.getElementById('tuning-history-modal');
    if (openHistBtn && histModal) {
        openHistBtn.addEventListener('click', () => { histModal.style.display = 'flex'; refreshHistoryTable(); });
    }
    document.getElementById('closeHistoryBtn')?.addEventListener('click', () => { histModal.style.display = 'none'; });
    document.getElementById('exportHistoryCsvBtn')?.addEventListener('click', exportHistoryCsv);
});
// Osobny bufor logów systemowych (kanał 'log' z robota i ważne wpisy UI)
// Pojedynczy, scalony bufor logów
const allLogsBuffer = [];
const ALL_LOGS_MAX = 2000;
function pushLog(message, level = 'info') {
    const ts = new Date().toLocaleTimeString();
    allLogsBuffer.push({ ts, level, message });
    if (allLogsBuffer.length > ALL_LOGS_MAX) allLogsBuffer.shift();
    const logHistEl = document.getElementById('log-history');
    const autoEl = document.getElementById('logsAutoscroll');
    if (logHistEl && logHistEl.style.display === 'block' && autoEl && autoEl.checked) {
        renderAllLogs(true);
    }
}

// --- Sensor mapping 3D preview (simple cube with axes) ---
let sensorPreview = { scene: null, camera: null, renderer: null, cube: null, axes: null, animId: null };
function initSensorMappingPreview() {
    const container = document.getElementById('sensor-mapping-preview');
    if (!container) return;
    // Clean up existing renderer
    if (sensorPreview.renderer && sensorPreview.renderer.domElement) {
        while (container.firstChild) container.removeChild(container.firstChild);
        sensorPreview.renderer.dispose();
        sensorPreview.renderer = null;
    }
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(3, 3, 6);
    camera.lookAt(0, 0, 0);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);
    const geom = new THREE.BoxGeometry(2, 0.2, 2);
    const mat = new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.2, roughness: 0.7 });
    const cube = new THREE.Mesh(geom, mat);
    // Add small axes helper
    const axes = new THREE.AxesHelper(3);
    scene.add(axes);
    scene.add(cube);
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xffffff, 0.6);
    dir.position.set(5, 10, 7);
    scene.add(dir);
    sensorPreview.scene = scene; sensorPreview.camera = camera; sensorPreview.renderer = renderer; sensorPreview.cube = cube; sensorPreview.axes = axes;
    // Create simple axis labels (X,Y,Z) using sprites so user sees orientation
    const makeAxisLabel = (text, color) => {
        const canvasLabel = document.createElement('canvas'); canvasLabel.width = 128; canvasLabel.height = 64; const ctxLabel = canvasLabel.getContext('2d'); ctxLabel.font = 'bold 30px Arial'; ctxLabel.textAlign = 'center'; ctxLabel.textBaseline = 'middle'; ctxLabel.fillStyle = color || '#ffffff'; ctxLabel.fillText(text, canvasLabel.width / 2, canvasLabel.height / 2);
        const labelTex = new THREE.CanvasTexture(canvasLabel);
        const labelMat = new THREE.SpriteMaterial({ map: labelTex, depthTest: false });
        return new THREE.Sprite(labelMat);
    };
    sensorPreview.xLabel = makeAxisLabel('X', '#ff0000'); sensorPreview.xLabel.scale.set(1.2, 0.6, 1);
    sensorPreview.yLabel = makeAxisLabel('Y', '#00ff00'); sensorPreview.yLabel.scale.set(1.2, 0.6, 1);
    sensorPreview.zLabel = makeAxisLabel('Z', '#0000ff'); sensorPreview.zLabel.scale.set(1.2, 0.6, 1);
    // Attach labels to cube to reflect cube rotation (so labels move with cube)
    cube.add(sensorPreview.xLabel); cube.add(sensorPreview.yLabel); cube.add(sensorPreview.zLabel);
    // Place labels near cube faces (local coordinates so they rotate with cube)
    sensorPreview.xLabel.position.set(1.3, 0, 0);
    sensorPreview.yLabel.position.set(0, 1.3, 0);
    sensorPreview.zLabel.position.set(0, 0, 1.3);
    // Add arrow helpers to indicate positive directions of axes
    sensorPreview.xArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 0), 1.1, 0xff0000);
    sensorPreview.yArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 0), 1.1, 0x00ff00);
    sensorPreview.zArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 0), 1.1, 0x0000ff);
    cube.add(sensorPreview.xArrow); cube.add(sensorPreview.yArrow); cube.add(sensorPreview.zArrow);
    // Face indicator - small plane on cube front to indicate virtual sensor front/top orientation
    const faceGeom = new THREE.PlaneGeometry(0.8, 0.8);
    const faceMat = new THREE.MeshBasicMaterial({ color: 0xff00ff, transparent: true, opacity: 0.75, side: THREE.DoubleSide });
    const faceIndicator = new THREE.Mesh(faceGeom, faceMat);
    faceIndicator.position.set(0, 0, 1.3);
    faceIndicator.lookAt(sensorPreview.camera.position);
    faceIndicator.visible = false;
    cube.add(faceIndicator);
    sensorPreview.faceIndicator = faceIndicator;
    // Animation loop
    function render() {
        sensorPreview.animId = requestAnimationFrame(render);
        renderer.render(scene, camera);
    }
    render();
    // Resize handler
    window.addEventListener('resize', () => {
        if (!sensorPreview.renderer) return;
        const w = container.clientWidth; const h = container.clientHeight;
        sensorPreview.camera.aspect = w / h; sensorPreview.camera.updateProjectionMatrix(); sensorPreview.renderer.setSize(w, h);
    });
    // Update display initial values
    updateSensorMappingDisplays();
    // Buttons wiring
    ['pitchMinus90Btn', 'pitchPlus90Btn', 'rollMinus90Btn', 'rollPlus90Btn', 'yawMinus90Btn', 'yawPlus90Btn'].forEach(id => {
        const b = document.getElementById(id);
        if (!b) return;
        b.addEventListener('click', (e) => {
            const delta = id.includes('Minus') ? -90 : 90;
            if (id.startsWith('pitch')) rotateSensorCube('x', delta);
            if (id.startsWith('roll')) rotateSensorCube('z', delta);
            if (id.startsWith('yaw')) rotateSensorCube('y', delta);
        });
    });
    document.getElementById('setModalPitchZeroBtn')?.addEventListener('click', () => { setPitchZero(); });
    document.getElementById('setModalRollZeroBtn')?.addEventListener('click', () => { setRollZero(); });
    document.getElementById('clearModalPitchZeroBtn')?.addEventListener('click', () => {
        uiTrimZeroBasePitch = 0; uiZeroBaselineAnglePitch = 0; addLogMessage('[UI] UI baseline (Pitch) zostal wyczyszczony.', 'info'); updateTelemetryUI(window.telemetryData || {});
    });
    document.getElementById('clearModalRollZeroBtn')?.addEventListener('click', () => {
        uiTrimZeroBaseRoll = 0; uiZeroBaselineAngleRoll = 0; addLogMessage('[UI] UI baseline (Roll) zostal wyczyszczony.', 'info'); updateTelemetryUI(window.telemetryData || {});
    });
}

// Gather IMU mapping from sensor mapping modal
function gatherIMUMappingFromUI() {
    const mapping = {
        pitch: { source: parseInt(document.getElementById('imuPitchSource')?.value || '0'), sign: parseInt(getActiveSign('imuPitchSign')) },
        yaw: { source: parseInt(document.getElementById('imuYawSource')?.value || '1'), sign: parseInt(getActiveSign('imuYawSign')) },
        roll: { source: parseInt(document.getElementById('imuRollSource')?.value || '2'), sign: parseInt(getActiveSign('imuRollSign')) }
    };
    return mapping;
}

function updateIMUMappingUIFromData(data) {
    if (!data || !data.pitch) return;
    const p = document.getElementById('imuPitchSource'); if (p) p.value = data.pitch.source || '0';
    const y = document.getElementById('imuYawSource'); if (y) y.value = data.yaw.source || '1';
    const r = document.getElementById('imuRollSource'); if (r) r.value = data.roll.source || '2';
    setSignButtons('imuPitchSign', parseInt(data.pitch.sign));
    setSignButtons('imuYawSign', parseInt(data.yaw.sign));
    setSignButtons('imuRollSign', parseInt(data.roll.sign));
}

function rotateSensorCube(axis, deg) {
    if (!sensorPreview.cube) return;
    const rad = THREE.MathUtils.degToRad(deg);
    if (axis === 'x') sensorPreview.cube.rotateX(rad);
    else if (axis === 'y') sensorPreview.cube.rotateY(rad);
    else if (axis === 'z') sensorPreview.cube.rotateZ(rad);
    updateSensorMappingDisplays();
    // Apply rotation transform to current IMU mapping values (UI only until user saves)
    if (Math.abs(deg) % 90 === 0) {
        try { applyRotationToIMUMapping(axis, deg); } catch (e) { /* no-op */ }
    }
}

function mappingObjToMatrix(mapping) {
    // mapping: { pitch:{source,sign}, yaw:{...}, roll:{...} }
    const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    const setRow = (rowIdx, m) => { const col = parseInt(m.source); const sign = parseInt(m.sign) || 1; M[rowIdx][col] = sign; };
    setRow(0, mapping.pitch);
    setRow(1, mapping.yaw);
    setRow(2, mapping.roll);
    return M;
}

function matrixToMappingObj(M) {
    const findInRow = (row) => {
        for (let c = 0; c < 3; c++) {
            const v = M[row][c]; if (v === 0) continue; return { source: c, sign: v };
        }
        // default fallback
        return { source: 0, sign: 1 };
    };
    return { pitch: findInRow(0), yaw: findInRow(1), roll: findInRow(2) };
}

function multiplyMatrix(A, B) {
    const R = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { let s = 0; for (let k = 0; k < 3; k++) s += A[i][k] * B[k][j]; R[i][j] = s; }
    return R;
}

function getRotationMatrix(axis, deg) {
    const d = ((deg % 360) + 360) % 360; // normalize
    // Build RA for +90 degree rotation - adapt sign for negative angle
    const q = (d === 270) ? -90 : d; // for -90 deg normalized to 270; make it -90 to handle below
    let RA = null;
    if (axis === 'x') {
        if (q === 90) RA = [[1, 0, 0], [0, 0, -1], [0, 1, 0]];
        else if (q === -90) RA = [[1, 0, 0], [0, 0, 1], [0, -1, 0]];
        else if (q === 180) RA = [[1, 0, 0], [0, -1, 0], [0, 0, -1]];
        else RA = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    } else if (axis === 'y') {
        if (q === 90) RA = [[0, 0, 1], [0, 1, 0], [-1, 0, 0]];
        else if (q === -90) RA = [[0, 0, -1], [0, 1, 0], [1, 0, 0]];
        else if (q === 180) RA = [[-1, 0, 0], [0, 1, 0], [0, 0, -1]];
        else RA = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    } else { // z
        if (q === 90) RA = [[0, -1, 0], [1, 0, 0], [0, 0, 1]];
        else if (q === -90) RA = [[0, 1, 0], [-1, 0, 0], [0, 0, 1]];
        else if (q === 180) RA = [[-1, 0, 0], [0, -1, 0], [0, 0, 1]];
        else RA = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    }
    return RA;
}

function applyRotationToIMUMapping(axis, deg) {
    const cur = gatherIMUMappingFromUI();
    const M = mappingObjToMatrix(cur);
    const R = getRotationMatrix(axis, deg);
    const Mprime = multiplyMatrix(M, R);
    const newMap = matrixToMappingObj(Mprime);
    updateIMUMappingUIFromData(newMap);
}

function updateSensorMappingDisplays() {
    if (!sensorPreview.cube) return;
    const q = sensorPreview.cube.quaternion;
    const eul = new THREE.Euler().setFromQuaternion(q, 'ZYX');
    const yaw = THREE.MathUtils.radToDeg(eul.x);
    const pitch = THREE.MathUtils.radToDeg(eul.y);
    const roll = THREE.MathUtils.radToDeg(eul.z);
    document.getElementById('modal-pitch-display').textContent = pitch.toFixed(2) + '°';
    document.getElementById('modal-roll-display').textContent = roll.toFixed(2) + '°';
    document.getElementById('modal-yaw-display').textContent = yaw.toFixed(2) + '°';
}

function updateModalTelemetryDisplay() {
    const e = getRawEuler();
    const pd = document.getElementById('modal-pitch-telemetry');
    const rd = document.getElementById('modal-roll-telemetry');
    const yd = document.getElementById('modal-yaw-telemetry');
    if (pd) pd.textContent = (e.pitch || 0).toFixed(2) + '°';
    if (rd) rd.textContent = (e.roll || 0).toFixed(2) + '°';
    if (yd) yd.textContent = (e.yaw || 0).toFixed(2) + '°';
}

// Main reset buttons are mapped below; please use the assigned handlers via toolButtons mapping.
function renderAllLogs(keepScrollBottom = false) {
    const box = document.getElementById('log-history'); if (!box) return;
    const wasBottom = (box.scrollTop + box.clientHeight + 8) >= box.scrollHeight;
    box.innerHTML = '';
    for (const row of allLogsBuffer) {
        const div = document.createElement('div');
        let color = '#ccc';
        if (row.level === 'error') color = '#ff6347';
        else if (row.level === 'warn') color = '#f7b731';
        else if (row.level === 'success') color = '#a2f279';
        div.style.color = color;
        div.textContent = `[${row.ts}] ${row.message}`;
        box.appendChild(div);
    }
    if (keepScrollBottom || wasBottom) { box.scrollTop = box.scrollHeight; }
}

// --- Model Mapping (wizualizacja 3D) ---
let modelMapping = { pitch: { source: 0, sign: 1 }, yaw: { source: 1, sign: 1 }, roll: { source: 2, sign: 1 } }; // domyślne: identity
function openModelMappingModal() { const m = document.getElementById('model-mapping-modal'); if (!m) return; m.style.display = 'flex'; updateModelMappingUI(); }
function closeModelMappingModal() { const m = document.getElementById('model-mapping-modal'); if (!m) return; m.style.display = 'none'; }
function updateModelMappingUI() {
    // Ustaw dropdowny
    const sPitch = document.getElementById('modelPitchSource'); const sYaw = document.getElementById('modelYawSource'); const sRoll = document.getElementById('modelRollSource');
    if (sPitch) sPitch.value = String(modelMapping.pitch.source);
    if (sYaw) sYaw.value = String(modelMapping.yaw.source);
    if (sRoll) sRoll.value = String(modelMapping.roll.source);
    // Ustaw przyciski sign
    setSignButtons('modelPitchSign', modelMapping.pitch.sign);
    setSignButtons('modelYawSign', modelMapping.yaw.sign);
    setSignButtons('modelRollSign', modelMapping.roll.sign);
    // Podgląd
    const cur = document.getElementById('model-mapping-current');
    if (cur) { cur.textContent = `pitch: src=${modelMapping.pitch.source} sign=${modelMapping.pitch.sign} | yaw: src=${modelMapping.yaw.source} sign=${modelMapping.yaw.sign} | roll: src=${modelMapping.roll.source} sign=${modelMapping.roll.sign}`; }
}
function setSignButtons(containerId, sign) { const c = document.getElementById(containerId); if (!c) return; c.querySelectorAll('button').forEach(btn => { const s = parseInt(btn.dataset.sign); if (s === sign) { btn.classList.add('active'); } else { btn.classList.remove('active'); } }); }

function updateSignBadge(badgeId, sign) {
    const el = document.getElementById(badgeId);
    if (!el) return;
    const prefixMap = { 'balanceSignBadge': 'B', 'speedSignBadge': 'S', 'positionSignBadge': 'P' };
    const prefix = prefixMap[badgeId] || '';
    el.textContent = `${prefix}:${sign === -1 ? '-' : '+'}`;
    el.classList.toggle('negative', sign === -1);
    updateSignSummary();
}

function updateSignSummary() {
    const b = getActiveSign('balanceSign');
    const s = getActiveSign('speedSign');
    const p = getActiveSign('positionSign');
    const el = document.getElementById('signSummary');
    if (!el) return;
    el.textContent = `B:${b === -1 ? '-' : '+'} S:${s === -1 ? '-' : '+'} P:${p === -1 ? '-' : '+'}`;
}
function gatherModelMappingFromUI() { modelMapping.pitch.source = parseInt(document.getElementById('modelPitchSource').value); modelMapping.yaw.source = parseInt(document.getElementById('modelYawSource').value); modelMapping.roll.source = parseInt(document.getElementById('modelRollSource').value); modelMapping.pitch.sign = getActiveSign('modelPitchSign'); modelMapping.yaw.sign = getActiveSign('modelYawSign'); modelMapping.roll.sign = getActiveSign('modelRollSign'); }
function getActiveSign(containerId) { const c = document.getElementById(containerId); if (!c) return 1; const active = c.querySelector('button.active'); return active ? parseInt(active.dataset.sign) : 1; }
function resetModelMapping() { modelMapping = { pitch: { source: 0, sign: 1 }, yaw: { source: 1, sign: 1 }, roll: { source: 2, sign: 1 } }; updateModelMappingUI(); }
function applyModelMappingToEuler(e) { // e={pitch,yaw,roll}; zwraca przemapowane
    const arr = [e.pitch, e.yaw, e.roll];
    return {
        pitch: (arr[modelMapping.pitch.source] || 0) * modelMapping.pitch.sign,
        yaw: (arr[modelMapping.yaw.source] || 0) * modelMapping.yaw.sign,
        roll: (arr[modelMapping.roll.source] || 0) * modelMapping.roll.sign
    };
}
// Podłączenie eventów modalu
document.getElementById('modelMappingBtn')?.addEventListener('click', () => { openModelMappingModal(); sendBleMessage({ type: 'get_model_mapping' }); });
document.getElementById('modelMappingCloseBtn')?.addEventListener('click', () => closeModelMappingModal());
document.getElementById('modelMappingLoadBtn')?.addEventListener('click', () => { sendBleMessage({ type: 'get_model_mapping' }); });
document.getElementById('modelMappingSaveBtn')?.addEventListener('click', () => {
    if (!AppState.isConnected) { addLogMessage('[UI] Musisz być połączony z robotem aby zapisać mapowanie modelu 3D.', 'warn'); return; }
    if (!confirm('Zapisz mapowanie modelu 3D do pamięci EEPROM robota?')) return;
    gatherModelMappingFromUI();
    sendBleMessage({ type: 'set_model_mapping', mapping: modelMapping });
    addLogMessage('[UI] Wyslano mapowanie modelu 3D do robota.', 'info');
});
// Feedback sign toggles wiring - init once here (not in the test result handler)
const signButtonMap = {
    'balanceSign': 'balance_feedback_sign',
    'speedSign': 'speed_feedback_sign',
    'positionSign': 'position_feedback_sign'
};
Object.keys(signButtonMap).forEach(containerId => {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
            const sign = parseInt(btn.dataset.sign);
            // Only send change if robot is IDLE
            const robotState = appStore.getState('robot.state');
            if (robotState !== 'IDLE') {
                showNotification('Zmiana znaku tylko w trybie IDLE', 'warn');
                return;
            }
            // Send set_param to robot
            const key = signButtonMap[containerId];
            sendBleMessage({ type: 'set_param', key: key, value: sign });
            // Optimistically update UI
            setSignButtons(containerId, sign);
            updateSignBadge(containerId + 'Badge', sign);
        });
    });
});
// Disable sign toggles outside of IDLE for safety
appStore.subscribe('robot.state', (newVal) => {
    const isIdle = (newVal === 'IDLE');
    Object.keys(signButtonMap).forEach(containerId => {
        const el = document.getElementById(containerId);
        if (!el) return;
        el.querySelectorAll('button').forEach(btn => {
            btn.disabled = !isIdle;
        });
        el.classList.toggle('disabled', !isIdle);
    });
});
// Initial summary update
updateSignSummary();
document.getElementById('modelMappingResetBtn')?.addEventListener('click', () => { resetModelMapping(); addLogMessage('[UI] Przywrócono domyślne mapowanie modelu (identity).', 'info'); });
// Toggle pomocy w modalum model mapping
const mmHelp = document.getElementById('modelMappingHelp');
const mmHelpBox = document.getElementById('modelMappingHelpText');
if (mmHelp && mmHelpBox) {
    mmHelp.addEventListener('click', () => {
        mmHelpBox.classList.toggle('visible');
        mmHelpBox.setAttribute('aria-hidden', mmHelpBox.classList.contains('visible') ? 'false' : 'true');
    });
}
// Listenery znaków
['modelPitchSign', 'modelYawSign', 'modelRollSign'].forEach(id => { const c = document.getElementById(id); if (!c) return; c.querySelectorAll('button').forEach(btn => { btn.addEventListener('click', () => { c.querySelectorAll('button').forEach(b => b.classList.remove('active')); btn.classList.add('active'); }); }); });

// --- Przeliczanie kątów Euler’a z kwaternionu (telemetria: qw,qx,qy,qz) ---
function computeEulerFromQuaternion(qw, qx, qy, qz) {
    try {
        if ([qw, qx, qy, qz].some(v => typeof v !== 'number' || Number.isNaN(v))) return null;
        // ZYX (yaw-pitch-roll) zgodnie z firmware (imu_math.h)
        const n = Math.hypot(qw, qx, qy, qz) || 1;
        qw /= n; qx /= n; qy /= n; qz /= n;
        const siny_cosp = 2 * (qw * qz + qx * qy);
        const cosy_cosp = 1 - 2 * (qy * qy + qz * qz);
        const yaw = Math.atan2(siny_cosp, cosy_cosp);
        const sinp = 2 * (qw * qy - qz * qx);
        const pitch = Math.abs(sinp) >= 1 ? Math.sign(sinp) * (Math.PI / 2) : Math.asin(sinp);
        const sinr_cosp = 2 * (qw * qx + qy * qz);
        const cosr_cosp = 1 - 2 * (qx * qx + qy * qy);
        const roll = Math.atan2(sinr_cosp, cosr_cosp);
        return {
            yaw: THREE.MathUtils.radToDeg(yaw),
            pitch: THREE.MathUtils.radToDeg(pitch),
            roll: THREE.MathUtils.radToDeg(roll)
        };
    } catch (_) { return null; }
}

// Usunięto legacy mapowanie IMU (Quaternion-First). Euler liczony bezpośrednio z kwaternionu.

// Zwraca SUROWE kąty Euler'a z aktualnej telemetrii kwaternionu (bez mapowania IMU)
function getRawEuler() {
    if (!window.telemetryData) return { pitch: 0, yaw: 0, roll: 0 };
    const { qw, qx, qy, qz } = window.telemetryData;
    const eul = (typeof qw === 'number') ? computeEulerFromQuaternion(qw, qx, qy, qz) : null;
    return eul || { pitch: 0, yaw: 0, roll: 0 };
}

const debounce = (func, delay) => { let timeout; return function (...args) { const context = this; clearTimeout(timeout); timeout = setTimeout(() => func.apply(context, args), delay); }; };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function addLogMessage(message, level = 'info') { pushLog(message, level); const el = document.getElementById('log-history'); if (el && el.style.display === 'block') { renderAllLogs(true); } }
function clearLogs() { if (typeof allLogsBuffer !== 'undefined') { allLogsBuffer.length = 0; } const box = document.getElementById('log-history'); if (box) box.innerHTML = ''; }
function toggleAccordion(header) {
    const content = header.nextElementSibling;
    header.classList.toggle('active');
    const isOpening = header.classList.contains('active');
    if (!isOpening) {
        content.classList.remove('auto-height');
        content.style.maxHeight = '0px';
        content.style.padding = '0px 15px';
    } else {
        // Specjalne traktowanie panelu strojenia: stała wysokość po otwarciu
        if (content.classList.contains('autotune-pane')) {
            const desktopH = 600; // px
            const mobileVH = 70; // vh
            const isMobile = window.matchMedia('(max-width: 768px)').matches;
            if (isMobile) {
                content.style.maxHeight = mobileVH + 'vh';
            } else {
                content.style.maxHeight = desktopH + 'px';
            }
            content.style.overflow = 'hidden';
        } else {
            content.style.maxHeight = content.scrollHeight + 40 + 'px';
        }
        content.style.padding = '15px';
        setTimeout(() => {
            if (header.classList.contains('active') && !content.classList.contains('autotune-pane')) content.classList.add('auto-height');
        }, 450);
    }
}
function updateAccordionHeight(content) {
    if (content && content.classList.contains('active')) {
        content.classList.remove('auto-height');
        content.style.maxHeight = content.scrollHeight + 40 + 'px';
        // Ustaw auto po chwili by nie ucinać późniejszych elementów (np. pojawiające się help-texty)
        clearTimeout(content._autoTimer);
        content._autoTimer = setTimeout(() => {
            if (content.classList.contains('active')) content.classList.add('auto-height');
        }, 300);
    }
}
// Obserwator zmian dla dynamicznego dopasowania wysokości (np. rozwinięcie wielu help-text)
const accordionObserver = new MutationObserver(mutations => {
    mutations.forEach(m => {
        const content = m.target.closest && m.target.closest('.accordion-content');
        if (content && content.classList.contains('active')) {
            // Nie zmieniaj wysokości stałego panelu strojenia
            if (!content.classList.contains('autotune-pane')) {
                updateAccordionHeight(content);
            }
        }
    });
});
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.accordion-content').forEach(ac => {
        accordionObserver.observe(ac, { childList: true, subtree: true });
    });
});
// Relokacja wykresu procesu strojenia pod aktywny przycisk URUCHOM
function relocateAutotuneChart(method) {
    const chartWrapper = document.querySelector('.autotune-tuning-chart-wrapper');
    if (!chartWrapper) return;
    let targetBtn = null;
    if (method === 'zn-relay') targetBtn = document.getElementById('run-zn-test');
    else if (method === 'ga-genetic') targetBtn = document.getElementById('run-ga-tune');
    else if (method === 'pso-particle') targetBtn = document.getElementById('run-pso-tune');
    else if (method === 'single-tests') targetBtn = document.querySelector('.run-test-btn[data-test-type="step_response"]');
    if (!targetBtn) return;
    // Wstaw chart tuż za przyciskiem
    if (targetBtn.parentElement && targetBtn.parentElement.contains(targetBtn)) {
        // Unikaj wielokrotnego przenoszenia jeśli już jest poniżej
        if (chartWrapper._lastMethod !== method) {
            targetBtn.insertAdjacentElement('afterend', chartWrapper);
            chartWrapper._lastMethod = method;
            // Aktualizacja wysokości akordeonu
            const accordionContent = chartWrapper.closest('.accordion-content');
            updateAccordionHeight(accordionContent);
        }
    }
}

async function connectBLE() {
    addLogMessage('[UI] Prosze o wybranie urzadzenia Bluetooth...', 'info');
    try {
        // Use the new communication layer
        const connected = await commLayer.connect();

        if (!connected) {
            throw new Error('Failed to connect to device');
        }

        // Get device info for backward compatibility
        bleDevice = commLayer.device;
        rxCharacteristic = commLayer.rxCharacteristic;
        txCharacteristic = commLayer.txCharacteristic;

        const deviceName = commLayer.getDeviceName();
        addLogMessage(`[UI] Laczenie z ${deviceName}...`, 'info');

        const connectBtn = document.getElementById('connectBleBtn');
        connectBtn.disabled = true;
        document.getElementById('connectionText').textContent = 'Laczenie...';

        // Update state through state manager
        AppState.isConnected = true;
        AppState.isSynced = false;
        appStore.setState('connection.deviceName', deviceName);

        document.getElementById('connectionStatus').className = 'status-indicator status-ok';
        document.getElementById('connectionText').textContent = 'Polaczony';
        addLogMessage('[UI] Polaczono! Rozpoczynam synchronizacje...', 'success');
        document.body.classList.remove('ui-locked');
        document.getElementById('connectBleBtn').textContent = 'Synchronizowanie...';

        // Reset sync state
        AppState.isSynced = false;
        AppState.tempParams = {};
        AppState.tempTuningParams = {};
        AppState.tempStates = {};

        // Request configuration
        sendBleMessage({ type: 'request_full_config' });

        // Setup sync timeout
        clearTimeout(AppState.syncTimeout);
        AppState.syncTimeout = setTimeout(() => {
            if (!AppState.isSynced && AppState.isConnected) {
                addLogMessage('[UI] BLAD: Timeout synchronizacji. Robot nie odpowiedzial na czas (20s).', 'error');
                document.getElementById('connectionText').textContent = 'Blad synchronizacji';
                document.getElementById('connectBleBtn').textContent = 'SPROBUJ PONOWNIE ZSYNCHRONIZOWAC';
                document.getElementById('connectBleBtn').style.backgroundColor = '#ff6347';
                document.getElementById('connectBleBtn').disabled = false;
            }
        }, 20000);
    } catch (error) {
        addLogMessage(`[UI] Blad polaczenia BLE: ${error}`, 'error');
        onDisconnected();
    }
}

function onDisconnected() {
    // Update state
    AppState.isConnected = false;
    AppState.isSynced = false;
    appStore.setState('ui.isLocked', true);

    document.body.classList.add('ui-locked');

    if (AppState.isTuningActive) {
        handleCancel();
    }

    const connectBtn = document.getElementById('connectBleBtn');
    connectBtn.disabled = false;
    connectBtn.textContent = 'POLACZ Z ROBOTEM';
    connectBtn.style.backgroundColor = '';

    document.getElementById('connectionStatus').className = 'status-indicator status-disconnected';
    document.getElementById('connectionText').textContent = 'Rozlaczony';

    ['balanceSwitch', 'holdPositionSwitch', 'speedModeSwitch'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.checked = false;
    });
}
// Backward compatibility: keep old functions for any direct references
function handleBleNotification(event) { const value = event.target.value; const decoder = new TextDecoder('utf-8'); bleBuffer += decoder.decode(value); let newlineIndex; while ((newlineIndex = bleBuffer.indexOf('\n')) !== -1) { const line = bleBuffer.substring(0, newlineIndex).trim(); bleBuffer = bleBuffer.substring(newlineIndex + 1); if (line) { try { const data = JSON.parse(line); if (data.type === 'chunk' && data.id !== undefined) { let entry = bleChunks.get(data.id); if (!entry) { entry = { total: data.total || 0, parts: new Map(), timer: setTimeout(() => { if (bleChunks.has(data.id)) { bleChunks.delete(data.id); addLogMessage(`[UI] Blad: Timeout podczas skladania wiadomosci (ID: ${data.id}).`, 'error'); } }, 5000) }; bleChunks.set(data.id, entry); } entry.parts.set(data.i, data.data || ''); if (data.total) entry.total = data.total; if (entry.parts.size === entry.total && entry.total > 0) { clearTimeout(entry.timer); let combined = ''; for (let i = 0; i < entry.total; i++) { combined += entry.parts.get(i) || ''; } bleChunks.delete(data.id); try { const fullMsg = JSON.parse(combined); processCompleteMessage(fullMsg); } catch (e) { addLogMessage(`[UI] Blad skladania chunkow: ${e}. Dane: ${combined}`, 'error'); } } } else { processCompleteMessage(data); } } catch (e) { addLogMessage(`[UI] Blad parsowania JSON: ${e}. Dane: ${line}`, 'error'); } } } }
async function _sendRawBleMessage(message) { if (!rxCharacteristic) return; try { const encoder = new TextEncoder(); await rxCharacteristic.writeValueWithoutResponse(encoder.encode(JSON.stringify(message) + '\n')); } catch (error) { addLogMessage(`[UI] Blad wysylania danych BLE: ${error}`, 'error'); } }
async function processBleQueue() { if (isSendingBleMessage || bleMessageQueue.length === 0 || !rxCharacteristic) return; isSendingBleMessage = true; const message = bleMessageQueue.shift(); await _sendRawBleMessage(message); setTimeout(() => { isSendingBleMessage = false; processBleQueue(); }, BLE_SEND_INTERVAL); }

// Updated sendBleMessage to use the communication layer
function sendBleMessage(message) {
    // Use the new communication layer if available and connected
    try {
        if (['run_metrics_test', 'run_relay_test', 'cancel_test', 'request_full_config', 'set_param'].includes(message.type)) {
            addLogMessage(`[UI -> ROBOT] Sending: ${message.type} ${JSON.stringify(message)}`, 'info');
        }
    } catch (e) { /* ignore logging errors */ }
    if (commLayer && commLayer.getConnectionStatus()) {
        commLayer.send(message);
    } else {
        // Fallback to old method for backward compatibility
        bleMessageQueue.push(message);
        processBleQueue();
    }
}

// Setup communication layer message handlers
function setupCommunicationHandlers() {
    // Handle disconnection
    commLayer.onMessage('disconnected', () => {
        onDisconnected();
    });

    // Handle all incoming messages by routing them to processCompleteMessage
    commLayer.onMessage('*', (type, data) => {
        // Skip the 'disconnected' type as it's handled separately
        if (type !== 'disconnected') {
            processCompleteMessage(data);
        }
    });

    // Subscribe to state changes for UI updates
    appStore.subscribe('connection.isConnected', (value) => {
        document.body.classList.toggle('ui-locked', !value);
    });

    appStore.subscribe('robot.state', (value) => {
        const stateEl = document.getElementById('robotStateVal');
        if (stateEl) {
            stateEl.textContent = value;
        }
    });

    appStore.subscribe('tuning.isActive', (value) => {
        // Update UI based on tuning state if needed
        setTuningUiLock(value, appStore.getState('tuning.activeMethod'));
    });
}

function processCompleteMessage(data) {
    if (!data || !data.type) return;
    const prevState = AppState.lastKnownRobotState;
    if (data.robot_state) {
        const changed = data.robot_state !== AppState.lastKnownRobotState;
        AppState.lastKnownRobotState = data.robot_state;
        // Gdy stan robota zmienia się z trybu pracy autonomicznej na gotowość, przejdź do kolejnego kroku sekwencji
        if (changed) {
            try { checkAndExecuteNextSequenceStep(prevState); } catch (e) { /* no-op */ }
        }
    }
    // Note: Emergency stop during tuning is automatically handled by algorithms
    // through test_complete message with success=false. No manual pause needed here.
    // The algorithms will detect the failed test, enter pause state, and restore baseline PID.
    switch (data.type) {
        case 'telemetry':
            // Jeśli dostępny jest kwaternion, policz kąty bez dodatkowego mapowania (Quaternion-First)
            if (typeof data.qw === 'number' && typeof data.qx === 'number' && typeof data.qy === 'number' && typeof data.qz === 'number') {
                const eul = computeEulerFromQuaternion(data.qw, data.qx, data.qy, data.qz);
                if (eul) {
                    // Zachowaj SUROWE kąty z kwaternionu (dla logiki, wykresów, ścieżki)
                    data.raw_pitch = eul.pitch;
                    data.raw_yaw = eul.yaw;
                    data.raw_roll = eul.roll;
                    // Oblicz tylko dla wizualizacji (model 3D) – nie wpływa na logikę
                    const mapped = applyModelMappingToEuler(eul);
                    data.viz_pitch = mapped.pitch;
                    data.viz_yaw = mapped.yaw;
                    data.viz_roll = mapped.roll;
                    // Pola kompatybilności: pitch/yaw/roll = surowe + trim (korekcja widoczna w dashboard)
                    // Pobierz aktualne wartości trim (telemetria może nie zawierać ich w każdej paczce)
                    const currentTrim = (data.trim_angle !== undefined) ? Number(data.trim_angle) : Number((window.telemetryData && window.telemetryData.trim_angle) || parseFloat(document.getElementById('trimValueDisplay')?.textContent || '0') || 0);
                    const currentRollTrim = (data.roll_trim !== undefined) ? Number(data.roll_trim) : Number((window.telemetryData && window.telemetryData.roll_trim) || parseFloat(document.getElementById('rollTrimValueDisplay')?.textContent || '0') || 0);
                    // Zwracamy pitch/roll skorygowane o trimy (wyświetlane jako 'wartość po korekcji' w dashboard)
                    data.pitch = (data.raw_pitch || 0) + (isNaN(currentTrim) ? 0 : currentTrim);
                    data.yaw = data.raw_yaw;
                    data.roll = (data.raw_roll || 0) + (isNaN(currentRollTrim) ? 0 : currentRollTrim);
                }
            }
            updateTelemetryUI(data);
            updateChart(data);
            updateActualPath(data);
            // Legacy guard: mappingWizard removed; keep defensive check
            if (typeof mappingWizard !== 'undefined' && mappingWizard && mappingWizard.isActive && typeof processWizardTelemetry === 'function') {
                processWizardTelemetry(data);
            }
            break;
        case 'status_update':
            // Specjalna obsługa mount_corr_set (echo po sensor_map_commit)
            if (data.message === 'mount_corr_set' && typeof data.qw === 'number') {
                window.lastMountCorr = { qw: data.qw, qx: data.qx, qy: data.qy, qz: data.qz };
                addLogMessage(`[UI] Korekcja montażu zastosowana: w=${data.qw.toFixed(3)} x=${data.qx.toFixed(3)} y=${data.qy.toFixed(3)} z=${data.qz.toFixed(3)}`, 'success');
                // Jeśli modal nadal otwarty a zapis jeszcze nie zaznaczony, odśwież postęp
                if (document.getElementById('sensor-mapping-modal')?.style.display === 'flex') {
                    sensorWizard.progress.saved = true; setWizardProgress(); updateSensorWizardUI();
                }
            }
            break;
        case 'imu_mapping':
            // Zachowaj w pamięci (może w przyszłości do obliczeń sterowania UI)
            window.imuMapping = data;
            // Aktualizuj kontrolki w modalu mapowania czujnika (jeśli otwarte)
            try { updateIMUMappingUIFromData(data); } catch (e) { /* no-op */ }
            addLogMessage('[UI] Otrzymano mapowanie czujnika (imu_mapping).', 'info');
            break;
        case 'model_mapping':
            // Aktualizacja struktury modelMapping z EEPROM
            if (data.pitch && data.yaw && data.roll) {
                modelMapping.pitch.source = parseInt(data.pitch.source); modelMapping.pitch.sign = parseInt(data.pitch.sign);
                modelMapping.yaw.source = parseInt(data.yaw.source); modelMapping.yaw.sign = parseInt(data.yaw.sign);
                modelMapping.roll.source = parseInt(data.roll.source); modelMapping.roll.sign = parseInt(data.roll.sign);
                updateModelMappingUI();
            }
            addLogMessage('[UI] Otrzymano mapowanie modelu 3D (model_mapping).', 'info');
            break;
        case 'sync_begin':
            clearTimeout(AppState.syncTimeout);
            AppState.isSynced = false;
            document.getElementById('connectionText').textContent = 'Synchronizowanie...';
            addLogMessage('[UI] Rozpoczeto odbieranie konfiguracji...', 'info');
            break;
        case 'set_param':
            if (!AppState.isSynced) { // Jeśli jesteśmy w trakcie synchronizacji
                if (data.key === 'balancing' || data.key === 'holding_pos' || data.key === 'speed_mode') {
                    AppState.tempStates[data.key] = data.value;
                } else {
                    AppState.tempParams[data.key] = data.value;
                }
            } else {
                applySingleParam(data.key, data.value);
            }
            break;
        case 'set_tuning_config_param':
            // Umożliw obsługę runtime dla search_ki również z firmware (na wypadek zmian po stronie robota)
            if (!AppState.isSynced) {
                AppState.tempTuningParams[data.key] = data.value;
            } else {
                applySingleAutotuneParam(data.key, data.value);
                if (data.key === 'search_ki') updateSearchSpaceInputs();
            }
            break;

        case 'ack':
            if (data.command === 'request_full_config') { // NOWE: Obsługa ACK dla request_full_config
                if (data.success) {
                    addLogMessage(`[UI] Robot potwierdzil wyslanie konfiguracji: ${data.message}`, 'info');
                } else {
                    addLogMessage(`[UI] Robot odrzucil zadanie konfiguracji: ${data.message || 'Nieznany blad'}`, 'error');
                }
            } else if (data.command === 'save_tunings') {
                const level = data.success ? 'success' : 'error';
                addLogMessage(`[ROBOT] Zapis do EEPROM: ${data.message || (data.success ? 'OK' : 'Blad')}`, level);
            } else if (data.command === 'calibrate_mpu') {
                const level = data.success ? 'success' : 'error';
                addLogMessage(`[ROBOT] Kalibracja IMU: ${data.message || (data.success ? 'Zapisane do EEPROM' : 'Blad')}`, level);
            } else if (data.command === 'set_imu_mapping') {
                const level = data.success ? 'success' : 'error';
                addLogMessage(`[ROBOT] Mapowanie IMU: ${data.message || (data.success ? 'Zapisane' : 'BLAD')}`, level);
            } else {
                // Ogólna obsługa dla innych poleceń
                const level = data.success ? 'info' : 'warn';
                const message = `[ROBOT ACK] ${data.command}: ${data.success ? 'OK' : 'FAILED'} ${data.message ? `(${data.message})` : ''}`;
                addLogMessage(message, level);
            }
            break;
        case 'full_config':
            break;
        case 'sync_complete':
            // Zastosuj wszystkie zebrane parametry i stany
            AppState.isApplyingConfig = true;
            for (const [key, value] of Object.entries(AppState.tempParams)) {
                applySingleParam(key, value);
            }
            for (const [key, value] of Object.entries(AppState.tempTuningParams)) {
                applySingleAutotuneParam(key, value);
            }
            if (AppState.tempStates.balancing !== undefined) document.getElementById('balanceSwitch').checked = AppState.tempStates.balancing;
            if (AppState.tempStates.holding_pos !== undefined) document.getElementById('holdPositionSwitch').checked = AppState.tempStates.holding_pos;
            if (AppState.tempStates.speed_mode !== undefined) document.getElementById('speedModeSwitch').checked = AppState.tempStates.speed_mode;
            AppState.isApplyingConfig = false;

            // Zaktualizuj UI
            clearTimeout(AppState.syncTimeout);
            AppState.isSynced = true;
            document.getElementById('connectionText').textContent = 'Polaczony';
            document.getElementById('connectBleBtn').textContent = 'POLACZ Z ROBOTEM';
            addLogMessage('[UI] Synchronizacja konfiguracji zakonczona pomyslnie.', 'success');
            AppState.tempParams = {};
            AppState.tempTuningParams = {};
            AppState.tempStates = {};
            // Update sign summary/badges after applying synchronized parameters
            if (typeof updateSignSummary === 'function') updateSignSummary();
            break;
        case 'set_rgb_blink': // NOWE: Obsługa komend RGB
        case 'log':
            addLogMessage(`[ROBOT] ${data.message}`, data.level);
            break;
        case 'tuner_live_status': updateTunerStatus(data); break;
        case 'tuner_live_chart_data': updateAutotuneTuningChart(data); break;
        case 'tuning_result': handleTunerResult(data); break;
        case 'tuning_iteration_result': handleTuningIterationResult(data); break;
        // POPRAWKA: Dodano obsługę wyniku strojenia PWM
        case 'min_pwm_autotune_result':
            if (data.motor && data.direction && data.found_pwm !== undefined) {
                const { motor, direction, found_pwm } = data;
                addLogMessage(`[UI] Auto-strojenie zakończone dla ${motor} ${direction}. Znaleziono PWM: ${found_pwm}`, 'success');

                // Znajdź odpowiedni wiersz i pole input
                const row = document.querySelector(`.manual-tune-row[data-motor="${motor}"][data-direction="${direction}"]`);
                if (row) {
                    const input = row.querySelector('.tune-input');
                    const autoBtn = row.querySelector('.auto-btn');
                    // Zastosuj znalezioną wartość do pola input
                    if (input) input.value = found_pwm;
                    // Odblokuj przycisk "Auto"
                    if (autoBtn) {
                        autoBtn.disabled = false;
                        autoBtn.textContent = 'Auto';
                    }
                }
            }
            break;
        case 'test_result': handleDynamicTestResult(data); break;
        case 'metrics_result': handleDynamicTestResult(data); break;
        case 'tuner_session_end':
            // POPRAWKA: Obsługa komunikatu o zakończeniu sesji strojenia.
            // Odblokowuje UI, gdy strojenie zostanie przerwane na robocie lub zakończy się naturalnie.
            addLogMessage(`[UI] Sesja strojenia zakonczona: ${data.reason || 'Zdalne zatrzymanie'}`, 'info');
            // Używamy funkcji handleCancel, która już zawiera logikę czyszczenia stanu UI.
            handleCancel(false);
            break;
    }
    // Broadcast BLE message for client-side autotuning algorithms (Simple Test API)
    try { window.dispatchEvent(new CustomEvent('ble_message', { detail: data })); } catch (e) { }
}

// Historia prób strojenia + lista ostatnich 5
const tuningHistory = [];
function refreshRecentList() {
    const box = document.getElementById('recent-results-list');
    if (!box) return;
    const last5 = tuningHistory.slice(-5).reverse();
    if (!last5.length) { box.textContent = 'Brak danych.'; return; }
    box.innerHTML = last5.map((r, idx) => `#${r.idx} | Kp=${r.kp.toFixed(3)} Ki=${r.ki.toFixed(3)} Kd=${r.kd.toFixed(3)} | fitness=${r.fitness.toFixed(4)} | ITAE=${(r.itae ?? NaN).toFixed?.(2) ?? '---'} | ov=${(r.overshoot ?? NaN).toFixed?.(2) ?? '---'}${r.testType === 'metrics_test' ? '°' : '%'}`).join('\n');
}
function refreshHistoryTable() {
    const tbody = document.getElementById('results-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    for (let i = tuningHistory.length - 1; i >= 0; i--) {
        const r = tuningHistory[i];
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${r.idx}</td><td>${r.kp.toFixed(3)}</td><td>${r.ki.toFixed(3)}</td><td>${r.kd.toFixed(3)}</td><td>${r.fitness.toFixed(4)}</td><td>${(r.itae ?? 0).toFixed(2)}</td><td>${(r.overshoot ?? 0).toFixed(2)}${r.testType === 'metrics_test' ? '°' : '%'}</td><td><button class="btn-small" data-apply="${i}">Zastosuj</button></td>`;
        tbody.appendChild(tr);
    }
    { const hc = document.getElementById('historyCount'); if (hc) hc.textContent = `${tuningHistory.length} prób`; }
    // Delegacja dla przycisków Zastosuj
    tbody.querySelectorAll('button[data-apply]').forEach(btn => {
        btn.addEventListener('click', () => {
            const i = parseInt(btn.getAttribute('data-apply'));
            const r = tuningHistory[i];
            if (!r) return;
            applyParameters(r.kp, r.ki, r.kd);
        });
    });
}
function exportHistoryCsv() {
    if (!tuningHistory.length) { showNotification('Brak danych historii'); return; }
    const headers = ['#', 'Kp', 'Ki', 'Kd', 'Fitness', 'ITAE', 'Overshoot'];
    const lines = [headers.join(',')];
    tuningHistory.forEach(r => {
        lines.push([r.idx, r.kp.toFixed(3), r.ki.toFixed(3), r.kd.toFixed(3), r.fitness.toFixed(4), (r.itae ?? 0).toFixed(2), (r.overshoot ?? 0).toFixed(2)].join(','));
    });
    const csv = lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'tuning_history.csv'; a.click(); URL.revokeObjectURL(url);
}

function applySingleParam(snakeKey, value) {
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
                    if (inputId === 'include-ki-checkbox') updateSearchSpaceInputs();
                } else {
                    el.value = displayValue;
                }
            } else if (el.tagName === 'SPAN') {
                el.textContent = (typeof displayValue === 'number') ? parseFloat(displayValue).toFixed(2) : displayValue;
            }
        }
    }
    // Fallback dla trimów (jeśli elementy są poza mappingiem lub dodatkowe odświeżenie)
    if (snakeKey === 'trim_angle') {
        const actual = Number(value || 0);
        if (originalFirmwareTrimPitch === null) originalFirmwareTrimPitch = actual;
        const apparentVal = actual - (uiTrimZeroBasePitch || 0);
        const span = document.getElementById('trimValueDisplay'); if (span) span.textContent = apparentVal.toFixed(2);
        const origSpan = document.getElementById('trimOriginalDisplay'); if (origSpan) origSpan.textContent = originalFirmwareTrimPitch.toFixed(2);
        const deltaSpan = document.getElementById('trimDeltaDisplay'); if (deltaSpan) deltaSpan.textContent = (actual - (originalFirmwareTrimPitch || 0)).toFixed(2);
        // Update displayed angle with apparent trim
        const rawPitch = window.telemetryData && typeof window.telemetryData.raw_pitch === 'number' ? window.telemetryData.raw_pitch : 0;
        const corrected = rawPitch + actual - (uiZeroBaselineAnglePitch || 0);
        const angleEl = document.getElementById('angleVal'); if (angleEl) angleEl.textContent = corrected.toFixed(1) + ' \u00B0';
    } else if (snakeKey === 'roll_trim') {
        const actualR = Number(value || 0);
        if (originalFirmwareTrimRoll === null) originalFirmwareTrimRoll = actualR;
        const apparentR = actualR - (uiTrimZeroBaseRoll || 0);
        const span = document.getElementById('rollTrimValueDisplay'); if (span) span.textContent = apparentR.toFixed(2);
        const origRollSpan = document.getElementById('rollTrimOriginalDisplay'); if (origRollSpan) origRollSpan.textContent = originalFirmwareTrimRoll.toFixed(2);
        const rollDeltaSpan = document.getElementById('rollTrimDeltaDisplay'); if (rollDeltaSpan) rollDeltaSpan.textContent = (actualR - (originalFirmwareTrimRoll || 0)).toFixed(2);
        const rawRoll = window.telemetryData && typeof window.telemetryData.raw_roll === 'number' ? window.telemetryData.raw_roll : 0;
        const correctedR = rawRoll + actualR - (uiZeroBaselineAngleRoll || 0);
        const rollEl = document.getElementById('rollVal'); if (rollEl) rollEl.textContent = correctedR.toFixed(1) + ' \u00B0';
    }
    // Feedback sign params - special handling: update sign buttons
    if (snakeKey === 'balance_feedback_sign') {
        const v = parseInt(value);
        setSignButtons('balanceSign', v);
        updateSignBadge('balanceSignBadge', v);
    } else if (snakeKey === 'speed_feedback_sign') {
        const v = parseInt(value);
        setSignButtons('speedSign', v);
        updateSignBadge('speedSignBadge', v);
    } else if (snakeKey === 'position_feedback_sign') {
        const v = parseInt(value);
        setSignButtons('positionSign', v);
        updateSignBadge('positionSignBadge', v);
    }
    // Config dirty flag – inform UI whether there are runtime changes not persisted

}

function applySingleAutotuneParam(snakeKey, value) {
    const inputId = Object.keys(parameterMapping).find(key => parameterMapping[key] === snakeKey);

    if (inputId) {
        const input = document.getElementById(inputId);
        if (input) {
            let displayValue = value;
            if (snakeKey.startsWith('weights_')) {
                displayValue = (value * 100);
            }
            if (snakeKey === 'ga_mutation_rate') {
                displayValue = (value * 100);
            }
            if (snakeKey === 'tuning_trial_duration_ms') {
                displayValue = (value / 1000.0);
            }

            if (input.type === 'checkbox') {
                input.checked = displayValue;
            } else {
                input.value = displayValue;
            }

            if (snakeKey === 'search_ki') {
                // Odśwież układ pól przestrzeni wyszukiwania
                updateSearchSpaceInputs();
            }

            // If it's a shared field, update the other tab too
            const sharedFields = ['kp-min', 'kp-max', 'ki-min', 'ki-max', 'kd-min', 'kd-max', 'weight-itae', 'weight-overshoot', 'weight-control-effort'];
            const sharedField = sharedFields.find(f => inputId.endsWith(f));
            if (sharedField) {
                const prefix = inputId.startsWith('ga-') ? 'pso-' : 'ga-';
                const otherInput = document.getElementById(`${prefix}${sharedField}`);
                if (otherInput) {
                    otherInput.value = input.value;
                }
            }

            // Trigger input event for range sliders to update their text displays
            if (input.type === 'range') {
                input.dispatchEvent(new Event('input'));
            }
        }
    }
}

function applyFullConfig(params) {
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

function normalizeTelemetryData(d) {
    if (!d || typeof d !== 'object') return d;
    if (d.sp !== undefined && d.speed === undefined) d.speed = d.sp;
    if (d.ts !== undefined && d.target_speed === undefined) d.target_speed = d.ts;
    if (d.el !== undefined && d.encoder_left === undefined) d.encoder_left = d.el;
    if (d.er !== undefined && d.encoder_right === undefined) d.encoder_right = d.er;
    if (d.o !== undefined && d.output === undefined) d.output = d.o;
    if (d.cs !== undefined && d.calib_sys === undefined) d.calib_sys = d.cs;
    if (d.cg !== undefined && d.calib_gyro === undefined) d.calib_gyro = d.cg;
    if (d.ca !== undefined && d.calib_accel === undefined) d.calib_accel = d.ca;
    if (d.cm !== undefined && d.calib_mag === undefined) d.calib_mag = d.cm;
    if (d.lt !== undefined && d.loop_time === undefined) d.loop_time = d.lt;
    if (d.ta !== undefined && d.trim_angle === undefined) d.trim_angle = d.ta;
    if (d.rt !== undefined && d.roll_trim === undefined) d.roll_trim = d.rt;
    if (d.states && typeof d.states === 'object') {
        const s = d.states;
        if (s.b !== undefined && s.balancing === undefined) s.balancing = s.b;
        if (s.hp !== undefined && s.holding_pos === undefined) s.holding_pos = s.hp;
        if (s.sm !== undefined && s.speed_mode === undefined) s.speed_mode = s.sm;
        if (s.es !== undefined && s.emergency_stop === undefined) s.emergency_stop = s.es;
    }
    return d;
}

function updateTelemetryUI(data) {
    data = normalizeTelemetryData(data);

    // Zapisz ostatnie dane telemetryczne globalnie – zachowując raw_pitch/raw_roll/qw.., żeby
    // set_zero i korekta pionu miały zawsze dostęp do pełnej informacji.
    window.telemetryData = {
        ...(window.telemetryData || {}),
        ...data
    };
    if (data.robot_state !== undefined) document.getElementById('robotStateVal').textContent = data.robot_state;
    // Fitness paused indicator
    const dash = document.getElementById('autotune-dashboard');
    if (dash) {
        const statusEl = document.getElementById('dashboard-status');
        if (data.fitness_paused) {
            statusEl.textContent = 'Test wstrzymany (czekam na ustawienie)';
            dash.style.display = 'block';
        }
    }
    // loop time: support long 'loop_time' or short 'lt'
    const loopTimeVal = (data.loop_time !== undefined) ? data.loop_time : data.lt;
    if (loopTimeVal !== undefined) document.getElementById('loopTimeVal').textContent = loopTimeVal + ' \u00B5s';
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
    if (typeof data.raw_pitch === 'number' || typeof data.pitch === 'number') {
        // SUROWY kąt z kwaternionu (bez trima)
        const rawPitchVal = (typeof data.raw_pitch === 'number') ? data.raw_pitch : (data.raw_pitch || 0);

        // Aktualny trim z telemetrii (priorytet: data, potem ostatni zapisany w window.telemetryData)
        const telemetryTrimPitch = (data.trim_angle !== undefined)
            ? Number(data.trim_angle)
            : Number((window.telemetryData && window.telemetryData.trim_angle) || 0);

        const actualTrimForPitch = isNaN(telemetryTrimPitch) ? 0 : telemetryTrimPitch;

        // "Widoczny" trim w UI = firmware_trim - uiTrimZeroBasePitch
        const apparentTrimVal = actualTrimForPitch - (uiTrimZeroBasePitch || 0);

        // Kąt widoczny na dashboardzie liczony względem baseline kąta, zapamiętanego przy "Ustaw punkt 0"
        const correctedPitch = rawPitchVal + actualTrimForPitch - (uiZeroBaselineAnglePitch || 0);
        document.getElementById('angleVal').textContent = correctedPitch.toFixed(1) + ' \u00B0';
        const vizPitchVal = (data.viz_pitch !== undefined) ? data.viz_pitch : rawPitchVal || 0;
        document.getElementById('robot3d-pitch').textContent = vizPitchVal.toFixed(1) + '°';
        // Update trims display (apparent)
        const span = document.getElementById('trimValueDisplay'); if (span) span.textContent = apparentTrimVal.toFixed(2);
        pitchHistory.push(correctedPitch);
        if (pitchHistory.length > HISTORY_LENGTH) pitchHistory.shift();
    }
    if (typeof data.raw_roll === 'number' || typeof data.roll === 'number') {
        const rawRollVal = (typeof data.raw_roll === 'number') ? data.raw_roll : (data.raw_roll || 0);

        const telemetryRollTrim = (data.roll_trim !== undefined)
            ? Number(data.roll_trim)
            : Number((window.telemetryData && window.telemetryData.roll_trim) || 0);

        const actualTrimForRoll = isNaN(telemetryRollTrim) ? 0 : telemetryRollTrim;

        const apparentRollTrimVal = actualTrimForRoll - (uiTrimZeroBaseRoll || 0);
        const correctedRoll = rawRollVal + actualTrimForRoll - (uiZeroBaselineAngleRoll || 0);
        const vizRollVal = (data.viz_roll !== undefined) ? data.viz_roll : rawRollVal || 0;
        document.getElementById('robot3d-roll').textContent = vizRollVal.toFixed(1) + '°';
        document.getElementById('rollVal').textContent = correctedRoll.toFixed(1) + ' \u00B0';
        const rollSpan = document.getElementById('rollTrimValueDisplay'); if (rollSpan) rollSpan.textContent = apparentRollTrimVal.toFixed(2);
    }
    if (data.yaw !== undefined) {
        document.getElementById('yawVal').textContent = data.yaw.toFixed(1) + ' °';
        document.getElementById('compassNeedle').style.transform = `rotate(${data.yaw}deg)`;
    }
    // speed actual (sp) and target (ts) short keys
    const speedActual = (data.speed !== undefined) ? data.speed : data.sp;
    if (speedActual !== undefined) {
        const speed = parseFloat(speedActual);
        document.getElementById('speedVal').textContent = speed.toFixed(0) + ' imp/s';
        const ppr = parseFloat(document.getElementById('encoderPprInput').value) || 820;
        const wheelRpm = (speed / ppr) * 60;
        document.getElementById('robot3d-wheel-speed').textContent = wheelRpm.toFixed(0) + ' obr/min';
        speedHistory.push(speed);
        if (speedHistory.length > HISTORY_LENGTH) speedHistory.shift();
    }
    const encLeft = (data.encoder_left !== undefined) ? data.encoder_left : data.el;
    if (encLeft !== undefined) {
        currentEncoderLeft = encLeft;
        document.getElementById('encoderLeftVal').textContent = encLeft;
    }
    const encRight = (data.encoder_right !== undefined) ? data.encoder_right : data.er;
    if (encRight !== undefined) {
        currentEncoderRight = encRight;
        document.getElementById('encoderRightVal').textContent = encRight;
    }
    if (Date.now() - lastTelemetryUpdateTime > TELEMETRY_UPDATE_INTERVAL) {
        if (pitchHistory.length > 0) {
            const minPitch = Math.min(...pitchHistory);
            const maxPitch = Math.max(...pitchHistory);
            const avgPitch = pitchHistory.reduce((sum, val) => sum + val, 0) / pitchHistory.length;
            document.getElementById('pitchMin').textContent = minPitch.toFixed(1) + '°';
            document.getElementById('pitchMax').textContent = maxPitch.toFixed(1) + '°';
            document.getElementById('pitchAvg').textContent = avgPitch.toFixed(1) + '°';
        }
        if (speedHistory.length > 0) {
            const minSpeed = Math.min(...speedHistory);
            const maxSpeed = Math.max(...speedHistory);
            const avgSpeed = speedHistory.reduce((sum, val) => sum + val, 0) / speedHistory.length; // Poprawka: toFixed(0) dla speedAvg
            document.getElementById('speedMin').textContent = minSpeed.toFixed(0) + ' imp/s';
            document.getElementById('speedMax').textContent = maxSpeed.toFixed(0) + ' imp/s';
            document.getElementById('speedAvg').textContent = avgSpeed.toFixed(0) + ' imp/s';
        }
        lastTelemetryUpdateTime = Date.now();
    }
    const calibSys = (data.calib_sys !== undefined) ? data.calib_sys : data.cs;
    if (calibSys !== undefined) {
        document.getElementById('calibSysVal').textContent = calibSys;
        updateCalibrationProgress('sys', calibSys);
        const systemHealthItem = document.getElementById('systemHealthItem');
        const sysCalibVal = parseInt(calibSys);
        if (sysCalibVal < 2) { systemHealthItem.classList.add('error'); systemHealthItem.classList.remove('warn'); document.getElementById('systemHealthVal').textContent = 'KRYTYCZNY'; }
        else if (sysCalibVal === 2) { systemHealthItem.classList.add('warn'); systemHealthItem.classList.remove('error'); document.getElementById('systemHealthVal').textContent = 'NISKI'; } else { systemHealthItem.classList.remove('warn', 'error'); document.getElementById('systemHealthVal').textContent = 'OK'; }
    }
    const calibAccel = (data.calib_accel !== undefined) ? data.calib_accel : data.ca;
    if (calibAccel !== undefined) { document.getElementById('calibAccelVal').textContent = calibAccel; updateCalibrationProgress('accel', calibAccel); }
    const calibGyro = (data.calib_gyro !== undefined) ? data.calib_gyro : data.cg;
    if (calibGyro !== undefined) { document.getElementById('calibGyroVal').textContent = calibGyro; updateCalibrationProgress('gyro', calibGyro); }
    const calibMag = (data.calib_mag !== undefined) ? data.calib_mag : data.cm;
    if (calibMag !== undefined) { document.getElementById('calibMagVal').textContent = calibMag; updateCalibrationProgress('mag', calibMag); }
    const trimAngle = (data.trim_angle !== undefined)
        ? Number(data.trim_angle)
        : (typeof data.ta !== 'undefined' ? Number(data.ta) : undefined);

    if (typeof trimAngle !== 'undefined' && !isNaN(trimAngle)) {
        if (originalFirmwareTrimPitch === null) originalFirmwareTrimPitch = trimAngle;
        const apparentTrim = trimAngle - Number(uiTrimZeroBasePitch || 0);

        const span = document.getElementById('trimValueDisplay');
        if (span) span.textContent = apparentTrim.toFixed(2);

        const origSpan = document.getElementById('trimOriginalDisplay');
        if (origSpan) origSpan.textContent = originalFirmwareTrimPitch.toFixed(2);

        const deltaSpan = document.getElementById('trimDeltaDisplay');
        if (deltaSpan) deltaSpan.textContent = (trimAngle - (originalFirmwareTrimPitch || 0)).toFixed(2);
    }

    const rollTrim = (data.roll_trim !== undefined)
        ? Number(data.roll_trim)
        : (typeof data.rt !== 'undefined' ? Number(data.rt) : undefined);

    if (typeof rollTrim !== 'undefined' && !isNaN(rollTrim)) {
        if (originalFirmwareTrimRoll === null) originalFirmwareTrimRoll = rollTrim;
        const apparentRollTrim = rollTrim - Number(uiTrimZeroBaseRoll || 0);

        const rollSpan = document.getElementById('rollTrimValueDisplay');
        if (rollSpan) rollSpan.textContent = apparentRollTrim.toFixed(2);

        const origRollSpan = document.getElementById('rollTrimOriginalDisplay');
        if (origRollSpan) origRollSpan.textContent = originalFirmwareTrimRoll.toFixed(2);

        const rollDeltaSpan = document.getElementById('rollTrimDeltaDisplay');
        if (rollDeltaSpan) rollDeltaSpan.textContent = (rollTrim - (originalFirmwareTrimRoll || 0)).toFixed(2);
    }
    if (data.states && !AppState.isApplyingConfig) {
        AppState.isApplyingConfig = true;
        // states short keys fallback
        const s = data.states;
        const stBal = (s.balancing !== undefined) ? s.balancing : s.b;
        const stHold = (s.holding_pos !== undefined) ? s.holding_pos : s.hp;
        const stSpeed = (s.speed_mode !== undefined) ? s.speed_mode : s.sm;
        const stEstop = (s.emergency_stop !== undefined) ? s.emergency_stop : s.es;
        if (stBal !== undefined) document.getElementById('balanceSwitch').checked = !!stBal;
        if (stHold !== undefined) document.getElementById('holdPositionSwitch').checked = !!stHold;
        if (stSpeed !== undefined) document.getElementById('speedModeSwitch').checked = !!stSpeed;
        AppState.isApplyingConfig = false;
        const emergencyBanner = document.getElementById('emergency-banner'); if (emergencyBanner) emergencyBanner.style.display = stEstop ? 'block' : 'none';
    } else {
        const emergencyBanner = document.getElementById('emergency-banner'); if (emergencyBanner) emergencyBanner.style.display = data.states && (data.states.emergency_stop || data.states.es) ? 'block' : 'none';
    }
}

let signalAnalyzerChart; let isChartPaused = false; let cursorA = null, cursorB = null;
let chartRangeSelection = { isSelecting: false, startIndex: null, endIndex: null };

function initSignalAnalyzerChart() {
    const ctx = document.getElementById('signalAnalyzerChart').getContext('2d');
    signalAnalyzerChart = new Chart(ctx, {
        type: 'line', data: { labels: Array(200).fill(''), datasets: [] },
        options: {
            animation: false, responsive: true, maintainAspectRatio: false,
            scales: {
                x: {
                    display: true,
                    title: { display: true, text: 'Czas', color: '#fff' },
                    ticks: { color: '#fff' }
                },
                y: { type: 'linear', display: true, position: 'left', id: 'y-pitch', ticks: { color: availableTelemetry['pitch']?.color || '#61dafb' }, title: { display: true, text: 'Pitch (°)', color: availableTelemetry['pitch']?.color || '#61dafb' } },
                y1: { type: 'linear', display: false, position: 'right', id: 'y-speed', ticks: { color: availableTelemetry['speed']?.color || '#f7b731' }, title: { display: true, text: 'Speed (imp/s)', color: availableTelemetry['speed']?.color || '#f7b731' }, grid: { drawOnChartArea: false } }
            },
            plugins: {
                legend: { labels: { color: '#fff' } },
                tooltip: { mode: 'index', intersect: false }
            },
            onClick: handleChartClick,
            onHover: (event, activeElements, chart) => {
                if (chartRangeSelection.isSelecting) {
                    chart.canvas.style.cursor = 'crosshair';
                } else {
                    chart.canvas.style.cursor = 'default';
                }
            }
        }
    });

    // Add range selection functionality
    const canvas = ctx.canvas;
    let selectionStart = null;

    canvas.addEventListener('mousedown', (e) => {
        if (e.shiftKey) {
            chartRangeSelection.isSelecting = true;
            const rect = canvas.getBoundingClientRect();
            selectionStart = e.clientX - rect.left;
            chartRangeSelection.startIndex = getChartIndexFromX(selectionStart);
        }
    });

    canvas.addEventListener('mousemove', (e) => {
        if (chartRangeSelection.isSelecting && selectionStart !== null) {
            const rect = canvas.getBoundingClientRect();
            const currentX = e.clientX - rect.left;
            chartRangeSelection.endIndex = getChartIndexFromX(currentX);
            highlightSelectedRange();
        }
    });

    canvas.addEventListener('mouseup', (e) => {
        if (chartRangeSelection.isSelecting) {
            chartRangeSelection.isSelecting = false;
            selectionStart = null;
            // Range is now selected and stored in chartRangeSelection
            if (chartRangeSelection.startIndex !== null && chartRangeSelection.endIndex !== null) {
                addLogMessage(`[UI] Zakres zaznaczony: ${chartRangeSelection.startIndex} - ${chartRangeSelection.endIndex}. Użyj "Eksport CSV (Zakres)" aby wyeksportować.`, 'info');
            }
        }
    });
}
function setupSignalChartControls() {
    const container = document.getElementById('signalChartControls'); container.innerHTML = '';
    const defaultChecked = ['pitch', 'speed'];
    Object.keys(availableTelemetry).forEach((key) => {
        const label = document.createElement('label'); const checkbox = document.createElement('input');
        checkbox.type = 'checkbox'; checkbox.value = key; checkbox.checked = defaultChecked.includes(key);
        checkbox.addEventListener('change', (e) => {
            const varName = e.target.value, datasetLabel = availableTelemetry[varName].label, datasetColor = availableTelemetry[varName].color;
            let dataset = signalAnalyzerChart.data.datasets.find(ds => ds.label === datasetLabel);
            if (e.target.checked) {
                if (!dataset) {
                    let yAxisID = 'y-pitch';
                    if (['speed', 'target_speed', 'output'].includes(varName)) { yAxisID = 'y-speed'; signalAnalyzerChart.options.scales['y1'].display = true; }
                    signalAnalyzerChart.data.datasets.push({ label: datasetLabel, data: Array(signalAnalyzerChart.data.labels.length).fill(null), borderColor: datasetColor, fill: false, tension: 0.1, pointRadius: 0, yAxisID: yAxisID });
                }
            } else {
                const datasetIndex = signalAnalyzerChart.data.datasets.findIndex(ds => ds.label === datasetLabel);
                if (datasetIndex > -1) { signalAnalyzerChart.data.datasets.splice(datasetIndex, 1); }
                if (!signalAnalyzerChart.data.datasets.some(ds => ds.yAxisID === 'y-speed')) { signalAnalyzerChart.options.scales['y1'].display = false; }
            }
            signalAnalyzerChart.update(); updateCursorInfo();
        });
        label.appendChild(checkbox); label.append(` ${availableTelemetry[key].label}`); container.appendChild(label);
        if (checkbox.checked) checkbox.dispatchEvent(new Event('change'));
    });
}
function updateChart(data) {
    if (isChartPaused) return;
    const chartData = signalAnalyzerChart.data;
    const currentTimeLabel = (Date.now() / 1000).toFixed(1);
    if (chartData.labels.length >= 200) { chartData.labels.shift(); chartData.datasets.forEach(ds => ds.data.shift()); }
    chartData.labels.push(currentTimeLabel);
    chartData.datasets.forEach(ds => {
        const key = Object.keys(availableTelemetry).find(k => availableTelemetry[k].label === ds.label);
        const value = (key && data[key] !== undefined) ? data[key] : null;
        ds.data.push(value);
    });
    signalAnalyzerChart.update('none');
}
function setupSignalAnalyzerControls() {
    document.getElementById('pauseChartBtn').addEventListener('click', () => { isChartPaused = true; document.getElementById('pauseChartBtn').style.display = 'none'; document.getElementById('resumeChartBtn').style.display = 'inline-block'; addLogMessage('[UI] Wykres wstrzymany.', 'info'); });
    document.getElementById('resumeChartBtn').addEventListener('click', () => { isChartPaused = false; document.getElementById('resumeChartBtn').style.display = 'none'; document.getElementById('pauseChartBtn').style.display = 'inline-block'; addLogMessage('[UI] Wykres wznowiony.', 'info'); });
    document.getElementById('cursorABBtn').addEventListener('click', toggleCursors);
    document.getElementById('exportCsvBtn').addEventListener('click', () => exportChartDataToCsv(false));
    document.getElementById('exportRangeCsvBtn').addEventListener('click', () => {
        if (chartRangeSelection.startIndex === null || chartRangeSelection.endIndex === null) {
            addLogMessage('[UI] Najpierw zaznacz zakres! Przytrzymaj Shift i przeciągnij myszką po wykresie.', 'warn');
            return;
        }
        exportChartDataToCsv(true);
    });
    document.getElementById('resetZoomBtn').addEventListener('click', () => {
        if (signalAnalyzerChart.resetZoom) {
            signalAnalyzerChart.resetZoom();
            addLogMessage('[UI] Widok wykresu zresetowany.', 'info');
        }
    });
    document.getElementById('exportPngBtn').addEventListener('click', exportChartToPng);
}
function toggleCursors() { const cursorInfo = document.getElementById('cursorInfo'); if (cursorInfo.style.display === 'none') { cursorInfo.style.display = 'flex'; cursorA = { index: Math.floor(signalAnalyzerChart.data.labels.length * 0.25) }; cursorB = { index: Math.floor(signalAnalyzerChart.data.labels.length * 0.75) }; updateCursorInfo(); } else { cursorInfo.style.display = 'none'; cursorA = null; cursorB = null; } signalAnalyzerChart.update(); }
function handleChartClick(event) { if (!cursorA && !cursorB) return; const activePoints = signalAnalyzerChart.getElementsAtEventForMode(event, 'index', { intersect: false }, true); if (activePoints.length > 0) { const clickedIndex = activePoints[0].index; if (cursorA && cursorB) { const distA = Math.abs(clickedIndex - cursorA.index); const distB = Math.abs(clickedIndex - cursorB.index); if (distA < distB) { cursorA.index = clickedIndex; } else { cursorB.index = clickedIndex; } } else if (cursorA) { cursorA.index = clickedIndex; } updateCursorInfo(); signalAnalyzerChart.update(); } }
function updateCursorInfo() { if (!cursorA && !cursorB) { document.getElementById('cursorInfo').style.display = 'none'; return; } document.getElementById('cursorInfo').style.display = 'flex'; const labels = signalAnalyzerChart.data.labels; const datasets = signalAnalyzerChart.data.datasets; if (cursorA) { document.getElementById('cursorAX').textContent = labels[cursorA.index] || '---'; document.getElementById('cursorAY').textContent = datasets.length > 0 && datasets[0].data[cursorA.index] !== undefined ? datasets[0].data[cursorA.index].toFixed(2) : '---'; } if (cursorB) { document.getElementById('cursorBX').textContent = labels[cursorB.index] || '---'; document.getElementById('cursorBY').textContent = datasets.length > 0 && datasets[0].data[cursorB.index] !== undefined ? datasets[0].data[cursorB.index].toFixed(2) : '---'; } if (cursorA && cursorB) { const timeA = parseFloat(labels[cursorA.index]); const timeB = parseFloat(labels[cursorB.index]); document.getElementById('cursorDeltaT').textContent = `${Math.abs(timeB - timeA).toFixed(2)}s`; datasets.forEach(ds => { const valA = ds.data[cursorA.index]; const valB = ds.data[cursorB.index]; if (valA !== null && valB !== null) { if (ds.yAxisID === 'y-pitch') document.getElementById('cursorDeltaYPitch').textContent = `${(valB - valA).toFixed(2)}°`; else if (ds.yAxisID === 'y-speed') document.getElementById('cursorDeltaYSpeed').textContent = `${(valB - valA).toFixed(0)} imp/s`; } }); } }
function getChartIndexFromX(xPixel) {
    const chart = signalAnalyzerChart;
    const xScale = chart.scales['x'];
    const dataLength = chart.data.labels.length;

    // Calculate which index this X coordinate corresponds to
    const xStart = xScale.left;
    const xEnd = xScale.right;
    const xRange = xEnd - xStart;

    // Prevent division by zero
    if (xRange === 0 || dataLength === 0) {
        return 0;
    }

    const relativeX = (xPixel - xStart) / xRange;
    const index = Math.round(relativeX * (dataLength - 1));

    return Math.max(0, Math.min(dataLength - 1, index));
}

function highlightSelectedRange() {
    // Update the chart to show selected range
    // The visual feedback is provided through the selection state and console messages
    if (chartRangeSelection.startIndex !== null && chartRangeSelection.endIndex !== null) {
        const start = Math.min(chartRangeSelection.startIndex, chartRangeSelection.endIndex);
        const end = Math.max(chartRangeSelection.startIndex, chartRangeSelection.endIndex);
        // Visual highlighting could be added here with a Chart.js plugin in future
        // For now, we rely on user feedback through the log system
    }
}

function exportChartDataToCsv(exportRange = false) {
    const data = signalAnalyzerChart.data;
    let csvContent = "data:text/csv;charset=utf-8,";
    let headers = ['Time'];
    data.datasets.forEach(ds => headers.push(ds.label));
    csvContent += headers.join(',') + '\n';

    let startIdx = 0;
    let endIdx = data.labels.length - 1;

    // If exporting range and a range is selected, use it
    if (exportRange && chartRangeSelection.startIndex !== null && chartRangeSelection.endIndex !== null) {
        startIdx = Math.min(chartRangeSelection.startIndex, chartRangeSelection.endIndex);
        endIdx = Math.max(chartRangeSelection.startIndex, chartRangeSelection.endIndex);
        addLogMessage(`[UI] Eksportowanie zakresu: ${startIdx} - ${endIdx}`, 'info');
    }

    for (let i = startIdx; i <= endIdx; i++) {
        let row = [data.labels[i]];
        data.datasets.forEach(ds => {
            const value = ds.data[i] !== null ? ds.data[i].toFixed(4) : '';
            row.push(value);
        });
        csvContent += row.join(',') + '\n';
    }
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    const filename = exportRange ? "telemetry_data_range.csv" : "telemetry_data.csv";
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    const message = exportRange ? '[UI] Zaznaczony zakres wyeksportowany do CSV.' : '[UI] Dane wykresu wyeksportowane do CSV.';
    addLogMessage(message, 'info');
}
function exportChartToPng() { const link = document.createElement('a'); link.download = 'telemetry_chart.png'; link.href = signalAnalyzerChart.toBase64Image(); link.click(); addLogMessage('[UI] Wykres wyeksportowany do PNG.', 'info'); }

function saveCurrentAsPreset() {
    const presetName = prompt("Podaj nazwe dla nowego presetu:", "");
    if (presetName && presetName.trim() !== "") {
        const presetData = {};
        for (const [inputId, snakeKey] of Object.entries(parameterMapping)) {
            const input = document.getElementById(inputId); if (input) { presetData[inputId] = parseFloat(input.value); }
        }
        presetData['balanceSwitch'] = document.getElementById('balanceSwitch').checked;
        presetData['holdPositionSwitch'] = document.getElementById('holdPositionSwitch').checked;
        presetData['speedModeSwitch'] = document.getElementById('speedModeSwitch').checked;
        localStorage.setItem(CUSTOM_PRESET_PREFIX + presetName.trim(), JSON.stringify(presetData));
        addLogMessage(`[UI] Zapisano wlasny preset '${presetName.trim()}'.`, 'success');
        populatePresetSelect();
    }
}
async function applySelectedPreset() {
    const select = document.getElementById('pidPresetSelect'); const selectedValue = select.value; let presetData;
    if (selectedValue.startsWith(CUSTOM_PRESET_PREFIX)) { presetData = JSON.parse(localStorage.getItem(selectedValue)); } else { presetData = builtInPresetsData[selectedValue]?.params; }
    if (presetData) {
        AppState.isApplyingConfig = true;
        for (const [key, value] of Object.entries(presetData)) {
            const input = document.getElementById(key);
            if (input) { let actualValue = value; if (['turn_factor', 'expo_joystick', 'joystick_sensitivity', 'joystick_deadzone', 'balance_pid_derivative_filter_alpha'].includes(parameterMapping[key])) { actualValue = (value * 100); } input.value = actualValue; }
            else if (['balanceSwitch', 'holdPositionSwitch', 'speedModeSwitch'].includes(key)) { document.getElementById(key).checked = value; }
        }
        AppState.isApplyingConfig = false; addLogMessage('[UI] Zastosowano wartosci presetu. Zapisz na robocie, aby wyslac.', 'info');
        for (const [key, value] of Object.entries(presetData)) { const input = document.getElementById(key); if (input) { input.dispatchEvent(new Event('change', { bubbles: true })); } }
    }
}
function populatePresetSelect() { const select = document.getElementById('pidPresetSelect'); select.innerHTML = ''; for (const [index, preset] of Object.entries(builtInPresetsData)) { const option = document.createElement('option'); option.value = index; option.textContent = preset.name; select.appendChild(option); } for (let i = 0; i < localStorage.length; i++) { const key = localStorage.key(i); if (key.startsWith(CUSTOM_PRESET_PREFIX)) { const presetName = key.substring(CUSTOM_PRESET_PREFIX.length); const option = document.createElement('option'); option.value = key; option.textContent = `Wlasny: ${presetName}`; select.appendChild(option); } } }
function deleteSelectedPreset() { const select = document.getElementById('pidPresetSelect'); const selectedValue = select.value; if (!selectedValue.startsWith(CUSTOM_PRESET_PREFIX)) { addLogMessage('[UI] Nie mozna usunac wbudowanego presetu.', 'warn'); return; } if (confirm(`Czy na pewno chcesz usunac preset '${selectedValue.substring(CUSTOM_PRESET_PREFIX.length)}'?`)) { localStorage.removeItem(selectedValue); addLogMessage(`[UI] Usunieto preset.`, 'info'); populatePresetSelect(); } }

function setupSequenceControls() { document.getElementById('add-sequence-step-btn').addEventListener('click', addSequenceStep); document.getElementById('run-sequence-btn').addEventListener('click', runSequence); document.getElementById('stop-sequence-btn').addEventListener('click', stopSequenceExecution); document.getElementById('clear-sequence-btn').addEventListener('click', clearSequence); }
function addSequenceStep() {
    const list = document.getElementById('sequence-list'); if (list.children.length >= MAX_SEQUENCE_STEPS) { addLogMessage(`[UI] Osiagnieto maksymalna liczbe krokow (${MAX_SEQUENCE_STEPS}).`, 'warn'); return; }
    const stepDiv = document.createElement('div'); stepDiv.className = 'sequence-step';
    stepDiv.innerHTML = `<select class="sequence-type"><option value="move_fwd">Przod (cm)</option><option value="move_bwd">Tyl (cm)</option><option value="rotate_r">Obrot Prawo (st.)</option><option value="rotate_l">Obrot Lewo (st.)</option><option value="wait_ms">Czekaj (ms)</option><option value="wait_condition">Czekaj az (np. pitch < 0.5)</option><option value="set_param">Ustaw parametr (np. Kp=100)</option></select><input type="text" class="sequence-value" value="20"><button class="remove-step-btn">&times;</button>`;
    list.appendChild(stepDiv); updateAccordionHeight(list.closest('.accordion-content'));
    stepDiv.querySelector('.sequence-type').addEventListener('change', (e) => {
        const valueInput = stepDiv.querySelector('.sequence-value'); const type = e.target.value;
        if (type === 'wait_condition') { valueInput.type = 'text'; valueInput.value = 'pitch < 0.5'; }
        else if (type === 'set_param') { valueInput.type = 'text'; valueInput.value = 'balanceKpInput=100.0'; }
        else { valueInput.type = 'number'; valueInput.value = '20'; }
    });
    stepDiv.querySelector('.remove-step-btn').addEventListener('click', () => { stepDiv.remove(); updateAccordionHeight(list.closest('.accordion-content')); });
}
function runSequence() { if (AppState.isSequenceRunning) return; if (AppState.lastKnownRobotState !== 'TRZYMA_POZYCJE' && AppState.lastKnownRobotState !== 'BALANSUJE') { addLogMessage(`[UI] Nie mozna rozpoczac sekwencji. Robot w stanie '${AppState.lastKnownRobotState}'.`, 'error'); return; } const steps = document.querySelectorAll('.sequence-step'); if (steps.length === 0) return; resetPathVisualization(); AppState.isSequenceRunning = true; currentSequenceStep = 0; updateSequenceUI(); addLogMessage(`[UI] Rozpoczeto sekwencje z ${steps.length} krokow.`, 'info'); executeNextSequenceStep(); }
function stopSequenceExecution() { if (!AppState.isSequenceRunning) return; AppState.isSequenceRunning = false; sendBleMessage({ type: 'command_stop' }); updateSequenceUI(); addLogMessage('[UI] Sekwencja zatrzymana.', 'warn'); }
function clearSequence() { if (AppState.isSequenceRunning) stopSequenceExecution(); const list = document.getElementById('sequence-list'); list.innerHTML = ''; updateAccordionHeight(list.closest('.accordion-content')); resetPathVisualization(); }
function updateSequenceUI() { document.querySelectorAll('.sequence-step').forEach((step, index) => { step.classList.toggle('executing', AppState.isSequenceRunning && index === currentSequenceStep); }); document.getElementById('run-sequence-btn').disabled = AppState.isSequenceRunning; document.getElementById('add-sequence-step-btn').disabled = AppState.isSequenceRunning; document.getElementById('clear-sequence-btn').disabled = AppState.isSequenceRunning; document.getElementById('stop-sequence-btn').disabled = !AppState.isSequenceRunning; }
function checkAndExecuteNextSequenceStep(previousState) { const wasWorking = ['RUCH_AUTONOMICZNY', 'OBROT_AUTONOMICZNY'].includes(previousState); const isReady = ['TRZYMA_POZYCJE', 'BALANSUJE'].includes(AppState.lastKnownRobotState); if (AppState.isSequenceRunning && wasWorking && isReady) { addLogMessage(`[UI] Krok ${currentSequenceStep + 1} zakonczony.`, 'info'); currentSequenceStep++; executeNextSequenceStep(); } }

// Pomocnicze: ewaluacja warunku w oparciu o ostatnią telemetrię
function evaluateCondition(expr) {
    if (typeof expr !== 'string') return null;
    const m = expr.match(/^\s*([a-zA-Z_][\w]*)\s*(==|!=|>=|<=|>|<)\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (!m) return null;
    const [, key, op, rhsStr] = m;
    const lhs = window.telemetryData ? window.telemetryData[key] : undefined;
    const rhs = parseFloat(rhsStr);
    if (typeof lhs !== 'number' || Number.isNaN(lhs)) return null;
    switch (op) {
        case '==': return lhs === rhs;
        case '!=': return lhs !== rhs;
        case '>': return lhs > rhs;
        case '<': return lhs < rhs;
        case '>=': return lhs >= rhs;
        case '<=': return lhs <= rhs;
        default: return null;
    }
}

function waitForCondition(expr, timeoutMs = 10000, intervalMs = 100) {
    return new Promise((resolve, reject) => {
        const start = Date.now();
        const timer = setInterval(() => {
            const ok = evaluateCondition(expr);
            if (ok === true) { clearInterval(timer); resolve(); }
            else if (Date.now() - start > timeoutMs) { clearInterval(timer); reject(new Error('timeout')); }
        }, intervalMs);
    });
}
function executeNextSequenceStep() {
    const steps = document.querySelectorAll('.sequence-step');
    if (!AppState.isSequenceRunning || currentSequenceStep >= steps.length) { if (AppState.isSequenceRunning) { AppState.isSequenceRunning = false; addLogMessage('[UI] Sekwencja ukonczona.', 'success'); showSequenceReport(); } updateSequenceUI(); return; }
    updateSequenceUI();
    const stepNode = steps[currentSequenceStep], type = stepNode.querySelector('.sequence-type').value, value = stepNode.querySelector('.sequence-value').value; let command = {};
    switch (type) {
        case 'move_fwd': command = { type: 'execute_move', distance_cm: parseFloat(value) }; break;
        case 'move_bwd': command = { type: 'execute_move', distance_cm: -parseFloat(value) }; break;
        case 'rotate_r': command = { type: 'execute_rotate', angle_deg: parseFloat(value) }; break;
        case 'rotate_l': command = { type: 'execute_rotate', angle_deg: -parseFloat(value) }; break;
        case 'wait_ms': {
            const duration = parseInt(value);
            const ms = Number.isFinite(duration) ? duration : 0;
            addLogMessage(`[UI] Czekam ${ms} ms...`, 'info');
            setTimeout(() => { currentSequenceStep++; executeNextSequenceStep(); }, ms);
            return; // nie wysyłamy komendy do robota
        }
        case 'wait_condition': {
            const cond = String(value || '').trim();
            if (!cond) { addLogMessage('[UI] Pusty warunek. Pomijam.', 'warn'); currentSequenceStep++; executeNextSequenceStep(); return; }
            addLogMessage(`[UI] Czekam az warunek bedzie prawdziwy: ${cond}`, 'info');
            waitForCondition(cond).then(() => {
                addLogMessage('[UI] Warunek spelniony.', 'success');
                currentSequenceStep++;
                executeNextSequenceStep();
            }).catch(() => {
                addLogMessage('[UI] Timeout czekania na warunek. Przechodze dalej.', 'warn');
                currentSequenceStep++;
                executeNextSequenceStep();
            });
            return; // nie wysyłamy komendy do robota
        }
        case 'set_param': {
            const parts = String(value).split('=');
            const inputId = parts[0]?.trim();
            const paramValue = parts[1]?.trim();
            if (inputId && paramValue) {
                const snakeKey = parameterMapping[inputId];
                if (snakeKey) {
                    let val = parseFloat(paramValue);
                    if (['turn_factor', 'expo_joystick', 'joystick_sensitivity', 'joystick_deadzone', 'balance_pid_derivative_filter_alpha', 'speed_pid_filter_alpha', 'position_pid_filter_alpha', 'weights_itae', 'weights_overshoot', 'weights_control_effort'].includes(snakeKey)) {
                        val /= 100.0;
                    }
                    addLogMessage(`[UI] Ustaw parametr: ${snakeKey} = ${val}`, 'info');
                    sendBleMessage({ type: 'set_param', key: snakeKey, value: val });
                    // natychmiast przejdź dalej
                    currentSequenceStep++;
                    executeNextSequenceStep();
                    return;
                } else {
                    addLogMessage(`[UI] Nieznany parametr: ${inputId}.`, 'error'); currentSequenceStep++; executeNextSequenceStep(); return;
                }
            } else { addLogMessage(`[UI] Nieprawidlowy format: ${value}.`, 'error'); currentSequenceStep++; executeNextSequenceStep(); return; }
        }
    }
    addLogMessage(`[UI] Wysylanie kroku ${currentSequenceStep + 1}/${steps.length}: ${JSON.stringify(command)}`, 'info');
    sendBleMessage(command);
    if (['move_fwd', 'move_bwd', 'rotate_r', 'rotate_l'].includes(type)) { addPlannedPathSegment(type, parseFloat(value)); }
}
let pathCanvas, pathCtx; let robotPathX = 0, robotPathY = 0, robotPathHeading = 0; const CM_PER_PIXEL = 1.0; let plannedPath = [], actualPath = [];
function initPathVisualization() { pathCanvas = document.getElementById('pathCanvas'); pathCtx = pathCanvas.getContext('2d'); pathCanvas.width = pathCanvas.clientWidth; pathCanvas.height = pathCanvas.clientHeight; resetPathVisualization(); }
function drawPathVisualization() { if (!pathCtx) return; pathCtx.clearRect(0, 0, pathCanvas.width, pathCanvas.height); const drawPath = (path, color) => { pathCtx.strokeStyle = color; pathCtx.lineWidth = 2; pathCtx.beginPath(); if (path.length > 0) { pathCtx.moveTo(path[0].x, path[0].y); path.forEach(p => pathCtx.lineTo(p.x, p.y)); } pathCtx.stroke(); }; drawPath(plannedPath, '#61dafb'); drawPath(actualPath, '#a2f279'); if (actualPath.length > 0) { const lastPos = actualPath[actualPath.length - 1]; pathCtx.fillStyle = '#ff6347'; pathCtx.beginPath(); pathCtx.arc(lastPos.x, lastPos.y, 4, 0, Math.PI * 2); pathCtx.fill(); } }
function addPlannedPathSegment(type, value) { let { x, y, heading } = plannedPath.length > 0 ? plannedPath[plannedPath.length - 1] : { x: robotPathX, y: robotPathY, heading: robotPathHeading }; let newX = x, newY = y, newHeading = heading; const angleRad = (heading - 90) * Math.PI / 180; if (type === 'move_fwd') { newX += Math.cos(angleRad) * value / CM_PER_PIXEL; newY += Math.sin(angleRad) * value / CM_PER_PIXEL; } else if (type === 'move_bwd') { newX -= Math.cos(angleRad) * value / CM_PER_PIXEL; newY -= Math.sin(angleRad) * value / CM_PER_PIXEL; } else if (type === 'rotate_r') { newHeading += value; } else if (type === 'rotate_l') { newHeading -= value; } plannedPath.push({ x: newX, y: newY, heading: newHeading }); drawPathVisualization(); }
function updateActualPath(data) { if (data.pos_x_cm !== undefined && data.pos_y_cm !== undefined && data.yaw !== undefined) { const actualX = robotPathX + (data.pos_x_cm / CM_PER_PIXEL); const actualY = robotPathY - (data.pos_y_cm / CM_PER_PIXEL); actualPath.push({ x: actualX, y: actualY, heading: data.yaw }); drawPathVisualization(); } }
function resetPathVisualization() { robotPathX = pathCanvas.width / 2; robotPathY = pathCanvas.height / 2; robotPathHeading = 0; plannedPath = [{ x: robotPathX, y: robotPathY, heading: robotPathHeading }]; actualPath = [{ x: robotPathX, y: robotPathY, heading: robotPathHeading }]; const ReportPanel = document.getElementById('sequenceReportPanel'); if (ReportPanel) { ReportPanel.style.display = 'none'; } drawPathVisualization(); }
function showSequenceReport() { document.getElementById('sequence-report-panel').style.display = 'block'; document.getElementById('avgHeadingError').textContent = 'X.X °'; document.getElementById('maxHeadingError').textContent = 'Y.Y °'; document.getElementById('totalDistanceCovered').textContent = 'Z.Z cm'; }

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
    const applyZnBtn = document.getElementById('apply-zn-results');
    if (applyZnBtn) applyZnBtn.addEventListener('click', () => {
        const kp = parseFloat(document.getElementById('zn-kp-suggest').textContent), kd = parseFloat(document.getElementById('zn-kd-suggest').textContent);
        if (!isNaN(kp) && !isNaN(kd)) {
            document.getElementById('balanceKpInput').value = kp.toFixed(4); document.getElementById('balanceKdInput').value = kd.toFixed(4);
            document.getElementById('balanceKpInput').dispatchEvent(new Event('change')); document.getElementById('balanceKdInput').dispatchEvent(new Event('change'));
            addLogMessage('[UI] Zastosowano wartosci z Z-N.', 'info');
        }
    });
    const __loopSel = document.getElementById('tuning-loop-selector');
    if (__loopSel) __loopSel.addEventListener('change', updateSearchSpaceInputs);
    updateSearchSpaceInputs();
}

// Główne zakładki w panelu optymalizacji (Konfiguracja/Metody)
function setupMainAutotuneTabs() {
    const tabs = document.querySelectorAll('.autotune-main-tab');
    const panes = document.querySelectorAll('.autotune-main-content');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const target = tab.dataset.tab;
            tabs.forEach(t => t.classList.remove('active'));
            panes.forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            document.querySelector(`.autotune-main-content[data-tab="${target}"]`)?.classList.add('active');
            // Pokazuj przyciski sterujące tylko na zakładce 'methods'
            const controlsBar = document.getElementById('tuning-controls-bar');
            if (controlsBar) controlsBar.style.display = (target === 'methods') ? 'flex' : 'none';
        });
    });
    // Ustaw widoczność kontrolek zgodnie z aktywną zakładką na starcie
    const activeMain = document.querySelector('.autotune-main-tab.active')?.dataset.tab || 'config';
    const controlsBar = document.getElementById('tuning-controls-bar');
    if (controlsBar) controlsBar.style.display = (activeMain === 'methods') ? 'flex' : 'none';
}
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
function checkTuningPrerequisites() { if (!AppState.isConnected || !AppState.isSynced) { addLogMessage('[UI] Blad: Polacz i zsynchronizuj z robotem.', 'error'); return false; } if (!['BALANSUJE', 'TRZYMA_POZYCJE'].includes(AppState.lastKnownRobotState)) { addLogMessage(`[UI] Blad: Wymagany stan 'BALANSUJE'. Aktualny: '${AppState.lastKnownRobotState}'.`, 'error'); return false; } if (AppState.isTuningActive) { addLogMessage('[UI] Blad: Inna sesja strojenia jest juz w toku.', 'warn'); return false; } return true; }
function setTuningUiLock(isLocked, method) {
    AppState.isTuningActive = isLocked;
    AppState.activeTuningMethod = isLocked ? method : '';

    // Globalny tryb strojenia (odblokowane: Sterowanie, Optymalizacja, Logi)
    document.body.classList.toggle('tuning-active', isLocked);

    // Wyłączamy przełączanie zakładek i testy UI
    document.querySelectorAll('.run-test-btn').forEach(btn => btn.disabled = isLocked);
    document.querySelectorAll('.method-tab').forEach(tab => tab.disabled = isLocked);
    // Dashboard legacy usunięty

    // Przełącz widoki w panelu optymalizacji
    const cfgPanel = document.getElementById('autotuning-config-panel');
    const progress = document.getElementById('tuning-progress-panel');
    if (cfgPanel) cfgPanel.classList.toggle('autotune-config-hide', isLocked);
    if (progress) progress.style.display = isLocked ? 'block' : 'none';
}
// Legacy handler wyników strojenia (serwerowych) został usunięty.
// Wyniki algorytmów (GA/PSO/ZN/Bayesian) są obsługiwane wyłącznie po stronie klienta.

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
// Ujednolicone API: prosta warstwa nad sendBleMessage w stylu (type,payload)
function sendBleCommand(type, payload) {
    const msg = Object.assign({ type }, payload || {});
    sendBleMessage(msg);
}

// Refaktoryzacja: wykorzystuj Simple Test API (run_metrics_test / run_relay_test)
function runDynamicTest(testType) {
    if (!checkTuningPrerequisites()) return;
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
    // Ujednolicenie: firmware oczekuje komendy 'run_metrics_test'
    sendBleCommand('run_metrics_test', { kp, ki, kd, testId });
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
    // ...existing code...

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
function initJoystick() {
    const wrapper = document.getElementById('joystickWrapper');
    const size = wrapper.clientWidth;
    const joystickCanvas = document.getElementById('joystickCanvas');
    const joystickCtx = joystickCanvas.getContext('2d');
    joystickCanvas.width = size;
    joystickCanvas.height = size;
    joystickCenter = { x: size / 2, y: size / 2 };
    joystickRadius = size / 2 * 0.75;
    knobRadius = size / 2 * 0.25;
    drawJoystick(joystickCtx, joystickCenter.x, joystickCenter.y);
}
function drawJoystick(ctx, x, y) {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.beginPath();
    ctx.arc(joystickCenter.x, joystickCenter.y, joystickRadius, 0, 2 * Math.PI);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, knobRadius, 0, 2 * Math.PI);
    ctx.fillStyle = '#61dafb';
    ctx.fill();
}
function handleJoystickStart(event) { event.preventDefault(); isDragging = true; }
function handleJoystickMove(event) { if (!isDragging) return; event.preventDefault(); const joystickCanvas = document.getElementById('joystickCanvas'); let { x, y } = getJoystickPosition(event); const dx = x - joystickCenter.x; const dy = y - joystickCenter.y; const distance = Math.sqrt(dx * dx + dy * dy); if (distance > joystickRadius) { x = joystickCenter.x + (dx / distance) * joystickRadius; y = joystickCenter.y + (dy / distance) * joystickRadius; } drawJoystick(joystickCanvas.getContext('2d'), x, y); const now = Date.now(); if (now - lastJoystickSendTime > JOYSTICK_SEND_INTERVAL) { const joyX = (x - joystickCenter.x) / joystickRadius; const joyY = -(y - joystickCenter.y) / joystickRadius; sendBleMessage({ type: 'joystick', x: joyX, y: joyY }); lastJoystickSendTime = now; } }
function getJoystickPosition(event) { const rect = document.getElementById('joystickCanvas').getBoundingClientRect(); const touch = event.touches ? event.touches[0] : event; return { x: touch.clientX - rect.left, y: touch.clientY - rect.top }; }
function handleJoystickEnd(event) { if (!isDragging) return; event.preventDefault(); isDragging = false; drawJoystick(document.getElementById('joystickCanvas').getContext('2d'), joystickCenter.x, joystickCenter.y); sendBleMessage({ type: 'joystick', x: 0, y: 0 }); }
function pollGamepad() { if (gamepadIndex !== null) { const gp = navigator.getGamepads()[gamepadIndex]; if (!gp) return; if (isMappingButton && actionToMap) { gp.buttons.forEach((button, i) => { if (button.pressed && !lastGamepadState[i]) { Object.keys(gamepadMappings).forEach(key => { if (gamepadMappings[key] === actionToMap) delete gamepadMappings[key]; }); gamepadMappings[i] = actionToMap; saveGamepadMappings(); addLogMessage(`[UI] Akcja '${availableActions[actionToMap].label}' przypisana do przycisku ${i}.`, 'success'); isMappingButton = false; actionToMap = null; renderMappingModal(); } }); } else { gp.buttons.forEach((button, i) => { if (button.pressed && !lastGamepadState[i]) { const action = gamepadMappings[i]; if (action && availableActions[action]) { const element = document.getElementById(availableActions[action].elementId); if (element && !element.disabled) { element.click(); flashElement(element); } } } }); } lastGamepadState = gp.buttons.map(b => b.pressed); let x = gp.axes[0] || 0; let y = gp.axes[1] || 0; if (Math.abs(x) < 0.15) x = 0; if (Math.abs(y) < 0.15) y = 0; sendBleMessage({ type: 'joystick', x: x, y: -y }); } requestAnimationFrame(pollGamepad); }
window.addEventListener('gamepadconnected', (e) => { gamepadIndex = e.gamepad.index; document.getElementById('gamepadStatus').textContent = 'Polaczony'; document.getElementById('gamepadStatus').style.color = '#a2f279'; addLogMessage(`[UI] Gamepad polaczony: ${e.gamepad.id}`, 'success'); });
window.addEventListener('gamepaddisconnected', (e) => { gamepadIndex = null; document.getElementById('gamepadStatus').textContent = 'Brak'; document.getElementById('gamepadStatus').style.color = '#f7b731'; addLogMessage('[UI] Gamepad rozlaczony.', 'warn'); });
function startMapping(action, buttonElement) { if (gamepadIndex === null) { addLogMessage("Podlacz gamepada, aby rozpoczac mapowanie!", "warn"); return; } isMappingButton = true; actionToMap = action; document.querySelectorAll('.mapping-button').forEach(btn => btn.textContent = "Przypisz"); buttonElement.textContent = "Czekam..."; addLogMessage(`[UI] Nasluchiwanie na przycisk dla akcji: ${availableActions[action].label}...`, "info"); }
function renderMappingModal() { const list = document.getElementById('gamepad-mapping-list'); list.innerHTML = ''; for (const [action, config] of Object.entries(availableActions)) { const row = document.createElement('div'); row.className = 'mapping-row'; const buttonIndex = Object.keys(gamepadMappings).find(key => gamepadMappings[key] === action); row.innerHTML = `<span class="mapping-label">${config.label}</span><span class="mapping-display">${buttonIndex !== undefined ? `Przycisk ${buttonIndex}` : 'Brak'}</span><button class="mapping-button" data-action="${action}">Przypisz</button>`; list.appendChild(row); } list.querySelectorAll('.mapping-button').forEach(button => { button.addEventListener('click', (e) => { const action = e.target.dataset.action; startMapping(action, e.target); }); }); }
function setupNumericInputs() {
    document.querySelectorAll('.numeric-input-wrapper').forEach(wrapper => {
        const container = wrapper.closest('.setting-container') || wrapper.closest('.pwm-input-row');
        if (!container) return;
        const input = container.querySelector('input[type=number]');
        const minusBtn = wrapper.querySelector('button:first-child');
        const plusBtn = wrapper.querySelector('button:last-child');
        if (!input || !minusBtn || !plusBtn || input.disabled) return;
        const step = parseFloat(input.step) || 1;
        const isFloat = input.step.includes('.');

        // Add automatic value clamping on input
        input.addEventListener('input', (e) => {
            let value = parseFloat(e.target.value);
            if (isNaN(value)) return;

            const min = parseFloat(e.target.min);
            const max = parseFloat(e.target.max);

            if (!isNaN(min) && value < min) {
                e.target.value = min;
            }
            if (!isNaN(max) && value > max) {
                e.target.value = max;
            }
        });

        // Also clamp on blur (when user leaves the field)
        input.addEventListener('blur', (e) => {
            let value = parseFloat(e.target.value);
            if (isNaN(value)) {
                e.target.value = parseFloat(e.target.min) || 0;
                return;
            }

            const min = parseFloat(e.target.min);
            const max = parseFloat(e.target.max);

            if (!isNaN(min) && value < min) {
                e.target.value = min;
                e.target.dispatchEvent(new Event('change', { bubbles: true }));
            }
            if (!isNaN(max) && value > max) {
                e.target.value = max;
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
            input.dispatchEvent(new Event('change', { bubbles: true }));
        };
        minusBtn.addEventListener('click', () => updateValue(-step));
        plusBtn.addEventListener('click', () => updateValue(step));
    });
}
function sendFullConfigToRobot() {
    const params = {};
    for (const [inputId, snakeKey] of Object.entries(parameterMapping)) {
        const input = document.getElementById(inputId);
        if (!input) continue;
        let value;
        if (input.type === 'checkbox') value = input.checked;
        else value = parseFloat(input.value);

        // Konwersje jednostek i procentów
        if (['turn_factor', 'expo_joystick', 'joystick_sensitivity', 'joystick_deadzone', 'balance_pid_derivative_filter_alpha', 'speed_pid_filter_alpha', 'position_pid_filter_alpha', 'weights_itae', 'weights_overshoot', 'weights_control_effort'].includes(snakeKey)) {
            value /= 100.0;
        }
        if (snakeKey === 'ga_mutation_rate') {
            value /= 100.0; // % -> frakcja
        }
        if (snakeKey === 'tuning_trial_duration_ms') {
            value = (value * 1000.0); // s -> ms
        }
        params[snakeKey] = value;
    }
    // Add trim parameters from displays
    params['trim_angle'] = parseFloat(document.getElementById('trimValueDisplay').textContent) || 0;
    params['roll_trim'] = parseFloat(document.getElementById('rollTrimValueDisplay').textContent) || 0;
    addLogMessage('[UI] Wysylam pelna konfiguracje do robota...', 'info');
    sendBleMessage({ type: 'full_config', params });
}
// LEGACY REMOVED: setupEventListeners() nieużywane po refaktorze – zachowane tylko jako komentarz dla historii.
// (Jeśli potrzebne w przyszłości: przenieść potrzebne listenery do setupParameterListeners.)

function setupParameterListeners() {
    const sendSingleParam = (inputId, value) => {
        if (AppState.isApplyingConfig) return;
        const snakeKey = parameterMapping[inputId];
        if (snakeKey) {
            if (['turn_factor', 'expo_joystick', 'joystick_sensitivity', 'joystick_deadzone', 'balance_pid_derivative_filter_alpha', 'speed_pid_filter_alpha', 'position_pid_filter_alpha', 'weights_itae', 'weights_overshoot', 'weights_control_effort'].includes(snakeKey)) {
                value /= 100.0;
            }
            sendBleMessage({ type: 'set_param', key: snakeKey, value: value });
        }
    };
    const debouncedSendSingleParam = debounce(sendSingleParam, 400);
    document.querySelectorAll('.config-value').forEach(input => { input.addEventListener('change', (e) => { debouncedSendSingleParam(e.target.id, parseFloat(e.target.value)); }); });
    // AUTOTUNING: wysyłanie parametrów metod (GA/PSO/ZN) jako set_tuning_config_param z odpowiednimi konwersjami
    const sendTuningParam = (snakeKey, rawValue) => {
        if (AppState.isApplyingConfig) return;
        let value = rawValue;
        if (typeof value === 'number' && isNaN(value)) return;
        if (snakeKey && snakeKey.startsWith('weights_')) {
            value = (parseFloat(value) / 100.0);
        }
        if (snakeKey === 'ga_mutation_rate') {
            value = (parseFloat(value) / 100.0);
        }
        if (snakeKey === 'tuning_trial_duration_ms') {
            value = Math.round(parseFloat(value) * 1000.0); // s -> ms
        }
        sendBleMessage({ type: 'set_tuning_config_param', key: snakeKey, value });
    };
    const debouncedSendTuningParam = debounce((inputId, val) => {
        const snakeKey = parameterMapping[inputId];
        if (!snakeKey) return;
        sendTuningParam(snakeKey, val);
    }, 300);
    // Zarejestruj listenery dla wszystkich pól autotuningu, które nie mają klasy .config-value
    for (const [inputId, snakeKey] of Object.entries(parameterMapping)) {
        const input = document.getElementById(inputId);
        if (!input) continue;
        if (input.classList.contains('config-value')) continue; // te obsługuje blok wyżej
        // Ogranicz do kluczy strojenia/poszukiwania/prób
        const isTuningKey = (
            snakeKey.startsWith('ga_') || snakeKey.startsWith('pso_') || snakeKey.startsWith('space_') ||
            snakeKey.startsWith('weights_') || snakeKey === 'tuning_trial_duration_ms' || snakeKey === 'zn_amplitude'
        );
        if (!isTuningKey) continue;
        if (input.type === 'checkbox') {
            input.addEventListener('change', (e) => {
                sendBleMessage({ type: 'set_tuning_config_param', key: snakeKey, value: e.target.checked });
            });
        } else {
            input.addEventListener('change', (e) => {
                const v = parseFloat(e.target.value);
                debouncedSendTuningParam(inputId, v);
            });
        }
    }
    const joystickCanvasEl = document.getElementById('joystickCanvas');
    if (joystickCanvasEl) {
        joystickCanvasEl.addEventListener('mousedown', handleJoystickStart); document.addEventListener('mousemove', handleJoystickMove); document.addEventListener('mouseup', handleJoystickEnd);
        joystickCanvasEl.addEventListener('touchstart', handleJoystickStart, { passive: false }); document.addEventListener('touchmove', handleJoystickMove, { passive: false }); document.addEventListener('touchend', handleJoystickEnd); document.addEventListener('touchcancel', handleJoystickEnd);
    }
    const connectBleBtnEl = document.getElementById('connectBleBtn');
    connectBleBtnEl?.addEventListener('click', connectBLE);
    ['balanceSwitch', 'holdPositionSwitch', 'speedModeSwitch'].forEach(id => { const el = document.getElementById(id); if (!el) return; el.addEventListener('change', (e) => { if (AppState.isApplyingConfig) return; const typeMap = { 'balanceSwitch': 'balance_toggle', 'holdPositionSwitch': 'hold_position_toggle', 'speedModeSwitch': 'speed_mode_toggle' }; sendBleMessage({ type: typeMap[id], enabled: e.target.checked }); }); });

    // POPRAWKA: Usunięto stare listenery dla trim+/- i dodano nowe, poprawne dla precyzyjnych przycisków.
    const toolButtons = { 'resetZeroBtn': { type: 'set_pitch_zero' }, 'resetEncodersBtn': { type: 'reset_encoders' }, 'emergencyStopBtn': { type: 'emergency_stop' } };
    // Trim: aktualizacja + wysyłka set_param (jednolite traktowanie)
    function updateAndSendTrim(delta) {
        const span = document.getElementById('trimValueDisplay');
        if (!span) return; const currentApparent = parseFloat(span.textContent) || 0; const newApparent = currentApparent + delta; span.textContent = newApparent.toFixed(2);
        // Send absolute value: actualTrim = uiTrimZeroBasePitch + apparentTrim
        const actualToSend = (uiTrimZeroBasePitch || 0) + newApparent;
        sendBleMessage({ type: 'set_param', key: 'trim_angle', value: actualToSend });
    }
    document.getElementById('trimMinus01Btn')?.addEventListener('click', () => updateAndSendTrim(-0.1));
    document.getElementById('trimMinus001Btn')?.addEventListener('click', () => updateAndSendTrim(-0.01));
    document.getElementById('trimPlus001Btn')?.addEventListener('click', () => updateAndSendTrim(0.01));
    document.getElementById('trimPlus01Btn')?.addEventListener('click', () => updateAndSendTrim(0.1));
    // Roll trim: aktualizacja + wysyłka set_param
    document.getElementById('resetRollZeroBtn')?.addEventListener('click', () => setRollZero());
    // Reset korekty pionu (pitch trim) - ustawia trim tak, by skorygowany kąt wynosił 0
    document.getElementById('resetZeroBtn')?.addEventListener('click', () => setPitchZero());
    function updateAndSendRollTrim(delta) {
        const span = document.getElementById('rollTrimValueDisplay');
        if (!span) return; const currentApparent = parseFloat(span.textContent) || 0; const newApparent = currentApparent + delta; span.textContent = newApparent.toFixed(2);
        const actualToSend = (uiTrimZeroBaseRoll || 0) + newApparent;
        sendBleMessage({ type: 'set_param', key: 'roll_trim', value: actualToSend });
    }
    document.getElementById('rollTrimMinus01Btn')?.addEventListener('click', () => updateAndSendRollTrim(-0.1));
    document.getElementById('rollTrimMinus001Btn')?.addEventListener('click', () => updateAndSendRollTrim(-0.01));
    document.getElementById('rollTrimPlus001Btn')?.addEventListener('click', () => updateAndSendRollTrim(0.01));
    document.getElementById('rollTrimPlus01Btn')?.addEventListener('click', () => updateAndSendRollTrim(0.1));

    function setPitchZero() {
        const eul = getRawEuler();
        if (!eul) { addLogMessage('[UI] Brak danych telemetrii (pitch). Nie mozna ustawic punktu 0.', 'warn'); return; }
        const rawPitch = Number(eul.pitch || 0);
        // computedTrim so that rawPitch + computedTrim == 0
        const computedTrim = -rawPitch; // trim that zeros the displayed pitch
        // Send set_param to actually change the trim value in firmware
        sendBleMessage({ type: 'set_param', key: 'trim_angle', value: computedTrim });
        // Backward compatibility: also send the legacy command
        sendBleMessage({ type: 'set_pitch_zero' });
        // Update UI base so apparent trim becomes zero and displayed angle is zero
        uiTrimZeroBasePitch = computedTrim;
        uiZeroBaselineAnglePitch = rawPitch + computedTrim; // normally 0, but keep for correctness
        const span = document.getElementById('trimValueDisplay'); if (span) span.textContent = (0).toFixed(2);
        // Set displayed total trim original and delta
        const origSpan = document.getElementById('trimOriginalDisplay'); if (origSpan && originalFirmwareTrimPitch !== null) origSpan.textContent = originalFirmwareTrimPitch.toFixed(2);
        const deltaSpan = document.getElementById('trimDeltaDisplay'); if (deltaSpan) deltaSpan.textContent = (computedTrim - (originalFirmwareTrimPitch || 0)).toFixed(2);
        // Show corrected angle as 0.0 in dashboard for immediate feedback and update charts/history
        const val = document.getElementById('angleVal'); if (val) val.textContent = '0.0 °';
        pitchHistory.push(0); if (pitchHistory.length > HISTORY_LENGTH) pitchHistory.shift(); updateChart({ pitch: 0 });
        addLogMessage(`[UI] Punkt 0 (Pitch) ustawiony. Wyliczony trim = ${computedTrim.toFixed(2)}° (apparent = 0). Przycisk 'Zapisz' utrwali zmiany w EEPROM.`, 'success');
    }

    function setRollZero() {
        const eul = getRawEuler();
        if (!eul) { addLogMessage('[UI] Brak danych telemetrii (roll). Nie mozna ustawic punktu 0.', 'warn'); return; }
        const rawRoll = Number(eul.roll || 0);
        const computedTrim = -rawRoll; // trim to zero displayed roll
        sendBleMessage({ type: 'set_param', key: 'roll_trim', value: computedTrim });
        sendBleMessage({ type: 'set_roll_zero' });
        uiTrimZeroBaseRoll = computedTrim;
        uiZeroBaselineAngleRoll = rawRoll + computedTrim; // normally 0
        const span = document.getElementById('rollTrimValueDisplay'); if (span) span.textContent = (0).toFixed(2);
        const origSpan = document.getElementById('rollTrimOriginalDisplay'); if (origSpan && originalFirmwareTrimRoll !== null) origSpan.textContent = originalFirmwareTrimRoll.toFixed(2);
        const deltaSpan = document.getElementById('rollTrimDeltaDisplay'); if (deltaSpan) deltaSpan.textContent = (computedTrim - (originalFirmwareTrimRoll || 0)).toFixed(2);
        const val = document.getElementById('rollVal'); if (val) val.textContent = '0.0 °';
        updateChart({ roll: 0 });
        addLogMessage(`[UI] Punkt 0 (Roll) ustawiony. Wyliczony roll_trim = ${computedTrim.toFixed(2)}° (apparent = 0). Przycisk 'Zapisz' utrwali zmiany w EEPROM.`, 'success');
    }

    document.getElementById('saveBtn')?.addEventListener('click', () => {
        if (AppState.isConnected && confirm("Czy na pewno chcesz trwale zapisać bieżącą konfigurację z panelu do pamięci EEPROM robota?")) {
            addLogMessage('[UI] Wyslano polecenie zapisu konfiguracji do EEPROM...', 'info');
            sendBleMessage({ type: 'save_tunings' });
        } else if (!AppState.isConnected) { addLogMessage('[UI] Połącz z robotem przed zapisem konfiguracji.', 'warn'); }
    });
    document.getElementById('loadBtn')?.addEventListener('click', () => { if (confirm("UWAGA! Spowoduje to nadpisanie wszystkich niezapisanych zmian w panelu. Kontynuowac?")) { AppState.isSynced = false; AppState.tempParams = {}; AppState.tempStates = {}; sendBleMessage({ type: 'request_full_config' }); } });

    document.getElementById('calibrateMpuBtn')?.addEventListener('click', showCalibrationModal);
    document.getElementById('calibrateZeroPointBtn')?.addEventListener('click', () => { if (confirm("Upewnij sie, ze robot stoi na idealnie plaskiej powierzchni. Robot bedzie balansowal przez 10 sekund w celu znalezienia dokladnego punktu rownowagi. Kontynuowac?")) { sendBleMessage({ type: 'calibrate_zero_point' }); } });

    document.getElementById('applySelectedPresetBtn')?.addEventListener('click', applySelectedPreset); document.getElementById('saveCurrentAsPresetBtn')?.addEventListener('click', saveCurrentAsPreset); document.getElementById('deleteSelectedPresetBtn')?.addEventListener('click', deleteSelectedPreset);
    document.querySelectorAll('.help-icon').forEach(icon => { icon.addEventListener('click', (e) => { e.stopPropagation(); const container = icon.closest('.setting-container') || icon.closest('.control-row') || icon.closest('.fitness-weight-item'); if (!container) return; const next = container.nextElementSibling; const helpText = (next && next.classList && next.classList.contains('help-text')) ? next : container.querySelector('.help-text'); if (helpText) { helpText.classList.toggle('visible'); const accordionContent = container.closest('.accordion-content'); if (accordionContent) updateAccordionHeight(accordionContent); } }); });
    // Legacy IMU mapping wizard: usunięty
}
function setupManualTuneButtons() {
    // Przechowuj timery auto-stop dla testów 5s
    const activeTestTimers = new Map(); // key: `${motor}-${direction}` -> timeoutId

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
            // Wyślij start testu ręcznego
            sendBleMessage({ type: 'manual_tune_motor', motor, direction, pwm });
            addLogMessage(`[UI] Test ${motor} ${direction} rozpoczęty na 5s (PWM=${pwm}).`, 'info');
            // Skasuj poprzedni timer (jeśli był)
            if (activeTestTimers.has(rowKey)) {
                clearTimeout(activeTestTimers.get(rowKey));
            }
            // Ustaw auto-stop po 5 sekundach
            const timeoutId = setTimeout(() => {
                sendBleMessage({ type: 'manual_tune_motor', motor, direction, pwm: 0 });
                addLogMessage(`[UI] Test ${motor} ${direction} zakończony automatycznie po 5s.`, 'info');
                activeTestTimers.delete(rowKey);
            }, 5000);
            activeTestTimers.set(rowKey, timeoutId);
        });

        stopBtn.addEventListener('click', () => {
            // Ręczne zatrzymanie – przerwij timer i wyślij stop
            if (activeTestTimers.has(rowKey)) {
                clearTimeout(activeTestTimers.get(rowKey));
                activeTestTimers.delete(rowKey);
            }
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

    document.getElementById('manualTuneStopAll').addEventListener('click', () => {
        sendBleMessage({ type: 'manual_tune_stop_all' });
        addLogMessage('[UI] Zatrzymano wszystkie silniki.', 'warn');
    });
}
function setupGamepadMappingModal() { document.getElementById('open-gamepad-modal-btn').addEventListener('click', () => { document.getElementById('gamepad-mapping-modal').style.display = 'flex'; }); document.getElementById('close-modal-btn').addEventListener('click', () => { document.getElementById('gamepad-mapping-modal').style.display = 'none'; }); }
function flashElement(element) { if (!element) return; const target = element.tagName === 'INPUT' ? element.closest('.switch') || element.closest('.control-row') || element : element; target.classList.add('gamepad-flash'); setTimeout(() => target.classList.remove('gamepad-flash'), 300); }
function loadGamepadMappings() { const saved = localStorage.getItem(GAMEPAD_MAPPING_KEY); gamepadMappings = saved ? JSON.parse(saved) : {}; }
function saveGamepadMappings() { localStorage.setItem(GAMEPAD_MAPPING_KEY, JSON.stringify(gamepadMappings)); }
function setupDpadControls() { document.querySelectorAll('.dpad-btn').forEach(btn => { btn.addEventListener('click', (e) => { const action = e.currentTarget.dataset.dpad; if (action === 'up') sendBleMessage({ type: 'execute_move', distance_cm: parseFloat(document.getElementById('dpadDistInput').value) }); else if (action === 'down') sendBleMessage({ type: 'execute_move', distance_cm: -parseFloat(document.getElementById('dpadDistInput').value) }); else if (action === 'left') sendBleMessage({ type: 'execute_rotate', angle_deg: -parseFloat(document.getElementById('dpadAngleInput').value) }); else if (action === 'right') sendBleMessage({ type: 'execute_rotate', angle_deg: parseFloat(document.getElementById('dpadAngleInput').value) }); else if (action === 'stop') sendBleMessage({ type: 'command_stop' }); }); }); }
function refreshCalibrationFromTelemetry() {
    // Odczytaj ostatnią telemetrię i zaktualizuj paski w modalu
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
function setupCalibrationModal() {
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
function showCalibrationModal() { document.getElementById('calibration-modal').style.display = 'flex'; isCalibrationModalShown = true; sendBleMessage({ type: 'set_rgb_blink', colors: ['00FF00', 'FFA500'] }); addLogMessage('[UI] Rozpocznij proces kalibracji IMU - obracaj robota powoli we wszystkich kierunkach.', 'info'); }
function hideCalibrationModal() { document.getElementById('calibration-modal').style.display = 'none'; isCalibrationModalShown = false; sendBleMessage({ type: 'stop_rgb_blink' }); addLogMessage('[UI] Asystent kalibracji zamkniety.', 'info'); }
function updateCalibrationProgress(axis, value) {
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
        // Don't auto-close the modal. Offer save option when Sys>=3
        if (sys >= 3) {
            if (saveBtn) saveBtn.style.display = 'inline-block';
        } else {
            if (saveBtn) saveBtn.style.display = 'none';
        }
    }
}; // ZMIANA: Usunięto duplikację funkcji setupCalibrationModal()
function init3DVisualization() { const container = document.getElementById('robot3d-container'); scene3D = new THREE.Scene(); camera3D = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 2000); camera3D.position.set(28, 22, 48); camera3D.lookAt(0, 8, 0); renderer3D = new THREE.WebGLRenderer({ antialias: true }); renderer3D.setSize(container.clientWidth, container.clientHeight); container.appendChild(renderer3D.domElement); controls3D = new THREE.OrbitControls(camera3D, renderer3D.domElement); controls3D.target.set(0, 8, 0); controls3D.maxPolarAngle = Math.PI / 2; const ambientLight = new THREE.AmbientLight(0xffffff, 0.8); scene3D.add(ambientLight); const directionalLight = new THREE.DirectionalLight(0xffffff, 0.9); directionalLight.position.set(10, 20, 15); scene3D.add(directionalLight); const PLANE_SIZE_CM = 2000; groundTexture = createCheckerTexture(40); const repeats = PLANE_SIZE_CM / 40; groundTexture.repeat.set(repeats, repeats); const groundMaterial = new THREE.MeshStandardMaterial({ map: groundTexture, roughness: 1.0, metalness: 0.0 }); const groundGeo = new THREE.PlaneGeometry(PLANE_SIZE_CM, PLANE_SIZE_CM, 1, 1); groundMesh = new THREE.Mesh(groundGeo, groundMaterial); groundMesh.rotation.x = -Math.PI / 2; groundMesh.position.y = 0; scene3D.add(groundMesh); robotPivot = createRobotModel3D(); robotPivot.position.y = 4.1; scene3D.add(robotPivot); skyDome = createSkyDome(); scene3D.add(skyDome); window.addEventListener('resize', () => { const width = container.clientWidth; const height = container.clientHeight; camera3D.aspect = width / height; camera3D.updateProjectionMatrix(); renderer3D.setSize(width, height); }); setupControls3D(); setupCalibrationModal(); }; // ZMIANA: Usunięto duplikację funkcji setupCalibrationModal()
function createCustomWheel(totalRadius, tireThickness, width) { const wheelGroup = new THREE.Group(); const tireMaterial = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 }); const rimMaterial = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.4 }); const rimRadius = totalRadius - tireThickness; const tire = new THREE.Mesh(new THREE.TorusGeometry(rimRadius + tireThickness / 2, tireThickness / 2, 16, 100), tireMaterial); wheelGroup.add(tire); const rimShape = new THREE.Shape(); rimShape.absarc(0, 0, rimRadius, 0, Math.PI * 2, false); const holePath = new THREE.Path(); holePath.absarc(0, 0, rimRadius * 0.85, 0, Math.PI * 2, true); rimShape.holes.push(holePath); const extrudeSettings = { depth: width * 0.4, bevelEnabled: false }; const outerRimGeometry = new THREE.ExtrudeGeometry(rimShape, extrudeSettings); outerRimGeometry.center(); const outerRim = new THREE.Mesh(outerRimGeometry, rimMaterial); wheelGroup.add(outerRim); const hubRadius = rimRadius * 0.2; const hub = new THREE.Mesh(new THREE.CylinderGeometry(hubRadius, hubRadius, width * 0.5, 24), rimMaterial); hub.rotateX(Math.PI / 2); wheelGroup.add(hub); const spokeLength = (rimRadius * 0.85) - hubRadius; const spokeGeometry = new THREE.BoxGeometry(spokeLength, rimRadius * 0.15, width * 0.4); spokeGeometry.translate(hubRadius + spokeLength / 2, 0, 0); for (let i = 0; i < 6; i++) { const spoke = new THREE.Mesh(spokeGeometry, rimMaterial); spoke.rotation.z = i * (Math.PI / 3); wheelGroup.add(spoke); } return wheelGroup; }
function createRobotModel3D() { const BODY_WIDTH = 9.0, BODY_HEIGHT = 6.0, BODY_DEPTH = 3.5, WHEEL_GAP = 1.0; const MAST_HEIGHT = 14.5, MAST_THICKNESS = 1.5; const BATTERY_WIDTH = 6.0, BATTERY_HEIGHT = 1.0, BATTERY_DEPTH = 3.0; const TIRE_THICKNESS = 1.0, WHEEL_WIDTH = 2.0; const WHEEL_RADIUS_3D = 4.1; const pivot = new THREE.Object3D(); const model = new THREE.Group(); const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x1C1C1C }); const batteryMaterial = new THREE.MeshStandardMaterial({ color: 0x4169E1 }); const body = new THREE.Mesh(new THREE.BoxGeometry(BODY_WIDTH, BODY_HEIGHT, BODY_DEPTH), bodyMaterial); body.position.y = WHEEL_RADIUS_3D; model.add(body); const mast = new THREE.Mesh(new THREE.BoxGeometry(MAST_THICKNESS, MAST_HEIGHT, MAST_THICKNESS), bodyMaterial); mast.position.y = WHEEL_RADIUS_3D + BODY_HEIGHT / 2 + MAST_HEIGHT / 2; model.add(mast); const battery = new THREE.Mesh(new THREE.BoxGeometry(BATTERY_WIDTH, BATTERY_HEIGHT, BATTERY_DEPTH), batteryMaterial); battery.position.y = mast.position.y + MAST_HEIGHT / 2 + BATTERY_HEIGHT / 2; model.add(battery); leftWheel = createCustomWheel(WHEEL_RADIUS_3D, TIRE_THICKNESS, WHEEL_WIDTH); leftWheel.rotation.y = Math.PI / 2; leftWheel.position.set(-(BODY_WIDTH / 2 + WHEEL_GAP), WHEEL_RADIUS_3D, 0); model.add(leftWheel); rightWheel = createCustomWheel(WHEEL_RADIUS_3D, TIRE_THICKNESS, WHEEL_WIDTH); rightWheel.rotation.y = Math.PI / 2; rightWheel.position.set(BODY_WIDTH / 2 + WHEEL_GAP, WHEEL_RADIUS_3D, 0); model.add(rightWheel); model.position.y = -WHEEL_RADIUS_3D; pivot.add(model); return pivot; }
function createCheckerTexture(squareSizeCm = 20, colorA = '#C8C8C8', colorB = '#787878') { const size = 256; const squares = 2; const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size; const ctx = canvas.getContext('2d'); const s = size / squares; for (let y = 0; y < squares; y++) { for (let x = 0; x < squares; x++) { ctx.fillStyle = ((x + y) % 2 === 0) ? colorA : colorB; ctx.fillRect(x * s, y * s, s, s); } } const tex = new THREE.CanvasTexture(canvas); tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 8; tex.encoding = THREE.sRGBEncoding; return tex; }
function createSkyDome() {
    const width = 2048, height = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    // Create gradient background
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, '#87CEEB');
    grad.addColorStop(0.6, '#B0E0E6');
    grad.addColorStop(1, '#E6F2FA');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // Draw clouds with seamless wrapping
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    for (let i = 0; i < 150; i++) {
        const x = Math.random() * width;
        const y = Math.random() * height * 0.6;
        const radius = 20 + Math.random() * 80;
        const blur = 10 + Math.random() * 20;
        ctx.filter = `blur(${blur}px)`;

        // Draw the cloud
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();

        // Draw the cloud again on the opposite edge to create seamless wrapping
        // If cloud is near the right edge, draw it also on the left edge
        if (x > width - radius * 2) {
            ctx.beginPath();
            ctx.arc(x - width, y, radius, 0, Math.PI * 2);
            ctx.fill();
        }
        // If cloud is near the left edge, draw it also on the right edge
        if (x < radius * 2) {
            ctx.beginPath();
            ctx.arc(x + width, y, radius, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    ctx.filter = 'none';

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.encoding = THREE.sRGBEncoding;

    const skyGeo = new THREE.SphereGeometry(1000, 32, 16);
    const skyMat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide });
    const skyDome = new THREE.Mesh(skyGeo, skyMat);
    return skyDome;
}
function setupControls3D() { document.getElementById('reset3dViewBtn').addEventListener('click', () => { camera3D.position.set(28, 22, 48); controls3D.target.set(0, 8, 0); controls3D.update(); }); document.getElementById('toggle3dAnimationBtn').addEventListener('click', () => isAnimation3DEnabled = !isAnimation3DEnabled); document.getElementById('toggle3dMovementBtn').addEventListener('click', () => { isMovement3DEnabled = !isMovement3DEnabled; if (!isMovement3DEnabled) { lastEncoderAvg = (currentEncoderLeft + currentEncoderRight) / 2; } }); }

function update3DAnimation() {
    if (isAnimation3DEnabled && robotPivot) {
        // NOWE: używamy bezpośrednio kwaternionu z telemetrii + mapowanie przez premnożenie.
        // Eliminujemy artefakt unoszenia wynikający z dynamicznej korekty wysokości zależnej od roll.
        if (typeof window.telemetryData?.qw === 'number') {
            try {
                // Surowy kwaternion z IMU (Three.js: x,y,z,w)
                const qRaw = new THREE.Quaternion(
                    window.telemetryData.qx,
                    window.telemetryData.qy,
                    window.telemetryData.qz,
                    window.telemetryData.qw
                ).normalize();

                // Budowa kwaternionu korekcyjnego na podstawie mapowania.
                // Uwaga: pojedynczy sign flip osi jest odbiciem (nie reprezentowalny jako czysta rotacja);
                // jeśli liczba negatywnych znaków jest parzysta – można odwzorować jako rotację 180° wokół osi prostopadłej.
                const signs = [modelMapping.pitch.sign, modelMapping.yaw.sign, modelMapping.roll.sign];
                const negCount = signs.filter(s => s === -1).length;
                let qCorr = new THREE.Quaternion(); // identity

                // Permutacja osi + znaki: realizujemy przez przejście do Euler, przemapowanie i złożenie z powrotem.
                // Dla ograniczenia artefaktów wprowadzamy jednorazowy kwaternion docelowy i płynne przejście (slerp).
                const eulRaw = computeEulerFromQuaternion(window.telemetryData.qw, window.telemetryData.qx, window.telemetryData.qy, window.telemetryData.qz);
                let mapped = eulRaw ? applyModelMappingToEuler(eulRaw) : { pitch: 0, yaw: 0, roll: 0 };
                // Jeśli negCount jest nieparzyste – stosujemy fallback (bez prób tworzenia niepoprawnej rotacji).
                if (negCount % 2 === 0) {
                    // Można spróbować zakodować kombinację dwóch flips jako rotację 180° wokół pozostałej osi.
                    // (Heurystyka – poprawia przypadki odwrotu dwóch osi.)
                    if (negCount === 2) {
                        // Znajdź oś, która pozostała dodatnia
                        const idx = signs.findIndex(s => s === 1);
                        const axisVec = idx === 0 ? new THREE.Vector3(1, 0, 0) : (idx === 1 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1));
                        qCorr.setFromAxisAngle(axisVec, Math.PI); // 180° rotacja kompensująca dwa odbicia
                    }
                }
                // Kwaternion wynikowy: qResult = qCorr * qMappedEuler
                const qMappedEuler = new THREE.Quaternion().setFromEuler(new THREE.Euler(
                    THREE.MathUtils.degToRad(mapped.pitch),
                    THREE.MathUtils.degToRad(mapped.yaw),
                    THREE.MathUtils.degToRad(mapped.roll),
                    'YXZ'
                ));
                const qResult = new THREE.Quaternion().multiplyQuaternions(qCorr, qMappedEuler).normalize();

                // Płynne przejście (redukcja mikro-skoków przy wrap 360°)
                robotPivot.quaternion.slerp(qResult, 0.35);
            } catch (err) {
                console.error('Quaternion mapping error:', err);
            }
        } else {
            // Brak kwaternionu – pozostaw orientation bez zmian.
        }

        // Stała wysokość (z minimalnym podniesieniem aby koła nie "przecinały" podłogi)
        robotPivot.position.y = 4.4; // 4.1 + 0.3 buffer

        // Aktualizacja kamery w trybie "Perspektywa Robota"
        const isRobotPerspective = document.getElementById('robotPerspectiveCheckbox').checked;
        controls3D.enabled = !isRobotPerspective; // Wylacz OrbitControls w trybie perspektywy

        if (isRobotPerspective) {
            const offset = new THREE.Vector3(0, 15, robotPerspectiveZoom); // Uzyj zmiennej do kontroli dystansu
            offset.applyQuaternion(robotPivot.quaternion); // Obroc wektor offsetu zgodnie z orientacja robota

            const cameraPosition = robotPivot.position.clone().add(offset);
            camera3D.position.lerp(cameraPosition, 0.1); // Plynne przejscie do nowej pozycji

            const lookAtPosition = robotPivot.position.clone().add(new THREE.Vector3(0, 10, 0)); // Patrz troche powyzej srodka robota
            camera3D.lookAt(lookAtPosition);
        }

        // Reszta funkcji pozostaje bez zmian (obrot kol, ruch podloza itp.)
        const ppr = parseFloat(document.getElementById('encoderPprInput').value) || 820;
        const wheelRotationL = (currentEncoderLeft / ppr) * 2 * Math.PI;
        const wheelRotationR = (currentEncoderRight / ppr) * 2 * Math.PI;
        if (leftWheel) leftWheel.rotation.z = -wheelRotationL;
        if (rightWheel) rightWheel.rotation.z = -wheelRotationR;
        if (isMovement3DEnabled) {
            const wheelDiameter = parseFloat(document.getElementById('wheelDiameterInput').value) || 8.2;
            const currentEncoderAvg = (currentEncoderLeft + currentEncoderRight) / 2;
            const dist_cm = ((currentEncoderAvg - lastEncoderAvg) / ppr) * Math.PI * wheelDiameter;
            if (groundTexture) {
                // Uzyj juz ustawionej, bezpiecznej rotacji z samego modelu, aby uniknac bledu NaN
                // Pobieramy rotację modelu wokół osi Y, która odpowiada za kurs (yaw)
                const yawRad = robotPivot.rotation.y;
                const dx = Math.sin(yawRad) * dist_cm;
                const dz = Math.cos(yawRad) * dist_cm;
                const squaresPerCm = 1 / 20;
                groundTexture.offset.x += dx * squaresPerCm;
                groundTexture.offset.y -= dz * squaresPerCm;
                groundTexture.needsUpdate = true;
            }
            const logicalX = (groundTexture ? -groundTexture.offset.x * 20 : 0);
            const logicalZ = (groundTexture ? -groundTexture.offset.y * 20 : 0);
            document.getElementById('robot3d-position-x').textContent = logicalX.toFixed(1) + ' cm';
            document.getElementById('robot3d-position-z').textContent = logicalZ.toFixed(1) + ' cm';
            lastEncoderAvg = currentEncoderAvg;
        }
    }
}

function animate3D() {
    requestAnimationFrame(animate3D);

    update3DAnimation();

    // Powolny obrot kopuly nieba dla efektu dynamiki
    if (skyDome) {
        skyDome.rotation.y += 0.00005;
    }

    if (controls3D && renderer3D && scene3D && camera3D) {
        controls3D.update();
        renderer3D.render(scene3D, camera3D);
    }
}

// UI EVENT HANDLERS
// ========================================================================

function initAutoTuningUI() {
    // Zakładki już obsługiwane przez setupAutotuningTabs()+activateMethodTab
    // Upewnij się że domyślnie aktywna karta jest poprawnie ustawiona
    const initial = document.querySelector('.method-tab.active')?.dataset.method || 'ga';
    activateMethodTab(initial);
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { initAutoTuningUI(); setupMainAutotuneTabs(); });
} else {
    initAutoTuningUI();
    setupMainAutotuneTabs();
}

// Listen for BLE messages
window.addEventListener('message', function (event) {
    if (event.data && event.data.type) {
        // Dispatch custom event for algorithm handlers
        const bleEvent = new CustomEvent('ble_message', { detail: event.data });
        window.dispatchEvent(bleEvent);
    }
});

// ML accordion helpers: bridge to Bayesian tab
document.addEventListener('DOMContentLoaded', () => {
    const openBtn = document.getElementById('ml-open-bayesian');
    if (openBtn) openBtn.addEventListener('click', () => {
        activateMethodTab('bayesian');
        document.querySelector('#autotuning-card-content')?.scrollIntoView({ behavior: 'smooth' });
    });
    const startBtn = document.getElementById('ml-start-bayesian');
    if (startBtn) startBtn.addEventListener('click', () => {
        activateMethodTab('bayesian');
        document.getElementById('start-tuning-btn')?.click();
    });
});

// ========================================================================
// UI EVENT HANDLERS & SESSION MANAGEMENT (Client-Side Logic)
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
    if (!checkTuningPrerequisites()) return;

    const method = document.querySelector('.method-tab.active')?.dataset.method;
    if (!method) {
        addLogMessage('[UI] Nie wybrano metody optymalizacji.', 'warn');
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
    document.getElementById('tuning-status-text').textContent = 'Uruchamianie...';
    document.getElementById('current-iteration').textContent = '0';
    fitnessChartData = [];
    updateFitnessChart();
    document.getElementById('start-tuning-btn').disabled = true;
    document.getElementById('pause-tuning-btn').disabled = false;
    document.getElementById('stop-tuning-btn').disabled = false;

    addLogMessage(`[UI] Rozpoczynam strojenie po stronie UI metodą: ${method.toUpperCase()}`, 'info');

    try {
        let config;
        if (method === 'ga') {
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
        } else if (method === 'pso') {
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
        } else if (method === 'zn') {
            config = {
                amplitude: parseFloat(document.getElementById('zn-amplitude').value),
                minCycles: parseInt(document.getElementById('zn-min-cycles').value)
            };
            currentTuningSession = new ZieglerNicholsRelay(config);
            if (isNaN(config.minCycles) || config.minCycles <= 0 || isNaN(config.amplitude) || config.amplitude <= 0) {
                addLogMessage('[UI] Niepoprawna konfiguracja ZN: amplitude i minCycles muszą być > 0', 'error');
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

        const runStartTime = Date.now();
        try { addLogMessage(`[UI] currentTuningSession: ${currentTuningSession.constructor.name} debugId=${currentTuningSession._debugId || 'N/A'} config=${JSON.stringify(config)}`, 'info'); } catch (e) { console.debug('[UI] tuning session log failed', e); }
        currentTuningSession.run().then(() => {
            addLogMessage(`[UI] Autostrojenie zakonczone (metoda: ${method.toUpperCase()}) po ${Date.now() - runStartTime}ms`, 'success');
        }).catch((err) => {
            console.error('[UI] Autostrojenie error:', err);
            addLogMessage(`[UI] Błąd podczas sesji strojenia: ${(err && err.message) ? err.message : String(err)} (after ${Date.now() - runStartTime}ms)`, 'error');
        }).finally(() => {
            addLogMessage(`[UI] finalizing run() after ${Date.now() - runStartTime}ms (method ${method})`, 'debug');
            stopTuning(false);
        });

    } catch (error) {
        console.error('Błąd inicjalizacji strojenia:', error);
        addLogMessage('Błąd inicjalizacji strojenia: ' + error.message, 'error');
        stopTuning(false);
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

document.addEventListener('DOMContentLoaded', () => {
    const startBtn = document.getElementById('start-tuning-btn');
    const pauseBtn = document.getElementById('pause-tuning-btn');
    const resumeBtn = document.getElementById('resume-tuning-btn');
    const stopBtn = document.getElementById('stop-tuning-btn');

    if (startBtn) startBtn.addEventListener('click', startTuning);
    if (pauseBtn) pauseBtn.addEventListener('click', pauseTuning);
    if (resumeBtn) resumeBtn.addEventListener('click', resumeTuning);
    if (stopBtn) stopBtn.addEventListener('click', () => stopTuning(true));
});


