/**
 * input-controls.js — ES6 module
 * Joystick, Gamepad, DPad, and Sequence control code for RoboBala.
 *
 * Extracted from main.js.
 * All cross-module calls go through window.* for backward compatibility.
 * No imports — standalone module.
 */

// ─── Cross-module helpers (resolved via window.*) ──────────────────────────────
function sendBleMessage(msg) { if (typeof window.sendBleMessage === 'function') window.sendBleMessage(msg); }
function addLogMessage(msg, level) { if (typeof window.addLogMessage === 'function') window.addLogMessage(msg, level); }
function updateAccordionHeight(content) { if (typeof window.updateAccordionHeight === 'function') window.updateAccordionHeight(content); }
function resetPathVisualization() { if (typeof window.resetPathVisualization === 'function') window.resetPathVisualization(); }
function addPlannedPathSegment(type, value) { if (typeof window.addPlannedPathSegment === 'function') window.addPlannedPathSegment(type, value); }

// ─── Joystick global variables ─────────────────────────────────────────────────
let joystickCenter, joystickRadius, knobRadius, isDragging = false, lastJoystickSendTime = 0;
// OPTYMALIZACJA: Zmniejszono interwał z 20ms (50Hz) na 2ms (500Hz) dla natychmiastowej reakcji
const JOYSTICK_SEND_INTERVAL = 2;
let currentJoystickX = 0, currentJoystickY = 0;

// ─── Gamepad global variables ──────────────────────────────────────────────────
let gamepadIndex = null, lastGamepadState = [], gamepadMappings = {}; const GAMEPAD_MAPPING_KEY = 'pid_gamepad_mappings_v3';
let isMappingButton = false, actionToMap = null, lastGamepadSendTime = 0;
// OPTYMALIZACJA: Zmniejszono interwał z 20ms (50Hz) na 2ms (500Hz) dla natychmiastowej reakcji
const GAMEPAD_SEND_INTERVAL = 2;

// ─── Available actions for gamepad mapping ─────────────────────────────────────
// Podstawowe przełączniki
const availableActions = {
    'toggle_balance': { label: 'Wlacz/Wylacz Balansowanie', elementId: 'balanceSwitch' },
    'toggle_hold_position': { label: 'Wlacz/Wylacz Trzymanie Pozycji', elementId: 'holdPositionSwitch' },
    'toggle_speed_mode': { label: 'Wlacz/Wylacz Tryb Predkosci', elementId: 'speedModeSwitch' },
    'emergency_stop': { label: 'STOP AWARYJNY', elementId: 'emergencyStopBtn' },
    'reset_pitch': { label: 'Ustaw punkt 0 (Pitch)', elementId: 'resetZeroBtn' },
    'reset_roll': { label: 'Ustaw punkt 0 (Roll)', elementId: 'resetRollZeroBtn' }
};

// ─── Sequence control variables ────────────────────────────────────────────────
let currentSequenceStep = 0;
const MAX_SEQUENCE_STEPS = 15;

// ─── Joystick functions ────────────────────────────────────────────────────────
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
function handleJoystickStart(event) { event.preventDefault(); isDragging = true; pollJoystick(); }
function handleJoystickMove(event) { if (!isDragging) return; event.preventDefault(); const joystickCanvas = document.getElementById('joystickCanvas'); let { x, y } = getJoystickPosition(event); const dx = x - joystickCenter.x; const dy = y - joystickCenter.y; const distance = Math.sqrt(dx * dx + dy * dy); if (distance > joystickRadius) { x = joystickCenter.x + (dx / distance) * joystickRadius; y = joystickCenter.y + (dy / distance) * joystickRadius; } drawJoystick(joystickCanvas.getContext('2d'), x, y); const joyX = (x - joystickCenter.x) / joystickRadius; const joyY = -(y - joystickCenter.y) / joystickRadius; currentJoystickX = joyX; currentJoystickY = joyY; const now = Date.now(); if (now - lastJoystickSendTime > JOYSTICK_SEND_INTERVAL) { sendBleMessage({ type: 'joystick', x: joyX, y: joyY }); lastJoystickSendTime = now; } }
function getJoystickPosition(event) { const rect = document.getElementById('joystickCanvas').getBoundingClientRect(); const touch = event.touches ? event.touches[0] : event; return { x: touch.clientX - rect.left, y: touch.clientY - rect.top }; }
function handleJoystickEnd(event) { if (!isDragging) return; event.preventDefault(); isDragging = false; drawJoystick(document.getElementById('joystickCanvas').getContext('2d'), joystickCenter.x, joystickCenter.y); sendBleMessage({ type: 'joystick', x: 0, y: 0 }); }

