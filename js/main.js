// ========================================================================
// MODULE BRIDGE — symbole dostarczane przez moduły ES6 (js/modules/*.js)
// ========================================================================
// Deklaracje var tworzą powiązania window.*, które moduły ES6 wypełnią
// kanonicznymi wersjami przed uruchomieniem DOMContentLoaded.
// NIE definiuj tych symboli ponownie — jedynie forward-deklaracje.
// ========================================================================

// State (modules/state.js)
var AppStore, appStore, AppState, parameterMapping;

// Communication (modules/communication.js)
var CommunicationLayer, BLECommunication, MockCommunication, commLayer;
var SERVICE_UUID, RX_UUID, TX_UUID;
var sendBleMessage, connectBLE, onDisconnected, setupCommunicationHandlers;

// Telemetry (modules/telemetry.js)
var normalizeTelemetryData, updateTelemetryUI;
var applySingleParam, applySingleAutotuneParam, applyFullConfig;

// 3D Visualization (modules/visualization3d.js)
var init3DVisualization, animate3D, update3DAnimation;

// PID Education & Diagnostics (modules/pid-tuning.js)
var PIDEducation, PIDDiagnostics;
var initPIDEducation, initPIDDiagnostics, updatePIDEducation, updatePIDDiagnostics;
var hookPIDToTelemetry;

// RB.helpers namespace (modules/state.js)
window.RB = window.RB || {};
window.RB.helpers = window.RB.helpers || {};



let bleDevice, rxCharacteristic, txCharacteristic;
let bleBuffer = '', bleMessageQueue = [], isSendingBleMessage = false; const bleChunks = new Map();
const BLE_SEND_INTERVAL = 20;

let joystickCenter, joystickRadius, knobRadius, isDragging = false, lastJoystickSendTime = 0;
// OPTYMALIZACJA: Zmniejszono interwał z 20ms (50Hz) na 2ms (500Hz) dla natychmiastowej reakcji
const JOYSTICK_SEND_INTERVAL = 2;
let currentJoystickX = 0, currentJoystickY = 0;

