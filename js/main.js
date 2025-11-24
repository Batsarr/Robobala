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
        });
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
    if (data.loop_time !== undefined) {
        const loopEl = document.getElementById('loopTimeValue');
        if (loopEl) loopEl.textContent = data.loop_time + ' μs';
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
            document.getElementById(`view${capitalize(viewId)}`).classList.add('active');

            // Close sidebar on mobile
            closeSidebar();

            // Scroll to top
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    });

    function capitalize(str) {
        return str.split('-').map(word =>
            word.charAt(0).toUpperCase() + word.slice(1)
        ).join('');
    }

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

        // Send joystick values to robot
        if (appStore.getState('connection.isConnected')) {
            commLayer.send({
                type: 'joystick_control',
                x: normalizedX,
                y: normalizedY
            });
        }
    }

    function handleJoystickEnd(e) {
        if (!joystickActive) return;
        e.preventDefault();

        joystickActive = false;
        joystickKnob = { ...joystickCenter };
        drawJoystick();

        // Send zero values to robot
        if (appStore.getState('connection.isConnected')) {
            commLayer.send({
                type: 'joystick_control',
                x: 0,
                y: 0
            });
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
        addLogMessage(`Balansowanie ${state ? 'włączono' : 'wyłączono'}`, state ? 'success' : 'warn');
    });

    holdPositionToggle.addEventListener('change', (e) => {
        const state = e.target.checked;
        commLayer.send({ type: 'set_param', key: 'holding_pos', value: state });
        addLogMessage(`Trzymanie pozycji ${state ? 'włączono' : 'wyłączono'}`, state ? 'success' : 'warn');
    });

    speedModeToggle.addEventListener('change', (e) => {
        const state = e.target.checked;
        commLayer.send({ type: 'set_param', key: 'speed_mode', value: state });
        addLogMessage(`Tryb prędkości ${state ? 'włączono' : 'wyłączono'}`, state ? 'success' : 'warn');
    });

    // ========================================================================
    // 3D VISUALIZATION (Placeholder)
    // ========================================================================
    const robot3DContainer = document.getElementById('robot3DContainer');
    const reset3DView = document.getElementById('reset3DView');
    const toggle3DAnimation = document.getElementById('toggle3DAnimation');

    reset3DView.addEventListener('click', () => {
        addLogMessage('Widok 3D zresetowany', 'info');
    });

    toggle3DAnimation.addEventListener('click', () => {
        addLogMessage('Animacja 3D przełączona', 'info');
    });

    // TODO: Initialize THREE.js scene here
    // For now, show placeholder
    robot3DContainer.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: var(--text-secondary); font-size: 3rem;">🤖</div>';

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
            'balanceIntegralLimit': 'balance_pid_integral_limit'
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

    // Initialize settings when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            initJoystickSettings();
            initHardwareSettings();
        });
    } else {
        initJoystickSettings();
        initHardwareSettings();
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
            // Kp
            const kpInput = document.getElementById(`${loop}KpInput`);
            if (kpInput) {
                kpInput.addEventListener('change', () => {
                    const value = parseFloat(kpInput.value);
                    if (appStore.getState('connection.isConnected')) {
                        commLayer.send({ type: 'set_pid_param', loop: loop, param: 'kp', value: value });
                    }
                    addLogMessage(`Ustawiono Kp dla ${loop} na ${value}`, 'info');
                });
            }

            // Ki
            const kiInput = document.getElementById(`${loop}KiInput`);
            if (kiInput) {
                kiInput.addEventListener('change', () => {
                    const value = parseFloat(kiInput.value);
                    if (appStore.getState('connection.isConnected')) {
                        commLayer.send({ type: 'set_pid_param', loop: loop, param: 'ki', value: value });
                    }
                    addLogMessage(`Ustawiono Ki dla ${loop} na ${value}`, 'info');
                });
            }

            // Kd
            const kdInput = document.getElementById(`${loop}KdInput`);
            if (kdInput) {
                kdInput.addEventListener('change', () => {
                    const value = parseFloat(kdInput.value);
                    if (appStore.getState('connection.isConnected')) {
                        commLayer.send({ type: 'set_pid_param', loop: loop, param: 'kd', value: value });
                    }
                    addLogMessage(`Ustawiono Kd dla ${loop} na ${value}`, 'info');
                });
            }

            // Filter
            const filterInput = document.getElementById(`${loop}FilterInput`);
            if (filterInput) {
                filterInput.addEventListener('change', () => {
                    const value = parseFloat(filterInput.value);
                    if (appStore.getState('connection.isConnected')) {
                        commLayer.send({ type: 'set_pid_param', loop: loop, param: 'filter', value: value });
                    }
                    addLogMessage(`Ustawiono filtr dla ${loop} na ${value}`, 'info');
                });
            }
        });
    }

    // Initialize PID settings when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initPidSettings);
    } else {
        initPidSettings();
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
            kpInputId = 'balanceKpInput';
            kiInputId = 'balanceKiInput';
            kdInputId = 'balanceKdInput';
        } else if (loop === 'speed') {
            kpInputId = 'speedKpInput';
            kiInputId = 'speedKiInput';
            kdInputId = 'speedKdInput';
        } else if (loop === 'position') {
            kpInputId = 'positionKpInput';
            kiInputId = 'positionKiInput';
            kdInputId = 'positionKdInput';
        } else if (loop === 'rotation') {
            kpInputId = 'rotationKpInput';
            kiInputId = 'rotationKiInput';
            kdInputId = 'rotationKdInput';
        } else if (loop === 'heading') {
            kpInputId = 'headingKpInput';
            kiInputId = 'headingKiInput';
            kdInputId = 'headingKdInput';
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