// ─── Gamepad functions ─────────────────────────────────────────────────────────
function pollGamepad() { if (gamepadIndex !== null) { const gp = navigator.getGamepads()[gamepadIndex]; if (!gp) return; if (isMappingButton && actionToMap) { gp.buttons.forEach((button, i) => { if (button.pressed && !lastGamepadState[i]) { Object.keys(gamepadMappings).forEach(key => { if (gamepadMappings[key] === actionToMap) delete gamepadMappings[key]; }); gamepadMappings[i] = actionToMap; saveGamepadMappings(); addLogMessage(`[UI] Akcja '${availableActions[actionToMap].label}' przypisana do przycisku ${i}.`, 'success'); isMappingButton = false; actionToMap = null; renderMappingModal(); } }); } else { gp.buttons.forEach((button, i) => { if (button.pressed && !lastGamepadState[i]) { const action = gamepadMappings[i]; if (action && availableActions[action]) { const element = document.getElementById(availableActions[action].elementId); if (element && !element.disabled) { element.click(); flashElement(element); } } } }); } lastGamepadState = gp.buttons.map(b => b.pressed); let x = gp.axes[0] || 0; let y = gp.axes[1] || 0; if (Math.abs(x) < 0.15) x = 0; if (Math.abs(y) < 0.15) y = 0; const now = Date.now(); if (now - lastGamepadSendTime > GAMEPAD_SEND_INTERVAL) { sendBleMessage({ type: 'joystick', x: x, y: -y }); lastGamepadSendTime = now; } } requestAnimationFrame(pollGamepad); }
function pollJoystick() { if (isDragging) { const now = Date.now(); if (now - lastJoystickSendTime > JOYSTICK_SEND_INTERVAL) { sendBleMessage({ type: 'joystick', x: currentJoystickX, y: currentJoystickY }); lastJoystickSendTime = now; } requestAnimationFrame(pollJoystick); } }
function startMapping(action, buttonElement) { if (gamepadIndex === null) { addLogMessage("Podlacz gamepada, aby rozpoczac mapowanie!", "warn"); return; } isMappingButton = true; actionToMap = action; document.querySelectorAll('.mapping-button').forEach(btn => btn.textContent = "Przypisz"); buttonElement.textContent = "Czekam..."; addLogMessage(`[UI] Nasluchiwanie na przycisk dla akcji: ${availableActions[action].label}...`, "info"); }
function renderMappingModal() { const list = document.getElementById('gamepad-mapping-list'); list.innerHTML = ''; for (const [action, config] of Object.entries(availableActions)) { const row = document.createElement('div'); row.className = 'mapping-row'; const buttonIndex = Object.keys(gamepadMappings).find(key => gamepadMappings[key] === action); row.innerHTML = `<span class="mapping-label">${config.label}</span><span class="mapping-display">${buttonIndex !== undefined ? `Przycisk ${buttonIndex}` : 'Brak'}</span><button class="mapping-button" data-action="${action}">Przypisz</button>`; list.appendChild(row); } list.querySelectorAll('.mapping-button').forEach(button => { button.addEventListener('click', (e) => { const action = e.target.dataset.action; startMapping(action, e.target); }); }); }

// ─── Gamepad helper functions ──────────────────────────────────────────────────
function setupGamepadMappingModal() { document.getElementById('open-gamepad-modal-btn').addEventListener('click', () => { document.getElementById('gamepad-mapping-modal').style.display = 'flex'; }); document.getElementById('close-modal-btn').addEventListener('click', () => { document.getElementById('gamepad-mapping-modal').style.display = 'none'; }); }
function flashElement(element) { if (!element) return; const target = element.tagName === 'INPUT' ? element.closest('.switch') || element.closest('.control-row') || element : element; target.classList.add('gamepad-flash'); setTimeout(() => target.classList.remove('gamepad-flash'), 300); }
function loadGamepadMappings() { const saved = localStorage.getItem(GAMEPAD_MAPPING_KEY); gamepadMappings = saved ? JSON.parse(saved) : {}; }
function saveGamepadMappings() { localStorage.setItem(GAMEPAD_MAPPING_KEY, JSON.stringify(gamepadMappings)); }

// ─── DPad controls ─────────────────────────────────────────────────────────────
function setupDpadControls() { document.querySelectorAll('.dpad-btn').forEach(btn => { btn.addEventListener('click', (e) => { const action = e.currentTarget.dataset.dpad; let msg = null; if (action === 'up') msg = { type: 'execute_move', distance_cm: parseFloat(document.getElementById('dpadDistInput').value) }; else if (action === 'down') msg = { type: 'execute_move', distance_cm: -parseFloat(document.getElementById('dpadDistInput').value) }; else if (action === 'left') msg = { type: 'execute_rotate', angle_deg: -parseFloat(document.getElementById('dpadAngleInput').value) }; else if (action === 'right') msg = { type: 'execute_rotate', angle_deg: parseFloat(document.getElementById('dpadAngleInput').value) }; else if (action === 'stop') msg = { type: 'command_stop' }; if (msg) { flashElement(e.currentTarget); try { addLogMessage(`[UI -> ROBOT] Sending: ${msg.type} ${JSON.stringify(msg)}`, 'info'); } catch (err) { } sendBleMessage(msg); } }); }); }

