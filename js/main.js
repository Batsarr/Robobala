// ============================================================================
// RoboBala - Mobile-First Control Interface
// Main JavaScript - Full Functionality with Robot Communication
// ============================================================================

// ========================================================================
// STATE MANAGER - Centralized State Management
// ========================================================================
// This module provides a centralized store for application state with
// observer pattern for reactive updates. It replaces scattered global
// variables with a single source of truth.
// ========================================================================

/**
 * AppStore - Centralized application state manager
 * Implements observer pattern for reactive state updates
 */
class AppStore {
    constructor() {
        this.state = {
            // Connection state
            connection: {
                isConnected: false,
                isSynced: false,
                deviceName: null,
                syncTimeout: null
            },

            // Robot state
            robot: {
                state: 'IDLE', // IDLE, BALANCING, EMERGENCY_STOP, etc.
                balancing: false,
                holdingPosition: false,
                speedMode: false
            },

            // Telemetry data
            telemetry: {
                pitch: 0,
                roll: 0,
                yaw: 0,
                speed: 0,
                encoderLeft: 0,
                encoderRight: 0,
                loopTime: 0,
                qw: 0,
                qx: 0,
                qy: 0,
                qz: 0
            },

            // UI state
            ui: {
                isApplyingConfig: false,
                isSyncingConfig: false,
                isLocked: true
            },

            // Tuning state
            tuning: {
                isActive: false,
                activeMethod: '',
                isPaused: false
            },

            // Sequence state
            sequence: {
                isRunning: false,
                currentStep: 0
            },

            // Temporary sync data
            sync: {
                tempParams: {},
                tempTuningParams: {},
                tempStates: {}
            },

            // Joystick state
            joystick: {
                isDragging: false,
                lastSendTime: 0
            },

            // Gamepad state
            gamepad: {
                index: null,
                lastState: [],
                mappings: {},
                isMappingButton: false,
                actionToMap: null
            }
        };

        this.listeners = new Map();
        this.nextListenerId = 0;
    }

    /**
     * Get current state or a specific path in the state
     * @param {string} path - Optional dot-notation path (e.g., 'connection.isConnected')
     * @returns {any} State value
     */

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

    /**
     * Update state and notify listeners
     * @param {string} path - Dot-notation path or object with updates
     * @param {any} value - New value (if path is string)
     */
    setState(path, value = undefined) {
        let updates = {};

        if (typeof path === 'object' && value === undefined) {
            // Direct object update: setState({ 'connection.isConnected': true })
            updates = path;
        } else {
            // Path update: setState('connection.isConnected', true)
            updates[path] = value;
        }

        // Apply updates
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

        // Notify listeners for changed paths
        if (changedPaths.length > 0) {
            this.notifyListeners(changedPaths);
        }
    }

    /**
     * Subscribe to state changes
     * @param {string|Array<string>} paths - Path(s) to watch (e.g., 'connection.isConnected')
     * @param {Function} callback - Callback function(newValue, oldValue, path)
     * @returns {number} Listener ID for unsubscribing
     */
    subscribe(paths, callback) {
        const id = this.nextListenerId++;
        const pathArray = Array.isArray(paths) ? paths : [paths];

        this.listeners.set(id, {
            paths: pathArray,
            callback
        });

        return id;
    }

    /**
     * Unsubscribe from state changes
     * @param {number} id - Listener ID returned from subscribe()
     */
    unsubscribe(id) {
        this.listeners.delete(id);
    }

    /**
     * Notify listeners about state changes
     * @param {Array<string>} changedPaths - Paths that changed
     */
    notifyListeners(changedPaths) {
        for (const [id, listener] of this.listeners.entries()) {
            const { paths, callback } = listener;

            // Check if any watched path was changed
            for (const watchPath of paths) {
                for (const changedPath of changedPaths) {
                    // Match exact path or parent path (e.g., 'connection' matches 'connection.isConnected')
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

    /**
     * Reset state to initial values
     */
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

    /**
     * Batch update multiple state values
     * More efficient than multiple setState calls
     * @param {Object} updates - Object with path: value pairs
     */
    batchUpdate(updates) {
        this.setState(updates);
    }
}

// Attach sensor mapping modal controls and IMU mapping buttons when DOM is ready
// Setup manual/auto PWM tuning buttons (start/test/stop) before DomContentLoaded
function setupManualTuneButtons() {
    const activeTestTimers = new Map();
    document.querySelectorAll('.manual-tune-row').forEach(row => {
        const motor = row.dataset.motor;
        const direction = row.dataset.direction;
        const rowKey = `${motor}-${direction}`;
        const input = row.querySelector('.tune-input');
        const testBtn = row.querySelector('.test-btn');
        const stopBtn = row.querySelector('.stop-btn');
        const autoBtn = row.querySelector('.auto-btn');

        if (testBtn) testBtn.addEventListener('click', () => {
            const pwm = parseInt(input.value) || 0;
            if (pwm <= 0) { addLogMessage('[UI] Wpisz dodatni PWM do testu.', 'warn'); return; }
            commLayer.send({ type: 'manual_tune_motor', motor, direction, pwm });
            addLogMessage(`[UI] Test ${motor} ${direction} rozpoczęty na 5s (PWM=${pwm}).`, 'info');
            if (activeTestTimers.has(rowKey)) clearTimeout(activeTestTimers.get(rowKey));
            const timeoutId = setTimeout(() => {
                commLayer.send({ type: 'manual_tune_motor', motor, direction, pwm: 0 });
                addLogMessage(`[UI] Test ${motor} ${direction} zakończony automatycznie po 5s.`, 'info');
                activeTestTimers.delete(rowKey);
            }, 5000);
            activeTestTimers.set(rowKey, timeoutId);
        });

        if (stopBtn) stopBtn.addEventListener('click', () => {
            if (activeTestTimers.has(rowKey)) { clearTimeout(activeTestTimers.get(rowKey)); activeTestTimers.delete(rowKey); }
            commLayer.send({ type: 'manual_tune_motor', motor, direction, pwm: 0 });
            addLogMessage(`[UI] Test ${motor} ${direction} zatrzymany.`, 'warn');
        });

        if (autoBtn) autoBtn.addEventListener('click', (e) => {
            // If an autotune for this row is already in progress, ignore repeat presses
            if (autoBtn.disabled) { addLogMessage(`[UI] Auto-strojenie już trwa dla ${motor} ${direction}`, 'warn'); return; }
            if (!confirm('UWAGA! Upewnij sie, ze robot jest uniesiony, a kola moga sie swobodnie obracac. Kontynuowac?')) return;
            if (!appStore.getState('connection.isConnected')) { addLogMessage('[UI] Najpierw połącz się z robotem', 'warn'); return; }
            const startValue = parseInt(document.getElementById('pwmTuneStartInput')?.value || 1200);
            commLayer.send({ type: 'autotune_single_pwm', motor, direction, start_pwm: startValue });
            if (autoBtn) { autoBtn.disabled = true; autoBtn.textContent = 'Szukanie...'; autoBtn.classList.add('running'); }
            addLogMessage(`[UI] Rozpoczynam auto-strojenie dla ${motor} ${direction}...`, 'info');
            // Add a safety timeout that re-enables the button after 30s
            const rowKeyAuto = `${motor}-${direction}`;
            if (globalActiveAutoTimers.has(rowKeyAuto)) clearTimeout(globalActiveAutoTimers.get(rowKeyAuto));
            const autoTimeoutId = setTimeout(() => {
                try { if (autoBtn) { autoBtn.disabled = false; autoBtn.textContent = 'Auto'; autoBtn.classList.remove('running'); } addLogMessage(`[UI] Auto-strojenie ${motor} ${direction} przerwane (timeout).`, 'warn'); } finally { globalActiveAutoTimers.delete(rowKeyAuto); }
            }, 30000);
            globalActiveAutoTimers.set(rowKeyAuto, autoTimeoutId);
        });
    });

    const stopAll = document.getElementById('manualTuneStopAll');
    if (stopAll) stopAll.addEventListener('click', () => {
        commLayer.send({ type: 'manual_tune_stop_all' });
        addLogMessage('[UI] Zatrzymano wszystkie silniki.', 'warn');
        // clear test timers (manual 5s tests)
        try { activeTestTimers.forEach((t) => clearTimeout(t)); activeTestTimers.clear(); } catch (e) { /* no-op */ }
        // Clear any active auto timers and re-enable Auto buttons
        try {
            globalActiveAutoTimers.forEach((tId, key) => { clearTimeout(tId); });
            globalActiveAutoTimers.clear();
            document.querySelectorAll('.manual-tune-row').forEach(row => { const ab = row.querySelector('.auto-btn'); if (ab) { ab.disabled = false; ab.textContent = 'Auto'; ab.classList.remove('running'); } });
        } catch (e) { /* no-op */ }
    });

    const startMinus = document.getElementById('pwmTuneStartMinus');
    const startPlus = document.getElementById('pwmTuneStartPlus');
    const startInput = document.getElementById('pwmTuneStartInput');
    if (startMinus && startInput) startMinus.addEventListener('click', () => { startInput.value = Math.max(parseInt(startInput.value || 0) - 10, 1); });
    if (startPlus && startInput) startPlus.addEventListener('click', () => { startInput.value = Math.min(parseInt(startInput.value || 0) + 10, 2047); });
}

document.addEventListener('DOMContentLoaded', () => {
    // Initialize PWM tuning button handlers (if present)
    setupManualTuneButtons();
    // Initialize signal analyzer chart and controls (idempotent guards inside)
    try { initSignalAnalyzerChart(); setupSignalChartControls(); setupSignalAnalyzerControls(); } catch (e) { /* no-op if Chart.js not present */ }
    document.getElementById('sensorMappingBtnSettings')?.addEventListener('click', () => { openSensorMappingModal(); });
    // IMU calibration buttons
    document.getElementById('calibrateMpuBtnSettings')?.addEventListener('click', showCalibrationModal);
    document.getElementById('calibrateZeroPointBtnSettings')?.addEventListener('click', () => { if (confirm("Upewnij sie, ze robot stoi na idealnie plaskiej powierzchni. Robot bedzie balansowal przez 10 sekund w celu znalezienia dokladnego punktu rownowagi. Kontynuowac?")) { sendBleMessage({ type: 'calibrate_zero_point' }); } });
    // Model mapping buttons
    document.getElementById('modelMappingBtn3D')?.addEventListener('click', () => { openModelMappingModal(); sendBleMessage({ type: 'get_model_mapping' }); });
    document.getElementById('modelMappingLoadBtn')?.addEventListener('click', () => { sendBleMessage({ type: 'get_model_mapping' }); });
    document.getElementById('modelMappingSaveBtn')?.addEventListener('click', () => {
        if (!AppState.isConnected) { addLogMessage('[UI] Musisz być połączony z robotem aby zapisać mapowanie modelu 3D.', 'warn'); return; }
        if (!confirm('Zapisz mapowanie modelu 3D do pamięci EEPROM robota?')) return;
        gatherModelMappingFromUI();
        sendBleMessage({ type: 'set_model_mapping', mapping: modelMapping });
        addLogMessage('[UI] Wyslano mapowanie modelu 3D do robota.', 'info');
    });
    document.getElementById('modelMappingResetBtn')?.addEventListener('click', () => { resetModelMapping(); addLogMessage('[UI] Przywrócono domyślne mapowanie modelu (identity).', 'info'); });
    document.getElementById('modelMappingCloseBtn')?.addEventListener('click', () => { closeModelMappingModal(); });
    document.getElementById('imuMappingLoadBtn')?.addEventListener('click', () => { sendBleMessage({ type: 'get_imu_mapping' }); });
    document.getElementById('imuMappingSaveBtn')?.addEventListener('click', () => {
        if (!AppState.isConnected) { addLogMessage('[UI] Musisz być połączony z robotem aby zapisać mapowanie IMU.', 'warn'); return; }
        if (!confirm('Zapisz mapowanie IMU do pamięci EEPROM robota?')) return;
        const mapping = gatherIMUMappingFromUI();
        sendBleMessage({ type: 'set_imu_mapping', mapping });
        addLogMessage('[UI] Wysłano mapowanie IMU do robota (set_imu_mapping).', 'info');
    });

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

    ['imuPitchSign', 'imuYawSign', 'imuRollSign'].forEach(containerId => {
        const el = document.getElementById(containerId);
        if (!el) return;
        el.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', () => { const sign = parseInt(btn.dataset.sign); setSignButtons(containerId, sign); });
        });
    });

    // Manual correction panel wiring (right-side)
    const manualPanel = document.getElementById('dashboard-right-panel');
    const manualPanelOverlay = document.getElementById('panelRightOverlay');
    document.getElementById('openManualCorrectionPanel')?.addEventListener('click', () => {
        if (!manualPanel) return;
        manualPanel.style.display = 'block';
        manualPanelOverlay.classList.add('active');
        setTimeout(() => manualPanel.classList.add('open'), 20);
        // Prefill inputs
        const pInput = document.getElementById('manualPitchCorrectionInput');
        const rInput = document.getElementById('manualRollCorrectionInput');
        const curTrimPitch = (window.telemetryData && typeof window.telemetryData.trim_angle !== 'undefined') ? Number(window.telemetryData.trim_angle) : null;
        const curTrimRoll = (window.telemetryData && typeof window.telemetryData.roll_trim !== 'undefined') ? Number(window.telemetryData.roll_trim) : null;
        if (pInput) { pInput.value = (curTrimPitch !== null) ? curTrimPitch.toFixed(2) : (Number(window.telemetryData?.pitch || 0)).toFixed(2); pInput.dispatchEvent(new Event('change')); }
        if (rInput) { rInput.value = (curTrimRoll !== null) ? curTrimRoll.toFixed(2) : (Number(window.telemetryData?.roll || 0)).toFixed(2); rInput.dispatchEvent(new Event('change')); }
    });
    document.getElementById('closeManualCorrectionPanel')?.addEventListener('click', () => {
        if (!manualPanel) return;
        manualPanel.classList.remove('open');
        manualPanelOverlay.classList.remove('active');
        setTimeout(() => manualPanel.style.display = 'none', 300);
    });
    // Close on overlay click
    manualPanelOverlay?.addEventListener('click', () => {
        if (!manualPanel) return;
        manualPanel.classList.remove('open');
        manualPanelOverlay.classList.remove('active');
        setTimeout(() => manualPanel.style.display = 'none', 300);
    });

    function bindSpinner(minusId, plusId, inputId, step) {
        const minus = document.getElementById(minusId);
        const plus = document.getElementById(plusId);
        const input = document.getElementById(inputId);
        if (!input) return;
        if (minus) minus.addEventListener('click', () => { input.value = (parseFloat(input.value || 0) - step).toFixed(getDecimalPlaces(step)); input.dispatchEvent(new Event('change')); });
        if (plus) plus.addEventListener('click', () => { input.value = (parseFloat(input.value || 0) + step).toFixed(getDecimalPlaces(step)); input.dispatchEvent(new Event('change')); });
    }

    bindSpinner('pitchMinus', 'pitchPlus', 'manualPitchCorrectionInput', 0.1);
    bindSpinner('rollMinus', 'rollPlus', 'manualRollCorrectionInput', 0.1);

    // Pitch apply and set zero
    document.getElementById('manualPitchApplyBtn')?.addEventListener('click', () => {
        if (!appStore.getState('connection.isConnected')) { addLogMessage('Najpierw połącz się z robotem', 'warn'); return; }
        const v = parseFloat(document.getElementById('manualPitchCorrectionInput')?.value || 0);
        commLayer.send({ type: 'set_param', key: 'trim_angle', value: v });
        addLogMessage(`[UI] Zmieniono trim (Pitch) na ${v}`, 'info');
    });
    document.getElementById('manualPitchSetZeroBtn')?.addEventListener('click', () => {
        if (!appStore.getState('connection.isConnected')) { addLogMessage('Najpierw połącz się z robotem', 'warn'); return; }
        const currentPitch = Number(window.telemetryData?.pitch || 0);
        const newTrim = -currentPitch;
        // Apply runtime delta for immediate effect then persist trim value (keep set_param as last message)
        commLayer.send({ type: 'adjust_zero', value: newTrim });
        commLayer.send({ type: 'set_param', key: 'trim_angle', value: newTrim });
        addLogMessage(`[UI] Ustawiono punkt 0 (Pitch). Nowy trim=${newTrim.toFixed(2)}`, 'info');
    });

    // Roll apply and set zero
    document.getElementById('manualRollApplyBtn')?.addEventListener('click', () => {
        if (!appStore.getState('connection.isConnected')) { addLogMessage('Najpierw połącz się z robotem', 'warn'); return; }
        const v = parseFloat(document.getElementById('manualRollCorrectionInput')?.value || 0);
        commLayer.send({ type: 'set_param', key: 'roll_trim', value: v });
        addLogMessage(`[UI] Zmieniono trim (Roll) na ${v}`, 'info');
    });
    document.getElementById('manualRollSetZeroBtn')?.addEventListener('click', () => {
        if (!appStore.getState('connection.isConnected')) { addLogMessage('Najpierw połącz się z robotem', 'warn'); return; }
        const currentRoll = Number(window.telemetryData?.roll || 0);
        const newTrim = -currentRoll;
        // Apply runtime delta for immediate effect then persist trim value (keep set_param as last message)
        commLayer.send({ type: 'adjust_roll', value: newTrim });
        commLayer.send({ type: 'set_param', key: 'roll_trim', value: newTrim });
        addLogMessage(`[UI] Ustawiono punkt 0 (Roll). Nowy trim=${newTrim.toFixed(2)}`, 'info');
    });

    // Backward compatible Set Zero helpers (used by legacy UI modals)
    function setPitchZero() {
        if (!appStore.getState('connection.isConnected')) { addLogMessage('Najpierw połącz się z robotem', 'warn'); return; }
        const currentPitch = Number(window.telemetryData?.pitch || 0);
        const delta = -currentPitch;
        commLayer.send({ type: 'adjust_zero', value: delta });
        addLogMessage(`[UI] setPitchZero() -> adjust_zero ${delta}`, 'info');
    }

    function setRollZero() {
        if (!appStore.getState('connection.isConnected')) { addLogMessage('Najpierw połącz się z robotem', 'warn'); return; }
        const currentRoll = Number(window.telemetryData?.roll || 0);
        const delta = -currentRoll;
        commLayer.send({ type: 'adjust_roll', value: delta });
        addLogMessage(`[UI] setRollZero() -> adjust_roll ${delta}`, 'info');
    }

    // Sidebar EEPROM save/load
    document.getElementById('loadEepromBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        if (!appStore.getState('connection.isConnected')) { addLogMessage('Najpierw połącz się z robotem', 'warn'); return; }
        commLayer.send({ type: 'request_full_config' });
        addLogMessage('[UI] Żądanie odczytu EEPROM (request_full_config)', 'info');
    });
    document.getElementById('saveEepromBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        if (!appStore.getState('connection.isConnected')) { addLogMessage('Najpierw połącz się z robotem', 'warn'); return; }
        if (!confirm('Czy zapisać bieżące parametry na robot (EEPROM)?')) return;
        commLayer.send({ type: 'save_tunings' });
        addLogMessage('[UI] Żądanie zapisu do EEPROM (save_tunings)', 'info');
    });
});

