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
// Podstawowe przełączniki
const availableActions = {
    'toggle_balance': { label: 'Wlacz/Wylacz Balansowanie', elementId: 'balanceSwitch' },
    'toggle_hold_position': { label: 'Wlacz/Wylacz Trzymanie Pozycji', elementId: 'holdPositionSwitch' },
    'toggle_speed_mode': { label: 'Wlacz/Wylacz Tryb Predkosci', elementId: 'speedModeSwitch' },
    'emergency_stop': { label: 'STOP AWARYJNY', elementId: 'emergencyStopBtn' },
    'reset_pitch': { label: 'Zeruj offset (Pitch)', elementId: 'resetPitchOffsetBtn' },
    'reset_roll': { label: 'Zeruj offset (Roll)', elementId: 'resetRollOffsetBtn' }
};
const availableTelemetry = { 'pitch': { label: 'Pitch (Kat)', color: '#61dafb' }, 'roll': { label: 'Roll (Przechyl)', color: '#a2f279' }, 'speed': { label: 'Predkosc', color: '#f7b731' }, 'target_speed': { label: 'Predkosc Zadana', color: '#ff9f43' }, 'output': { label: 'Wyjscie PID', color: '#ff6347' }, 'encoder_left': { label: 'Enkoder L', color: '#9966ff' }, 'encoder_right': { label: 'Enkoder P', color: '#cc66ff' } };
const builtInPresetsData = { '1': { name: "1. PID Zbalansowany (Startowy)", params: { balanceKpInput: 95.0, balanceKiInput: 0.0, balanceKdInput: 3.23 } }, '2': { name: "2. PID Mieciutki (Plynny)", params: { balanceKpInput: 80.0, balanceKiInput: 0.0, balanceKdInput: 2.8 } }, '3': { name: "3. PID Agresywny (Sztywny)", params: { balanceKpInput: 110.0, balanceKiInput: 0.0, balanceKdInput: 4.0 } } };
let skyDome;
let scene3D, camera3D, renderer3D, controls3D, robotPivot, leftWheel, rightWheel, groundMesh, groundTexture, robotPerspectiveZoom = 40;
let currentEncoderLeft = 0, currentEncoderRight = 0;
let isAnimation3DEnabled = true, isMovement3DEnabled = false, lastEncoderAvg = 0;
window.telemetryData = {};
let isCalibrationModalShown = false;

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
    // Elementy mapowania orientacji czujnika BNO zostały usunięte z interfejsu.
    setupGamepadMappingModal();
    setupDpadControls();
    setupSequenceControls();
    if (typeof initPathVisualization === 'function') initPathVisualization();
    loadGamepadMappings();
    renderMappingModal();
    pollGamepad();
    window.addEventListener('resize', initJoystick);
    init3DVisualization();
    animate3D();
    setTuningUiLock(false, '');
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

// --- Sign toggle helpers (used by feedback sign toggles: balance/speed/position) ---
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
function getActiveSign(containerId) { const c = document.getElementById(containerId); if (!c) return 1; const active = c.querySelector('button.active'); return active ? parseInt(active.dataset.sign) : 1; }
// Podłączenie eventow feedback sign toggles
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
if (typeof toggleAccordion === 'function') window.toggleAccordion = toggleAccordion;
if (typeof updateAccordionHeight === 'function') window.updateAccordionHeight = updateAccordionHeight;
if (typeof clearLogs === 'function') window.clearLogs = clearLogs;
if (typeof getRawEuler === 'function') window.getRawEuler = getRawEuler;
if (typeof updateIMUMappingUIFromData === 'function') window.updateIMUMappingUIFromData = updateIMUMappingUIFromData;