// ─── Sequence control functions ────────────────────────────────────────────────
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
function showSequenceReport() { document.getElementById('sequence-report-panel').style.display = 'block'; document.getElementById('avgHeadingError').textContent = 'X.X °'; document.getElementById('maxHeadingError').textContent = 'Y.Y °'; document.getElementById('totalDistanceCovered').textContent = 'Z.Z cm'; }

// ─── Initialization ────────────────────────────────────────────────────────────
/**
 * initInputControls() — call from DOMContentLoaded to wire up all input controls.
 * Replaces the individual calls previously made in main.js:
 *   initJoystick, setupGamepadMappingModal, setupDpadControls,
 *   setupSequenceControls, loadGamepadMappings, renderMappingModal,
 *   pollGamepad, window resize listener, gamepad connect/disconnect events.
 */
function initInputControls() {
    initJoystick();
    setupGamepadMappingModal();
    setupDpadControls();
    setupSequenceControls();
    loadGamepadMappings();
    renderMappingModal();
    pollGamepad();

    // Joystick canvas events
    const joystickCanvas = document.getElementById('joystickCanvas');
    if (joystickCanvas) {
        joystickCanvas.addEventListener('mousedown', handleJoystickStart);
        joystickCanvas.addEventListener('mousemove', handleJoystickMove);
        joystickCanvas.addEventListener('mouseup', handleJoystickEnd);
        joystickCanvas.addEventListener('mouseleave', handleJoystickEnd);
        joystickCanvas.addEventListener('touchstart', handleJoystickStart);
        joystickCanvas.addEventListener('touchmove', handleJoystickMove);
        joystickCanvas.addEventListener('touchend', handleJoystickEnd);
    }

    // Resize handler for joystick
    window.addEventListener('resize', initJoystick);

    // Gamepad connect / disconnect
    window.addEventListener('gamepadconnected', (e) => { gamepadIndex = e.gamepad.index; document.getElementById('gamepadStatus').textContent = 'Polaczony'; document.getElementById('gamepadStatus').style.color = '#a2f279'; addLogMessage(`[UI] Gamepad polaczony: ${e.gamepad.id}`, 'success'); });
    window.addEventListener('gamepaddisconnected', (e) => { gamepadIndex = null; document.getElementById('gamepadStatus').textContent = 'Brak'; document.getElementById('gamepadStatus').style.color = '#f7b731'; addLogMessage('[UI] Gamepad rozlaczony.', 'warn'); });
}

// ─── window.* backward compatibility ───────────────────────────────────────────
window.initJoystick = initJoystick;
window.drawJoystick = drawJoystick;
window.handleJoystickStart = handleJoystickStart;
window.handleJoystickMove = handleJoystickMove;
window.handleJoystickEnd = handleJoystickEnd;
window.getJoystickPosition = getJoystickPosition;
window.pollGamepad = pollGamepad;
window.pollJoystick = pollJoystick;
window.startMapping = startMapping;
window.renderMappingModal = renderMappingModal;
window.setupGamepadMappingModal = setupGamepadMappingModal;
window.flashElement = flashElement;
window.loadGamepadMappings = loadGamepadMappings;
window.saveGamepadMappings = saveGamepadMappings;
window.setupDpadControls = setupDpadControls;
window.setupSequenceControls = setupSequenceControls;
window.addSequenceStep = addSequenceStep;
window.runSequence = runSequence;
window.stopSequenceExecution = stopSequenceExecution;
window.clearSequence = clearSequence;
window.updateSequenceUI = updateSequenceUI;
window.checkAndExecuteNextSequenceStep = checkAndExecuteNextSequenceStep;
window.evaluateCondition = evaluateCondition;
window.waitForCondition = waitForCondition;
window.executeNextSequenceStep = executeNextSequenceStep;
window.showSequenceReport = showSequenceReport;
window.initInputControls = initInputControls;

// ─── ES6 Exports ───────────────────────────────────────────────────────────────
export {
    // Joystick variables
    joystickCenter,
    joystickRadius,
    knobRadius,
    isDragging,
    currentJoystickX,
    currentJoystickY,
    JOYSTICK_SEND_INTERVAL,

    // Gamepad variables
    gamepadIndex,
    gamepadMappings,
    GAMEPAD_MAPPING_KEY,
    GAMEPAD_SEND_INTERVAL,
    isMappingButton,
    actionToMap,

    // Constants
    availableActions,
    MAX_SEQUENCE_STEPS,

    // Joystick functions
    initJoystick,
    drawJoystick,
    handleJoystickStart,
    handleJoystickMove,
    handleJoystickEnd,
    getJoystickPosition,
    pollJoystick,

    // Gamepad functions
    pollGamepad,
    startMapping,
    renderMappingModal,
    setupGamepadMappingModal,
    flashElement,
    loadGamepadMappings,
    saveGamepadMappings,

    // DPad
    setupDpadControls,

    // Sequence functions
    setupSequenceControls,
    addSequenceStep,
    runSequence,
    stopSequenceExecution,
    clearSequence,
    updateSequenceUI,
    checkAndExecuteNextSequenceStep,
    evaluateCondition,
    waitForCondition,
    executeNextSequenceStep,
    showSequenceReport,

    // Init
    initInputControls
};