// Create singleton instance
const appStore = new AppStore();

// ========================================================================
// COMMUNICATION LAYER - Abstract Communication Interface
// ========================================================================
// This module provides an abstract layer for robot communication,
// decoupling the application from specific communication protocols (BLE).
// This makes the code more testable and allows easier protocol changes.
// ========================================================================

/**
 * Abstract base class for communication
 * All communication implementations should extend this class
 */
class CommunicationLayer {
    constructor() {
        this.messageHandlers = new Map();
        this.isConnected = false;
    }

    /**
     * Connect to the device
     * @returns {Promise<boolean>} Success status
     */
    async connect() {
        throw new Error('connect() must be implemented by subclass');
    }

    /**
     * Disconnect from the device
     */
    async disconnect() {
        throw new Error('disconnect() must be implemented by subclass');
    }

    /**
     * Send a message to the device
     * @param {Object} message - Message object to send
     * @returns {Promise<void>}
     */
    async send(message) {
        throw new Error('send() must be implemented by subclass');
    }

    /**
     * Register a handler for incoming messages
     * @param {string} type - Message type to handle
     * @param {Function} handler - Handler function(data)
     */
    onMessage(type, handler) {
        if (!this.messageHandlers.has(type)) {
            this.messageHandlers.set(type, []);
        }
        this.messageHandlers.get(type).push(handler);
    }

    /**
     * Remove a message handler
     * @param {string} type - Message type
     * @param {Function} handler - Handler function to remove
     */
    offMessage(type, handler) {
        if (this.messageHandlers.has(type)) {
            const handlers = this.messageHandlers.get(type);
            const index = handlers.indexOf(handler);
            if (index !== -1) {
                handlers.splice(index, 1);
            }
        }
    }

    /**
     * Notify all handlers for a message type
     * @param {string} type - Message type
     * @param {Object} data - Message data
     */
    notifyHandlers(type, data) {
        if (this.messageHandlers.has(type)) {
            for (const handler of this.messageHandlers.get(type)) {
                try {
                    handler(data);
                } catch (error) {
                    console.error(`Error in message handler for ${type}:`, error);
                }
            }
        }

        // Also notify wildcard handlers (type '*')
        if (this.messageHandlers.has('*')) {
            for (const handler of this.messageHandlers.get('*')) {
                try {
                    handler(type, data);
                } catch (error) {
                    console.error('Error in wildcard message handler:', error);
                }
            }
        }
    }

    /**
     * Get connection status
     * @returns {boolean}
     */
    getConnectionStatus() {
        return this.isConnected;
    }
}

/**
 * Bluetooth Low Energy (BLE) implementation of CommunicationLayer
 */
class BLECommunication extends CommunicationLayer {
    constructor(serviceUuid, rxUuid, txUuid) {
        super();
        this.serviceUuid = serviceUuid;
        this.rxUuid = rxUuid;
        this.txUuid = txUuid;

        this.device = null;
        this.rxCharacteristic = null;
        this.txCharacteristic = null;

        this.buffer = '';
        this.messageQueue = [];
        this.isSending = false;
        this.sendInterval = 20; // ms between messages

        // Chunked message handling
        this.chunks = new Map();
    }

    /**
     * Connect to BLE device
     * @returns {Promise<boolean>}
     */
    async connect() {
        try {
            // Request device
            this.device = await navigator.bluetooth.requestDevice({
                filters: [{ name: 'RoboBala' }],
                optionalServices: [this.serviceUuid]
            });

            // Listen for disconnection
            this.device.addEventListener('gattserverdisconnected', () => {
                this.handleDisconnection();
            });

            // Connect to GATT server
            const server = await this.device.gatt.connect();
            const service = await server.getPrimaryService(this.serviceUuid);

            // Get characteristics
            this.rxCharacteristic = await service.getCharacteristic(this.rxUuid);
            this.txCharacteristic = await service.getCharacteristic(this.txUuid);

            // Start receiving notifications
            await this.txCharacteristic.startNotifications();
            this.txCharacteristic.addEventListener('characteristicvaluechanged',
                (event) => this.handleNotification(event));

            this.isConnected = true;
            return true;
        } catch (error) {
            console.error('BLE connection error:', error);
            this.isConnected = false;
            return false;
        }
    }

    /**
     * Disconnect from BLE device
     */
    async disconnect() {
        if (this.device && this.device.gatt.connected) {
            await this.device.gatt.disconnect();
        }
        this.handleDisconnection();
    }

    /**
     * Handle disconnection event
     */
    handleDisconnection() {
        this.isConnected = false;
        this.device = null;
        this.rxCharacteristic = null;
        this.txCharacteristic = null;
        this.messageQueue = [];
        this.buffer = '';
        this.chunks.clear();

        // Notify handlers about disconnection
        this.notifyHandlers('disconnected', {});
    }

    /**
     * Handle incoming BLE notification
     * @param {Event} event - Characteristic value changed event
     */
    handleNotification(event) {
        const value = event.target.value;
        const decoder = new TextDecoder('utf-8');
        this.buffer += decoder.decode(value);

        // Process complete lines
        let newlineIndex;
        while ((newlineIndex = this.buffer.indexOf('\n')) !== -1) {
            const line = this.buffer.substring(0, newlineIndex).trim();
            this.buffer = this.buffer.substring(newlineIndex + 1);

            if (line) {
                try {
                    const data = JSON.parse(line);

                    // Handle chunked messages (legacy 'chunk') or new firmware 'chunk_stream')
                    if ((data.type === 'chunk' || data.type === 'chunk_stream') && data.id !== undefined) {
                        this.handleChunk({
                            id: data.id,
                            i: data.i,
                            total: data.total,
                            data: data.data
                        });
                    } else {
                        // Regular message
                        this.notifyHandlers(data.type, data);
                    }
                } catch (error) {
                    console.error('JSON parse error:', error, 'Data:', line);
                }
            }
        }
    }

    /**
     * Handle chunked message assembly
     * @param {Object} chunk - Chunk data
     */
    handleChunk(chunk) {
        const { id, i, total, data } = chunk;

        // Get or create chunk entry
        let entry = this.chunks.get(id);
        if (!entry) {
            entry = {
                total: total || 0,
                parts: new Map(),
                timer: setTimeout(() => {
                    if (this.chunks.has(id)) {
                        this.chunks.delete(id);
                        console.error(`Chunk assembly timeout for ID: ${id}`);
                    }
                }, 5000)
            };
            this.chunks.set(id, entry);
        }

        // Store chunk part
        entry.parts.set(i, data || '');
        if (total) entry.total = total;

        // Check if all chunks received
        if (entry.parts.size === entry.total && entry.total > 0) {
            clearTimeout(entry.timer);

            // Combine chunks
            let combined = '';
            for (let idx = 0; idx < entry.total; idx++) {
                combined += entry.parts.get(idx) || '';
            }

            this.chunks.delete(id);

            // Parse and notify
            try {
                const fullMessage = JSON.parse(combined);
                this.notifyHandlers(fullMessage.type, fullMessage);
            } catch (error) {
                console.error('Error assembling chunks:', error, 'Data:', combined);
            }
        }
    }

    /**
     * Send message to device
     * @param {Object} message - Message to send
     */
    async send(message) {
        this.messageQueue.push(message);
        this.processQueue();
    }

    /**
     * Process message queue
     */
    async processQueue() {
        if (this.isSending || this.messageQueue.length === 0 || !this.rxCharacteristic) {
            return;
        }

        this.isSending = true;
        const message = this.messageQueue.shift();

        try {
            const encoder = new TextEncoder();
            const data = JSON.stringify(message) + '\n';
            await this.rxCharacteristic.writeValueWithoutResponse(encoder.encode(data));
        } catch (error) {
            console.error('BLE send error:', error);
        }

        // Schedule next message
        setTimeout(() => {
            this.isSending = false;
            this.processQueue();
        }, this.sendInterval);
    }

    /**
     * Get device name
     * @returns {string|null}
     */
    getDeviceName() {
        return this.device ? this.device.name : null;
    }
}

/**
 * Mock communication for testing
 */
class MockCommunication extends CommunicationLayer {
    constructor() {
        super();
        this.mockDelay = 50; // Simulate network delay
    }

    async connect() {
        await this.delay(this.mockDelay);
        this.isConnected = true;
        return true;
    }

    async disconnect() {
        await this.delay(this.mockDelay);
        this.isConnected = false;
        this.notifyHandlers('disconnected', {});
    }

    async send(message) {
        if (!this.isConnected) {
            throw new Error('Not connected');
        }

        // Simulate sending and echo back (for testing)
        await this.delay(this.mockDelay);
        console.log('Mock send:', message);

        // Simulate some responses
        if (message.type === 'request_full_config') {
            setTimeout(() => {
                this.notifyHandlers('sync_begin', {});
                this.notifyHandlers('set_param', { key: 'kp_b', value: 95.0 });
                this.notifyHandlers('sync_end', {});
            }, 100);
        }
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    getDeviceName() {
        return 'MockRoboBala';
    }
}

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

// Model mapping for 3D visualization
let modelMapping = { pitch: { source: 0, sign: 1 }, yaw: { source: 1, sign: 1 }, roll: { source: 2, sign: 1 } };
function updateModelMappingUI() {
    const sPitch = document.getElementById('modelPitchSource');
    const sYaw = document.getElementById('modelYawSource');
    const sRoll = document.getElementById('modelRollSource');
    if (sPitch) sPitch.value = String(modelMapping.pitch.source);
    if (sYaw) sYaw.value = String(modelMapping.yaw.source);
    if (sRoll) sRoll.value = String(modelMapping.roll.source);
    setSignButtons('modelPitchSign', modelMapping.pitch.sign);
    setSignButtons('modelYawSign', modelMapping.yaw.sign);
    setSignButtons('modelRollSign', modelMapping.roll.sign);
    const cur = document.getElementById('model-mapping-current');
    if (cur) { cur.textContent = `pitch: src=${modelMapping.pitch.source} sign=${modelMapping.pitch.sign} | yaw: src=${modelMapping.yaw.source} sign=${modelMapping.yaw.sign} | roll: src=${modelMapping.roll.source} sign=${modelMapping.roll.sign}`; }
}

function gatherModelMappingFromUI() {
    modelMapping.pitch.source = parseInt(document.getElementById('modelPitchSource')?.value || '0');
    modelMapping.yaw.source = parseInt(document.getElementById('modelYawSource')?.value || '1');
    modelMapping.roll.source = parseInt(document.getElementById('modelRollSource')?.value || '2');
    modelMapping.pitch.sign = getActiveSign('modelPitchSign');
    modelMapping.yaw.sign = getActiveSign('modelYawSign');
    modelMapping.roll.sign = getActiveSign('modelRollSign');
}

function resetModelMapping() {
    modelMapping = { pitch: { source: 0, sign: 1 }, yaw: { source: 1, sign: 1 }, roll: { source: 2, sign: 1 } };
    updateModelMappingUI();
}

// Signal analyzer chart variables
let signalAnalyzerChart;
let signalAnalyzerChartInitialized = false;
let signalAnalyzerControlsBound = false;
let signalChartMouseHandlersBound = false;
// Global map to track pending autotune timers per motor/direction so we can clear them from other handlers
let globalActiveAutoTimers = new Map();
// Telemetry variables available for chart
let availableTelemetry = {
    pitch: { label: 'Pitch', color: '#61dafb' },
    roll: { label: 'Roll', color: '#4CAF50' },
    yaw: { label: 'Yaw', color: '#FF9800' },
    speed: { label: 'Speed', color: '#f7b731' },
    target_speed: { label: 'Target Speed', color: '#e74c3c' },
    output: { label: 'Output', color: '#9b59b6' }
};

// no duplicate setupManualTuneButtons here; the real function is defined earlier
let isChartPaused = false;
let chartRangeSelection = { isSelecting: false, startIndex: null, endIndex: null };
let cursorA = null, cursorB = null;

// 3D Visualization variables
let scene3D, camera3D, renderer3D, controls3D, robotPivot, leftWheel, rightWheel, groundMesh, groundTexture, skyDome;
let isAnimation3DEnabled = false, isMovement3DEnabled = false, robotPerspectiveZoom = 40;
// Sensor mapping preview and wizard globals
let sensorPreview = { scene: null, camera: null, renderer: null, cube: null, axes: null, animId: null, faceIndicator: null, xLabel: null, yLabel: null, zLabel: null, xArrow: null, yArrow: null, zArrow: null };
let sensorWizard = { step: 0, rotStartYaw: null, monitorId: null, progress: { upright: false, rotation: false, saved: false } };
let sensorModalTelemetryMonitorId = null;
let currentEncoderLeft = 0, currentEncoderRight = 0, lastEncoderAvg = 0;

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
        // Disable/enable D-Pad controls visually and functionally
        document.querySelectorAll('.dpad-btn').forEach(btn => {
            try { btn.disabled = !value; } catch (e) { }
            // Add a safety timeout in case robot doesn't respond, re-enable button after 30s
            const rowKeyAuto = `${motor}-${direction}`;
            if (globalActiveAutoTimers.has(rowKeyAuto)) clearTimeout(globalActiveAutoTimers.get(rowKeyAuto));
            const autoTimeoutId = setTimeout(() => {
                try {
                    const row = document.querySelector(`.manual-tune-row[data-motor="${motor}"][data-direction="${direction}"]`);
                    if (row) {
                        const ab = row.querySelector('.auto-btn'); if (ab) { ab.disabled = false; ab.textContent = 'Auto'; }
                    }
                    addLogMessage(`[UI] Auto-strojenie ${motor} ${direction} przerwane (timeout).`, 'warn');
                } finally {
                    globalActiveAutoTimers.delete(rowKeyAuto);
                }
            }, 30000);
            globalActiveAutoTimers.set(rowKeyAuto, autoTimeoutId);
        });
        // clear any active auto timers and re-enable auto buttons
        try {
            globalActiveAutoTimers.forEach((tId, key) => { clearTimeout(tId); });
            globalActiveAutoTimers.clear();
            document.querySelectorAll('.manual-tune-row').forEach(row => { const ab = row.querySelector('.auto-btn'); if (ab) { ab.disabled = false; ab.textContent = 'Auto'; } });
        } catch (e) { /* no-op */ }
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
        if (value && typeof refreshRecentList === 'function') refreshRecentList();
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
                    // Kąty z kwaternionu po stronie firmware są już skorygowane o trymy.
                    // Dlatego ustawiamy bez dalszych korekt.
                    data.pitch = data.raw_pitch;
                    data.yaw = data.raw_yaw;
                    data.roll = data.raw_roll;
                }
            }
            updateTelemetryUI(data);
            updateChart(data);
            updateActualPath(data);
            // Legacy guard: mappingWizard removed; keep defensive check
            if (typeof mappingWizard !== 'undefined' && mappingWizard && mappingWizard.isActive && typeof processWizardTelemetry === 'function') {
                processWizardTelemetry(data);
            }
            // Update encoder variables for 3D visualization
            const encLeft = (data.encoder_left !== undefined) ? data.encoder_left : data.el;
            if (encLeft !== undefined) {
                currentEncoderLeft = encLeft;
                const encoderLeftEl = document.getElementById('encoderLeftVal');
                if (encoderLeftEl) encoderLeftEl.textContent = encLeft;
            }
            const encRight = (data.encoder_right !== undefined) ? data.encoder_right : data.er;
            if (encRight !== undefined) {
                currentEncoderRight = encRight;
                const encoderRightEl = document.getElementById('encoderRightVal');
                if (encoderRightEl) encoderRightEl.textContent = encRight;
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
            else if (data.message === 'autonomous_move_complete') {
                addLogMessage(`[ROBOT] Ruch autonomiczny zakonczony. target=${data.targetPosition} current=${data.currentPosition}`, 'success');
            }
            else if (data.message === 'autonomous_rotate_complete') {
                addLogMessage(`[ROBOT] Rotacja autonomiczna zakonczona. targetYaw=${data.targetYawDeg} currentYaw=${data.currentYawDeg}`, 'success');
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
        case 'min_pwm_autotune_result':
            try {
                const motor = data.motor; const direction = data.direction; const found = data.found_pwm;
                const id = `${motor === 'left' ? 'minPwmLeft' : 'minPwmRight'}${direction === 'fwd' ? 'Fwd' : 'Bwd'}Input`;
                const inputEl = document.getElementById(id);
                if (inputEl) { inputEl.value = found; inputEl.dispatchEvent(new Event('change')); }
                const row = document.querySelector(`.manual-tune-row[data-motor="${motor}"][data-direction="${direction}"]`);
                if (row) { const autoBtn = row.querySelector('.auto-btn'); if (autoBtn) { autoBtn.disabled = false; autoBtn.textContent = 'Auto'; autoBtn.classList.remove('running'); } }
                // Clear any pending auto timeout for this motor-direction
                try {
                    const rowKeyAuto = `${motor}-${direction}`;
                    if (globalActiveAutoTimers && globalActiveAutoTimers.has(rowKeyAuto)) { clearTimeout(globalActiveAutoTimers.get(rowKeyAuto)); globalActiveAutoTimers.delete(rowKeyAuto); }
                } catch (e) { /* ignore */ }
                addLogMessage(`[UI] min_pwm_autotune_result: ${motor} ${direction} -> ${found}`, 'info');
            } catch (e) { console.error('Error handling min_pwm_autotune_result', e); }
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
                    addLogMessage(`[UI] Robot potwierdzil wyslanie konfiguracji: ${data.message || 'OK'}`, 'info');
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
        case 'sync_end':
            // Zastosuj wszystkie zebrane parametry i stany
            AppState.isApplyingConfig = true;
            for (const [key, value] of Object.entries(AppState.tempParams)) {
                applySingleParam(key, value);
            }
            for (const [key, value] of Object.entries(AppState.tempTuningParams)) {
                applySingleAutotuneParam(key, value);
            }
            if (AppState.tempStates.balancing !== undefined) {
                const balEl = document.getElementById('balanceToggle') || document.getElementById('balanceSwitch');
                if (balEl) balEl.checked = AppState.tempStates.balancing;
            }
            if (AppState.tempStates.holding_pos !== undefined) {
                const holdEl = document.getElementById('holdPositionToggle') || document.getElementById('holdPositionSwitch');
                if (holdEl) holdEl.checked = AppState.tempStates.holding_pos;
            }
            if (AppState.tempStates.speed_mode !== undefined) {
                const speedEl = document.getElementById('speedModeToggle') || document.getElementById('speedModeSwitch');
                if (speedEl) speedEl.checked = AppState.tempStates.speed_mode;
            }
            AppState.isApplyingConfig = false;

            // Zaktualizuj UI
            clearTimeout(AppState.syncTimeout);
            AppState.isSynced = true;
            document.getElementById('connectionText').textContent = 'Połączony';
            document.getElementById('connectBtn').querySelector('span').textContent = 'Rozłącz';
            document.getElementById('connectBtn').classList.remove('btn-primary');
            document.getElementById('connectBtn').classList.add('btn-secondary');
            document.getElementById('connectionDot').classList.add('connected');
            addLogMessage('[UI] Synchronizacja zakończona pomyślnie', 'success');
            break;
        default:
            // Handle other message types if needed
            break;
    }
}