let gamepadIndex = null, lastGamepadState = [], gamepadMappings = {}; const GAMEPAD_MAPPING_KEY = 'pid_gamepad_mappings_v3';
let isMappingButton = false, actionToMap = null, lastGamepadSendTime = 0;
// OPTYMALIZACJA: Zmniejszono interwał z 20ms (50Hz) na 2ms (500Hz) dla natychmiastowej reakcji
const GAMEPAD_SEND_INTERVAL = 2;

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
// Prosty model trymów:
//  - firmware trzyma jedną wartość trim_angle / roll_trim (w stopniach) - korekta montażu czujnika
//  - firmware trzyma osobno pitch_offset / roll_offset (w stopniach) - offset pionu dla balansu
//  - UI pokazuje dokładnie te wartości
let originalFirmwareTrimPitch = null; // tylko do celów informacyjnych/logów
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
                sendBleMessage({ type: 'mount_calib2_capture_rot_end' });
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
        // Oblicz obroty z sensorPreview.cube.quaternion
        const q = sensorPreview.cube.quaternion;
        const eul = new THREE.Euler().setFromQuaternion(q, 'ZYX');
        const yawDeg = THREE.MathUtils.radToDeg(eul.x);
        const pitchDeg = THREE.MathUtils.radToDeg(eul.y);
        const rollDeg = THREE.MathUtils.radToDeg(eul.z);
        // Wyślij rotate_mount_90 dla każdej osi z niezerowym obrotem
        if (Math.abs(pitchDeg) >= 45) { // tolerancja dla błędów zaokrąglenia
            const steps = Math.round(pitchDeg / 90);
            sendBleMessage({ type: 'rotate_mount_90', axis: 'x', steps });
            addLogMessage(`[UI] Obrót montażu X: steps=${steps}`, 'info');
        }
        if (Math.abs(yawDeg) >= 45) {
            const steps = Math.round(yawDeg / 90);
            sendBleMessage({ type: 'rotate_mount_90', axis: 'y', steps });
            addLogMessage(`[UI] Obrót montażu Y: steps=${steps}`, 'info');
        }
        if (Math.abs(rollDeg) >= 45) {
            const steps = Math.round(rollDeg / 90);
            sendBleMessage({ type: 'rotate_mount_90', axis: 'z', steps });
            addLogMessage(`[UI] Obrót montażu Z: steps=${steps}`, 'info');
        }
        addLogMessage('[UI] Wysłano obroty montażu do robota (rotate_mount_90).', 'info');
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
    document.getElementById('sensorWizardCancelBtn')?.addEventListener('click', () => { sendBleMessage({ type: 'mount_calib2_cancel' }); closeSensorMappingModal(); });
    document.getElementById('sensorWizardBackBtn')?.addEventListener('click', () => {
        if (sensorWizard.step === 0) return; // nic
        if (sensorWizard.step === 1) { if (sensorWizard.monitorId) { clearInterval(sensorWizard.monitorId); sensorWizard.monitorId = null; } }
        sensorWizard.step -= 1; updateSensorWizardUI();
    });
    document.getElementById('sensorWizardNextBtn')?.addEventListener('click', async () => {
        if (sensorWizard.step === 0) {
            // Start i rejestracja pozycji pionowej
            sendBleMessage({ type: 'mount_calib2_start' });
            await RB.helpers.delay(80);
            sendBleMessage({ type: 'mount_calib2_capture_upright' });
            sensorWizard.progress.upright = true; setWizardProgress();
            // Rozpocznij krok rotacji i monitoring
            sendBleMessage({ type: 'mount_calib2_capture_rot_start' });
            sensorWizard.step = 1; updateSensorWizardUI(); startRotationMonitor();
        } else if (sensorWizard.step === 2) {
            // Zapis
            sendBleMessage({ type: 'mount_calib2_commit' });
            sensorWizard.progress.saved = true; setWizardProgress();
            closeSensorMappingModal();
        }
    });
    setupGamepadMappingModal();
    setupDpadControls();
    setupSequenceControls();
    if (typeof initPathVisualization === 'function') initPathVisualization();
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
    // Ensure current telemetry canvas has correct resolution and resizes with window
    (function () {
        const canvas = document.getElementById('current-telemetry-chart');
        if (!canvas) return;
        function resizeCanvas() {
            canvas.width = canvas.clientWidth;
            canvas.height = canvas.clientHeight;
        }
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
    })();
    // Start strojenia dostępny dopiero po wyborze metody
    const startBtnInit = document.getElementById('start-tuning-btn');
    if (startBtnInit) startBtnInit.disabled = true;
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
        // Ustaw padding od razu przy starcie (aby nawet zamknięty pasek logów nie zasłaniał przycisków)
        setTimeout(updateBodyPadding, 100);
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

    // ==================================================================
    // Inicjalizacja modulow ES6 (wywolywane przez window.* bridge)
    // ==================================================================
    if (typeof initAutotune === 'function') initAutotune();
    if (typeof initSystemIdentification === 'function') initSystemIdentification();
    if (typeof initFusionPIDProfiles === 'function') initFusionPIDProfiles();
    if (typeof setupCalibrationModal === 'function') setupCalibrationModal();
});
// Osobny bufor logów systemowych (kanał 'log' z robota i ważne wpisy UI)
// Pojedynczy, scalony bufor logów
const allLogsBuffer = [];
const ALL_LOGS_MAX = 2000;
function pushLog(message, level = 'info') {
    const ts = new Date().toLocaleTimeString();
    allLogsBuffer.push({ ts, level, message });
    if (allLogsBuffer.length > ALL_LOGS_MAX) allLogsBuffer.shift();
    const logCard = document.getElementById('log-card');
    const autoEl = document.getElementById('logsAutoscroll');
    if (logCard && logCard.classList.contains('open')) {
        const shouldScroll = (autoEl && autoEl.checked) === true;
        renderAllLogs(shouldScroll);
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
    // Małe korekty trimów
    document.getElementById('pitchTrimPlus01Btn')?.addEventListener('click', () => { adjustTrim('pitch', 0.1); });
    document.getElementById('pitchTrimMinus01Btn')?.addEventListener('click', () => { adjustTrim('pitch', -0.1); });
    document.getElementById('pitchTrimPlus001Btn')?.addEventListener('click', () => { adjustTrim('pitch', 0.01); });
    document.getElementById('pitchTrimMinus001Btn')?.addEventListener('click', () => { adjustTrim('pitch', -0.01); });
    document.getElementById('rollTrimPlus01Btn')?.addEventListener('click', () => { adjustTrim('roll', 0.1); });
    document.getElementById('rollTrimMinus01Btn')?.addEventListener('click', () => { adjustTrim('roll', -0.1); });
    document.getElementById('rollTrimPlus001Btn')?.addEventListener('click', () => { adjustTrim('roll', 0.01); });
    document.getElementById('rollTrimMinus001Btn')?.addEventListener('click', () => { adjustTrim('roll', -0.01); });
    document.getElementById('clearModalPitchZeroBtn')?.addEventListener('click', () => {
        // Nowy model: trymy nie są stosowane runtime – nic do czyszczenia.
        addLogMessage('[UI] Trym (Pitch) jest częścią montażu (qcorr) i nie podlega czyszczeniu wartością 0. Użyj przycisków ± lub Ustaw punkt 0.', 'warn');
    });
    document.getElementById('clearModalRollZeroBtn')?.addEventListener('click', () => {
        addLogMessage('[UI] Trym (Roll) jest częścią montażu (qcorr) i nie podlega czyszczeniu wartością 0. Użyj przycisków ± lub Ustaw punkt 0.', 'warn');
    });
    // Nowe: przyciski obrotu montażu (qcorr) o 90° wokół osi X/Y/Z - ZAKOMENTOWANE, bo robot nie obsługuje rotate_mount_90
    /*
    const rotate90 = (axis, steps) => {
        sendBleMessage({ type: 'rotate_mount_90', axis, steps });
        addLogMessage(`[UI] Obrót montażu 90°: axis=${axis.toUpperCase()} steps=${steps}`, 'info');
    };
    document.getElementById('mountXMinus90Btn')?.addEventListener('click', () => rotate90('x', -1));
    document.getElementById('mountXPlus90Btn')?.addEventListener('click', () => rotate90('x', 1));
    document.getElementById('mountYMinus90Btn')?.addEventListener('click', () => rotate90('y', -1));
    document.getElementById('mountYPlus90Btn')?.addEventListener('click', () => rotate90('y', 1));
    document.getElementById('mountZMinus90Btn')?.addEventListener('click', () => rotate90('z', -1));
    document.getElementById('mountZPlus90Btn')?.addEventListener('click', () => rotate90('z', 1));
    */
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
            const key = signButtonMap[containerId];
            sendBleMessage({ type: 'set_param', key: key, value: sign });
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

// GLOBALNE: ustawianie punktu 0 dla Pitch i Roll.
// Firmware: adjust_zero dodaje deltę do baseTargetAngleTrim.
// Telemetria pitch to już kąt po trymach, więc delta = -pitch spowoduje że następny odczyt będzie 0.
// Uwzględniamy też offset UI, który jest tymczasową korektą wyświetlania.
function setPitchZero() {
    if (!window.telemetryData) {
        addLogMessage('[UI] Brak danych telemetrii (pitch).', 'warn');
        return;
    }
    // Odczytaj aktualny pitch z telemetrii (już po trymach i offsetach)
    let currentPitch = Number(window.telemetryData.pitch);
    if (typeof currentPitch !== 'number' || isNaN(currentPitch)) {
        if (typeof window.telemetryData.qw === 'number') {
            const eul = computeEulerFromQuaternion(window.telemetryData.qw, window.telemetryData.qx, window.telemetryData.qy, window.telemetryData.qz);
            currentPitch = eul ? eul.pitch : 0;
        } else {
            addLogMessage('[UI] Nieprawidłowy odczyt pitch.', 'error');
            return;
        }
    }
    // Zaokrąglij lekko, by uniknąć flipa znaku przy ±0.00x
    currentPitch = Math.round(currentPitch * 100) / 100;
    if (isNaN(currentPitch)) {
        addLogMessage('[UI] Nieprawidlowy odczyt pitch.', 'error');
        return;
    }
    // Delta = -currentPitch -> po dodaniu do trim montażu, następny odczyt pitch = 0
    const delta = -currentPitch;
    sendBleMessage({ type: 'adjust_zero', value: delta });
    const val = document.getElementById('angleVal');
    if (val) val.textContent = '0.0 °';
    pitchHistory.push(0);
    if (pitchHistory.length > HISTORY_LENGTH) pitchHistory.shift();
    updateChart({ pitch: 0 });
    addLogMessage(`[UI] Punkt 0 (Pitch) ustawiony. Delta trim=${delta.toFixed(2)}°.`, 'success');
}

function setRollZero() {
    if (!window.telemetryData) {
        addLogMessage('[UI] Brak danych telemetrii (roll).', 'warn');
        return;
    }
    // Odczytaj aktualny roll z telemetrii (już po trymach i offsetach)
    let currentRoll = Number(window.telemetryData.roll);
    if (typeof currentRoll !== 'number' || isNaN(currentRoll)) {
        if (typeof window.telemetryData.qw === 'number') {
            const eul = computeEulerFromQuaternion(window.telemetryData.qw, window.telemetryData.qx, window.telemetryData.qy, window.telemetryData.qz);
            currentRoll = eul ? eul.roll : 0;
        } else {
            addLogMessage('[UI] Nieprawidłowy odczyt roll.', 'error');
            return;
        }
    }
    currentRoll = Math.round(currentRoll * 100) / 100;
    if (isNaN(currentRoll)) {
        addLogMessage('[UI] Nieprawidlowy odczyt roll.', 'error');
        return;
    }
    // Delta = -currentRoll -> po dodaniu do trim montażu, następny odczyt roll = 0
    const delta = -currentRoll;
    sendBleMessage({ type: 'adjust_roll', value: delta });
    const val = document.getElementById('rollVal');
    if (val) val.textContent = '0.0 °';
    updateChart({ roll: 0 });
    addLogMessage(`[UI] Punkt 0 (Roll) ustawiony. Delta trim=${delta.toFixed(2)}°.`, 'success');
}

function adjustTrim(axis, delta) {
    // axis: 'pitch' or 'roll'
    // delta: number like 0.1 or -0.01
    sendBleMessage({ type: axis === 'pitch' ? 'adjust_zero' : 'adjust_roll', value: delta });
    addLogMessage(`[UI] Korekta ${axis} o ${delta.toFixed(2)}°`, 'success');
}

const debounce = (func, delay) => { let timeout; return function (...args) { const context = this; clearTimeout(timeout); timeout = setTimeout(() => func.apply(context, args), delay); }; };
// delay helper is provided by RB.helpers.delay (see js/helpers.js)
function addLogMessage(message, level = 'info') { pushLog(message, level); const logCard = document.getElementById('log-card'); const autoEl = document.getElementById('logsAutoscroll'); if (logCard && logCard.classList.contains('open')) { renderAllLogs((autoEl && autoEl.checked) === true); } }
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
    if (method === 'ga-genetic' || method === 'ga') targetBtn = document.getElementById('run-ga-tune');
    else if (method === 'pso-particle' || method === 'pso') targetBtn = document.getElementById('run-pso-tune');
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


// ========================================================================
// WINDOW EXPORTS  funkcje wymagane przez moduly ES6 via window.*
// ========================================================================
if (typeof addLogMessage === 'function') window.addLogMessage = addLogMessage;
if (typeof setSignButtons === 'function') window.setSignButtons = setSignButtons;
if (typeof updateSignBadge === 'function') window.updateSignBadge = updateSignBadge;
if (typeof computeEulerFromQuaternion === 'function') window.computeEulerFromQuaternion = computeEulerFromQuaternion;
if (typeof applyModelMappingToEuler === 'function') window.applyModelMappingToEuler = applyModelMappingToEuler;
if (typeof toggleAccordion === 'function') window.toggleAccordion = toggleAccordion;
if (typeof updateAccordionHeight === 'function') window.updateAccordionHeight = updateAccordionHeight;
if (typeof modelMapping !== 'undefined') window.modelMapping = modelMapping;
if (typeof setPitchZero === 'function') window.setPitchZero = setPitchZero;
if (typeof setRollZero === 'function') window.setRollZero = setRollZero;
if (typeof clearLogs === 'function') window.clearLogs = clearLogs;
if (typeof getRawEuler === 'function') window.getRawEuler = getRawEuler;
if (typeof updateIMUMappingUIFromData === 'function') window.updateIMUMappingUIFromData = updateIMUMappingUIFromData;