// Helper functions for message processing
function applySingleParam(key, value) {
    // Map parameter keys to input IDs
    const paramMap = {
        'kp_b': 'balanceKp',
        'ki_b': 'balanceKi',
        'kd_b': 'balanceKd',
        'balance_pid_derivative_filter_alpha': 'balanceFilterAlpha',
        'balance_pid_integral_limit': 'balanceIntegralLimit'
        , 'trim_angle': 'manualPitchCorrectionInput'
        , 'roll_trim': 'manualRollCorrectionInput'
    };

    const inputId = paramMap[key];
    if (inputId) {
        const input = document.getElementById(inputId);
        if (input) {
            input.value = value;
            input.dispatchEvent(new Event('change'));
        }
    }
}

function applySingleAutotuneParam(key, value) {
    // Handle autotune parameters
    if (key === 'search_ki') {
        const checkbox = document.getElementById('include-ki-checkbox');
        if (checkbox) {
            checkbox.checked = value;
            updateSearchSpaceInputs();
        }
    }
}

function updateSearchSpaceInputs() {
    // Placeholder for search space updates
}

function updateTelemetryUI(data) {
    if (data.pitch !== undefined) {
        const pitchEl = document.getElementById('pitchValue');
        if (pitchEl) pitchEl.textContent = data.pitch.toFixed(1) + '°';
    }
    if (data.roll !== undefined) {
        const rollEl = document.getElementById('rollValue');
        if (rollEl) rollEl.textContent = data.roll.toFixed(1) + '°';
    }
    if (data.yaw !== undefined) {
        const yawEl = document.getElementById('yawValue');
        if (yawEl) yawEl.textContent = data.yaw.toFixed(1) + '°';
    }
    if (data.loop_time !== undefined || data.lt !== undefined) {
        const loopTime = data.loop_time !== undefined ? data.loop_time : data.lt;
        const loopEl = document.getElementById('loopTimeValue');
        if (loopEl) loopEl.textContent = loopTime + ' μs';
    }
}

function updateChart(data) {
    // Placeholder for chart updates
}

function updateActualPath(data) {
    // Placeholder for path updates
}

function checkAndExecuteNextSequenceStep(prevState) {
    // Placeholder for sequence handling
}

function setTuningUiLock(isLocked, method) {
    // Placeholder for tuning UI lock
}

function refreshRecentList() {
    // Placeholder for recent list refresh
}

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

function applyModelMappingToEuler(e) {
    // e={pitch,yaw,roll}; zwraca przemapowane
    const arr = [e.pitch, e.yaw, e.roll];
    return {
        pitch: (arr[modelMapping.pitch.source] || 0) * modelMapping.pitch.sign,
        yaw: (arr[modelMapping.yaw.source] || 0) * modelMapping.yaw.sign,
        roll: (arr[modelMapping.roll.source] || 0) * modelMapping.roll.sign
    };
}

function addLogMessage(message, level = 'info') {
    const logMessages = document.getElementById('logMessages');
    const logBadge = document.getElementById('logBadge');
    const logAutoscroll = document.getElementById('logAutoscroll');

    if (!logMessages || !logBadge) return;

    const logEntry = document.createElement('div');
    logEntry.className = `log-entry ${level}`;

    const time = new Date().toLocaleTimeString('pl-PL');
    logEntry.innerHTML = `<span class="log-time">${time}</span>${message}`;

    logMessages.appendChild(logEntry);
    const currentCount = parseInt(logBadge.textContent) || 0;
    logBadge.textContent = currentCount + 1;

    // Auto-scroll if enabled
    if (logAutoscroll && logAutoscroll.checked) {
        logMessages.scrollTop = logMessages.scrollHeight;
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

    const connectBtn = document.getElementById('connectBtn');
    if (connectBtn) {
        connectBtn.querySelector('span').textContent = 'Połącz z Robotem';
        connectBtn.classList.remove('btn-secondary');
        connectBtn.classList.add('btn-primary');
    }

    const connectionDot = document.getElementById('connectionDot');
    const connectionText = document.getElementById('connectionText');
    if (connectionDot) connectionDot.classList.remove('connected');
    if (connectionText) connectionText.textContent = 'Rozłączony';

    ['balanceToggle', 'holdPositionToggle', 'speedModeToggle'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.checked = false;
    });
}

function handleCancel() {
    // Placeholder for cancel handling
}

document.addEventListener('DOMContentLoaded', () => {
    // ========================================================================
    // SPLASH SCREEN
    // ========================================================================
    const splashScreen = document.getElementById('splashScreen');

    // Hide splash after 2 seconds with smooth animation
    setTimeout(() => {
        splashScreen.classList.add('exiting');
        setTimeout(() => {
            splashScreen.classList.remove('active', 'exiting');
        }, 500);
    }, 2000);

    // Initialize communication handlers
    setupCommunicationHandlers();

    // ========================================================================
    // SIDEBAR NAVIGATION
    // ========================================================================
    const menuToggle = document.getElementById('menuToggle');
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    const sidebarClose = document.getElementById('sidebarClose');
    const menuLinks = document.querySelectorAll('.sidebar-menu a');

    function capitalize(str) {
        return str.split('-').map(word => {
            if (word.length === 0) return word;
            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        }).join('');
    }

    // Robust helper to find a view element by data-view value.
    // Handles cases like '3d' -> 'view3D' and performs case-insensitive fallback.
    function getViewElement(viewId) {
        if (!viewId) return null;
        // 1) try capitalized (pid-tuning -> PidTuning)
        let candidate = `view${capitalize(viewId)}`;
        let el = document.getElementById(candidate);
        if (el) return el;

        // 2) try raw (view3d)
        candidate = `view${viewId}`;
        el = document.getElementById(candidate);
        if (el) return el;

        // 3) case-insensitive search among .view elements
        const lower = candidate.toLowerCase();
        const views = document.querySelectorAll('.view');
        for (const v of views) {
            if (v.id && v.id.toLowerCase() === lower) return v;
        }

        return null;
    }

    function openSidebar() {
        sidebar.classList.add('active');
        sidebarOverlay.classList.add('active');
        menuToggle.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeSidebar() {
        sidebar.classList.remove('active');
        sidebarOverlay.classList.remove('active');
        menuToggle.classList.remove('active');
        document.body.style.overflow = '';
    }

    menuToggle.addEventListener('click', () => {
        if (sidebar.classList.contains('active')) {
            closeSidebar();
        } else {
            openSidebar();
        }
    });

    sidebarClose.addEventListener('click', closeSidebar);
    sidebarOverlay.addEventListener('click', closeSidebar);

    // View Navigation
    menuLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const viewId = link.getAttribute('data-view');

            // Update active menu item
            menuLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');

            // Switch view
            document.querySelectorAll('.view').forEach(view => {
                view.classList.remove('active');
            });
            const newView = getViewElement(viewId);
            if (!newView) {
                console.warn(`[UI] No view element found for data-view='${viewId}'. Tried view${capitalize(viewId)} and view${viewId}`);
            } else {
                newView.classList.add('active');
            }

            // Initialize 3D visualization when switching to diagnostics OR 3D view
            if (viewId === 'diagnostics' || viewId === '3d') {
                setTimeout(() => {
                    try {
                        if (typeof window.init3DVisualization === 'function') {
                            window.init3DVisualization();
                            window.setupControls3D?.();
                            window.animate3D();
                            addLogMessage('[UI] Wizualizacja 3D zainicjalizowana przy przełączaniu zakładki', 'info');
                        }
                        if (typeof window.initSignalAnalyzerChart === 'function') {
                            window.initSignalAnalyzerChart();
                            window.setupSignalChartControls?.();
                            window.setupSignalAnalyzerControls?.();
                            addLogMessage('[UI] Analizator sygnału zainicjalizowany przy przełączaniu zakładki', 'info');
                        }
                    } catch (e) {
                        console.warn('Initialization error:', e);
                        addLogMessage('Błąd inicjalizacji: ' + e.message, 'error');
                    }
                }, 100);
            }

            // Initialize view-specific components
            setTimeout(() => {
                try {
                    switch (viewId) {
                        case 'pid-tuning':
                            if (typeof window.initPidSettings === 'function') {
                                window.initPidSettings();
                                addLogMessage('[UI] Ustawienia PID zainicjalizowane przy przełączaniu zakładki', 'info');
                            }
                            break;
                        case 'settings':
                            if (typeof window.initJoystickSettings === 'function') {
                                window.initJoystickSettings();
                                addLogMessage('[UI] Ustawienia joysticka zainicjalizowane przy przełączaniu zakładki', 'info');
                            }
                            if (typeof window.initHardwareSettings === 'function') {
                                window.initHardwareSettings();
                                addLogMessage('[UI] Ustawienia sprzętu zainicjalizowane przy przełączaniu zakładki', 'info');
                            }
                            break;
                        case 'calibration':
                            if (typeof window.initSensorMappingPreview === 'function') {
                                window.initSensorMappingPreview();
                                addLogMessage('[UI] Podgląd mapowania czujników zainicjalizowany przy przełączaniu zakładki', 'info');
                            }
                            break;
                        case 'autotuning':
                            if (typeof window.initAutotuning === 'function') {
                                window.initAutotuning();
                                addLogMessage('[UI] Autostrojenie zainicjalizowane przy przełączaniu zakładki', 'info');
                            }
                            break;
                        case 'autonomous':
                            if (typeof window.initPathVisualization === 'function') {
                                window.initPathVisualization();
                                addLogMessage('[UI] Wizualizacja ścieżki zainicjalizowana przy przełączaniu zakładki', 'info');
                            }
                            if (typeof setupDpadControls === 'function') {
                                setupDpadControls();
                                addLogMessage('[UI] Kontrolki D-Pad zainicjalizowane przy przełączaniu zakładki', 'info');
                            }
                            break;
                    }
                } catch (e) {
                    console.warn('View initialization error:', e);
                    addLogMessage('Błąd inicjalizacji widoku: ' + e.message, 'error');
                }
            }, 150);

            // Close sidebar on mobile
            closeSidebar();

            // Scroll to top
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    });

    // ========================================================================
    // THEME TOGGLE
    // ========================================================================
    const themeToggle = document.getElementById('themeToggle');
    const themeIcon = themeToggle.querySelector('.theme-icon');
    const themeLabel = themeToggle.querySelector('.theme-label');

    // Load saved theme
    const savedTheme = localStorage.getItem('robobala-theme') || 'dark';
    document.body.className = `theme-${savedTheme}`;
    updateThemeButton(savedTheme);

    themeToggle.addEventListener('click', () => {
        const currentTheme = document.body.classList.contains('theme-dark') ? 'dark' : 'light';
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

        document.body.className = `theme-${newTheme}`;
        localStorage.setItem('robobala-theme', newTheme);
        updateThemeButton(newTheme);
    });

    function updateThemeButton(theme) {
        if (theme === 'dark') {
            themeIcon.textContent = '🌙';
            themeLabel.textContent = 'Tryb Ciemny';
        } else {
            themeIcon.textContent = '☀️';
            themeLabel.textContent = 'Tryb Jasny';
        }
    }

    // ========================================================================
    // LOG SHEET (Collapsible Bottom Sheet)
    // ========================================================================
    const logSheet = document.getElementById('logSheet');
    const logHeader = document.getElementById('logHeader');
    const logToggle = document.getElementById('logToggle');
    const logMessages = document.getElementById('logMessages');
    const logBadge = document.getElementById('logBadge');
    const clearLogs = document.getElementById('clearLogs');
    const logAutoscroll = document.getElementById('logAutoscroll');

    let logCount = 0;

    logHeader.addEventListener('click', () => {
        logSheet.classList.toggle('expanded');
    });

    clearLogs.addEventListener('click', (e) => {
        e.stopPropagation();
        logMessages.innerHTML = '';
        logCount = 0;
        updateLogBadge();
        addLogMessage('Logi wyczyszczone', 'info');
    });

    function updateLogBadge() {
        logBadge.textContent = logCount;
    }

    // Add initial log
    addLogMessage('Aplikacja uruchomiona', 'success');

    // ========================================================================
    // EMERGENCY FAB
    // ========================================================================
    const emergencyFab = document.getElementById('emergencyFab');

    emergencyFab.addEventListener('click', () => {
        if (confirm('Czy na pewno chcesz wykonać awaryjne zatrzymanie robota?')) {
            commLayer.send({ type: 'command_stop' });
            addLogMessage('AWARYJNE ZATRZYMANIE wykonane', 'error');
            alert('Robot zatrzymany awaryjnie!');
        }
    });

    // ========================================================================
    // TABS
    // ========================================================================
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const targetId = tab.getAttribute('data-tab');
            const tabContainer = tab.closest('.card');

            // Update tab buttons
            tabContainer.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // Update tab content
            tabContainer.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });
            tabContainer.querySelector(`#tab${capitalize(targetId)}`).classList.add('active');
        });
    });

    // ========================================================================
    // ACCORDION
    // ========================================================================
    document.querySelectorAll('.accordion-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const content = btn.nextElementSibling;
            const isActive = btn.classList.contains('active');

            // Close all accordions in same container
            const container = btn.closest('.card');
            container.querySelectorAll('.accordion-btn').forEach(b => {
                b.classList.remove('active');
                b.nextElementSibling.classList.remove('active');
            });

            // Toggle current accordion
            if (!isActive) {
                btn.classList.add('active');
                content.classList.add('active');
            }
        });
    });

    // ========================================================================
    // PARAMETER INPUTS (Plus/Minus Buttons)
    // ========================================================================
    document.querySelectorAll('.input-group').forEach(group => {
        const input = group.querySelector('input[type="number"]');
        const minusBtn = group.querySelector('.btn-minus');
        const plusBtn = group.querySelector('.btn-plus');

        if (!input || !minusBtn || !plusBtn) return;

        const step = parseFloat(input.getAttribute('step')) || 1;
        const min = parseFloat(input.getAttribute('min'));
        const max = parseFloat(input.getAttribute('max'));

        minusBtn.addEventListener('click', () => {
            let value = parseFloat(input.value) || 0;
            value -= step;
            if (!isNaN(min)) value = Math.max(min, value);
            input.value = value.toFixed(getDecimalPlaces(step));
            input.dispatchEvent(new Event('change'));
        });

        plusBtn.addEventListener('click', () => {
            let value = parseFloat(input.value) || 0;
            value += step;
            if (!isNaN(max)) value = Math.min(max, value);
            input.value = value.toFixed(getDecimalPlaces(step));
            input.dispatchEvent(new Event('change'));
        });
    });

    function getDecimalPlaces(num) {
        const match = ('' + num).match(/(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/);
        if (!match) return 0;
        return Math.max(0, (match[1] ? match[1].length : 0) - (match[2] ? +match[2] : 0));
    }

    // ========================================================================
    // JOYSTICK
    // ========================================================================
    const joystickCanvas = document.getElementById('joystickCanvas');
    const joystickCtx = joystickCanvas.getContext('2d');

    let joystickActive = false;
    let joystickCenter = { x: 0, y: 0 };
    let joystickKnob = { x: 0, y: 0 };
    let joystickRadius = 0;
    let knobRadius = 0;
    let joystickInterval = null;
    let currentJoyX = 0;
    let currentJoyY = 0;

    function initJoystick() {
        const size = joystickCanvas.parentElement.offsetWidth;
        joystickCanvas.width = size;
        joystickCanvas.height = size;

        joystickCenter = { x: size / 2, y: size / 2 };
        joystickRadius = size / 2 * 0.75;
        knobRadius = size / 2 * 0.25;

        joystickKnob = { ...joystickCenter };
        drawJoystick();
    }

    function drawJoystick() {
        joystickCtx.clearRect(0, 0, joystickCanvas.width, joystickCanvas.height);

        // Draw outer circle
        joystickCtx.beginPath();
        joystickCtx.arc(joystickCenter.x, joystickCenter.y, joystickRadius, 0, Math.PI * 2);
        joystickCtx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        joystickCtx.fill();

        // Draw knob
        joystickCtx.beginPath();
        joystickCtx.arc(joystickKnob.x, joystickKnob.y, knobRadius, 0, Math.PI * 2);
        joystickCtx.fillStyle = '#61dafb';
        joystickCtx.fill();

        // Draw center dot
        joystickCtx.beginPath();
        joystickCtx.arc(joystickCenter.x, joystickCenter.y, 4, 0, Math.PI * 2);
        joystickCtx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        joystickCtx.fill();
    }

    function handleJoystickStart(e) {
        e.preventDefault();
        joystickActive = true;
        handleJoystickMove(e);

        // Start continuous sending
        if (joystickInterval) clearInterval(joystickInterval);
        joystickInterval = setInterval(() => {
            if (appStore.getState('connection.isConnected')) {
                // Send joystick values continuously
                commLayer.send({ type: 'joystick_control', x: currentJoyX, y: currentJoyY });
                commLayer.send({ type: 'joystick', x: currentJoyX, y: currentJoyY });
            }
        }, 100); // Send every 100ms
    }

    function handleJoystickMove(e) {
        if (!joystickActive) return;
        e.preventDefault();

        const rect = joystickCanvas.getBoundingClientRect();
        const touch = e.touches ? e.touches[0] : e;

        let x = touch.clientX - rect.left;
        let y = touch.clientY - rect.top;

        const dx = x - joystickCenter.x;
        const dy = y - joystickCenter.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > joystickRadius) {
            const angle = Math.atan2(dy, dx);
            x = joystickCenter.x + Math.cos(angle) * joystickRadius;
            y = joystickCenter.y + Math.sin(angle) * joystickRadius;
        }

        joystickKnob = { x, y };
        drawJoystick();

        // Calculate normalized values (-1 to 1)
        const normalizedX = (x - joystickCenter.x) / joystickRadius;
        const normalizedY = -(y - joystickCenter.y) / joystickRadius;

        // Update current values for continuous sending
        currentJoyX = normalizedX;
        currentJoyY = normalizedY;
    }

    function handleJoystickEnd(e) {
        if (!joystickActive) return;
        e.preventDefault();

        joystickActive = false;
        joystickKnob = { ...joystickCenter };
        drawJoystick();

        // Stop continuous sending and reset values
        if (joystickInterval) {
            clearInterval(joystickInterval);
            joystickInterval = null;
        }
        currentJoyX = 0;
        currentJoyY = 0;

        // Send zero values to robot
        if (appStore.getState('connection.isConnected')) {
            // Send both modern and legacy joystick stop messages
            commLayer.send({ type: 'joystick_control', x: 0, y: 0 });
            commLayer.send({ type: 'joystick', x: 0, y: 0 });
        }
    }

    joystickCanvas.addEventListener('mousedown', handleJoystickStart);
    joystickCanvas.addEventListener('mousemove', handleJoystickMove);
    document.addEventListener('mouseup', handleJoystickEnd);

    joystickCanvas.addEventListener('touchstart', handleJoystickStart, { passive: false });
    joystickCanvas.addEventListener('touchmove', handleJoystickMove, { passive: false });
    document.addEventListener('touchend', handleJoystickEnd);

    window.addEventListener('resize', initJoystick);
    initJoystick();

    // ========================================================================
    // GAMEPAD POLLING (like old version)
    // ========================================================================
    let gamepadIndex = null;

    function pollGamepad() {
        if (gamepadIndex !== null) {
            const gp = navigator.getGamepads()[gamepadIndex];
            if (!gp) return;

            let x = gp.axes[0] || 0;
            let y = gp.axes[1] || 0;

            // Apply deadzone
            if (Math.abs(x) < 0.15) x = 0;
            if (Math.abs(y) < 0.15) y = 0;

            // Send joystick values continuously
            if (appStore.getState('connection.isConnected')) {
                commLayer.send({ type: 'joystick_control', x: x, y: -y });
                commLayer.send({ type: 'joystick', x: x, y: -y });
            }
        }
        requestAnimationFrame(pollGamepad);
    }

    // Start polling when gamepad is connected
    window.addEventListener('gamepadconnected', (e) => {
        gamepadIndex = e.gamepad.index;
        addLogMessage(`Podłączono gamepad: ${e.gamepad.id}`, 'info');
        pollGamepad();
    });

    window.addEventListener('gamepaddisconnected', (e) => {
        if (gamepadIndex === e.gamepad.index) {
            gamepadIndex = null;
        }
        addLogMessage(`Odłączono gamepad: ${e.gamepad.id}`, 'warn');
    });

    // ========================================================================
    // CONNECTION BUTTON
    // ========================================================================
    const connectBtn = document.getElementById('connectBtn');
    const connectionDot = document.getElementById('connectionDot');
    const connectionText = document.getElementById('connectionText');

    let isConnected = false;

    connectBtn.addEventListener('click', async () => {
        if (isConnected) {
            // Disconnect
            await commLayer.disconnect();
            isConnected = false;
            connectBtn.querySelector('span').textContent = 'Połącz z Robotem';
            connectBtn.classList.remove('btn-secondary');
            connectBtn.classList.add('btn-primary');
            connectionDot.classList.remove('connected');
            connectionText.textContent = 'Rozłączony';
            addLogMessage('Rozłączono z robotem', 'warn');
        } else {
            // Connect
            addLogMessage('Próba połączenia z robotem...', 'info');

            try {
                const connected = await commLayer.connect();
                if (connected) {
                    const deviceName = commLayer.getDeviceName();
                    appStore.setState('connection.deviceName', deviceName);

                    isConnected = true;
                    connectBtn.querySelector('span').textContent = 'Rozłącz';
                    connectBtn.classList.remove('btn-primary');
                    connectBtn.classList.add('btn-secondary');
                    connectionDot.classList.add('connected');
                    connectionText.textContent = 'Synchronizowanie...';
                    addLogMessage(`Połączono z ${deviceName}`, 'success');

                    // Request configuration
                    commLayer.send({ type: 'request_full_config' });

                    // Setup sync timeout
                    const syncTimeout = setTimeout(() => {
                        if (!appStore.getState('connection.isSynced') && appStore.getState('connection.isConnected')) {
                            addLogMessage('BŁĄD: Timeout synchronizacji. Robot nie odpowiedział w czasie (20s).', 'error');
                            connectionText.textContent = 'Błąd synchronizacji';
                            connectBtn.querySelector('span').textContent = 'Spróbuj ponownie zsynchronizować';
                            connectBtn.classList.remove('btn-secondary');
                            connectBtn.classList.add('btn-primary');
                        }
                    }, 20000);

                    appStore.setState('connection.syncTimeout', syncTimeout);
                } else {
                    throw new Error('Connection failed');
                }
            } catch (error) {
                addLogMessage(`Błąd połączenia BLE: ${error.message}`, 'error');
                onDisconnected();
            }
        }
    });

    // ========================================================================
    // TOGGLES (Simulate State Changes)
    // ========================================================================
    const balanceToggle = document.getElementById('balanceToggle');
    const holdPositionToggle = document.getElementById('holdPositionToggle');
    const speedModeToggle = document.getElementById('speedModeToggle');

    balanceToggle.addEventListener('change', (e) => {
        const state = e.target.checked;
        commLayer.send({ type: 'set_param', key: 'balancing', value: state });
        // Backward compatibility: also send legacy toggle event
        commLayer.send({ type: 'balance_toggle', enabled: state });
        addLogMessage(`Balansowanie ${state ? 'włączono' : 'wyłączono'}`, state ? 'success' : 'warn');
    });

    holdPositionToggle.addEventListener('change', (e) => {
        const state = e.target.checked;
        commLayer.send({ type: 'set_param', key: 'holding_pos', value: state });
        // Backward compatibility: also send legacy toggle event
        commLayer.send({ type: 'hold_position_toggle', enabled: state });
        addLogMessage(`Trzymanie pozycji ${state ? 'włączono' : 'wyłączono'}`, state ? 'success' : 'warn');
    });

    speedModeToggle.addEventListener('change', (e) => {
        const state = e.target.checked;
        commLayer.send({ type: 'set_param', key: 'speed_mode', value: state });
        // Backward compatibility: also send legacy toggle event
        commLayer.send({ type: 'speed_mode_toggle', enabled: state });
        addLogMessage(`Tryb prędkości ${state ? 'włączono' : 'wyłączono'}`, state ? 'success' : 'warn');
    });

    // ========================================================================
    // 3D VISUALIZATION
    // ========================================================================
    const robot3DContainer = document.getElementById('robot3d-container');
    const reset3DView = document.getElementById('reset3DView');
    const toggle3DAnimation = document.getElementById('toggle3DAnimation');
    const toggle3DMovement = document.getElementById('toggle3DMovement');

    // Wire up placeholder buttons now; the real hooks are set up in setupControls3D()
    if (reset3DView) reset3DView.addEventListener('click', () => { addLogMessage('Widok 3D zresetowany', 'info'); });
    if (toggle3DAnimation) toggle3DAnimation.addEventListener('click', () => { isAnimation3DEnabled = !isAnimation3DEnabled; addLogMessage('Animacja 3D przełączona', 'info'); });
    if (toggle3DMovement) toggle3DMovement.addEventListener('click', () => { isMovement3DEnabled = !isMovement3DEnabled; addLogMessage('Ruch 3D przełączony', 'info'); });

    // Implement THREE.js 3D scene initialization and robot model
    function init3DVisualization() {
        if (!robot3DContainer) return;
        // If already initialized, resize renderer and return
        if (renderer3D && renderer3D.domElement && robot3DContainer.contains(renderer3D.domElement)) {
            renderer3D.setSize(robot3DContainer.clientWidth, robot3DContainer.clientHeight);
            camera3D.aspect = robot3DContainer.clientWidth / robot3DContainer.clientHeight;
            camera3D.updateProjectionMatrix();
            return;
        }

        scene3D = new THREE.Scene();
        camera3D = new THREE.PerspectiveCamera(50, robot3DContainer.clientWidth / robot3DContainer.clientHeight, 0.1, 2000);
        camera3D.position.set(28, 22, 48);
        camera3D.lookAt(0, 8, 0);
        renderer3D = new THREE.WebGLRenderer({ antialias: true });
        renderer3D.setSize(robot3DContainer.clientWidth, robot3DContainer.clientHeight);
        robot3DContainer.innerHTML = '';
        robot3DContainer.appendChild(renderer3D.domElement);
        controls3D = new THREE.OrbitControls(camera3D, renderer3D.domElement);
        controls3D.target.set(0, 8, 0);
        controls3D.maxPolarAngle = Math.PI / 2;

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
        scene3D.add(ambientLight);
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.9);
        directionalLight.position.set(10, 20, 15);
        scene3D.add(directionalLight);

        const PLANE_SIZE_CM = 2000;
        groundTexture = createCheckerTexture(40);
        const repeats = PLANE_SIZE_CM / 40;
        groundTexture.repeat.set(repeats, repeats);
        const groundMaterial = new THREE.MeshStandardMaterial({ map: groundTexture, roughness: 1.0, metalness: 0.0 });
        const groundGeo = new THREE.PlaneGeometry(PLANE_SIZE_CM, PLANE_SIZE_CM, 1, 1);
        groundMesh = new THREE.Mesh(groundGeo, groundMaterial);
        groundMesh.rotation.x = -Math.PI / 2;
        groundMesh.position.y = 0;
        scene3D.add(groundMesh);

        robotPivot = createRobotModel3D();
        robotPivot.position.y = 4.1;
        scene3D.add(robotPivot);

        skyDome = createSkyDome();
        scene3D.add(skyDome);

        // Handle resize
        window.addEventListener('resize', () => {
            const width = robot3DContainer.clientWidth;
            const height = robot3DContainer.clientHeight;
            camera3D.aspect = width / height;
            camera3D.updateProjectionMatrix();
            renderer3D.setSize(width, height);
        });

        setupControls3D();
    }

    function createCustomWheel(totalRadius, tireThickness, width) {
        const wheelGroup = new THREE.Group();
        const tireMaterial = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 });
        const rimMaterial = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.4 });
        const rimRadius = totalRadius - tireThickness;
        const tire = new THREE.Mesh(new THREE.TorusGeometry(rimRadius + tireThickness / 2, tireThickness / 2, 16, 100), tireMaterial);
        wheelGroup.add(tire);
        const rimShape = new THREE.Shape();
        rimShape.absarc(0, 0, rimRadius, 0, Math.PI * 2, false);
        const holePath = new THREE.Path();
        holePath.absarc(0, 0, rimRadius * 0.85, 0, Math.PI * 2, true);
        rimShape.holes.push(holePath);
        const extrudeSettings = { depth: width * 0.4, bevelEnabled: false };
        const outerRimGeometry = new THREE.ExtrudeGeometry(rimShape, extrudeSettings);
        outerRimGeometry.center();
        const outerRim = new THREE.Mesh(outerRimGeometry, rimMaterial);
        wheelGroup.add(outerRim);
        const hubRadius = rimRadius * 0.2;
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(hubRadius, hubRadius, width * 0.5, 24), rimMaterial);
        hub.rotateX(Math.PI / 2);
        wheelGroup.add(hub);
        const spokeLength = (rimRadius * 0.85) - hubRadius;
        const spokeGeometry = new THREE.BoxGeometry(spokeLength, rimRadius * 0.15, width * 0.4);
        spokeGeometry.translate(hubRadius + spokeLength / 2, 0, 0);
        for (let i = 0; i < 6; i++) {
            const spoke = new THREE.Mesh(spokeGeometry, rimMaterial);
            spoke.rotation.z = i * (Math.PI / 3);
            wheelGroup.add(spoke);
        }
        return wheelGroup;
    }

    function createRobotModel3D() {
        const BODY_WIDTH = 9.0, BODY_HEIGHT = 6.0, BODY_DEPTH = 3.5, WHEEL_GAP = 1.0;
        const MAST_HEIGHT = 14.5, MAST_THICKNESS = 1.5;
        const TIRE_THICKNESS = 1.0, WHEEL_WIDTH = 2.0;
        const WHEEL_RADIUS_3D = 4.1;
        const pivot = new THREE.Object3D();
        const model = new THREE.Group();
        const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x1C1C1C });
        const batteryMaterial = new THREE.MeshStandardMaterial({ color: 0x4169E1 });
        const body = new THREE.Mesh(new THREE.BoxGeometry(BODY_WIDTH, BODY_HEIGHT, BODY_DEPTH), bodyMaterial);
        body.position.y = WHEEL_RADIUS_3D;
        model.add(body);
        const mast = new THREE.Mesh(new THREE.BoxGeometry(MAST_THICKNESS, MAST_HEIGHT, MAST_THICKNESS), bodyMaterial);
        mast.position.y = WHEEL_RADIUS_3D + BODY_HEIGHT / 2 + MAST_HEIGHT / 2;
        model.add(mast);
        const battery = new THREE.Mesh(new THREE.BoxGeometry(6.0, 1.0, 3.0), batteryMaterial);
        battery.position.y = mast.position.y + MAST_HEIGHT / 2 + 0.5;
        model.add(battery);
        leftWheel = createCustomWheel(WHEEL_RADIUS_3D, TIRE_THICKNESS, WHEEL_WIDTH);
        leftWheel.rotation.y = Math.PI / 2;
        leftWheel.position.set(-(BODY_WIDTH / 2 + WHEEL_GAP), WHEEL_RADIUS_3D, 0);
        model.add(leftWheel);
        rightWheel = createCustomWheel(WHEEL_RADIUS_3D, TIRE_THICKNESS, WHEEL_WIDTH);
        rightWheel.rotation.y = Math.PI / 2;
        rightWheel.position.set(BODY_WIDTH / 2 + WHEEL_GAP, WHEEL_RADIUS_3D, 0);
        model.add(rightWheel);
        model.position.y = -WHEEL_RADIUS_3D;
        pivot.add(model);
        return pivot;
    }

    function createCheckerTexture(squareSizeCm = 20, colorA = '#C8C8C8', colorB = '#787878') {
        const size = 256;
        const squares = 2;
        const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size; const ctx = canvas.getContext('2d'); const s = size / squares; for (let y = 0; y < squares; y++) { for (let x = 0; x < squares; x++) { ctx.fillStyle = ((x + y) % 2 === 0) ? colorA : colorB; ctx.fillRect(x * s, y * s, s, s); } }
        const tex = new THREE.CanvasTexture(canvas); tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 8; tex.encoding = THREE.sRGBEncoding; return tex;
    }

    function createSkyDome() {
        const width = 2048, height = 1024;
        const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; const ctx = canvas.getContext('2d'); const grad = ctx.createLinearGradient(0, 0, 0, height); grad.addColorStop(0, '#87CEEB'); grad.addColorStop(0.6, '#B0E0E6'); grad.addColorStop(1, '#E6F2FA'); ctx.fillStyle = grad; ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        for (let i = 0; i < 150; i++) {
            const x = Math.random() * width;
            const y = Math.random() * height * 0.6;
            const radius = 20 + Math.random() * 80;
            const blur = 10 + Math.random() * 20;
            ctx.filter = `blur(${blur}px)`;
            ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill(); if (x > width - radius * 2) { ctx.beginPath(); ctx.arc(x - width, y, radius, 0, Math.PI * 2); ctx.fill(); } if (x < radius * 2) { ctx.beginPath(); ctx.arc(x + width, y, radius, 0, Math.PI * 2); ctx.fill(); }
        }
        ctx.filter = 'none';
        const tex = new THREE.CanvasTexture(canvas); tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.ClampToEdgeWrapping; tex.encoding = THREE.sRGBEncoding; const skyGeo = new THREE.SphereGeometry(1000, 32, 16); const skyMat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide }); return new THREE.Mesh(skyGeo, skyMat);
    }

    function setupControls3D() {
        const btnReset = document.getElementById('reset3DView') || document.getElementById('reset3dView');
        const btnToggleAnim = document.getElementById('toggle3DAnimation') || document.getElementById('toggle3dAnimation');
        const btnToggleMove = document.getElementById('toggle3DMovement') || document.getElementById('toggle3dMovement');
        if (btnReset) btnReset.addEventListener('click', () => { camera3D.position.set(28, 22, 48); controls3D.target.set(0, 8, 0); controls3D.update(); });
        if (btnToggleAnim) btnToggleAnim.addEventListener('click', () => isAnimation3DEnabled = !isAnimation3DEnabled);
        if (btnToggleMove) btnToggleMove.addEventListener('click', () => { isMovement3DEnabled = !isMovement3DEnabled; lastEncoderAvg = (currentEncoderLeft + currentEncoderRight) / 2; });
    }

    function update3DAnimation() {
        if (isAnimation3DEnabled && robotPivot) {
            if (typeof window.telemetryData?.qw === 'number') {
                try {
                    const qRaw = new THREE.Quaternion(window.telemetryData.qx, window.telemetryData.qy, window.telemetryData.qz, window.telemetryData.qw).normalize();
                    const eul = computeEulerFromQuaternion(window.telemetryData.qw, window.telemetryData.qx, window.telemetryData.qy, window.telemetryData.qz);
                    const mapped = eul ? applyModelMappingToEuler(eul) : { pitch: 0, yaw: 0, roll: 0 };
                    const qMappedEuler = new THREE.Quaternion().setFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(mapped.pitch), THREE.MathUtils.degToRad(mapped.yaw), THREE.MathUtils.degToRad(mapped.roll), 'YXZ'));
                    robotPivot.quaternion.slerp(qMappedEuler, 0.35);
                } catch (err) {
                    console.error('Quaternion mapping error', err);
                }
            }
            robotPivot.position.y = 4.4;
            const isRobotPerspective = document.getElementById('robotPerspectiveCheckbox')?.checked;
            controls3D.enabled = !isRobotPerspective;
            if (isRobotPerspective) {
                const offset = new THREE.Vector3(0, 15, robotPerspectiveZoom);
                offset.applyQuaternion(robotPivot.quaternion);
                const cameraPosition = robotPivot.position.clone().add(offset);
                camera3D.position.lerp(cameraPosition, 0.1);
                const lookAtPosition = robotPivot.position.clone().add(new THREE.Vector3(0, 10, 0));
                camera3D.lookAt(lookAtPosition);
            }
            const ppr = parseFloat(document.getElementById('encoderPprInput')?.value) || 820;
            const wheelRotationL = (currentEncoderLeft / ppr) * 2 * Math.PI;
            const wheelRotationR = (currentEncoderRight / ppr) * 2 * Math.PI;
            if (leftWheel) leftWheel.rotation.z = -wheelRotationL;
            if (rightWheel) rightWheel.rotation.z = -wheelRotationR;
            if (isMovement3DEnabled) {
                const wheelDiameter = parseFloat(document.getElementById('wheelDiameterInput')?.value) || 8.2;
                const currentEncoderAvg = (currentEncoderLeft + currentEncoderRight) / 2;
                const dist_cm = -((currentEncoderAvg - lastEncoderAvg) / ppr) * Math.PI * wheelDiameter;
                if (groundTexture) {
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
                const elX = document.getElementById('robot3d-position-x'); if (elX) elX.textContent = logicalX.toFixed(1) + ' cm';
                const elZ = document.getElementById('robot3d-position-z'); if (elZ) elZ.textContent = logicalZ.toFixed(1) + ' cm';
                lastEncoderAvg = currentEncoderAvg;
            }
        }
    }

    function animate3D() {
        requestAnimationFrame(animate3D);
        update3DAnimation();
        if (skyDome) skyDome.rotation.y += 0.00005;
        if (controls3D && renderer3D && scene3D && camera3D) {
            controls3D.update();
            renderer3D.render(scene3D, camera3D);
        }
    }

    // Expose 3D functions on global window for calls by other parts of app
    window.init3DVisualization = init3DVisualization;
    window.setupControls3D = setupControls3D;
    window.animate3D = animate3D;

    // ========================================================================
    // SENSOR MAPPING PREVIEW & WIZARD (copied from dev implementation)
    // ========================================================================

    // Init the simple 3D cube preview for IMU sensor mapping
    function initSensorMappingPreview() {
        const container = document.getElementById('sensor-mapping-preview');
        if (!container) return;
        // Clean up existing renderer
        if (sensorPreview.renderer && sensorPreview.renderer.domElement) {
            while (container.firstChild) container.removeChild(container.firstChild);
            try { sensorPreview.renderer.dispose(); } catch (e) { /* no-op */ }
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
        const axes = new THREE.AxesHelper(3);
        scene.add(axes);
        scene.add(cube);
        const ambient = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambient);
        const dir = new THREE.DirectionalLight(0xffffff, 0.6);
        dir.position.set(5, 10, 7);
        scene.add(dir);
        sensorPreview.scene = scene; sensorPreview.camera = camera; sensorPreview.renderer = renderer; sensorPreview.cube = cube; sensorPreview.axes = axes;
        const makeAxisLabel = (text, color) => {
            const canvasLabel = document.createElement('canvas'); canvasLabel.width = 128; canvasLabel.height = 64; const ctxLabel = canvasLabel.getContext('2d'); ctxLabel.font = 'bold 30px Arial'; ctxLabel.textAlign = 'center'; ctxLabel.textBaseline = 'middle'; ctxLabel.fillStyle = color || '#ffffff'; ctxLabel.fillText(text, canvasLabel.width / 2, canvasLabel.height / 2);
            const labelTex = new THREE.CanvasTexture(canvasLabel);
            const labelMat = new THREE.SpriteMaterial({ map: labelTex, depthTest: false });
            return new THREE.Sprite(labelMat);
        };
        sensorPreview.xLabel = makeAxisLabel('X', '#ff0000'); sensorPreview.xLabel.scale.set(1.2, 0.6, 1);
        sensorPreview.yLabel = makeAxisLabel('Y', '#00ff00'); sensorPreview.yLabel.scale.set(1.2, 0.6, 1);
        sensorPreview.zLabel = makeAxisLabel('Z', '#0000ff'); sensorPreview.zLabel.scale.set(1.2, 0.6, 1);
        cube.add(sensorPreview.xLabel); cube.add(sensorPreview.yLabel); cube.add(sensorPreview.zLabel);
        sensorPreview.xLabel.position.set(1.3, 0, 0);
        sensorPreview.yLabel.position.set(0, 1.3, 0);
        sensorPreview.zLabel.position.set(0, 0, 1.3);
        sensorPreview.xArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 0), 1.1, 0xff0000);
        sensorPreview.yArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 0), 1.1, 0x00ff00);
        sensorPreview.zArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 0), 1.1, 0x0000ff);
        cube.add(sensorPreview.xArrow); cube.add(sensorPreview.yArrow); cube.add(sensorPreview.zArrow);
        const faceGeom = new THREE.PlaneGeometry(0.8, 0.8);
        const faceMat = new THREE.MeshBasicMaterial({ color: 0xff00ff, transparent: true, opacity: 0.75, side: THREE.DoubleSide });
        const faceIndicator = new THREE.Mesh(faceGeom, faceMat);
        faceIndicator.position.set(0, 0, 1.3);
        faceIndicator.lookAt(sensorPreview.camera.position);
        faceIndicator.visible = false;
        cube.add(faceIndicator);
        sensorPreview.faceIndicator = faceIndicator;
        function render() { sensorPreview.animId = requestAnimationFrame(render); renderer.render(scene, camera); }
        render();
        window.addEventListener('resize', () => { if (!sensorPreview.renderer) return; const w = container.clientWidth, h = container.clientHeight; sensorPreview.camera.aspect = w / h; sensorPreview.camera.updateProjectionMatrix(); sensorPreview.renderer.setSize(w, h); });
        updateSensorMappingDisplays();
        ['pitchMinus90Btn', 'pitchPlus90Btn', 'rollMinus90Btn', 'rollPlus90Btn', 'yawMinus90Btn', 'yawPlus90Btn'].forEach(id => { const b = document.getElementById(id); if (!b) return; b.addEventListener('click', (e) => { const delta = id.includes('Minus') ? -90 : 90; if (id.startsWith('pitch')) rotateSensorCube('x', delta); if (id.startsWith('roll')) rotateSensorCube('z', delta); if (id.startsWith('yaw')) rotateSensorCube('y', delta); }); });
        document.getElementById('setModalPitchZeroBtn')?.addEventListener('click', () => { setPitchZero(); });
        document.getElementById('setModalRollZeroBtn')?.addEventListener('click', () => { setRollZero(); });
        document.getElementById('clearModalPitchZeroBtn')?.addEventListener('click', () => { addLogMessage('[UI] Trym (Pitch) jest częścią montażu (qcorr) i nie podlega czyszczeniu wartością 0. Użyj przycisków ± lub Ustaw punkt 0.', 'warn'); });
        document.getElementById('clearModalRollZeroBtn')?.addEventListener('click', () => { addLogMessage('[UI] Trym (Roll) jest częścią montażu (qcorr) i nie podlega czyszczeniu wartością 0. Użyj przycisków ± lub Ustaw punkt 0.', 'warn'); });
        const rotate90 = (axis, steps) => { sendBleMessage({ type: 'rotate_mount_90', axis, steps }); addLogMessage(`[UI] Obrót montażu 90°: axis=${axis.toUpperCase()} steps=${steps}`, 'info'); };
        document.getElementById('mountXMinus90Btn')?.addEventListener('click', () => rotate90('x', -1));
        document.getElementById('mountXPlus90Btn')?.addEventListener('click', () => rotate90('x', 1));
        document.getElementById('mountYMinus90Btn')?.addEventListener('click', () => rotate90('y', -1));
        document.getElementById('mountYPlus90Btn')?.addEventListener('click', () => rotate90('y', 1));
        document.getElementById('mountZMinus90Btn')?.addEventListener('click', () => rotate90('z', -1));
        document.getElementById('mountZPlus90Btn')?.addEventListener('click', () => rotate90('z', 1));
    }

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
        setSignButtons('imuPitchSign', parseInt(data.pitch.sign)); setSignButtons('imuYawSign', parseInt(data.yaw.sign)); setSignButtons('imuRollSign', parseInt(data.roll.sign));
    }

    function rotateSensorCube(axis, deg) {
        if (!sensorPreview.cube) return; const rad = THREE.MathUtils.degToRad(deg);
        if (axis === 'x') sensorPreview.cube.rotateX(rad); else if (axis === 'y') sensorPreview.cube.rotateY(rad); else if (axis === 'z') sensorPreview.cube.rotateZ(rad);
        updateSensorMappingDisplays(); if (Math.abs(deg) % 90 === 0) { try { applyRotationToIMUMapping(axis, deg); } catch (e) { /* no-op */ } }
    }

    function mappingObjToMatrix(mapping) { const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]; const setRow = (rowIdx, m) => { const col = parseInt(m.source); const sign = parseInt(m.sign) || 1; M[rowIdx][col] = sign; }; setRow(0, mapping.pitch); setRow(1, mapping.yaw); setRow(2, mapping.roll); return M; }

    function matrixToMappingObj(M) { const findInRow = (row) => { for (let c = 0; c < 3; c++) { const v = M[row][c]; if (v === 0) continue; return { source: c, sign: v }; } return { source: 0, sign: 1 }; }; return { pitch: findInRow(0), yaw: findInRow(1), roll: findInRow(2) }; }

    function getRotationMatrix(axis, deg) {
        const d = ((deg % 360) + 360) % 360; const q = (d === 270) ? -90 : d; let RA = null;
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
        } else {
            if (q === 90) RA = [[0, -1, 0], [1, 0, 0], [0, 0, 1]];
            else if (q === -90) RA = [[0, 1, 0], [-1, 0, 0], [0, 0, 1]];
            else if (q === 180) RA = [[-1, 0, 0], [0, -1, 0], [0, 0, 1]];
            else RA = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
        }
        return RA;
    }

    function multiplyMatrix(A, B) {
        const R = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { let s = 0; for (let k = 0; k < 3; k++) s += A[i][k] * B[k][j]; R[i][j] = s; }
        return R;
    }

    function applyRotationToIMUMapping(axis, deg) { const cur = gatherIMUMappingFromUI(); const M = mappingObjToMatrix(cur); const R = getRotationMatrix(axis, deg); const Mprime = multiplyMatrix(M, R); const newMap = matrixToMappingObj(Mprime); updateIMUMappingUIFromData(newMap); }

    function updateSensorMappingDisplays() { if (!sensorPreview.cube) return; const q = sensorPreview.cube.quaternion; const eul = new THREE.Euler().setFromQuaternion(q, 'ZYX'); const yaw = THREE.MathUtils.radToDeg(eul.x); const pitch = THREE.MathUtils.radToDeg(eul.y); const roll = THREE.MathUtils.radToDeg(eul.z); const pd = document.getElementById('modal-pitch-display'); const rd = document.getElementById('modal-roll-display'); const yd = document.getElementById('modal-yaw-display'); if (pd) pd.textContent = pitch.toFixed(2) + '°'; if (rd) rd.textContent = roll.toFixed(2) + '°'; if (yd) yd.textContent = yaw.toFixed(2) + '°'; }

    function updateModalTelemetryDisplay() { const e = getRawEuler(); const pd = document.getElementById('modal-pitch-telemetry'); const rd = document.getElementById('modal-roll-telemetry'); const yd = document.getElementById('modal-yaw-telemetry'); if (pd) pd.textContent = (e.pitch || 0).toFixed(2) + '°'; if (rd) rd.textContent = (e.roll || 0).toFixed(2) + '°'; if (yd) yd.textContent = (e.yaw || 0).toFixed(2) + '°'; }

    function openSensorMappingModal() { const m = document.getElementById('sensor-mapping-modal'); if (!m) return; m.style.display = 'flex'; sensorWizard = { step: 0, rotStartYaw: null, monitorId: null, progress: { upright: false, rotation: false, saved: false } }; updateSensorWizardUI(); initSensorMappingPreview(); sendBleMessage({ type: 'get_imu_mapping' }); if (!sensorModalTelemetryMonitorId) sensorModalTelemetryMonitorId = setInterval(updateModalTelemetryDisplay, 200); }

    function closeSensorMappingModal() { const m = document.getElementById('sensor-mapping-modal'); if (!m) return; if (sensorWizard.monitorId) { clearInterval(sensorWizard.monitorId); sensorWizard.monitorId = null; } if (sensorModalTelemetryMonitorId) { clearInterval(sensorModalTelemetryMonitorId); sensorModalTelemetryMonitorId = null; } m.style.display = 'none'; }
    function openModelMappingModal() { const m = document.getElementById('model-mapping-modal'); if (!m) return; m.style.display = 'flex'; updateModelMappingUI(); sendBleMessage({ type: 'get_model_mapping' }); }
    function closeModelMappingModal() { const m = document.getElementById('model-mapping-modal'); if (!m) return; m.style.display = 'none'; }

    function setWizardProgress() { const el = document.getElementById('sensorWizardProgress'); if (!el) return; const p = sensorWizard.progress; el.textContent = `[${p.upright ? 'x' : ' '}] Pion | [${p.rotation ? 'x' : ' '}] Rotacja ≥ 90° | [${p.saved ? 'x' : ' '}] Zapis`; if (p.saved && window.lastMountCorr) { const { qw, qx, qy, qz } = window.lastMountCorr; const preview = `\nqcorr: w=${qw.toFixed(3)} x=${qx.toFixed(3)} y=${qy.toFixed(3)} z=${qz.toFixed(3)}`; el.textContent += preview; } }

    function setWizardStepNo() { const n = document.getElementById('sensorWizardStepNo'); if (n) n.textContent = (sensorWizard.step + 1).toString(); }

    function getCurrentYawDeg() { const td = window.telemetryData || {}; const { qw, qx, qy, qz } = td; if (typeof qw !== 'number') return null; const eul = computeEulerFromQuaternion(qw, qx, qy, qz); return eul ? eul.yaw : null; }

    function angleDeltaDeg(a, b) { if (a === null || b === null) return null; let d = ((a - b + 540) % 360) - 180; return Math.abs(d); }

    function updateSensorWizardUI() { setWizardStepNo(); setWizardProgress(); const t = document.getElementById('sensorWizardText'); const hint = document.getElementById('sensorWizardHint'); const back = document.getElementById('sensorWizardBackBtn'); const next = document.getElementById('sensorWizardNextBtn'); if (!t || !hint || !back || !next) return; if (sensorWizard.step === 0) { back.disabled = true; next.disabled = false; next.textContent = 'Dalej'; t.innerHTML = '1) Postaw robota pionowo (koła w dół, prosto) na stabilnej powierzchni i poczekaj aż się uspokoi.<br>Po kliknięciu Dalej zarejestrujemy bazową orientację.'; hint.textContent = 'Warunek: kalibracja IMU (Sys=3). Jeśli nie, wykonaj kalibrację przed kontynuacją.'; } else if (sensorWizard.step === 1) { back.disabled = false; next.disabled = true; next.textContent = 'Czekam na ≥ 90°'; t.innerHTML = '2) Obracaj robota powoli zgodnie z ruchem wskazówek zegara (poziomo).<br>Krok zakończy się automatycznie po wykryciu obrotu ≥ 90°.'; hint.textContent = 'Nie podnoś robota – trzymaj koła w dół. Możesz obracać więcej (180–360°) – wystarczy przekroczyć 90°.'; } else { back.disabled = false; next.disabled = false; next.textContent = 'Zapisz'; let extra = ''; if (window.lastMountCorr) { const { qw, qx, qy, qz } = window.lastMountCorr; extra = `<div style="margin-top:8px; font-size:0.8em; color:#9fa;">Aktualne (ostatnie) qcorr:<br>w=${qw.toFixed(4)} x=${qx.toFixed(4)} y=${qy.toFixed(4)} z=${qz.toFixed(4)}</div>`; } t.innerHTML = '3) Zapisz ustawienia mapowania. Zmiany zostaną utrwalone w pamięci i zaczną działać natychmiast.' + extra; hint.textContent = 'Po zapisie osie w Dashboard i w modelu 3D będą już skorygowane.'; } }

    function startRotationMonitor() { sensorWizard.rotStartYaw = getCurrentYawDeg(); if (sensorWizard.monitorId) { clearInterval(sensorWizard.monitorId); sensorWizard.monitorId = null; } sensorWizard.monitorId = setInterval(() => { const cy = getCurrentYawDeg(); const d = angleDeltaDeg(cy, sensorWizard.rotStartYaw); if (d !== null && d >= 90) { clearInterval(sensorWizard.monitorId); sensorWizard.monitorId = null; sendBleMessage({ type: 'sensor_map_capture_rot_end' }); sensorWizard.progress.rotation = true; sensorWizard.step = 2; updateSensorWizardUI(); setWizardProgress(); addLogMessage('[UI] Wykryto rotację ≥ 90°. Przechodzę do kroku Zapis.', 'success'); } }, 100); }

    // Expose sensor mapping helpers globally for backward compatibility
    window.initSensorMappingPreview = initSensorMappingPreview;
    window.gatherIMUMappingFromUI = gatherIMUMappingFromUI;
    window.updateIMUMappingUIFromData = updateIMUMappingUIFromData;
    window.rotateSensorCube = rotateSensorCube;
    window.applyRotationToIMUMapping = applyRotationToIMUMapping;
    window.openSensorMappingModal = openSensorMappingModal;
    window.closeSensorMappingModal = closeSensorMappingModal;


    // ========================================================================
    // PARAMETER CHANGE HANDLING
    // ========================================================================
    document.querySelectorAll('input[type="number"]').forEach(input => {
        input.addEventListener('change', (e) => {
            const label = e.target.closest('.param-group')?.querySelector('label')?.textContent.trim() || 'Parametr';
            const paramKey = getParamKeyFromInputId(e.target.id);
            if (paramKey && appStore.getState('connection.isConnected')) {
                commLayer.send({ type: 'set_param', key: paramKey, value: parseFloat(e.target.value) });
            }
            addLogMessage(`${label}: ${e.target.value}`, 'info');
        });
    });

    function getParamKeyFromInputId(inputId) {
        const paramMap = {
            'balanceKp': 'kp_b',
            'balanceKi': 'ki_b',
            'balanceKd': 'kd_b',
            'balanceFilterAlpha': 'balance_pid_derivative_filter_alpha',
            'balanceIntegralLimit': 'balance_pid_integral_limit',
            'minPwmLeftFwdInput': 'min_pwm_left_fwd',
            'minPwmLeftBwdInput': 'min_pwm_left_bwd',
            'minPwmRightFwdInput': 'min_pwm_right_fwd',
            'minPwmRightBwdInput': 'min_pwm_right_bwd',
            'manualPitchCorrectionInput': 'trim_angle',
            'manualRollCorrectionInput': 'roll_trim'
            // Add more mappings as needed
        };
        return paramMap[inputId];
    }

    // ========================================================================
    // PID TUNING BUTTONS
    // ========================================================================
    const loadPidConfig = document.getElementById('loadConfig');
    const savePidConfig = document.getElementById('saveConfig');

    if (loadPidConfig) {
        loadPidConfig.addEventListener('click', () => {
            if (appStore.getState('connection.isConnected')) {
                commLayer.send({ type: 'request_full_config' });
                addLogMessage('Wczytywanie konfiguracji PID...', 'info');
            } else {
                addLogMessage('Najpierw połącz się z robotem', 'warn');
            }
        });
    }

    if (savePidConfig) {
        savePidConfig.addEventListener('click', () => {
            if (appStore.getState('connection.isConnected')) {
                if (confirm('Czy na pewno chcesz zapisać konfigurację PID na robocie?')) {
                    commLayer.send({ type: 'save_tunings' });
                    addLogMessage('Zapisywanie konfiguracji PID...', 'info');
                }
            } else {
                addLogMessage('Najpierw połącz się z robotem', 'warn');
            }
        });
    }

    // Auto-tuning buttons
    const startGaTuning = document.getElementById('start-ga-tuning');
    const startPsoTuning = document.getElementById('start-pso-tuning');
    const startZnTuning = document.getElementById('start-zn-tuning');

    if (startGaTuning) {
        startGaTuning.addEventListener('click', async () => {
            if (!appStore.getState('connection.isConnected')) {
                addLogMessage('Najpierw połącz się z robotem', 'warn');
                return;
            }
            if (appStore.getState('tuning.isActive')) {
                addLogMessage('Strojenie już jest aktywne', 'warn');
                return;
            }

            try {
                // Import tuning algorithms dynamically
                const { GeneticAlgorithm } = await import('./tuning_algorithms.js');

                const searchSpace = {
                    kp_min: 10, kp_max: 200,
                    ki_min: 0, ki_max: 5,
                    kd_min: 0.1, kd_max: 20
                };

                const ga = new GeneticAlgorithm({
                    populationSize: 20,
                    generations: 30,
                    searchSpace: searchSpace
                });

                appStore.setState('tuning.isActive', true);
                appStore.setState('tuning.activeMethod', 'GA');

                addLogMessage('Rozpoczynam strojenie GA...', 'info');

                await ga.run();

                appStore.setState('tuning.isActive', false);
                appStore.setState('tuning.activeMethod', '');

            } catch (error) {
                addLogMessage(`Błąd strojenia GA: ${error.message}`, 'error');
                appStore.setState('tuning.isActive', false);
                appStore.setState('tuning.activeMethod', '');
            }
        });
    }

    if (startPsoTuning) {
        startPsoTuning.addEventListener('click', async () => {
            if (!appStore.getState('connection.isConnected')) {
                addLogMessage('Najpierw połącz się z robotem', 'warn');
                return;
            }
            if (appStore.getState('tuning.isActive')) {
                addLogMessage('Strojenie już jest aktywne', 'warn');
                return;
            }

            try {
                const { ParticleSwarmOptimization } = await import('./tuning_algorithms.js');

                const searchSpace = {
                    kp_min: 10, kp_max: 200,
                    ki_min: 0, ki_max: 5,
                    kd_min: 0.1, kd_max: 20
                };

                const pso = new ParticleSwarmOptimization({
                    numParticles: 20,
                    iterations: 30,
                    searchSpace: searchSpace
                });

                appStore.setState('tuning.isActive', true);
                appStore.setState('tuning.activeMethod', 'PSO');

                addLogMessage('Rozpoczynam strojenie PSO...', 'info');

                await pso.run();

                appStore.setState('tuning.isActive', false);
                appStore.setState('tuning.activeMethod', '');

            } catch (error) {
                addLogMessage(`Błąd strojenia PSO: ${error.message}`, 'error');
                appStore.setState('tuning.isActive', false);
                appStore.setState('tuning.activeMethod', '');
            }
        });
    }

    if (startZnTuning) {
        startZnTuning.addEventListener('click', async () => {
            if (!appStore.getState('connection.isConnected')) {
                addLogMessage('Najpierw połącz się z robotem', 'warn');
                return;
            }
            if (appStore.getState('tuning.isActive')) {
                addLogMessage('Strojenie już jest aktywne', 'warn');
                return;
            }

            try {
                const { ZieglerNicholsRelay } = await import('./tuning_algorithms.js');

                const zn = new ZieglerNicholsRelay({
                    amplitude: 2.0,
                    minCycles: 3
                });

                appStore.setState('tuning.isActive', true);
                appStore.setState('tuning.activeMethod', 'ZN');

                addLogMessage('Rozpoczynam strojenie ZN...', 'info');

                const results = await zn.run();

                if (results) {
                    addLogMessage(`ZN zakończone: Kp=${results.kp.toFixed(3)}, Ki=${results.ki.toFixed(3)}, Kd=${results.kd.toFixed(3)}`, 'success');
                }

                appStore.setState('tuning.isActive', false);
                appStore.setState('tuning.activeMethod', '');

            } catch (error) {
                addLogMessage(`Błąd strojenia ZN: ${error.message}`, 'error');
                appStore.setState('tuning.isActive', false);
                appStore.setState('tuning.activeMethod', '');
            }
        });
    }

    // Tuning control buttons
    const pauseTuning = document.getElementById('pause-tuning');
    const resumeTuning = document.getElementById('resume-tuning');
    const stopTuning = document.getElementById('stop-tuning');

    if (pauseTuning) {
        pauseTuning.addEventListener('click', () => {
            // This would need to be implemented in the tuning algorithms
            addLogMessage('Pauza strojenia - funkcja w trakcie implementacji', 'info');
        });
    }

    if (resumeTuning) {
        resumeTuning.addEventListener('click', () => {
            // This would need to be implemented in the tuning algorithms
            addLogMessage('Wznowienie strojenia - funkcja w trakcie implementacji', 'info');
        });
    }

    if (stopTuning) {
        stopTuning.addEventListener('click', () => {
            // This would need to be implemented in the tuning algorithms
            addLogMessage('Zatrzymanie strojenia - funkcja w trakcie implementacji', 'info');
        });
    }

    // Apply best parameters button
    const applyBestBtn = document.getElementById('apply-best-btn');
    if (applyBestBtn) {
        applyBestBtn.addEventListener('click', () => {
            const bestKp = document.getElementById('best-kp').textContent;
            const bestKi = document.getElementById('best-ki').textContent;
            const bestKd = document.getElementById('best-kd').textContent;

            if (bestKp !== '---' && bestKi !== '---' && bestKd !== '---') {
                // Update UI inputs
                document.getElementById('balanceKp').value = parseFloat(bestKp);
                document.getElementById('balanceKi').value = parseFloat(bestKi);
                document.getElementById('balanceKd').value = parseFloat(bestKd);

                // Send to robot
                if (appStore.getState('connection.isConnected')) {
                    commLayer.send({ type: 'set_param', key: 'kp_b', value: parseFloat(bestKp) });
                    commLayer.send({ type: 'set_param', key: 'ki_b', value: parseFloat(bestKi) });
                    commLayer.send({ type: 'set_param', key: 'kd_b', value: parseFloat(bestKd) });
                }

                addLogMessage('Zastosowano najlepsze parametry', 'success');
            }
        });
    }

    // ========================================================================
    // AUTONOMOUS SEQUENCE CONTROLS
    // ========================================================================
    const addSequenceStepBtn = document.getElementById('add-sequence-step-btn');
    const runSequenceBtn = document.getElementById('run-sequence-btn');
    const stopSequenceBtn = document.getElementById('stop-sequence-btn');
    const clearSequenceBtn = document.getElementById('clear-sequence-btn');
    const sequenceList = document.getElementById('sequence-list');

    if (addSequenceStepBtn) {
        addSequenceStepBtn.addEventListener('click', () => {
            if (sequenceList.children.length >= 15) {
                addLogMessage('Osiągnięto maksymalną liczbę kroków (15)', 'warn');
                return;
            }

            const stepDiv = document.createElement('div');
            stepDiv.className = 'sequence-step';
            stepDiv.innerHTML = `
                <select class="sequence-type">
                    <option value="move_fwd">Przemieść Przód (cm)</option>
                    <option value="move_bwd">Przemieść Tył (cm)</option>
                    <option value="rotate_r">Obrót Prawo (stopnie)</option>
                    <option value="rotate_l">Obrót Lewo (stopnie)</option>
                    <option value="wait_ms">Czekaj (ms)</option>
                    <option value="wait_condition">Czekaj aż (warunek)</option>
                    <option value="set_param">Ustaw parametr</option>
                </select>
                <input type="text" class="sequence-value" placeholder="Wartość">
                <button class="remove-step-btn">&times;</button>
            `;

            sequenceList.appendChild(stepDiv);

            // Add event listeners
            const typeSelect = stepDiv.querySelector('.sequence-type');
            const valueInput = stepDiv.querySelector('.sequence-value');
            const removeBtn = stepDiv.querySelector('.remove-step-btn');

            typeSelect.addEventListener('change', () => {
                const type = typeSelect.value;
                if (type === 'wait_condition') {
                    valueInput.placeholder = 'np. pitch < 0.5';
                } else if (type === 'set_param') {
                    valueInput.placeholder = 'np. balanceKp=100.0';
                } else {
                    valueInput.placeholder = 'Wartość';
                }
            });

            removeBtn.addEventListener('click', () => {
                stepDiv.remove();
            });
        });
    }

    if (runSequenceBtn) {
        runSequenceBtn.addEventListener('click', () => {
            if (appStore.getState('sequence.isRunning')) return;

            const steps = Array.from(sequenceList.children);
            if (steps.length === 0) return;

            if (!appStore.getState('connection.isConnected')) {
                addLogMessage('Najpierw połącz się z robotem', 'warn');
                return;
            }

            appStore.setState('sequence.isRunning', true);
            appStore.setState('sequence.currentStep', 0);

            runSequenceBtn.style.display = 'none';
            stopSequenceBtn.style.display = 'inline-block';

            addLogMessage(`Rozpoczynam sekwencję z ${steps.length} krokami`, 'info');

            executeSequenceStep();
        });
    }

    if (stopSequenceBtn) {
        stopSequenceBtn.addEventListener('click', () => {
            if (!appStore.getState('sequence.isRunning')) return;

            appStore.setState('sequence.isRunning', false);
            commLayer.send({ type: 'command_stop' });

            runSequenceBtn.style.display = 'inline-block';
            stopSequenceBtn.style.display = 'none';

            addLogMessage('Sekwencja zatrzymana', 'warn');
        });
    }

    if (clearSequenceBtn) {
        clearSequenceBtn.addEventListener('click', () => {
            if (appStore.getState('sequence.isRunning')) {
                stopSequenceBtn.click();
            }
            sequenceList.innerHTML = '';
        });
    }

    function executeSequenceStep() {
        if (!appStore.getState('sequence.isRunning')) return;

        const steps = Array.from(sequenceList.children);
        const currentStep = appStore.getState('sequence.currentStep');

        if (currentStep >= steps.length) {
            appStore.setState('sequence.isRunning', false);
            runSequenceBtn.style.display = 'inline-block';
            stopSequenceBtn.style.display = 'none';
            addLogMessage('Sekwencja zakończona', 'success');
            return;
        }

        const stepDiv = steps[currentStep];
        const type = stepDiv.querySelector('.sequence-type').value;
        const value = stepDiv.querySelector('.sequence-value').value;

        stepDiv.classList.add('executing');

        let command = {};
        switch (type) {
            case 'move_fwd':
                command = { type: 'execute_move', distance_cm: parseFloat(value) };
                break;
            case 'move_bwd':
                command = { type: 'execute_move', distance_cm: -parseFloat(value) };
                break;
            case 'rotate_r':
                command = { type: 'execute_rotate', angle_deg: parseFloat(value) };
                break;
            case 'rotate_l':
                command = { type: 'execute_rotate', angle_deg: -parseFloat(value) };
                break;
            case 'wait_ms':
                setTimeout(() => {
                    stepDiv.classList.remove('executing');
                    appStore.setState('sequence.currentStep', currentStep + 1);
                    executeSequenceStep();
                }, parseInt(value) || 1000);
                return;
            case 'wait_condition':
                // This would need more complex implementation
                addLogMessage('Funkcja czekania na warunek w trakcie implementacji', 'info');
                stepDiv.classList.remove('executing');
                appStore.setState('sequence.currentStep', currentStep + 1);
                executeSequenceStep();
                return;
            case 'set_param':
                // Parse parameter setting
                const parts = value.split('=');
                if (parts.length === 2) {
                    const paramKey = parts[0].trim();
                    const paramValue = parseFloat(parts[1].trim());
                    commLayer.send({ type: 'set_param', key: paramKey, value: paramValue });
                    addLogMessage(`Ustawiono ${paramKey} = ${paramValue}`, 'info');
                }
                stepDiv.classList.remove('executing');
                appStore.setState('sequence.currentStep', currentStep + 1);
                executeSequenceStep();
                return;
        }

        addLogMessage(`Wykonuję krok ${currentStep + 1}/${steps.length}: ${type}`, 'info');
        commLayer.send(command);
    }

    // Path visualization reset
    const resetPathBtn = document.getElementById('reset-path-btn');
    if (resetPathBtn) {
        resetPathBtn.addEventListener('click', () => {
            // This would need path visualization implementation
            addLogMessage('Ścieżka zresetowana', 'info');
        });
    }

    // ========================================================================
    // DIAGNOSTICS - SIGNAL ANALYZER AND RESULTS
    // ========================================================================

    // Initialize signal analyzer when diagnostics view is shown
    const diagnosticsView = document.getElementById('viewDiagnostics');
    if (diagnosticsView) {
        // This would be triggered when switching to diagnostics view
        // For now, initialize on load
        setTimeout(() => {
            if (typeof initSignalAnalyzerChart === 'function') {
                initSignalAnalyzerChart();
                setupSignalChartControls();
                setupSignalAnalyzerControls();
            }
        }, 1000);
    }

    // Results table management
    window.addTestToResultsTable = function (testNum, params, fitness, itae, overshoot, testType = 'telemetry_test', meta = {}) {
        const tbody = document.getElementById('results-table-body');
        if (!tbody) return;

        const metaText = (meta.gen && meta.totalGen) ? ` (Gen ${meta.gen}/${meta.totalGen})` : '';
        const row = tbody.insertRow(0); // Insert at top
        row.innerHTML = `
            <td>${testNum}${metaText}</td>
            <td>${params.kp ? params.kp.toFixed(3) : '---'}</td>
            <td>${params.ki ? params.ki.toFixed(3) : '---'}</td>
            <td>${params.kd ? params.kd.toFixed(3) : '---'}</td>
            <td>${(fitness === Infinity || isNaN(fitness)) ? '---' : fitness.toFixed(4)}</td>
            <td>${(isNaN(itae) ? '---' : itae.toFixed(2))}</td>
            <td>${isNaN(overshoot) ? '---' : overshoot.toFixed(2)}</td>
            <td><button onclick="applyParameters(${params.kp || 0}, ${params.ki || 0}, ${params.kd || 0})" class="btn-small">Zastosuj</button></td>
        `;
    };

    window.applyParameters = function (kp, ki, kd) {
        if (kp !== undefined && ki !== undefined && kd !== undefined) {
            document.getElementById('balanceKp').value = kp;
            document.getElementById('balanceKi').value = ki;
            document.getElementById('balanceKd').value = kd;

            if (appStore.getState('connection.isConnected')) {
                commLayer.send({ type: 'set_param', key: 'kp_b', value: kp });
                commLayer.send({ type: 'set_param', key: 'ki_b', value: ki });
                commLayer.send({ type: 'set_param', key: 'kd_b', value: kd });
            }

            addLogMessage('Zastosowano parametry z tabeli wyników', 'success');
        }
    };

    // Update progress display functions
    window.updateProgressDisplay = function (current, total, bestFitness) {
        const itEl = document.getElementById('current-iteration');
        const totEl = document.getElementById('total-iterations');
        const fEl = document.getElementById('best-fitness');
        if (itEl) itEl.textContent = current;
        if (totEl) totEl.textContent = total;
        if (fEl && bestFitness !== undefined && bestFitness !== Infinity) {
            fEl.textContent = bestFitness.toFixed(4);
        }
    };

    window.updateBestDisplay = function (params) {
        const elKp = document.getElementById('best-kp');
        const elKi = document.getElementById('best-ki');
        const elKd = document.getElementById('best-kd');
        const elF = document.getElementById('best-fitness');
        if (elKp) elKp.textContent = params.kp ? params.kp.toFixed(3) : '---';
        if (elKi) elKi.textContent = params.ki ? params.ki.toFixed(3) : '---';
        if (elKd) elKd.textContent = params.kd ? params.kd.toFixed(3) : '---';
        if (elF && params.fitness !== undefined && params.fitness !== Infinity) {
            elF.textContent = params.fitness.toFixed(4);
        }
        const applyBtn = document.getElementById('apply-best-btn');
        if (applyBtn) applyBtn.disabled = false;
    };

    window.updateCurrentTestDisplay = function (generation, totalGen, individual, totalPop, kp, ki, kd, fitness) {
        // Update progress panel
        updateProgressDisplay(generation, totalGen, fitness);
        updateBestDisplay({ kp, ki, kd, fitness });
    };

    // Sign toggle functions
    window.setSignButtons = function (containerId, sign) {
        const container = document.getElementById(containerId);
        if (!container) return;

        container.querySelectorAll('button').forEach(btn => {
            const btnSign = parseInt(btn.dataset.sign);
            if (btnSign === sign) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    };

    window.getActiveSign = function (containerId) {
        const container = document.getElementById(containerId);
        if (!container) return 1;

        const activeBtn = container.querySelector('button.active');
        return activeBtn ? parseInt(activeBtn.dataset.sign) : 1;
    };

    // Initialize sign toggles
    function initSignToggles() {
        // Balance sign toggle
        const balanceSign = document.getElementById('balanceSign');
        if (balanceSign) {
            balanceSign.querySelectorAll('button').forEach(btn => {
                btn.addEventListener('click', () => {
                    const sign = parseInt(btn.dataset.sign);
                    setSignButtons('balanceSign', sign);

                    if (appStore.getState('connection.isConnected')) {
                        commLayer.send({ type: 'set_param', key: 'balance_feedback_sign', value: sign });
                    }

                    addLogMessage(`Zmieniono znak sprzężenia balansu na ${sign}`, 'info');
                });
            });
        }

        // Speed sign toggle
        const speedSign = document.getElementById('speedSign');
        if (speedSign) {
            speedSign.querySelectorAll('button').forEach(btn => {
                btn.addEventListener('click', () => {
                    const sign = parseInt(btn.dataset.sign);
                    setSignButtons('speedSign', sign);

                    if (appStore.getState('connection.isConnected')) {
                        commLayer.send({ type: 'set_param', key: 'speed_feedback_sign', value: sign });
                    }

                    addLogMessage(`Zmieniono znak sprzężenia prędkości na ${sign}`, 'info');
                });
            });
        }

        // Position sign toggle
        const positionSign = document.getElementById('positionSign');
        if (positionSign) {
            positionSign.querySelectorAll('button').forEach(btn => {
                btn.addEventListener('click', () => {
                    const sign = parseInt(btn.dataset.sign);
                    setSignButtons('positionSign', sign);

                    if (appStore.getState('connection.isConnected')) {
                        commLayer.send({ type: 'set_param', key: 'position_feedback_sign', value: sign });
                    }

                    addLogMessage(`Zmieniono znak sprzężenia pozycji na ${sign}`, 'info');
                });
            });
        }
    }

    // Initialize sign toggles when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSignToggles);
    } else {
        initSignToggles();
    }

    // Joystick settings functions
    function initJoystickSettings() {
        // Joystick sensitivity
        const sensitivityInput = document.getElementById('joystickSensitivityInput');
        if (sensitivityInput) {
            sensitivityInput.addEventListener('change', () => {
                const value = parseInt(sensitivityInput.value);
                if (appStore.getState('connection.isConnected')) {
                    commLayer.send({ type: 'set_param', key: 'joystick_sensitivity', value: value / 100 });
                }
                addLogMessage(`Ustawiono czułość joysticka na ${value}%`, 'info');
            });
        }

        // Expo joystick
        const expoInput = document.getElementById('expoJoystickInput');
        if (expoInput) {
            expoInput.addEventListener('change', () => {
                const value = parseInt(expoInput.value);
                if (appStore.getState('connection.isConnected')) {
                    commLayer.send({ type: 'set_param', key: 'expo_joystick', value: value / 100 });
                }
                addLogMessage(`Ustawiono expo joysticka na ${value}%`, 'info');
            });
        }

        // Max speed joystick
        const maxSpeedInput = document.getElementById('maxSpeedJoystickInput');
        if (maxSpeedInput) {
            maxSpeedInput.addEventListener('change', () => {
                const value = parseInt(maxSpeedInput.value);
                if (appStore.getState('connection.isConnected')) {
                    commLayer.send({ type: 'set_param', key: 'max_target_speed_from_joystick', value: value });
                }
                addLogMessage(`Ustawiono maksymalną prędkość joysticka na ${value} imp/s`, 'info');
            });
        }

        // Joystick angle sensitivity
        const angleSensitivityInput = document.getElementById('joystickAngleSensitivityInput');
        if (angleSensitivityInput) {
            angleSensitivityInput.addEventListener('change', () => {
                const value = parseFloat(angleSensitivityInput.value);
                if (appStore.getState('connection.isConnected')) {
                    commLayer.send({ type: 'set_param', key: 'joystick_angle_sensitivity', value: value });
                }
                addLogMessage(`Ustawiono czułość kąta joysticka na ${value}°`, 'info');
            });
        }

        // Turn factor
        const turnFactorInput = document.getElementById('turnFactorInput');
        if (turnFactorInput) {
            turnFactorInput.addEventListener('change', () => {
                const value = parseInt(turnFactorInput.value);
                if (appStore.getState('connection.isConnected')) {
                    commLayer.send({ type: 'set_param', key: 'turn_factor', value: value / 100 });
                }
                addLogMessage(`Ustawiono czułość skrętu na ${value}%`, 'info');
            });
        }

        // Joystick deadzone
        const deadzoneInput = document.getElementById('joystickDeadzoneInput');
        if (deadzoneInput) {
            deadzoneInput.addEventListener('change', () => {
                const value = parseInt(deadzoneInput.value);
                if (appStore.getState('connection.isConnected')) {
                    commLayer.send({ type: 'set_param', key: 'joystick_deadzone', value: value / 100 });
                }
                addLogMessage(`Ustawiono strefę martwą joysticka na ${value}%`, 'info');
            });
        }
    }

    // Hardware settings functions
    function initHardwareSettings() {
        // Wheel diameter
        const wheelDiameterInput = document.getElementById('wheelDiameterInput');
        if (wheelDiameterInput) {
            wheelDiameterInput.addEventListener('change', () => {
                const value = parseFloat(wheelDiameterInput.value);
                if (appStore.getState('connection.isConnected')) {
                    commLayer.send({ type: 'set_param', key: 'wheel_diameter_cm', value: value });
                }
                addLogMessage(`Ustawiono średnicę koła na ${value} cm`, 'info');
            });
        }

        // Track width
        const trackWidthInput = document.getElementById('trackWidthInput');
        if (trackWidthInput) {
            trackWidthInput.addEventListener('change', () => {
                const value = parseFloat(trackWidthInput.value);
                if (appStore.getState('connection.isConnected')) {
                    commLayer.send({ type: 'set_param', key: 'track_width_cm', value: value });
                }
                addLogMessage(`Ustawiono rozstaw kół na ${value} cm`, 'info');
            });
        }

        // Encoder PPR
        const encoderPprInput = document.getElementById('encoderPprInput');
        if (encoderPprInput) {
            encoderPprInput.addEventListener('change', () => {
                const value = parseInt(encoderPprInput.value);
                if (appStore.getState('connection.isConnected')) {
                    commLayer.send({ type: 'set_param', key: 'encoder_ppr', value: value });
                }
                addLogMessage(`Ustawiono impulsy na obrót enkodera na ${value} PPR`, 'info');
            });
        }
    }

    // IMU settings functions
    function initImuSettings() {
        // Madgwick filter enable/disable
        const useMadgwickToggle = document.getElementById('useMadgwickFilterInput');
        if (useMadgwickToggle) {
            useMadgwickToggle.addEventListener('change', () => {
                const enabled = useMadgwickToggle.checked;
                if (appStore.getState('connection.isConnected')) {
                    commLayer.send({ type: 'set_param', key: 'use_madgwick_filter', value: enabled ? 1.0 : 0.0 });
                }
                addLogMessage(`Filtr Madgwicka ${enabled ? 'włączony' : 'wyłączony'}`, 'info');
            });
        }

        // Madgwick beta parameter
        const madgwickBetaInput = document.getElementById('madgwickBetaInput');
        if (madgwickBetaInput) {
            madgwickBetaInput.addEventListener('change', () => {
                const value = parseFloat(madgwickBetaInput.value);
                if (appStore.getState('connection.isConnected')) {
                    commLayer.send({ type: 'set_param', key: 'madgwick_beta', value: value });
                }
                addLogMessage(`Ustawiono beta filtru Madgwicka na ${value}`, 'info');
            });
        }

        // Madgwick zeta parameter
        const madgwickZetaInput = document.getElementById('madgwickZetaInput');
        if (madgwickZetaInput) {
            madgwickZetaInput.addEventListener('change', () => {
                const value = parseFloat(madgwickZetaInput.value);
                if (appStore.getState('connection.isConnected')) {
                    commLayer.send({ type: 'set_param', key: 'madgwick_zeta', value: value });
                }
                addLogMessage(`Ustawiono zeta filtru Madgwicka na ${value}`, 'info');
            });
        }

        // Magnetometer enable/disable
        const magnetometerToggle = document.getElementById('magnetometerEnabledInput');
        if (magnetometerToggle) {
            magnetometerToggle.addEventListener('change', () => {
                const enabled = magnetometerToggle.checked;
                if (appStore.getState('connection.isConnected')) {
                    commLayer.send({ type: 'set_param', key: 'disable_magnetometer', value: enabled ? 0.0 : 1.0 });
                }
                addLogMessage(`Magnetometr ${enabled ? 'włączony' : 'wyłączony'}`, 'info');
            });
        }
    }

    // Initialize settings when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            initJoystickSettings();
            initHardwareSettings();
            initImuSettings();
        });
    } else {
        initJoystickSettings();
        initHardwareSettings();
        initImuSettings();
    }

    // Joystick mapping functions
    let joystickMapping = {
        axes: {},
        buttons: {}
    };
    let isMappingMode = false;
    let currentMappingTarget = null;

    function initJoystickMapping() {
        const mappingGrid = document.getElementById('joystickMappingGrid');
        const startMappingBtn = document.getElementById('startJoystickMappingBtn');
        const stopMappingBtn = document.getElementById('stopJoystickMappingBtn');
        const clearMappingBtn = document.getElementById('clearJoystickMappingBtn');
        const statusDiv = document.getElementById('joystickMappingStatus');

        if (!mappingGrid || !startMappingBtn || !stopMappingBtn || !clearMappingBtn || !statusDiv) return;

        // Start mapping mode
        startMappingBtn.addEventListener('click', () => {
            isMappingMode = true;
            statusDiv.textContent = 'Tryb mapowania aktywny - poruszaj joystickiem lub naciskaj przyciski';
            statusDiv.className = 'mapping-status active';
            addLogMessage('Rozpoczęto mapowanie joysticka', 'info');
        });

        // Stop mapping mode
        stopMappingBtn.addEventListener('click', () => {
            isMappingMode = false;
            currentMappingTarget = null;
            statusDiv.textContent = 'Tryb mapowania zatrzymany';
            statusDiv.className = 'mapping-status inactive';
            addLogMessage('Zatrzymano mapowanie joysticka', 'info');
        });

        // Clear mapping
        clearMappingBtn.addEventListener('click', () => {
            joystickMapping = { axes: {}, buttons: {} };
            updateMappingDisplay();
            if (appStore.getState('connection.isConnected')) {
                commLayer.send({ type: 'set_param', key: 'joystick_mapping', value: joystickMapping });
            }
            addLogMessage('Wyczyszczono mapowanie joysticka', 'info');
        });

        // Handle gamepad input
        window.addEventListener('gamepadconnected', (e) => {
            addLogMessage(`Podłączono joystick: ${e.gamepad.id}`, 'info');
            requestAnimationFrame(updateGamepad);
        });

        window.addEventListener('gamepaddisconnected', (e) => {
            addLogMessage(`Odłączono joystick: ${e.gamepad.id}`, 'warning');
        });

        function updateGamepad() {
            const gamepads = navigator.getGamepads();
            for (let i = 0; i < gamepads.length; i++) {
                const gamepad = gamepads[i];
                if (!gamepad) continue;

                if (isMappingMode) {
                    // Check axes
                    for (let axisIndex = 0; axisIndex < gamepad.axes.length; axisIndex++) {
                        const axisValue = gamepad.axes[axisIndex];
                        if (Math.abs(axisValue) > 0.1) { // Threshold to avoid noise
                            if (!joystickMapping.axes[axisIndex]) {
                                joystickMapping.axes[axisIndex] = { value: axisValue };
                                updateMappingDisplay();
                                addLogMessage(`Zmapowano oś ${axisIndex} z wartością ${axisValue.toFixed(2)}`, 'info');
                            }
                        }
                    }

                    // Check buttons
                    for (let buttonIndex = 0; buttonIndex < gamepad.buttons.length; buttonIndex++) {
                        const button = gamepad.buttons[buttonIndex];
                        if (button.pressed) {
                            if (!joystickMapping.buttons[buttonIndex]) {
                                joystickMapping.buttons[buttonIndex] = { pressed: true };
                                updateMappingDisplay();
                                addLogMessage(`Zmapowano przycisk ${buttonIndex}`, 'info');
                            }
                        }
                    }
                }
            }
            requestAnimationFrame(updateGamepad);
        }

        function updateMappingDisplay() {
            const axesDiv = document.getElementById('mappedAxes');
            const buttonsDiv = document.getElementById('mappedButtons');

            if (axesDiv) {
                axesDiv.innerHTML = Object.keys(joystickMapping.axes).length > 0
                    ? Object.keys(joystickMapping.axes).map(axis => `Oś ${axis}`).join(', ')
                    : 'Brak zmapowanych osi';
            }

            if (buttonsDiv) {
                buttonsDiv.innerHTML = Object.keys(joystickMapping.buttons).length > 0
                    ? Object.keys(joystickMapping.buttons).map(button => `Przycisk ${button}`).join(', ')
                    : 'Brak zmapowanych przycisków';
            }
        }

        // Initialize display
        updateMappingDisplay();
    }

    // Initialize joystick mapping when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initJoystickMapping);
    } else {
        initJoystickMapping();
    }

    // PID settings functions
    function initPidSettings() {
        const pidLoops = ['balance', 'speed', 'position', 'rotation', 'heading'];

        pidLoops.forEach(loop => {
            // Map loop to suffix
            let suffix = '';
            if (loop === 'balance') suffix = 'b';
            else if (loop === 'speed') suffix = 's';
            else if (loop === 'position') suffix = 'p';
            else if (loop === 'rotation') suffix = 'r';
            else if (loop === 'heading') suffix = 'h';

            // Kp
            const kpInput = document.getElementById(`${loop}Kp`);
            if (kpInput) {
                kpInput.addEventListener('change', () => {
                    const value = parseFloat(kpInput.value);
                    if (appStore.getState('connection.isConnected')) {
                        commLayer.send({ type: 'set_param', key: `kp_${suffix}`, value: value });
                    }
                    addLogMessage(`Ustawiono Kp dla ${loop} na ${value}`, 'info');
                });
            }

            // Ki (skip for rotation)
            if (loop !== 'rotation') {
                const kiInput = document.getElementById(`${loop}Ki`);
                if (kiInput) {
                    kiInput.addEventListener('change', () => {
                        const value = parseFloat(kiInput.value);
                        if (appStore.getState('connection.isConnected')) {
                            commLayer.send({ type: 'set_param', key: `ki_${suffix}`, value: value });
                        }
                        addLogMessage(`Ustawiono Ki dla ${loop} na ${value}`, 'info');
                    });
                }
            }

            // Kd
            const kdInput = document.getElementById(`${loop}Kd`);
            if (kdInput) {
                kdInput.addEventListener('change', () => {
                    const value = parseFloat(kdInput.value);
                    if (appStore.getState('connection.isConnected')) {
                        commLayer.send({ type: 'set_param', key: `kd_${suffix}`, value: value });
                    }
                    addLogMessage(`Ustawiono Kd dla ${loop} na ${value}`, 'info');
                });
            }

            // Filter (only for balance, speed, position)
            if (['balance', 'speed', 'position'].includes(loop)) {
                const filterInput = document.getElementById(`${loop}FilterAlpha`);
                if (filterInput) {
                    filterInput.addEventListener('change', () => {
                        const value = parseFloat(filterInput.value);
                        if (appStore.getState('connection.isConnected')) {
                            const filterKey = loop === 'balance' ? 'balance_pid_derivative_filter_alpha' : `${loop}_pid_filter_alpha`;
                            commLayer.send({ type: 'set_param', key: filterKey, value: value });
                        }
                        addLogMessage(`Ustawiono filtr dla ${loop} na ${value}`, 'info');
                    });
                }
            }
        });
    }

    // Initialize PID settings when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initPidSettings);
    } else {
        initPidSettings();
    }

    // D-Pad controls functions
    function setupDpadControls() {
        document.querySelectorAll('.dpad-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = e.currentTarget.dataset.dpad;
                let msg = null;
                if (action === 'up') msg = { type: 'execute_move', distance_cm: parseFloat(document.getElementById('dpadDistInput').value) };
                else if (action === 'down') msg = { type: 'execute_move', distance_cm: -parseFloat(document.getElementById('dpadDistInput').value) };
                else if (action === 'left') msg = { type: 'execute_rotate', angle_deg: -parseFloat(document.getElementById('dpadAngleInput').value) };
                else if (action === 'right') msg = { type: 'execute_rotate', angle_deg: parseFloat(document.getElementById('dpadAngleInput').value) };
                else if (action === 'stop') msg = { type: 'command_stop' };
                if (msg) {
                    flashElement(e.currentTarget);
                    try {
                        addLogMessage(`[UI -> ROBOT] Sending: ${msg.type} ${JSON.stringify(msg)}`, 'info');
                    } catch (err) { }
                    if (appStore.getState('connection.isConnected')) {
                        commLayer.send(msg);
                    } else {
                        addLogMessage('Najpierw połącz się z robotem', 'warn');
                    }
                }
            });
        });
    }

    // Autotuning functions
    let currentTuningAlgorithm = null;

    function initAutotuning() {
        // Method selection tabs
        const methodTabs = document.querySelectorAll('.method-tab');
        methodTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                // Remove active class from all tabs
                methodTabs.forEach(t => t.classList.remove('active'));
                // Add active class to clicked tab
                tab.classList.add('active');

                // Hide all method configs
                const methodConfigs = document.querySelectorAll('.method-config');
                methodConfigs.forEach(config => config.style.display = 'none');

                // Show selected method config
                const method = tab.dataset.method;
                const selectedConfig = document.getElementById(`${method}-config`);
                if (selectedConfig) {
                    selectedConfig.style.display = 'block';
                }
            });
        });

        // Start tuning button
        const startTuningBtn = document.getElementById('startTuningBtn');
        if (startTuningBtn) {
            startTuningBtn.addEventListener('click', startTuning);
        }

        // Pause/Resume tuning button
        const pauseTuningBtn = document.getElementById('pauseTuningBtn');
        if (pauseTuningBtn) {
            pauseTuningBtn.addEventListener('click', pauseResumeTuning);
        }

        // Stop tuning button
        const stopTuningBtn = document.getElementById('stopTuningBtn');
        if (stopTuningBtn) {
            stopTuningBtn.addEventListener('click', handleStopTuning);
        }

        // Apply best parameters button
        const applyBestBtn = document.getElementById('applyBestBtn');
        if (applyBestBtn) {
            applyBestBtn.addEventListener('click', applyBestParameters);
        }

        // Loop selector
        const loopSelector = document.getElementById('tuningLoopSelector');
        if (loopSelector) {
            loopSelector.addEventListener('change', () => {
                updateTuningConfig();
            });
        }

        // Initialize with default method
        updateTuningConfig();
    }

    function updateTuningConfig() {
        const loopSelector = document.getElementById('tuningLoopSelector');
        const loop = loopSelector ? loopSelector.value : 'balance';

        // Update search space based on loop
        const searchSpace = getSearchSpaceForLoop(loop);

        // Update GA config
        const gaPopInput = document.getElementById('gaPopulationInput');
        const gaGenInput = document.getElementById('gaGenerationsInput');
        if (gaPopInput) gaPopInput.value = 20;
        if (gaGenInput) gaGenInput.value = 30;

        // Update PSO config
        const psoParticlesInput = document.getElementById('psoParticlesInput');
        const psoIterationsInput = document.getElementById('psoIterationsInput');
        if (psoParticlesInput) psoParticlesInput.value = 20;
        if (psoIterationsInput) psoIterationsInput.value = 30;

        // Update ZN config
        const znAmplitudeInput = document.getElementById('znAmplitudeInput');
        const znCyclesInput = document.getElementById('znCyclesInput');
        if (znAmplitudeInput) znAmplitudeInput.value = 2.0;
        if (znCyclesInput) znCyclesInput.value = 3;

        // Update Bayesian config
        const bayesIterationsInput = document.getElementById('bayesIterationsInput');
        const bayesSamplesInput = document.getElementById('bayesSamplesInput');
        if (bayesIterationsInput) bayesIterationsInput.value = 25;
        if (bayesSamplesInput) bayesSamplesInput.value = 5;

        addLogMessage(`Zaktualizowano konfigurację strojenia dla pętli: ${loop}`, 'info');
    }

    function getSearchSpaceForLoop(loop) {
        // Define search spaces for different loops
        const searchSpaces = {
            balance: {
                kp_min: 0.1, kp_max: 50.0,
                ki_min: 0.0, ki_max: 10.0,
                kd_min: 0.0, kd_max: 5.0
            },
            speed: {
                kp_min: 0.01, kp_max: 5.0,
                ki_min: 0.0, ki_max: 2.0,
                kd_min: 0.0, kd_max: 1.0
            },
            position: {
                kp_min: 0.1, kp_max: 20.0,
                ki_min: 0.0, ki_max: 5.0,
                kd_min: 0.0, kd_max: 2.0
            },
            rotation: {
                kp_min: 0.1, kp_max: 30.0,
                ki_min: 0.0, ki_max: 8.0,
                kd_min: 0.0, kd_max: 3.0
            },
            heading: {
                kp_min: 0.1, kp_max: 25.0,
                ki_min: 0.0, ki_max: 6.0,
                kd_min: 0.0, kd_max: 2.5
            }
        };

        return searchSpaces[loop] || searchSpaces.balance;
    }

    async function startTuning() {
        if (!appStore.getState('connection.isConnected')) {
            addLogMessage('Najpierw połącz się z robotem', 'warn');
            return;
        }

        if (currentTuningAlgorithm && currentTuningAlgorithm.isRunning) {
            addLogMessage('Strojenie już jest aktywne', 'warning');
            return;
        }

        const activeTab = document.querySelector('.method-tab.active');
        if (!activeTab) {
            addLogMessage('Wybierz metodę strojenia', 'error');
            return;
        }

        const method = activeTab.dataset.method;
        const loop = document.getElementById('tuningLoopSelector')?.value || 'balance';
        const searchSpace = getSearchSpaceForLoop(loop);

        // Capture baseline PID before starting
        captureBaselinePID();

        try {
            switch (method) {
                case 'ga':
                    await startGA(searchSpace);
                    break;
                case 'pso':
                    await startPSO(searchSpace);
                    break;
                case 'zn':
                    await startZN();
                    break;
                case 'bayes':
                    await startBayesian(searchSpace);
                    break;
                default:
                    addLogMessage('Nieznana metoda strojenia', 'error');
                    return;
            }

            appStore.setState('tuning.isActive', true);
            appStore.setState('tuning.activeMethod', method);
            updateTuningButtons(true);

        } catch (error) {
            addLogMessage(`Błąd podczas uruchamiania strojenia: ${error.message}`, 'error');
        }
    }

    async function startGA(searchSpace) {
        const populationSize = parseInt(document.getElementById('gaPopulationInput')?.value) || 20;
        const generations = parseInt(document.getElementById('gaGenerationsInput')?.value) || 30;

        // Import tuning algorithms dynamically
        const { GeneticAlgorithm } = await import('./tuning_algorithms.js');
        currentTuningAlgorithm = new GeneticAlgorithm({
            populationSize: populationSize,
            generations: generations,
            searchSpace: searchSpace
        });

        addLogMessage(`Uruchamianie Algorytmu Genetycznego: populacja=${populationSize}, generacje=${generations}`, 'info');
        await currentTuningAlgorithm.run();
    }

    async function startPSO(searchSpace) {
        const numParticles = parseInt(document.getElementById('psoParticlesInput')?.value) || 20;
        const iterations = parseInt(document.getElementById('psoIterationsInput')?.value) || 30;

        // Import tuning algorithms dynamically
        const { ParticleSwarmOptimization } = await import('./tuning_algorithms.js');
        currentTuningAlgorithm = new ParticleSwarmOptimization({
            numParticles: numParticles,
            iterations: iterations,
            searchSpace: searchSpace
        });

        addLogMessage(`Uruchamianie PSO: cząsteczki=${numParticles}, iteracje=${iterations}`, 'info');
        await currentTuningAlgorithm.run();
    }

    async function startZN() {
        const amplitude = parseFloat(document.getElementById('znAmplitudeInput')?.value) || 2.0;
        const minCycles = parseInt(document.getElementById('znCyclesInput')?.value) || 3;

        // Import tuning algorithms dynamically
        const { ZieglerNicholsRelay } = await import('./tuning_algorithms.js');
        currentTuningAlgorithm = new ZieglerNicholsRelay({
            amplitude: amplitude,
            minCycles: minCycles
        });

        addLogMessage(`Uruchamianie metody Zieglera-Nicholsa: amplituda=${amplitude}, cykle=${minCycles}`, 'info');
        await currentTuningAlgorithm.run();
    }

    async function startBayesian(searchSpace) {
        const iterations = parseInt(document.getElementById('bayesIterationsInput')?.value) || 25;
        const initialSamples = parseInt(document.getElementById('bayesSamplesInput')?.value) || 5;

        // Import tuning algorithms dynamically
        const { BayesianOptimization } = await import('./tuning_algorithms.js');
        currentTuningAlgorithm = new BayesianOptimization({
            iterations: iterations,
            initialSamples: initialSamples,
            searchSpace: searchSpace
        });

        addLogMessage(`Uruchamianie optymalizacji Bayesowskiej: iteracje=${iterations}, próbki=${initialSamples}`, 'info');
        await currentTuningAlgorithm.run();
    }

    function pauseResumeTuning() {
        if (!currentTuningAlgorithm) return;

        if (currentTuningAlgorithm.isPaused) {
            currentTuningAlgorithm.resume();
            appStore.setState('tuning.isPaused', false);
            addLogMessage('Wznawianie strojenia', 'info');
        } else {
            currentTuningAlgorithm.pause();
            appStore.setState('tuning.isPaused', true);
            addLogMessage('Wstrzymywanie strojenia', 'warning');
        }

        updateTuningButtons(true);
    }

    function handleStopTuning() {
        if (!currentTuningAlgorithm) return;

        currentTuningAlgorithm.stop();
        currentTuningAlgorithm = null;

        appStore.setState('tuning.isActive', false);
        appStore.setState('tuning.activeMethod', '');
        appStore.setState('tuning.isPaused', false);

        updateTuningButtons(false);
        addLogMessage('Zatrzymano strojenie', 'info');
    }

    function applyBestParameters() {
        // This function would apply the best parameters found during tuning
        // Implementation depends on how best parameters are stored
        addLogMessage('Zastosowano najlepsze parametry z strojenia', 'info');
    }

    function updateTuningButtons(isActive) {
        const startBtn = document.getElementById('startTuningBtn');
        const pauseBtn = document.getElementById('pauseTuningBtn');
        const stopBtn = document.getElementById('stopTuningBtn');

        if (isActive) {
            if (startBtn) startBtn.disabled = true;
            if (pauseBtn) {
                pauseBtn.disabled = false;
                pauseBtn.textContent = currentTuningAlgorithm?.isPaused ? 'Wznów' : 'Pauza';
            }
            if (stopBtn) stopBtn.disabled = false;
        } else {
            if (startBtn) startBtn.disabled = false;
            if (pauseBtn) {
                pauseBtn.disabled = true;
                pauseBtn.textContent = 'Pauza';
            }
            if (stopBtn) stopBtn.disabled = true;
        }
    }

    // Initialize autotuning when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAutotuning);
    } else {
        initAutotuning();
    }

    // Helper function to capture baseline PID parameters
    function captureBaselinePID() {
        const loop = document.getElementById('tuningLoopSelector')?.value || 'balance';

        // Map loop type to input element IDs
        let kpInputId, kiInputId, kdInputId;
        if (loop === 'balance') {
            kpInputId = 'balanceKp';
            kiInputId = 'balanceKi';
            kdInputId = 'balanceKd';
        } else if (loop === 'speed') {
            kpInputId = 'speedKp';
            kiInputId = 'speedKi';
            kdInputId = 'speedKd';
        } else if (loop === 'position') {
            kpInputId = 'positionKp';
            kiInputId = 'positionKi';
            kdInputId = 'positionKd';
        } else if (loop === 'rotation') {
            kpInputId = 'rotationKp';
            kiInputId = 'rotationKi';
            kdInputId = 'rotationKd';
        } else if (loop === 'heading') {
            kpInputId = 'headingKp';
            kiInputId = 'headingKi';
            kdInputId = 'headingKd';
        }

        // Read current values from UI
        const kpElement = document.getElementById(kpInputId);
        const kiElement = document.getElementById(kiInputId);
        const kdElement = document.getElementById(kdInputId);

        if (kpElement && kiElement && kdElement) {
            const baselinePID = {
                kp: parseFloat(kpElement.value) || 0,
                ki: parseFloat(kiElement.value) || 0,
                kd: parseFloat(kdElement.value) || 0
            };

            // Store in global scope for tuning algorithms
            window.baselinePID = baselinePID;

            console.log(`[Tuning] Captured baseline PID: Kp=${baselinePID.kp.toFixed(3)}, Ki=${baselinePID.ki.toFixed(3)}, Kd=${baselinePID.kd.toFixed(3)}`);
            addLogMessage(`Przechwycono parametry bazowe PID dla pętli ${loop}`, 'info');
        } else {
            console.warn('[Tuning] Could not capture baseline PID - input elements not found');
            addLogMessage('Nie można przechwycić parametrów bazowych PID', 'warning');
        }
    }
});

// ========================================================================
// SIGNAL ANALYZER FUNCTIONS (ported from .interface_2)
// ========================================================================

function initSignalAnalyzerChart() {
    const canvasEl = document.getElementById('signalAnalyzerChart');
    if (!canvasEl) { console.warn('[UI] signalAnalyzerChart canvas not found - skipping init.'); return; }
    if (typeof Chart === 'undefined') { console.warn('[UI] Chart.js library is not loaded - telemetry chart disabled.'); return; }
    // If already initialized, just resize and skip re-creation (prevent duplicates)
    if (signalAnalyzerChart) {
        try { signalAnalyzerChart.resize(); } catch (e) { /* ignore */ }
        return;
    }
    const ctx = canvasEl.getContext('2d');
    signalAnalyzerChart = new Chart(ctx, {
        type: 'line', data: { labels: Array(200).fill(''), datasets: [] },
        options: {
            animation: false, responsive: false, maintainAspectRatio: false,
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

    // Add range selection functionality (bind once)
    const canvas = ctx.canvas;
    if (!canvas.__rbChartHandlersBound) {
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
        canvas.__rbChartHandlersBound = true;
    }
}

function setupSignalChartControls() {
    if (signalAnalyzerControlsBound) return;
    signalAnalyzerControlsBound = true;
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
    if (isChartPaused || !signalAnalyzerChart) return;
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
    if (signalAnalyzerControlsBound) return;
    signalAnalyzerControlsBound = true;
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

    // Prevent division by zero
    const xStart = xScale.left;
    const xEnd = xScale.right;
    const xRange = xEnd - xStart;
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

// Make chart functions globally available
window.initSignalAnalyzerChart = initSignalAnalyzerChart;
window.setupSignalChartControls = setupSignalChartControls;
window.setupSignalAnalyzerControls = setupSignalAnalyzerControls;

// Make init functions globally available for view switching
if (typeof initPidSettings === 'function') window.initPidSettings = initPidSettings;
if (typeof initJoystickSettings === 'function') window.initJoystickSettings = initJoystickSettings;
if (typeof initHardwareSettings === 'function') window.initHardwareSettings = initHardwareSettings;
if (typeof initImuSettings === 'function') window.initImuSettings = initImuSettings;
if (typeof initSensorMappingPreview === 'function') window.initSensorMappingPreview = initSensorMappingPreview;
if (typeof initAutotuning === 'function') window.initAutotuning = initAutotuning;
if (typeof setupDpadControls === 'function') window.setupDpadControls = setupDpadControls;
