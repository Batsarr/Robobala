// Central helper namespace to avoid duplicate global functions. Safe to include in both dev and prod.
(function () {
    window.RB = window.RB || {};
    window.RB.helpers = window.RB.helpers || {};

    if (!window.RB.helpers.delay) {
        window.RB.helpers.delay = function (ms) {
            return new Promise((resolve) => setTimeout(resolve, ms));
        };
    }

    // Expose a global delay function if not already present (backwards compatibility)
    if (typeof window.delay === 'undefined') {
        window.delay = function (ms) {
            return window.RB.helpers.delay(ms);
        };
    }
})();
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

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AppStore, appStore };
}
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

// Export classes
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CommunicationLayer, BLECommunication, MockCommunication };
}
// Central path visualization module
(function () {
    window.RB = window.RB || {};
    window.RB.path = window.RB.path || {};

    const P = window.RB.path;

    P.CM_PER_PIXEL = 1.0;
    P.pathCanvas = null;
    P.pathCtx = null;
    P.robotPathX = 0;
    P.robotPathY = 0;
    P.robotPathHeading = 0;
    P.plannedPath = [];
    P.actualPath = [];

    P.initPathVisualization = function initPathVisualization() {
        P.pathCanvas = document.getElementById('pathCanvas');
        if (!P.pathCanvas) return;
        P.pathCtx = P.pathCanvas.getContext('2d');
        P.pathCanvas.width = P.pathCanvas.clientWidth;
        P.pathCanvas.height = P.pathCanvas.clientHeight;
        P.resetPathVisualization();
    };

    P.drawPathVisualization = function drawPathVisualization() {
        if (!P.pathCtx) return;
        P.pathCtx.clearRect(0, 0, P.pathCanvas.width, P.pathCanvas.height);
        const drawPath = (path, color) => {
            P.pathCtx.strokeStyle = color;
            P.pathCtx.lineWidth = 2;
            P.pathCtx.beginPath();
            if (path.length > 0) {
                P.pathCtx.moveTo(path[0].x, path[0].y);
                path.forEach(p => P.pathCtx.lineTo(p.x, p.y));
            }
            P.pathCtx.stroke();
        };
        drawPath(P.plannedPath, '#61dafb');
        drawPath(P.actualPath, '#a2f279');
        if (P.actualPath.length > 0) {
            const lastPos = P.actualPath[P.actualPath.length - 1];
            P.pathCtx.fillStyle = '#ff6347';
            P.pathCtx.beginPath();
            P.pathCtx.arc(lastPos.x, lastPos.y, 4, 0, Math.PI * 2);
            P.pathCtx.fill();
        }
    };

    P.addPlannedPathSegment = function addPlannedPathSegment(type, value) {
        let { x, y, heading } = P.plannedPath.length > 0 ? P.plannedPath[P.plannedPath.length - 1] : { x: P.robotPathX, y: P.robotPathY, heading: P.robotPathHeading };
        let newX = x, newY = y, newHeading = heading;
        const angleRad = (heading - 90) * Math.PI / 180;
        if (type === 'move_fwd') {
            newX += Math.cos(angleRad) * value / P.CM_PER_PIXEL;
            newY += Math.sin(angleRad) * value / P.CM_PER_PIXEL;
        } else if (type === 'move_bwd') {
            newX -= Math.cos(angleRad) * value / P.CM_PER_PIXEL;
            newY -= Math.sin(angleRad) * value / P.CM_PER_PIXEL;
        } else if (type === 'rotate_r') {
            newHeading += value;
        } else if (type === 'rotate_l') {
            newHeading -= value;
        }
        P.plannedPath.push({ x: newX, y: newY, heading: newHeading });
        P.drawPathVisualization();
    };

    P.updateActualPath = function updateActualPath(data) {
        if (data.pos_x_cm !== undefined && data.pos_y_cm !== undefined && data.yaw !== undefined) {
            const actualX = P.robotPathX + (data.pos_x_cm / P.CM_PER_PIXEL);
            const actualY = P.robotPathY - (data.pos_y_cm / P.CM_PER_PIXEL);
            P.actualPath.push({ x: actualX, y: actualY, heading: data.yaw });
            P.drawPathVisualization();
        }
    };

    P.resetPathVisualization = function resetPathVisualization() {
        if (!P.pathCanvas) return;
        P.robotPathX = P.pathCanvas.width / 2;
        P.robotPathY = P.pathCanvas.height / 2;
        P.robotPathHeading = 0;
        P.plannedPath = [{ x: P.robotPathX, y: P.robotPathY, heading: P.robotPathHeading }];
        P.actualPath = [{ x: P.robotPathX, y: P.robotPathY, heading: P.robotPathHeading }];
        const ReportPanel = document.getElementById('sequenceReportPanel');
        if (ReportPanel) { ReportPanel.style.display = 'none'; }
        P.drawPathVisualization();
    };

    // Backwards-compatible global wrappers (do not re-declare existing globals)
    if (typeof window.initPathVisualization === 'undefined') window.initPathVisualization = function () { P.initPathVisualization(); };
    if (typeof window.drawPathVisualization === 'undefined') window.drawPathVisualization = function () { P.drawPathVisualization(); };
    if (typeof window.addPlannedPathSegment === 'undefined') window.addPlannedPathSegment = function (type, value) { P.addPlannedPathSegment(type, value); };
    if (typeof window.updateActualPath === 'undefined') window.updateActualPath = function (data) { P.updateActualPath(data); };
    if (typeof window.resetPathVisualization === 'undefined') window.resetPathVisualization = function () { P.resetPathVisualization(); };

})();
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
// WARNING: This file is the bundled monolithic build containing all UI modules.
// Do NOT include other modular scripts (e.g., state_manager.js, ui_components.js,
// communication_layer.js, tuning_algorithms.js) together with this file in
// the same HTML page. Combining the bundled and modular files will result in
// duplicate global declarations and cause runtime SyntaxErrors such as
// "Uncaught SyntaxError: redeclaration of let ...".
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
    'joystickSensitivityInput': 'joystick_sensitivity', 'expoJoystickInput': 'expo_joystick', 'maxSpeedJoystickInput': 'max_speed_joystick', 'maxAccelJoystickInput': 'max_accel_joystick', 'turnFactorInput': 'turn_factor', 'joystickDeadzoneInput': 'joystick_deadzone', 'wheelDiameterInput': 'wheel_diameter_cm', 'trackWidthInput': 'track_width_cm', 'encoderPprInput': 'encoder_ppr', 'minPwmLeftFwdInput': 'min_pwm_left_fwd', 'minPwmLeftBwdInput': 'min_pwm_left_bwd', 'minPwmRightFwdInput': 'min_pwm_right_fwd', 'minPwmRightBwdInput': 'min_pwm_right_bwd',
    // Auto-tuning parameters (safety, space, weights, GA, PSO)
    'safetyMaxAngle': 'safety_max_angle', 'safetyMaxSpeed': 'safety_max_speed', 'safetyMaxPwm': 'safety_max_pwm',
    'ga-kp-min': 'space_kp_min', 'ga-kp-max': 'space_kp_max', 'ga-ki-min': 'space_ki_min', 'ga-ki-max': 'space_ki_max', 'ga-kd-min': 'space_kd_min', 'ga-kd-max': 'space_kd_max',
    'include-ki-checkbox': 'search_ki',
    'disableMagnetometerSwitch': 'disable_magnetometer',
    'ga-weight-itae': 'weights_itae', 'ga-weight-overshoot': 'weights_overshoot', 'ga-weight-control-effort': 'weights_control_effort',
    'ga-generations': 'ga_generations', 'ga-population': 'ga_population', 'ga-mutation-rate': 'ga_mutation_rate', 'ga-elitism': 'ga_elitism', 'ga-adaptive': 'ga_adaptive', 'ga-convergence-check': 'ga_convergence_check',
    'pso-iterations': 'pso_iterations', 'pso-particles': 'pso_particles', 'pso-inertia': 'pso_inertia', 'pso-adaptive-inertia': 'pso_adaptive_inertia', 'pso-velocity-clamp': 'pso_velocity_clamp', 'pso-neighborhood': 'pso_neighborhood',
    // Madgwick filter parameters
    'useMadgwickFilterInput': 'use_madgwick_filter', 'madgwickBetaInput': 'madgwick_beta', 'madgwickZetaInput': 'madgwick_zeta'
};
// Map toggle for disabling magnetometer (now included in parameterMapping)

// Backward compatibility: keep these for any direct references
let bleDevice, rxCharacteristic, txCharacteristic;
let bleBuffer = '', bleMessageQueue = [], isSendingBleMessage = false; const bleChunks = new Map();
const BLE_SEND_INTERVAL = 20;

let joystickCenter, joystickRadius, knobRadius, isDragging = false, lastJoystickSendTime = 0;
const JOYSTICK_SEND_INTERVAL = 20;
let currentJoystickX = 0, currentJoystickY = 0;

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
// Prosty model trymów:
//  - firmware trzyma jedną wartość trim_angle / roll_trim (w stopniach)
//  - UI pokazuje dokładnie tę wartość, a kąt liczymy z kwaternionu + trim
//  - przycisk "Ustaw 0" wylicza nowy trim tak, aby aktualna pozycja dawała 0°.
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

    // Init fitness modal
    if (typeof initFitnessModal === 'function') initFitnessModal();
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
// UWAGA: Kwaternion z telemetrii ma już zastosowane trymy (firmware wysyła q_final),
// więc aby uzyskać surowy fizyczny kąt przed trybem, odejmujemy aktualny trim.
function setPitchZero() {
    if (!window.telemetryData) {
        addLogMessage('[UI] Brak danych telemetrii (pitch).', 'warn');
        return;
    }
    // Oblicz skorygowany kąt bezpośrednio z kwaternionu (q_final z firmware)
    let correctedPitch = Number(window.telemetryData.pitch);
    if (typeof correctedPitch !== 'number' || isNaN(correctedPitch)) {
        if (typeof window.telemetryData.qw === 'number') {
            const eul = computeEulerFromQuaternion(window.telemetryData.qw, window.telemetryData.qx, window.telemetryData.qy, window.telemetryData.qz);
            correctedPitch = eul ? eul.pitch : 0;
        } else {
            correctedPitch = 0;
        }
    }
    const currentTrim = Number(window.telemetryData.trim_angle || 0);
    // Zaokrąglij lekko, by uniknąć flipa znaku przy ±0.00x
    correctedPitch = Math.round(correctedPitch * 100) / 100;
    const rawPitch = correctedPitch - currentTrim; // surowy kąt przed trimem
    if (isNaN(rawPitch)) {
        addLogMessage('[UI] Nieprawidlowy odczyt pitch.', 'error');
        return;
    }
    const delta = -rawPitch; // obróć montaż o -pitch aby uzyskać 0°
    sendBleMessage({ type: 'adjust_zero', value: delta });
    const val = document.getElementById('angleVal');
    if (val) val.textContent = '0.0 °';
    pitchHistory.push(0);
    if (pitchHistory.length > HISTORY_LENGTH) pitchHistory.shift();
    updateChart({ pitch: 0 });
    addLogMessage(`[UI] Punkt 0 (Pitch) ustawiony. Obrót montażu Y+=${delta.toFixed(2)}° (persist).`, 'success');
}

function setRollZero() {
    if (!window.telemetryData) {
        addLogMessage('[UI] Brak danych telemetrii (roll).', 'warn');
        return;
    }
    let correctedRoll = Number(window.telemetryData.roll);
    if (typeof correctedRoll !== 'number' || isNaN(correctedRoll)) {
        if (typeof window.telemetryData.qw === 'number') {
            const eul = computeEulerFromQuaternion(window.telemetryData.qw, window.telemetryData.qx, window.telemetryData.qy, window.telemetryData.qz);
            correctedRoll = eul ? eul.roll : 0;
        } else {
            correctedRoll = 0;
        }
    }
    const currentRollTrim = Number(window.telemetryData.roll_trim || 0);
    correctedRoll = Math.round(correctedRoll * 100) / 100;
    const rawRoll = correctedRoll - currentRollTrim;
    if (isNaN(rawRoll)) {
        addLogMessage('[UI] Nieprawidlowy odczyt roll.', 'error');
        return;
    }
    const delta = -rawRoll;
    sendBleMessage({ type: 'adjust_roll_trim', value: delta });
    const val = document.getElementById('rollVal');
    if (val) val.textContent = '0.0 °';
    updateChart({ roll: 0 });
    addLogMessage(`[UI] Punkt 0 (Roll) ustawiony. Obrót montażu X+=${delta.toFixed(2)}° (persist).`, 'success');
}

function adjustTrim(axis, delta) {
    // axis: 'pitch' or 'roll'
    // delta: number like 0.1 or -0.01
    sendBleMessage({ type: axis === 'pitch' ? 'adjust_zero' : 'adjust_roll_trim', value: delta });
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
        if (['run_metrics_test', 'run_relay_test', 'cancel_test', 'request_full_config', 'set_param', 'execute_move', 'execute_rotate', 'command_stop'].includes(message.type)) {
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
        case 'test_result':
        case 'metrics_result':
            // Normalize metrics data structure for fitness evaluation
            // Ensure metrics are at top level for tuning algorithms
            if (data.metrics) {
                data.itae = data.itae ?? data.metrics.itae;
                data.overshoot = data.overshoot ?? data.metrics.overshoot;
                data.rise_time = data.rise_time ?? data.metrics.rise_time;
                data.settling_time = data.settling_time ?? data.metrics.settling_time;
                data.steady_state_error = data.steady_state_error ?? data.metrics.steady_state_error;
            }
            if (data.params) {
                data.kp = data.kp ?? data.params.kp;
                data.ki = data.ki ?? data.params.ki;
                data.kd = data.kd ?? data.params.kd;
            }
            handleDynamicTestResult(data);
            break;
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
// Export as window property so that modular scripts can safely push into the same array
window.tuningHistory = window.tuningHistory || [];
const tuningHistory = window.tuningHistory;
function refreshRecentList() {
    const box = document.getElementById('recent-results-list');
    if (!box) return;
    const last5 = tuningHistory.slice(-5).reverse();
    if (!last5.length) { box.textContent = 'Brak danych.'; return; }
    // Render as readable blocks (mobile friendly) with Apply actions
    box.innerHTML = last5.map((r) => {
        const itae = (r.itae !== undefined && !isNaN(r.itae)) ? r.itae.toFixed(2) : '---';
        const ov = (r.overshoot !== undefined && !isNaN(r.overshoot)) ? r.overshoot.toFixed(2) : '---';
        const fitness = (r.fitness !== undefined && isFinite(r.fitness)) ? r.fitness.toFixed(4) : '---';
        return `
            <div class="result-entry" data-idx="${r.idx}">
                <div class="result-header">#${r.idx} · ${r.testType || 'test'} · Fitness: ${fitness}</div>
                <div class="result-params">Kp: ${r.kp.toFixed(3)}, Ki: ${r.ki.toFixed(3)}, Kd: ${r.kd.toFixed(3)}</div>
                <div class="result-metrics">ITAE: ${itae} · Overshoot: ${ov}${r.testType === 'metrics_test' ? '°' : '%'}</div>
                <div style="margin-top:6px;"><button class="btn-small" data-apply-idx="${r.idx}">Zastosuj</button></div>
            </div>`;
    }).join('');
    // Attach handlers for apply buttons
    box.querySelectorAll('button[data-apply-idx]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = parseInt(btn.getAttribute('data-apply-idx'));
            const r = tuningHistory.find(t => t.idx === idx);
            if (!r) return;
            applyParameters(r.kp, r.ki, r.kd);
            addLogMessage(`[UI] Zastosowano parametry z historii (#${idx})`, 'info');
        });
    });
    // Auto-scroll to show most recent entries (friendly UX)
    box.scrollTop = box.scrollHeight;
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
// Handler for server-side 'tuning_result' message (and other session results)
function handleTunerResult(data) {
    if (!data) return;
    const kp = (typeof data.kp === 'number') ? data.kp : (data.params && data.params.kp) || 0;
    const ki = (typeof data.ki === 'number') ? data.ki : (data.params && data.params.ki) || 0;
    const kd = (typeof data.kd === 'number') ? data.kd : (data.params && data.params.kd) || 0;
    const idx = data.idx || (tuningHistory.length + 1);
    const fitness = data.fitness ?? (data.metrics && data.metrics.fitness) ?? Infinity;
    const itae = data.itae ?? (data.metrics && data.metrics.itae);
    const overshoot = data.overshoot ?? (data.metrics && data.metrics.overshoot);
    const testType = data.test_type || data.testType || (data.metrics && data.metrics.type) || 'metrics_test';

    try {
        tuningHistory.push({ idx, kp, ki, kd, fitness, itae, overshoot, testType });
        if (typeof refreshRecentList === 'function') refreshRecentList();
        if (typeof addTestToResultsTable === 'function') {
            try { addTestToResultsTable(idx, { kp, ki, kd }, fitness, itae, overshoot, testType); } catch (_) { }
        }
    } catch (e) {
        console.error('[UI] handleTunerResult error:', e);
    }
}

// Handler for iteration updates from tuners (update progress display & best actor)
function handleTuningIterationResult(data) {
    if (!data) return;
    const current = data.current ?? data.iteration ?? null;
    const total = data.total ?? data.iterations ?? null;
    const best = data.best ?? data.best_found;
    if (current !== null) document.getElementById('current-iteration').textContent = String(current);
    if (total !== null) document.getElementById('total-iterations').textContent = String(total);
    if (best && typeof best.kp === 'number') updateBestDisplay(best);
    try { if (typeof refreshRecentList === 'function') refreshRecentList(); } catch (e) { }
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
    if (d.ta !== undefined && d.trim_angle === undefined) d.trim_angle = d.ta; // legacy alias
    if (d.rt !== undefined && d.roll_trim === undefined) d.roll_trim = d.rt;   // legacy alias
    if (d.trim_angle === undefined) d.trim_angle = 0.0;
    if (d.roll_trim === undefined) d.roll_trim = 0.0;
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
        // Firmware już zastosował trymy do kwaternionu; UI używa bezpośrednio skorygowanego kąta.
        const correctedPitch = (data.pitch !== undefined) ? data.pitch : (typeof data.raw_pitch === 'number' ? data.raw_pitch : 0);
        document.getElementById('angleVal').textContent = correctedPitch.toFixed(1) + ' \u00B0';
        const vizPitchVal = (data.viz_pitch !== undefined) ? data.viz_pitch : correctedPitch || 0;
        document.getElementById('robot3d-pitch').textContent = vizPitchVal.toFixed(1) + '°';
        pitchHistory.push(correctedPitch);
        if (pitchHistory.length > HISTORY_LENGTH) pitchHistory.shift();
    }
    if (typeof data.raw_roll === 'number' || typeof data.roll === 'number') {
        const correctedRoll = (data.roll !== undefined) ? data.roll : (typeof data.raw_roll === 'number' ? data.raw_roll : 0);
        const vizRollVal = (data.viz_roll !== undefined) ? data.viz_roll : correctedRoll || 0;
        document.getElementById('robot3d-roll').textContent = vizRollVal.toFixed(1) + '°';
        document.getElementById('rollVal').textContent = correctedRoll.toFixed(1) + ' \u00B0';
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
// Path visualization is centralized in RB.path (see js/path_visualization.js). Backwards-compatible globals are available (initPathVisualization, drawPathVisualization, addPlannedPathSegment, updateActualPath, resetPathVisualization)
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
    // If Bayesian tab is selected, ensure ml5 is available
    if (method === 'bayesian') {
        ensureTuningDependencies('bayesian').then(() => { try { addLogMessage('[UI] Bayesian support (ml5) zaladowany.', 'info'); } catch (_) { } }).catch(err => { try { addLogMessage('[UI] Nie mozna zaladowac ml5: ' + err.message, 'warn'); } catch (_) { } });
    }
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

// Ensure algorithm classes (GA/PSO/ZN/Bayesian) and optional ML dependencies (ml5) are available.
// Loads scripts dynamically when needed so the production `main.js` can be used while keeping
// modular development files separate.
function ensureTuningDependencies(method) {
    return new Promise(async (resolve, reject) => {
        // If we've already flagged the algorithms as loaded (inlined or previously set), only ensure ml5 if Bayesian is requested
        if (window.__tuning_algos_loaded) {
            if (method === 'bayesian' && typeof window.ml5 === 'undefined') {
                try { await loadMl5(); resolve(true); } catch (e) { reject(e); }
                return;
            }
            resolve(true);
            return;
        }

        // When the code is inlined in main.js we simply mark them as loaded and optionally load ml5
        window.__tuning_algos_loaded = true;
        if (method === 'bayesian' && typeof window.ml5 === 'undefined') {
            try { await loadMl5(); resolve(true); } catch (e) { reject(e); }
            return;
        }
        resolve(true);
    });
}

function loadMl5() {
    return new Promise((resolve, reject) => {
        if (typeof window.ml5 !== 'undefined') return resolve(true);
        const src = 'https://unpkg.com/ml5@0.6.1/dist/ml5.min.js';
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        let handled = false;
        const to = setTimeout(() => { if (!handled) { handled = true; reject(new Error('Timed out loading ml5')); } }, 15000);
        script.onload = () => { clearTimeout(to); handled = true; console.info('[UI] ml5 loaded'); resolve(true); };
        script.onerror = (e) => { clearTimeout(to); if (!handled) { handled = true; reject(new Error('Failed to load ml5')); } };
        document.head.appendChild(script);
    });
}

// Inline tuning algorithms (GA/PSO/ZN/Bayesian) from tuning_algorithms.js
// Guard - do not inline multiple times
if (!window.__tuning_algos_inlined) {
    window.__tuning_algos_inlined = true;

    // ========================================================================
    // Minimal tuning helpers (moved from tuning_algorithms.js) - keep these
    // available globally so we can reintroduce algorithm classes safely.
    // ========================================================================

    // Global tuning session management
    let fitnessChartData = [];

    // Baseline PID parameters (captured from UI)
    let baselinePID = { kp: 0, ki: 0, kd: 0 };
    const PARAMETER_SETTLING_TIME_MS = 300;

    function showNotification(message) {
        if (typeof addLogMessage === 'function') {
            addLogMessage(`[Tuning] ${message}`, 'info');
        } else {
            console.log(`[Notification] ${message}`);
        }
    }

    function mean(arr) { if (!Array.isArray(arr) || arr.length === 0) return 0; return arr.reduce((a, b) => a + b, 0) / arr.length; }

    function computeTestTimeout() {
        const trialInput = document.getElementById('tuningTrialDurationInput');
        let trialMs = 2000;
        if (trialInput) {
            const v = parseInt(trialInput.value, 10);
            if (!isNaN(v)) trialMs = v;
        }
        let t = trialMs + 1500;
        if (t < 3000) t = 3000;
        if (t > 15000) t = 15000;
        return t;
    }

    function getPIDParamKeys(loop) {
        let suffix = '';
        if (loop === 'balance') suffix = 'b';
        else if (loop === 'speed') suffix = 's';
        else if (loop === 'position') suffix = 'p';
        else suffix = 'b';
        return { kp: `kp_${suffix}`, ki: `ki_${suffix}`, kd: `kd_${suffix}` };
    }

    async function runTelemetryBasedTest(kp, ki, kd) {
        return new Promise((resolve, reject) => {
            const testStartTime = Date.now();
            const telemetrySamples = [];
            let resolved = false;

            const trialInput = document.getElementById('tuningTrialDurationInput');
            let testDurationMs = 2000;
            if (trialInput) {
                const v = parseInt(trialInput.value, 10);
                if (!isNaN(v) && v > 0) testDurationMs = v;
            }

            const settlingTimeMs = PARAMETER_SETTLING_TIME_MS;
            const totalDurationMs = testDurationMs + settlingTimeMs;
            const timeoutMs = totalDurationMs * 2;

            let timeoutHandle = setTimeout(() => {
                if (!resolved) { cleanup(); resolved = true; reject(new Error('test_timeout')); }
            }, timeoutMs);

            function cleanup() { window.removeEventListener('ble_message', telemetryHandler); clearTimeout(timeoutHandle); }

            function telemetryHandler(evt) {
                const d = evt.detail || evt;
                if (d.type !== 'telemetry') return;
                const elapsedTime = Date.now() - testStartTime;
                if (elapsedTime < settlingTimeMs) return;
                const sample = { timestamp: elapsedTime - settlingTimeMs, pitch: Number(d.pitch) || 0, roll: Number(d.roll) || 0, speed: Number(d.speed || d.sp) || 0, loopTime: Number(d.loop_time || d.lt) || 0 };
                telemetrySamples.push(sample);
                if (telemetrySamples.length % 12 === 0 && typeof updateCurrentTelemetryPlot === 'function') { try { updateCurrentTelemetryPlot(telemetrySamples); } catch (_) { } }
                if (elapsedTime >= totalDurationMs) finishTest();
            }

            function finishTest() {
                if (resolved) return; resolved = true; cleanup();
                if (telemetrySamples.length < 5) { resolve({ fitness: Infinity, itae: 0, overshoot: 0, steady_state_error: 0, raw: { samples: telemetrySamples.length, reason: 'insufficient_data' } }); return; }
                const metrics = calculateFitnessFromTelemetry(telemetrySamples);
                resolve(metrics);
            }

            window.addEventListener('ble_message', telemetryHandler);
            const loop = document.getElementById('tuning-loop-selector')?.value || 'balance';
            const paramKeys = getPIDParamKeys(loop);
            sendBleCommand('set_param', { key: paramKeys.kp, value: kp });
            sendBleCommand('set_param', { key: paramKeys.ki, value: ki });
            sendBleCommand('set_param', { key: paramKeys.kd, value: kd });
            try { addLogMessage(`[TelemetryTest] Started test with Kp=${kp.toFixed(3)}, Ki=${ki.toFixed(3)}, Kd=${kd.toFixed(3)}, duration=${testDurationMs}ms`, 'info'); } catch (_) { }
        });
    }

    function calculateFitnessFromTelemetry(samples) {
        if (!samples || samples.length === 0) return { fitness: Infinity, itae: 0, overshoot: 0, steady_state_error: 0, raw: { samples: 0 } };
        const targetAngle = 0; let itae = 0;
        for (let i = 0; i < samples.length; i++) { const error = Math.abs(samples[i].pitch - targetAngle); const timeWeight = samples[i].timestamp / 1000; itae += error * timeWeight; }
        itae = itae / samples.length;
        let maxDeviation = 0; for (let i = 0; i < samples.length; i++) { const deviation = Math.abs(samples[i].pitch - targetAngle); if (deviation > maxDeviation) maxDeviation = deviation; }
        const overshoot = maxDeviation;
        const steadyStateStart = Math.floor(samples.length * 0.7); let sseSum = 0; let sseCount = 0;
        for (let i = steadyStateStart; i < samples.length; i++) { sseSum += Math.abs(samples[i].pitch - targetAngle); sseCount++; }
        const steadyStateError = sseCount > 0 ? (sseSum / sseCount) : 0;
        let oscillationPenalty = 0;
        if (samples.length > 3) { let signChanges = 0; for (let i = 1; i < samples.length; i++) { const prevError = samples[i - 1].pitch - targetAngle; const currError = samples[i].pitch - targetAngle; if ((prevError > 0 && currError < 0) || (prevError < 0 && currError > 0)) signChanges++; } const oscillationRate = signChanges / samples.length; if (oscillationRate > 0.3) oscillationPenalty = oscillationRate * 20; }

        const weightsState = appStore.getState('tuning.weights') || { itae: 50, overshoot: 30, sse: 20 };
        const totalPoints = (weightsState.itae || 0) + (weightsState.overshoot || 0) + (weightsState.sse || 0) || 100;
        const wItae = (weightsState.itae || 0) / totalPoints; const wOvershoot = (weightsState.overshoot || 0) / totalPoints; const wSse = (weightsState.sse || 0) / totalPoints;
        const compItae = itae; const compOvershoot = overshoot * 10; const compSse = steadyStateError * 5;
        const weighted = wItae * compItae + wOvershoot * compOvershoot + wSse * compSse; const finalFitness = weighted + oscillationPenalty;
        try { addLogMessage(`[TelemetryTest] Calculated fitness: ITAE=${itae.toFixed(2)}, Overshoot=${overshoot.toFixed(2)}°, SSE=${steadyStateError.toFixed(2)}°, Fitness=${finalFitness.toFixed(2)} (weights:${wItae.toFixed(2)},${wOvershoot.toFixed(2)},${wSse.toFixed(2)})`, 'info'); } catch (_) { }
        return { fitness: finalFitness, itae: itae, overshoot: overshoot, steady_state_error: steadyStateError, raw: { samples: samples.length, oscillationPenalty: oscillationPenalty } };
    }

    function updateBestDisplay(params) {
        const elKp = document.getElementById('best-kp'); const elKi = document.getElementById('best-ki'); const elKd = document.getElementById('best-kd'); const elF = document.getElementById('best-fitness');
        if (elKp) elKp.textContent = params.kp.toFixed(3); if (elKi) elKi.textContent = params.ki.toFixed(3); if (elKd) elKd.textContent = params.kd.toFixed(3);
        if (elF && params.fitness !== undefined && params.fitness !== Infinity) elF.textContent = params.fitness.toFixed(4);
        const applyBtn = document.getElementById('apply-best-btn'); if (applyBtn) applyBtn.disabled = false;
    }

    function updateProgressDisplay(current, total, bestFitness) {
        const itEl = document.getElementById('current-iteration'); const totEl = document.getElementById('total-iterations'); const fEl = document.getElementById('best-fitness');
        if (itEl) itEl.textContent = current; if (totEl) totEl.textContent = total; if (fEl && bestFitness !== undefined && bestFitness !== Infinity) fEl.textContent = bestFitness.toFixed(4);
        fitnessChartData.push({ x: current, y: bestFitness }); try { updateFitnessChart(); } catch (_) { }
    }

    function updateFitnessChart() {
        const canvas = document.getElementById('fitness-chart'); if (!canvas) return; const ctx = canvas.getContext('2d'); if (!ctx) return; ctx.clearRect(0, 0, canvas.width, canvas.height); if (!Array.isArray(fitnessChartData) || fitnessChartData.length === 0) return; const minFitness = Math.min(...fitnessChartData.map(d => d.y)); const maxFitness = Math.max(...fitnessChartData.map(d => d.y)); const maxIteration = Math.max(...fitnessChartData.map(d => d.x)); const padding = 40; const width = canvas.width - 2 * padding; const height = canvas.height - 2 * padding; ctx.strokeStyle = '#61dafb'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(padding, padding); ctx.lineTo(padding, canvas.height - padding); ctx.lineTo(canvas.width - padding, canvas.height - padding); ctx.stroke(); ctx.fillStyle = '#ffffff'; ctx.font = '12px Arial'; ctx.fillText('Fitness', 5, padding); ctx.fillText('Iteracja', canvas.width - padding, canvas.height - padding + 20); ctx.strokeStyle = '#a2f279'; ctx.lineWidth = 2; ctx.beginPath(); fitnessChartData.forEach((p, i) => { const x = padding + (p.x / (maxIteration || 1)) * width; const y = canvas.height - padding - ((p.y - minFitness) / ((maxFitness - minFitness) || 0.0001)) * height; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }); ctx.stroke(); ctx.fillStyle = '#a2f279'; fitnessChartData.forEach((p) => { const x = padding + (p.x / (maxIteration || 1)) * width; const y = canvas.height - padding - ((p.y - minFitness) / ((maxFitness - minFitness) || 0.0001)) * height; ctx.beginPath(); ctx.arc(x, y, 3, 0, 2 * Math.PI); ctx.fill(); });
    }

    function addTestToResultsTable(testNum, params, fitness, itae, overshoot, testType = 'metrics_test', meta = {}) {
        const tbody = document.getElementById('results-table-body'); try { if (Array.isArray(tuningHistory)) { tuningHistory.push({ idx: testNum, kp: params.kp, ki: params.ki, kd: params.kd, fitness, itae, overshoot, testType }); if (typeof refreshRecentList === 'function') refreshRecentList(); } } catch (_) { }
        if (!tbody) return; const metaText = (meta && meta.gen && meta.individualIdx) ? ` (Gen ${meta.gen}/${meta.totalGen}, Osobnik ${meta.individualIdx}/${meta.pop})` : ''; const row = tbody.insertRow(0); row.innerHTML = `<td>${testNum}${metaText}</td><td>${params.kp.toFixed(3)}</td><td>${params.ki.toFixed(3)}</td><td>${params.kd.toFixed(3)}</td><td>${(fitness === Infinity || isNaN(fitness)) ? '---' : fitness.toFixed(4)}</td><td>${(isNaN(itae) ? '---' : itae.toFixed(2))}</td><td>${isNaN(overshoot) ? '---' : overshoot.toFixed(2)}${(testType === 'metrics_test') ? '°' : '%'}</td><td><button onclick="applyParameters(${params.kp}, ${params.ki}, ${params.kd})" class="btn-small">Zastosuj</button></td>`;
        const method = AppState.activeTuningMethod; let blockContainer; if (method && method.startsWith('ga')) blockContainer = document.getElementById('ga-results-blocks'); else if (method && method.startsWith('pso')) blockContainer = document.getElementById('pso-results-blocks'); if (blockContainer) { const block = document.createElement('div'); block.className = 'result-entry'; const header = document.createElement('div'); header.className = 'result-header'; const genInfo = (meta.gen && meta.totalGen) ? `Gen ${meta.gen}/${meta.totalGen}` : ''; const indInfo = (meta.individualIdx && meta.pop) ? ` · Osobnik ${meta.individualIdx}/${meta.pop}` : ''; header.innerHTML = `<strong>Wynik #${testNum} ${genInfo}${indInfo}:</strong> Fitness = ${(fitness !== undefined && fitness !== Infinity) ? fitness.toFixed(4) : '---'}`; const paramsDiv = document.createElement('div'); paramsDiv.className = 'result-params'; paramsDiv.textContent = `Kp: ${params.kp !== undefined ? params.kp.toFixed(4) : '---'}, Ki: ${params.ki !== undefined ? params.ki.toFixed(4) : '---'}, Kd: ${params.kd !== undefined ? params.kd.toFixed(4) : '---'}`; const metricsDiv = document.createElement('div'); metricsDiv.className = 'result-metrics'; metricsDiv.textContent = `Overshoot: ${overshoot !== undefined ? overshoot.toFixed(2) + '%' : '---'}, ITAE: ${itae !== undefined ? itae.toFixed(2) : '---'}`; const applyBtnBlock = document.createElement('button'); applyBtnBlock.textContent = 'Zastosuj'; applyBtnBlock.className = 'test-btn'; applyBtnBlock.addEventListener('click', () => { applyParameters(params.kp, params.ki, params.kd); addLogMessage('[UI] Zastosowano parametry z historii strojenia.', 'info'); }); block.appendChild(header); block.appendChild(paramsDiv); block.appendChild(metricsDiv); block.appendChild(applyBtnBlock); blockContainer.insertBefore(block, blockContainer.firstChild); }
    }




    // Expose a few helpers globally so the UI and algorithms can call them even if not inlined
    if (typeof window.runTelemetryBasedTest === 'undefined') window.runTelemetryBasedTest = runTelemetryBasedTest;
    if (typeof window.calculateFitnessFromTelemetry === 'undefined') window.calculateFitnessFromTelemetry = calculateFitnessFromTelemetry;
    if (typeof window.addTestToResultsTable === 'undefined') window.addTestToResultsTable = addTestToResultsTable;
    if (typeof window.applyParameters === 'undefined') window.applyParameters = applyParameters;
    if (typeof window.captureBaselinePID === 'undefined') window.captureBaselinePID = captureBaselinePID;
    if (typeof window.sendBaselinePIDToRobot === 'undefined') window.sendBaselinePIDToRobot = sendBaselinePIDToRobot;
}

function applyParameters(kp, ki, kd) {
    const loop = document.getElementById('tuning-loop-selector').value;
    const paramKeys = getPIDParamKeys(loop);
    sendBleCommand('set_param', { key: paramKeys.kp, value: kp }); sendBleCommand('set_param', { key: paramKeys.ki, value: ki }); sendBleCommand('set_param', { key: paramKeys.kd, value: kd }); showNotification(`Zastosowano parametry: Kp=${kp.toFixed(3)}, Ki=${ki.toFixed(3)}, Kd=${kd.toFixed(3)}`);
}

function sendBaselinePIDToRobot() {
    const loop = document.getElementById('tuning-loop-selector')?.value || 'balance';
    const paramKeys = getPIDParamKeys(loop);
    sendBleCommand('set_param', { key: paramKeys.kp, value: baselinePID.kp }); sendBleCommand('set_param', { key: paramKeys.ki, value: baselinePID.ki }); sendBleCommand('set_param', { key: paramKeys.kd, value: baselinePID.kd }); console.log(`[Tuning] Restored baseline PID: Kp=${baselinePID.kp.toFixed(3)}, Ki=${baselinePID.ki.toFixed(3)}, Kd=${baselinePID.kd.toFixed(3)}`);
}

function captureBaselinePID() {
    const loop = document.getElementById('tuning-loop-selector')?.value || 'balance';
    let kpInputId, kiInputId, kdInputId;
    if (loop === 'balance') { kpInputId = 'balanceKpInput'; kiInputId = 'balanceKiInput'; kdInputId = 'balanceKdInput'; } else if (loop === 'speed') { kpInputId = 'speedKpInput'; kiInputId = 'speedKiInput'; kdInputId = 'speedKdInput'; } else if (loop === 'position') { kpInputId = 'positionKpInput'; kiInputId = 'positionKiInput'; kdInputId = 'positionKdInput'; }
    const kpElement = document.getElementById(kpInputId); const kiElement = document.getElementById(kiInputId); const kdElement = document.getElementById(kdInputId);
    if (kpElement && kiElement && kdElement) { baselinePID.kp = parseFloat(kpElement.value) || 0; baselinePID.ki = parseFloat(kiElement.value) || 0; baselinePID.kd = parseFloat(kdElement.value) || 0; console.log(`[Tuning] Captured baseline PID: Kp=${baselinePID.kp.toFixed(3)}, Ki=${baselinePID.ki.toFixed(3)}, Kd=${baselinePID.kd.toFixed(3)}`); } else { console.warn('[Tuning] Could not capture baseline PID - input elements not found'); }

}
// Inserted original, well-formatted GeneticAlgorithm class
class GeneticAlgorithm {
    constructor(config) {
        this.populationSize = config.populationSize || 20;
        this.generations = config.generations || 30;
        this.mutationRate = config.mutationRate || 0.1;
        this.crossoverRate = config.crossoverRate || 0.7;
        this.elitism = config.elitism !== false;
        this.searchSpace = config.searchSpace;

        this.population = [];
        this.generation = 0;
        this.bestIndividual = null;
        this.isRunning = false;
        this.isPaused = false;
        this.testCounter = 0;
        // Debug id to correlate logs for multiple sessions
        this._debugId = (Date.now() >>> 0) & 0xFFFF;
        try { addLogMessage(`[GA:${this._debugId}] Constructed GA session: pop=${this.populationSize} gen=${this.generations}`, 'info'); } catch (e) { console.debug('[GA] log failed', e); }
    }

    initialize() {
        this.population = [];
        for (let i = 0; i < this.populationSize; i++) {
            this.population.push(this.createRandomIndividual());
        }
        // Seed first individual with baseline PID captured from UI (if available)
        if (typeof baselinePID !== 'undefined' && baselinePID && typeof baselinePID.kp === 'number') {
            this.population[0] = { kp: baselinePID.kp, ki: baselinePID.ki, kd: baselinePID.kd, fitness: Infinity };
        }
        this.generation = 0;
        this.testCounter = 0;
        fitnessChartData = [];
        try { addLogMessage(`[GA:${this._debugId}] initialize: population length = ${this.population.length}`, 'info'); } catch (e) { console.debug('GA init log failed', e); }
        // Safety: if population ended up empty for some reason, repopulate with at least 1
        if (!this.population || this.population.length === 0) {
            const fallbackSize = Math.max(1, this.populationSize || 20);
            for (let i = 0; i < fallbackSize; i++) {
                this.population.push(this.createRandomIndividual());
            }
            try { addLogMessage(`[GA:${this._debugId}] Warning: population was empty, repopulated to ${this.population.length}`, 'warn'); } catch (e) { console.debug('GA repopulate warn', e); }
        }
    }

    createRandomIndividual() {
        const includeKi = !!document.getElementById('include-ki-checkbox')?.checked;
        const getRandom = (min, max) => Math.random() * (max - min) + min;
        return {
            kp: getRandom(this.searchSpace.kp_min, this.searchSpace.kp_max),
            ki: includeKi ? getRandom(this.searchSpace.ki_min, this.searchSpace.ki_max) : (baselinePID?.ki ?? ((this.searchSpace.ki_min + this.searchSpace.ki_max) / 2)),
            kd: getRandom(this.searchSpace.kd_min, this.searchSpace.kd_max),
            fitness: Infinity
        };
    }

    async evaluateFitness(individual) {
        this.testCounter++;
        try {
            const res = await runTelemetryBasedTest(individual.kp, individual.ki, individual.kd);
            individual.fitness = res.fitness;
            // Wykres: X = generacja + indeks/populacja
            try { fitnessChartData.push({ x: this.generation + (this.testCounter / Math.max(1, this.population.length)), y: res.fitness }); updateFitnessChart(); } catch (_) { }
            const meta = { gen: this.generation + 1, totalGen: this.generations, individualIdx: this.testCounter, pop: this.population.length };
            addTestToResultsTable(this.testCounter, individual, res.fitness, res.itae, res.overshoot, 'telemetry_test', meta);
            return res.fitness;
        } catch (err) {
            if (err && err.reason === 'interrupted_by_emergency') {
                throw err; // obsługa w runGeneration
            }
            // Penalizuj i kontynuuj
            individual.fitness = Infinity;
            addTestToResultsTable(this.testCounter, individual, Infinity, 0, 0, 'telemetry_test');
            return Infinity;
        }
    }

    async runGeneration() {
        // Evaluate all individuals
        for (let i = 0; i < this.population.length; i++) {
            // Pause handling - keep loop alive while paused
            while (this.isPaused && this.isRunning) {
                await RB.helpers.delay(100);
            }

            if (!this.isRunning) break;

            // Update UI about the currently tested candidate
            try {
                if (typeof updateCurrentTestDisplay === 'function') updateCurrentTestDisplay(this.generation + 1, this.generations, i + 1, this.population.length, this.population[i].kp, this.population[i].ki, this.population[i].kd, this.population[i].fitness);
            } catch (_) { }

            if (this.population[i].fitness === Infinity) {
                try {
                    await this.evaluateFitness(this.population[i], i + 1);
                } catch (error) {
                    console.error('Test failed:', error);
                    // Handle emergency stop - pause and wait for user to resume
                    if (error && error.reason === 'interrupted_by_emergency') {
                        console.log('[GA] Emergency stop detected, entering pause state');
                        this.isPaused = true;
                        sendBaselinePIDToRobot();

                        // Wait for resume
                        while (this.isPaused && this.isRunning) {
                            await RB.helpers.delay(100);
                        }

                        // Retry the same test after resume
                        if (this.isRunning) {
                            console.log('[GA] Retrying interrupted test after resume');
                            i--; // Retry this individual
                            continue;
                        }
                    } else {
                        // Other errors - mark as failed
                        this.population[i].fitness = Infinity;
                    }
                }
            } else {
                // Already has a fitness; refresh UI with its fitness value
                try { if (typeof updateCurrentTestDisplay === 'function') updateCurrentTestDisplay(this.generation + 1, this.generations, i + 1, this.population.length, this.population[i].kp, this.population[i].ki, this.population[i].kd, this.population[i].fitness); } catch (_) { }
            }
        }

        // Sort by fitness
        this.population.sort((a, b) => a.fitness - b.fitness);

        // Update best
        if (!this.bestIndividual || this.population[0].fitness < this.bestIndividual.fitness) {
            this.bestIndividual = { ...this.population[0] };
            updateBestDisplay(this.bestIndividual);
        }

        // Create new population
        const newPopulation = [];

        // Elitism
        if (this.elitism) {
            newPopulation.push({ ...this.population[0] });
        }

        // Selection, crossover, mutation
        while (newPopulation.length < this.populationSize) {
            const parent1 = this.tournamentSelection();
            const parent2 = this.tournamentSelection();

            let offspring;
            if (Math.random() < this.crossoverRate) {
                offspring = this.crossover(parent1, parent2);
            } else {
                offspring = { ...parent1 };
            }

            offspring = this.mutate(offspring);
            offspring.fitness = Infinity;
            newPopulation.push(offspring);
        }

        this.population = newPopulation;
        this.generation++;

        updateProgressDisplay(this.generation, this.generations, this.bestIndividual.fitness);
    }

    tournamentSelection() {
        const tournamentSize = 3;
        let best = null;

        for (let i = 0; i < tournamentSize; i++) {
            const candidate = this.population[Math.floor(Math.random() * this.population.length)];
            if (!best || candidate.fitness < best.fitness) {
                best = candidate;
            }
        }

        return best;
    }

    crossover(parent1, parent2) {
        const alpha = Math.random();
        return {
            kp: alpha * parent1.kp + (1 - alpha) * parent2.kp,
            ki: alpha * parent1.ki + (1 - alpha) * parent2.ki,
            kd: alpha * parent1.kd + (1 - alpha) * parent2.kd,
            fitness: Infinity
        };
    }

    mutate(individual) {
        const mutated = { ...individual };

        if (Math.random() < this.mutationRate) {
            mutated.kp += (Math.random() - 0.5) * (this.searchSpace.kp_max - this.searchSpace.kp_min) * 0.1;
            mutated.kp = Math.max(this.searchSpace.kp_min, Math.min(this.searchSpace.kp_max, mutated.kp));
        }

        const includeKi = !!document.getElementById('include-ki-checkbox')?.checked;
        if (includeKi && Math.random() < this.mutationRate) {
            mutated.ki += (Math.random() - 0.5) * (this.searchSpace.ki_max - this.searchSpace.ki_min) * 0.1;
            mutated.ki = Math.max(this.searchSpace.ki_min, Math.min(this.searchSpace.ki_max, mutated.ki));
        }

        if (Math.random() < this.mutationRate) {
            mutated.kd += (Math.random() - 0.5) * (this.searchSpace.kd_max - this.searchSpace.kd_min) * 0.1;
            mutated.kd = Math.max(this.searchSpace.kd_min, Math.min(this.searchSpace.kd_max, mutated.kd));
        }

        return mutated;
    }

    async run() {
        this.isRunning = true;
        try {
            this.initialize();
            const progressEl = document.getElementById('tuning-progress-panel');
            if (progressEl) progressEl.style.display = 'block';
            try { addLogMessage(`[GA:${this._debugId}] run() started: generations=${this.generations} population=${this.population.length}`, 'info'); } catch (e) { console.debug('[GA] run start log failed', e); }

            while (this.generation < this.generations && this.isRunning) {
                if (!this.isPaused) {
                    await this.runGeneration();
                } else {
                    await RB.helpers.delay(100);
                }
            }

            this.isRunning = false;
            // Be defensive: bestIndividual might be null if initialization failed or no population
            try {
                if (this.bestIndividual && typeof this.bestIndividual.fitness === 'number' && isFinite(this.bestIndividual.fitness)) {
                    showNotification(`Optymalizacja GA zakończona! Najlepsze fitness: ${this.bestIndividual.fitness.toFixed(4)}`);
                } else {
                    showNotification(`Optymalizacja GA zakończona: brak wyników`);
                }
            } catch (err) {
                console.error('[GA] showNotification error:', err);
            }
            try { addLogMessage(`[GA:${this._debugId}] run() finished: generation=${this.generation} population=${this.population.length} best=${this.bestIndividual ? JSON.stringify(this.bestIndividual) : 'null'}`, 'info'); } catch (e) { console.debug('[GA] run finish log failed', e); }
        } catch (err) {
            this.isRunning = false;
            console.error(`[GA:${this._debugId}] run() error:`, err);
            try { addLogMessage(`[GA:${this._debugId}] run() error: ${err && err.message ? err.message : String(err)}`, 'error'); } catch (e) { console.debug('[GA] log failed', e); }
            throw err;
        }
    }

    pause() {
        this.isPaused = true;
        setTimeout(() => {
            if (this.isPaused) {
                sendBaselinePIDToRobot();
            }
        }, 100);
    }

    resume() {
        this.isPaused = false;
    }

    stop() {
        this.isRunning = false;
        sendBaselinePIDToRobot();
    }
}

// ========================================================================
// PSO ALGORITHM
// ========================================================================

class ParticleSwarmOptimization {
    constructor(config) {
        this.numParticles = config.numParticles || 20;
        this.iterations = config.iterations || 30;
        this.inertiaWeight = config.inertiaWeight || 0.7;
        this.cognitiveWeight = config.cognitiveWeight || 1.5;
        this.socialWeight = config.socialWeight || 1.5;
        this.searchSpace = config.searchSpace;
        this.particles = []; this.globalBest = null; this.iteration = 0; this.isRunning = false; this.isPaused = false; this.testCounter = 0; this._debugId = (Date.now() >>> 0) & 0xFFFF; try { addLogMessage(`[PSO:${this._debugId}] Constructed PSO: particles=${this.numParticles} iterations=${this.iterations}`, 'info'); } catch (e) { console.debug('[PSO] log failed', e); }
    }

    initialize() { this.particles = []; for (let i = 0; i < this.numParticles; i++) this.particles.push(this.createRandomParticle()); if (typeof baselinePID !== 'undefined' && baselinePID && typeof baselinePID.kp === 'number') this.particles[0] = { position: { kp: baselinePID.kp, ki: baselinePID.ki, kd: baselinePID.kd }, velocity: { kp: 0, ki: 0, kd: 0 }, bestPosition: { kp: baselinePID.kp, ki: baselinePID.ki, kd: baselinePID.kd }, bestFitness: Infinity, fitness: Infinity }; this.globalBest = null; this.iteration = 0; this.testCounter = 0; fitnessChartData = []; }

    createRandomParticle() { const includeKi = !!document.getElementById('include-ki-checkbox')?.checked; const getRandom = (min, max) => Math.random() * (max - min) + min; const position = { kp: getRandom(this.searchSpace.kp_min, this.searchSpace.kp_max), ki: includeKi ? getRandom(this.searchSpace.ki_min, this.searchSpace.ki_max) : (baselinePID?.ki ?? ((this.searchSpace.ki_min + this.searchSpace.ki_max) / 2)), kd: getRandom(this.searchSpace.kd_min, this.searchSpace.kd_max) }; return { position: position, velocity: { kp: 0, ki: 0, kd: 0 }, bestPosition: { ...position }, bestFitness: Infinity, fitness: Infinity }; }

    async evaluateFitness(particle, idx = 0) { this.testCounter++; try { if (typeof updateCurrentTestDisplay === 'function') updateCurrentTestDisplay(this.iteration + 1, this.iterations, idx, this.particles.length, particle.position.kp, particle.position.ki, particle.position.kd, particle.fitness); } catch (_) { } try { const res = await runTelemetryBasedTest(particle.position.kp, particle.position.ki, particle.position.kd); const fitness = res.fitness; particle.fitness = fitness; if (fitness < particle.bestFitness) { particle.bestFitness = fitness; particle.bestPosition = { ...particle.position }; } if (!this.globalBest || fitness < this.globalBest.fitness) { this.globalBest = { position: { ...particle.position }, fitness: fitness }; updateBestDisplay(this.globalBest.position); } const meta = { gen: this.iteration + 1, totalGen: this.iterations, individualIdx: idx, pop: this.particles.length }; try { fitnessChartData.push({ x: this.iteration + (idx / Math.max(1, this.particles.length)), y: fitness }); updateFitnessChart(); } catch (_) { } addTestToResultsTable(this.testCounter, particle.position, fitness, res.itae, res.overshoot, 'telemetry_test', meta); return fitness; } catch (error) { console.error('[PSO] Test failed:', error); particle.fitness = Infinity; addTestToResultsTable(this.testCounter, particle.position, Infinity, 0, 0, 'telemetry_test'); throw error; } }

    async runIteration() { for (let i = 0; i < this.particles.length; i++) { if (this.isPaused) { await RB.helpers.delay(100); i--; continue; } if (!this.isRunning) break; try { if (typeof updateCurrentTestDisplay === 'function') updateCurrentTestDisplay(this.iteration + 1, this.iterations, i + 1, this.particles.length, this.particles[i].position.kp, this.particles[i].position.ki, this.particles[i].position.kd, this.particles[i].fitness); await this.evaluateFitness(this.particles[i], i + 1); } catch (error) { console.error('Test failed:', error); if (error.reason === 'interrupted_by_emergency') { console.log('[PSO] Emergency stop detected, entering pause state'); this.isPaused = true; sendBaselinePIDToRobot(); while (this.isPaused && this.isRunning) await RB.helpers.delay(100); if (this.isRunning) { console.log('[PSO] Retrying interrupted test after resume'); i--; continue; } } else { this.particles[i].fitness = Infinity; } } } for (let particle of this.particles) { this.updateVelocity(particle); this.updatePosition(particle); } this.iteration++; updateProgressDisplay(this.iteration, this.iterations, this.globalBest ? this.globalBest.fitness : Infinity); }

    updateVelocity(particle) { const r1 = Math.random(); const r2 = Math.random(); for (let dim of ['kp', 'ki', 'kd']) { const cognitive = this.cognitiveWeight * r1 * (particle.bestPosition[dim] - particle.position[dim]); const social = this.socialWeight * r2 * (this.globalBest.position[dim] - particle.position[dim]); particle.velocity[dim] = this.inertiaWeight * particle.velocity[dim] + cognitive + social; const maxVel = (this.searchSpace[dim + '_max'] - this.searchSpace[dim + '_min']) * 0.2; particle.velocity[dim] = Math.max(-maxVel, Math.min(maxVel, particle.velocity[dim])); } }

    updatePosition(particle) { for (let dim of ['kp', 'ki', 'kd']) { particle.position[dim] += particle.velocity[dim]; particle.position[dim] = Math.max(this.searchSpace[dim + '_min'], Math.min(this.searchSpace[dim + '_max'], particle.position[dim])); } }

    async run() { this.isRunning = true; try { this.initialize(); const progressEl = document.getElementById('tuning-progress-panel'); if (progressEl) progressEl.style.display = 'block'; while (this.iteration < this.iterations && this.isRunning) { if (!this.isPaused) await this.runIteration(); else await RB.helpers.delay(100); } this.isRunning = false; try { if (this.globalBest && typeof this.globalBest.fitness === 'number' && isFinite(this.globalBest.fitness)) showNotification(`Optymalizacja PSO zakończona! Najlepsze fitness: ${this.globalBest.fitness.toFixed(4)}`); else showNotification(`Optymalizacja PSO zakonczona: brak wynikow`); } catch (err) { console.error('[PSO] showNotification error:', err); } try { addLogMessage(`[PSO] run finished: iteration=${this.iteration} particles=${this.particles.length} globalBest=${this.globalBest ? JSON.stringify(this.globalBest) : 'null'}`, 'info'); } catch (e) { console.debug('[PSO] log failed', e); } } catch (err) { this.isRunning = false; console.error('[PSO] run() error:', err); try { addLogMessage(`[PSO] run() error: ${err && err.message ? err.message : String(err)}`, 'error'); } catch (e) { console.debug('[PSO] log failed', e); } throw err; } }

    pause() { this.isPaused = true; setTimeout(() => { if (this.isPaused) sendBaselinePIDToRobot(); }, 100); }
    resume() { this.isPaused = false; }
    stop() { this.isRunning = false; sendBaselinePIDToRobot(); }
}

// ========================================================================
// ZIEGLER-NICHOLS RELAY METHOD
// ========================================================================

class ZieglerNicholsRelay {
    constructor(config) { this.amplitude = config.amplitude || 2.0; this.minCycles = config.minCycles || 3; this.isRunning = false; this.oscillationData = []; this.peaks = []; this.valleys = []; this._debugId = (Date.now() >>> 0) & 0xFFFF; try { addLogMessage(`[ZN:${this._debugId}] Constructed ZN: amplitude=${this.amplitude} minCycles=${this.minCycles}`, 'info'); } catch (e) { console.debug('[ZN] log failed', e); } }

    async run() {
        this.isRunning = true;
        const testId = Date.now() >>> 0;
        this.oscillationData = []; this.peaks = []; this.valleys = [];
        try {
            const znDisplay = document.getElementById('zn-oscillation-display'); if (znDisplay) znDisplay.style.display = 'block'; try { if (typeof updateCurrentTestDisplay === 'function') updateCurrentTestDisplay(1, 1, 1, 1, 0, 0, 0, null); } catch (_) { }
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => { reject(new Error('ZN test timeout')); }, 30000);
                const handler = (evt) => { const data = (evt && evt.detail) ? evt.detail : evt; if (data.type === 'relay_state' && Number(data.testId) === testId) { this.oscillationData.push({ time: data.time, angle: data.angle, relayOutput: data.relay_output }); this.detectPeaksValleys(); this.updateRelayChart(); const znCyclesEl = document.getElementById('zn-detected-cycles'); if (znCyclesEl) znCyclesEl.textContent = Math.min(this.peaks.length, this.valleys.length); if (this.peaks.length >= this.minCycles && this.valleys.length >= this.minCycles) { clearTimeout(timeout); window.removeEventListener('ble_message', handler); const results = this.calculateZNParameters(); this.displayResults(results); try { if (typeof updateCurrentTestDisplay === 'function') updateCurrentTestDisplay(1, 1, 1, 1, results.kp, results.ki, results.kd, 0); } catch (_) { } resolve(results); } } else if (data.type === 'test_complete' && Number(data.testId) === testId) { clearTimeout(timeout); window.removeEventListener('ble_message', handler); if (this.peaks.length >= this.minCycles && this.valleys.length >= this.minCycles) { const results = this.calculateZNParameters(); this.displayResults(results); try { if (typeof updateCurrentTestDisplay === 'function') updateCurrentTestDisplay(1, 1, 1, 1, results.kp, results.ki, results.kd, 0); } catch (_) { } resolve(results); } else { reject(new Error('Not enough oscillation cycles detected')); } } };
                window.addEventListener('ble_message', handler);
                const ackHandlerZN = (evt) => { const d = (evt && evt.detail) ? evt.detail : evt; if (d.type === 'ack' && d.command === 'run_relay_test') { if (!d.success) { clearTimeout(timeout); window.removeEventListener('ble_message', handler); window.removeEventListener('ble_message', ackHandlerZN); try { addLogMessage(`[ZN] run_relay_test ACK failed: ${d.message || 'N/A'}`, 'error'); } catch (e) { console.debug('[ZN] ack log failed', e); } reject({ reason: 'ack_failed', message: d.message }); return; } else { window.removeEventListener('ble_message', ackHandlerZN); } } };
                window.addEventListener('ble_message', ackHandlerZN);
                try { addLogMessage(`[ZN] Sending run_relay_test: testId=${testId} amplitude=${this.amplitude}`, 'info'); } catch (e) { console.debug('[ZN] log failed', e); }
                // sendBleCommand('run_relay_test', { amplitude: this.amplitude, testId: testId }); - ZAKOMENTOWANE, bo robot nie obsługuje
            });
        } catch (err) { this.isRunning = false; console.error('[ZN] run() error:', err); try { addLogMessage(`[ZN] run() error: ${err && err.message ? err.message : String(err)}`, 'error'); } catch (e) { console.debug('[ZN] log failed', e); } throw err; }
    }

    detectPeaksValleys() { const data = this.oscillationData; const n = data.length; if (n < 3) return; const last = data[n - 1]; const prev = data[n - 2]; const prevPrev = data[n - 3]; if (prev.angle > prevPrev.angle && prev.angle > last.angle) { if (this.peaks.length === 0 || prev.time - this.peaks[this.peaks.length - 1].time > 0.1) this.peaks.push({ time: prev.time, value: prev.angle }); } if (prev.angle < prevPrev.angle && prev.angle < last.angle) { if (this.valleys.length === 0 || prev.time - this.valleys[this.valleys.length - 1].time > 0.1) this.valleys.push({ time: prev.time, value: prev.angle }); } }

    calculateZNParameters() { const peakValues = this.peaks.slice(-this.minCycles).map(p => p.value); const valleyValues = this.valleys.slice(-this.minCycles).map(v => v.value); const avgAmplitude = (mean(peakValues) - mean(valleyValues)) / 2; const ku = (4 * this.amplitude) / (Math.PI * avgAmplitude); const periods = []; for (let i = 1; i < this.peaks.length; i++) periods.push(this.peaks[i].time - this.peaks[i - 1].time); const tu = mean(periods); return { ku: ku, tu: tu, kp: 0.6 * ku, ki: 1.2 * ku / tu, kd: 0.075 * ku * tu }; }

    displayResults(results) { updateBestDisplay({ kp: results.kp, ki: results.ki, kd: results.kd, fitness: 0 }); showNotification(`ZN: Ku=${results.ku.toFixed(3)}, Tu=${results.tu.toFixed(3)}s`); }

    updateRelayChart() { const canvas = document.getElementById('zn-oscillation-chart'); if (!canvas) return; const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, canvas.width, canvas.height); if (this.oscillationData.length === 0) return; const times = this.oscillationData.map(d => d.time); const angles = this.oscillationData.map(d => d.angle); const minTime = Math.min(...times); const maxTime = Math.max(...times); const minAngle = Math.min(...angles); const maxAngle = Math.max(...angles); const padding = 30; const width = canvas.width - 2 * padding; const height = canvas.height - 2 * padding; ctx.strokeStyle = '#61dafb'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(padding, padding); ctx.lineTo(padding, canvas.height - padding); ctx.lineTo(canvas.width - padding, canvas.height - padding); ctx.stroke(); ctx.strokeStyle = '#a2f279'; ctx.lineWidth = 2; ctx.beginPath(); this.oscillationData.forEach((point, i) => { const x = padding + ((point.time - minTime) / (maxTime - minTime + 0.001)) * width; const y = canvas.height - padding - ((point.angle - minAngle) / (maxAngle - minAngle + 0.001)) * height; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }); ctx.stroke(); ctx.fillStyle = '#ff6b6b'; this.peaks.forEach(peak => { const x = padding + ((peak.time - minTime) / (maxTime - minTime + 0.001)) * width; const y = canvas.height - padding - ((peak.value - minAngle) / (maxAngle - minAngle + 0.001)) * height; ctx.beginPath(); ctx.arc(x, y, 4, 0, 2 * Math.PI); ctx.fill(); }); ctx.fillStyle = '#4ecdc4'; this.valleys.forEach(valley => { const x = padding + ((valley.time - minTime) / (maxTime - minTime + 0.001)) * width; const y = canvas.height - padding - ((valley.value - minAngle) / (maxAngle - minAngle + 0.001)) * height; ctx.beginPath(); ctx.arc(x, y, 4, 0, 2 * Math.PI); ctx.fill(); }); }

    stop() { this.isRunning = false; /* sendBleCommand('cancel_test', {}); */ sendBaselinePIDToRobot(); }
}

// ========================================================================
// BAYESIAN OPTIMIZATION
// ========================================================================

class BayesianOptimization {
    constructor(config) { this.iterations = config.iterations || 25; this.initialSamples = config.initialSamples || 5; this.searchSpace = config.searchSpace; this.acquisitionFunction = config.acquisitionFunction || 'ei'; this.xi = config.xi || 0.01; this.samples = []; this.iteration = 0; this.isRunning = false; this.neuralNetwork = null; this.testCounter = 0; }

    async initialize() { this.samples = []; this.iteration = 0; this.testCounter = 0; fitnessChartData = []; for (let i = 0; i < this.initialSamples; i++) { const sample = this.sampleRandom(); try { const fitness = await this.evaluateSample(sample); this.samples.push({ ...sample, fitness }); } catch (error) { console.error('Initial sample failed:', error); this.samples.push({ ...sample, fitness: Infinity }); } } if (typeof baselinePID !== 'undefined' && baselinePID && typeof baselinePID.kp === 'number') { const baseSample = { kp: baselinePID.kp, ki: baselinePID.ki, kd: baselinePID.kd }; try { const fitness = await this.evaluateSample(baseSample); this.samples.push({ ...baseSample, fitness }); } catch (error) { console.warn('Baseline sample evaluation failed:', error); this.samples.push({ ...baseSample, fitness: Infinity }); } } await this.trainSurrogate(); document.getElementById('bayesian-visualization').style.display = 'block'; this.updateVisualization(); }

    async trainSurrogate() { if (!this.neuralNetwork) { this.neuralNetwork = ml5.neuralNetwork({ inputs: 3, outputs: 1, task: 'regression', layers: [{ type: 'dense', units: 32, activation: 'relu' }, { type: 'dense', units: 16, activation: 'relu' }] }); } this.neuralNetwork.data.data.raw = []; const validSamples = this.samples.filter(s => s.fitness !== Infinity); validSamples.forEach(sample => { this.neuralNetwork.addData({ kp: sample.kp, ki: sample.ki, kd: sample.kd }, { fitness: sample.fitness }); }); if (validSamples.length < 2) { console.warn('Not enough valid samples to train surrogate'); return; } await this.neuralNetwork.normalizeData(); const trainingOptions = { epochs: 30, batchSize: Math.min(8, validSamples.length), validationSplit: 0.1 }; await this.neuralNetwork.train(trainingOptions); }

    async acquireNext() { let bestAcquisition = -Infinity; let bestSample = null; const gridSize = 8; for (let i = 0; i < gridSize; i++) { for (let j = 0; j < gridSize; j++) { for (let k = 0; k < gridSize; k++) { const kp = this.searchSpace.kp_min + (i / (gridSize - 1)) * (this.searchSpace.kp_max - this.searchSpace.kp_min); const ki = this.searchSpace.ki_min + (j / (gridSize - 1)) * (this.searchSpace.ki_max - this.searchSpace.ki_min); const kd = this.searchSpace.kd_min + (k / (gridSize - 1)) * (this.searchSpace.kd_max - this.searchSpace.kd_min); const acquisition = await this.calculateAcquisition({ kp, ki, kd }); if (acquisition > bestAcquisition) { bestAcquisition = acquisition; bestSample = { kp, ki, kd }; } } } } return bestSample; }

    async calculateAcquisition(sample) { const prediction = await this.neuralNetwork.predict({ kp: sample.kp, ki: sample.ki, kd: sample.kd }); const predictedFitness = prediction[0].fitness; const validSamples = this.samples.filter(s => s.fitness !== Infinity); if (validSamples.length === 0) return 0; const currentBest = Math.min(...validSamples.map(s => s.fitness)); if (this.acquisitionFunction === 'ei') { const improvement = currentBest - predictedFitness; return Math.max(0, improvement + this.xi); } else if (this.acquisitionFunction === 'ucb') { const uncertainty = 1.0; return -predictedFitness + 2.0 * uncertainty; } else if (this.acquisitionFunction === 'pi') { const improvement = currentBest - predictedFitness; return improvement > 0 ? 1 : 0; } return -predictedFitness; }

    async evaluateSample(sample) { this.testCounter++; try { if (typeof updateCurrentTestDisplay === 'function') updateCurrentTestDisplay(this.iteration + 1, this.iterations, this.testCounter, this.initialSamples + 1, sample.kp, sample.ki, sample.kd, null); } catch (_) { } try { const res = await runTelemetryBasedTest(sample.kp, sample.ki, sample.kd); const fitness = res.fitness; try { if (typeof updateCurrentTestDisplay === 'function') updateCurrentTestDisplay(this.iteration + 1, this.iterations, this.testCounter, this.initialSamples + 1, sample.kp, sample.ki, sample.kd, fitness); } catch (_) { } addTestToResultsTable(this.testCounter, sample, fitness, res.itae, res.overshoot, 'telemetry_test'); return fitness; } catch (error) { console.error('[Bayesian] Test failed:', error); addTestToResultsTable(this.testCounter, sample, Infinity, 0, 0, 'telemetry_test'); throw error; } }

    sampleRandom() { const includeKi = !!document.getElementById('include-ki-checkbox')?.checked; const getRandom = (min, max) => Math.random() * (max - min) + min; return { kp: getRandom(this.searchSpace.kp_min, this.searchSpace.kp_max), ki: includeKi ? getRandom(this.searchSpace.ki_min, this.searchSpace.ki_max) : (baselinePID?.ki ?? ((this.searchSpace.ki_min + this.searchSpace.ki_max) / 2)), kd: getRandom(this.searchSpace.kd_min, this.searchSpace.kd_max) }; }

    updateVisualization() { const canvas = document.getElementById('bayesian-space-chart'); const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, canvas.width, canvas.height); if (this.samples.length === 0) return; const padding = 40; const width = canvas.width - 2 * padding; const height = canvas.height - 2 * padding; ctx.strokeStyle = '#61dafb'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(padding, padding); ctx.lineTo(padding, canvas.height - padding); ctx.lineTo(canvas.width - padding, canvas.height - padding); ctx.stroke(); ctx.fillStyle = '#ffffff'; ctx.font = '12px Arial'; ctx.fillText('Kp', canvas.width - padding + 5, canvas.height - padding + 5); ctx.fillText('Kd', padding - 30, padding); const validSamples = this.samples.filter(s => s.fitness !== Infinity); const bestSample = validSamples.length > 0 ? validSamples.reduce((a, b) => a.fitness < b.fitness ? a : b) : null; this.samples.forEach(sample => { if (sample.fitness === Infinity) return; const x = padding + ((sample.kp - this.searchSpace.kp_min) / (this.searchSpace.kp_max - this.searchSpace.kp_min)) * width; const y = canvas.height - padding - ((sample.kd - this.searchSpace.kd_min) / (this.searchSpace.kd_max - this.searchSpace.kd_min)) * height; const minFitness = Math.min(...validSamples.map(s => s.fitness)); const maxFitness = Math.max(...validSamples.map(s => s.fitness)); const normalized = (sample.fitness - minFitness) / (maxFitness - minFitness + 0.001); const hue = (1 - normalized) * 240; ctx.fillStyle = `hsl(${hue}, 70%, 50%)`; ctx.beginPath(); ctx.arc(x, y, 5, 0, 2 * Math.PI); ctx.fill(); }); if (bestSample) { const x = padding + ((bestSample.kp - this.searchSpace.kp_min) / (this.searchSpace.kp_max - this.searchSpace.kp_min)) * width; const y = canvas.height - padding - ((bestSample.kd - this.searchSpace.kd_min) / (this.searchSpace.kd_max - this.searchSpace.kd_min)) * height; ctx.strokeStyle = '#a2f279'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 8, 0, 2 * Math.PI); ctx.stroke(); } }

    async run() { this.isRunning = true; try { const progressEl = document.getElementById('tuning-progress-panel'); if (progressEl) progressEl.style.display = 'block'; try { showNotification('Inicjalizacja Bayesian Optimization...'); } catch (e) { console.debug('[Bayes] notify init failed', e); } await this.initialize(); while (this.iteration < this.iterations && this.isRunning) { const nextSample = await this.acquireNext(); if (!nextSample) { console.error('Failed to acquire next sample'); break; } try { const fitness = await this.evaluateSample(nextSample); this.samples.push({ ...nextSample, fitness }); } catch (error) { console.error('Sample evaluation failed:', error); this.samples.push({ ...nextSample, fitness: Infinity }); } await this.trainSurrogate(); const validSamples = this.samples.filter(s => s.fitness !== Infinity); const best = validSamples.length > 0 ? validSamples.reduce((a, b) => a.fitness < b.fitness ? a : b) : null; if (best) { updateBestDisplay(best); updateProgressDisplay(this.iteration + 1, this.iterations, best.fitness); } this.updateVisualization(); this.iteration++; } this.isRunning = false; const validSamples = this.samples.filter(s => s.fitness !== Infinity); const best = validSamples.length > 0 ? validSamples.reduce((a, b) => a.fitness < b.fitness ? a : b) : null; if (best) { try { if (best && typeof best.fitness === 'number' && isFinite(best.fitness)) { showNotification(`Bayesian Optimization zakończona! Najlepsze fitness: ${best.fitness.toFixed(4)}`); } else { showNotification('Bayesian Optimization zakończona - brak udanych testów'); } } catch (err) { console.error('[Bayes] showNotification error:', err); } } else { showNotification('Bayesian Optimization zakończona - brak udanych testów'); } } catch (err) { this.isRunning = false; console.error('[Bayes] run() error:', err); try { addLogMessage(`[Bayes] run() error: ${err && err.message ? err.message : String(err)}`, 'error'); } catch (e) { console.debug('[Bayes] log failed', e); } throw err; } }

    stop() { this.isRunning = false; sendBaselinePIDToRobot(); }
}

// Expose relevant functions globally so existing code paths still work
if (typeof window.GeneticAlgorithm === 'undefined') window.GeneticAlgorithm = GeneticAlgorithm;
if (typeof window.ParticleSwarmOptimization === 'undefined') window.ParticleSwarmOptimization = ParticleSwarmOptimization;
if (typeof window.ZieglerNicholsRelay === 'undefined') window.ZieglerNicholsRelay = ZieglerNicholsRelay;
if (typeof window.BayesianOptimization === 'undefined') window.BayesianOptimization = BayesianOptimization;
if (typeof window.runTelemetryBasedTest === 'undefined') window.runTelemetryBasedTest = runTelemetryBasedTest;
if (typeof window.calculateFitnessFromTelemetry === 'undefined') window.calculateFitnessFromTelemetry = calculateFitnessFromTelemetry;
if (typeof window.addTestToResultsTable === 'undefined') window.addTestToResultsTable = addTestToResultsTable;
if (typeof window.applyParameters === 'undefined') window.applyParameters = applyParameters;
if (typeof window.captureBaselinePID === 'undefined') window.captureBaselinePID = captureBaselinePID;
if (typeof window.sendBaselinePIDToRobot === 'undefined') window.sendBaselinePIDToRobot = sendBaselinePIDToRobot;
if (typeof window.updateBestDisplay === 'undefined') window.updateBestDisplay = updateBestDisplay;
if (typeof window.updateFitnessChart === 'undefined') window.updateFitnessChart = updateFitnessChart;


// Draw a mini telemetry plot for the currently tested candidate
function updateCurrentTelemetryPlot(samples) {
    const canvas = document.getElementById('current-telemetry-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!Array.isArray(samples) || samples.length === 0) return;

    const padding = 6;
    const w = canvas.width - padding * 2;
    const h = canvas.height - padding * 2;
    const pitches = samples.map(s => s.pitch);
    const minVal = Math.min(...pitches);
    const maxVal = Math.max(...pitches);
    const range = (maxVal - minVal) || 1;

    ctx.strokeStyle = '#61dafb';
    ctx.lineWidth = 2;
    ctx.beginPath();
    samples.forEach((s, i) => {
        const x = padding + (i / (samples.length - 1)) * w;
        const y = padding + h - (((s.pitch - minVal) / range) * h);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
    // Mark last sample
    const last = samples[samples.length - 1];
    const lastX = padding + w;
    const lastY = padding + h - (((last.pitch - minVal) / range) * h);
    ctx.fillStyle = '#a2f279';
    ctx.beginPath();
    ctx.arc(lastX - 2, lastY, 3, 0, 2 * Math.PI);
    ctx.fill();
}

// Główne zakładki w panelu optymalizacji (Konfiguracja/Metody)
function setupMainAutotuneTabs() {
    const tabs = document.querySelectorAll('.autotune-main-tab');
    const panes = document.querySelectorAll('.autotune-main-content');
    const controlsBar = document.getElementById('tuning-controls-bar');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const target = tab.dataset.tab;
            tabs.forEach(t => t.classList.remove('active'));
            panes.forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            document.querySelector(`.autotune-main-content[data-tab="${target}"]`)?.classList.add('active');
            // Pokaż przyciski sterujące na zakładce 'methods' lub zawsze, gdy sesja strojenia jest aktywna
            if (controlsBar) controlsBar.style.display = (target === 'methods' || AppState.isTuningActive) ? 'flex' : 'none';
        });
    });
    // Ustaw widoczność kontrolek zgodnie z aktywną zakładką na starcie
    const activeMain = document.querySelector('.autotune-main-tab.active')?.dataset.tab || 'config';
    if (controlsBar) controlsBar.style.display = (activeMain === 'methods' || AppState.isTuningActive) ? 'flex' : 'none';
}

// Initialize the fitness weights modal and wire controls
function initFitnessModal() {
    const TOTAL_POINTS = 100;
    const openBtn = document.getElementById('open-fitness-modal-btn');
    const modal = document.getElementById('fitness-modal');
    const closeBtn = document.getElementById('close-fitness-modal');
    const applyBtn = document.getElementById('apply-fitness-btn');
    const itaeInput = document.getElementById('weight-itae');
    const overshootInput = document.getElementById('weight-overshoot');
    const sseInput = document.getElementById('weight-sse');
    const remainingEl = document.getElementById('weight-remaining');

    if (!modal || !openBtn || !closeBtn || !applyBtn || !itaeInput || !overshootInput || !sseInput || !remainingEl) return;

    function sanitizeAndClamp(v) { let n = parseInt(v, 10); if (Number.isNaN(n)) n = 0; if (n < 0) n = 0; if (n > TOTAL_POINTS) n = TOTAL_POINTS; return n; }

    function updateWeightUi() {
        const itae = sanitizeAndClamp(itaeInput.value);
        const overs = sanitizeAndClamp(overshootInput.value);
        const sse = sanitizeAndClamp(sseInput.value);
        itaeInput.value = itae; overshootInput.value = overs; sseInput.value = sse;
        const sum = itae + overs + sse;
        const remaining = TOTAL_POINTS - sum;
        remainingEl.textContent = remaining;
        // Show negative remainder in red
        remainingEl.style.color = remaining === 0 ? '#61dafb' : '#ff6347';
        applyBtn.disabled = (remaining !== 0);
    }

    // Initialize values from appStore or defaults
    function initValuesFromState() {
        const stateWeights = appStore.getState('tuning.weights') || { itae: 50, overshoot: 30, sse: 20 };
        itaeInput.value = sanitizeAndClamp(stateWeights.itae);
        overshootInput.value = sanitizeAndClamp(stateWeights.overshoot);
        sseInput.value = sanitizeAndClamp(stateWeights.sse);
        updateWeightUi();
    }

    openBtn.addEventListener('click', () => { initValuesFromState(); modal.style.display = 'flex'; });
    closeBtn.addEventListener('click', () => { modal.style.display = 'none'; });
    [itaeInput, overshootInput, sseInput].forEach(inp => inp.addEventListener('input', updateWeightUi));

    applyBtn.addEventListener('click', () => {
        const itae = sanitizeAndClamp(itaeInput.value);
        const overs = sanitizeAndClamp(overshootInput.value);
        const sse = sanitizeAndClamp(sseInput.value);
        const sum = itae + overs + sse;
        if (sum !== TOTAL_POINTS) {
            addLogMessage('[UI] Musisz rozdzielić dokładnie 100 punktów pomiędzy wagi.', 'warn');
            return;
        }
        appStore.setState('tuning.weights', { itae, overshoot: overs, sse });
        // Send to robot as set_tuning_config_param keys - map sse to control effort key name
        sendBleCommand('set_tuning_config_param', { key: 'weights_itae', value: itae });
        sendBleCommand('set_tuning_config_param', { key: 'weights_overshoot', value: overs });
        sendBleCommand('set_tuning_config_param', { key: 'weights_control_effort', value: sse });
        addLogMessage('[UI] Wagi fitness zastosowane.', 'info');
        modal.style.display = 'none';
    });
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
// Wait for one of desired robot states to appear on appStore
function waitForRobotState(desiredStates = ['BALANSUJE', 'TRZYMA_POZYCJE'], timeoutMs = 5000) {
    return new Promise((resolve) => {
        try {
            if (desiredStates.includes(AppState.lastKnownRobotState)) { resolve(true); return; }
            const id = appStore.subscribe('robot.state', (newVal) => {
                try {
                    if (desiredStates.includes(newVal)) {
                        appStore.unsubscribe(id);
                        resolve(true);
                    }
                } catch (e) { /* ignore */ }
            });
            setTimeout(() => { try { appStore.unsubscribe(id); } catch (e) { } resolve(false); }, timeoutMs);
        } catch (e) { resolve(false); }
    });
}

// Asynchronous check of prerequisites - shows clearer messages and optionally toggles balancing on user consent.
async function checkTuningPrerequisites() {
    if (!AppState.isConnected || !AppState.isSynced) {
        addLogMessage('[UI] Blad: Polacz i zsynchronizuj z robotem.', 'error');
        const statusEl = document.getElementById('tuning-status-text'); if (statusEl) statusEl.textContent = 'Blad: brak polaczenia/synchronizacji';
        return false;
    }

    if (!['BALANSUJE', 'TRZYMA_POZYCJE'].includes(AppState.lastKnownRobotState)) {
        // Ask user whether we should try to enable balance automatically
        const msg = `Robot musi byc w stanie BALANSUJE lub TRZYMA_POZYCJE aby uruchomic testy. Aktualny stan: '${AppState.lastKnownRobotState}'.\nCzy wlaczyc balansowanie teraz?`;
        const ok = confirm(msg);
        if (!ok) {
            addLogMessage(`[UI] Wymagany stan 'BALANSUJE'. Aktualny: '${AppState.lastKnownRobotState}'.`, 'error');
            const statusEl = document.getElementById('tuning-status-text'); if (statusEl) statusEl.textContent = 'Wymagany stan: BALANSUJE';
            return false;
        }

        // Try to enable balancing via UI or direct command, then wait for the robot to switch state
        try {
            const bsEl = document.getElementById('balanceSwitch');
            if (bsEl) {
                bsEl.checked = true;
                // dispatch change to trigger standard handler
                bsEl.dispatchEvent(new Event('change'));
            } else {
                // fallback: direct command
                sendBleMessage({ type: 'balance_toggle', enabled: true });
            }
            addLogMessage('[UI] Wlaczono balansowanie. Oczekiwanie na stan BALANSUJE...', 'info');
            const success = await waitForRobotState(['BALANSUJE', 'TRZYMA_POZYCJE'], 8000);
            if (!success) {
                addLogMessage('[UI] Robot nie przeszedl do stanu BALANSUJE po wlaczeniu balansowania.', 'error');
                const statusEl = document.getElementById('tuning-status-text'); if (statusEl) statusEl.textContent = 'Brak oczekiwanego stanu BALANSUJE';
                return false;
            }
            return true;
        } catch (e) {
            addLogMessage('[UI] Blad przy probie wlaczenia balansowania: ' + (e && e.message ? e.message : String(e)), 'error');
            return false;
        }
    }

    if (AppState.isTuningActive) {
        addLogMessage('[UI] Blad: Inna sesja strojenia jest juz w toku.', 'warn');
        return false;
    }
    return true;
}
function setTuningUiLock(isLocked, method) {
    AppState.isTuningActive = isLocked;
    AppState.activeTuningMethod = isLocked ? method : '';

    // Globalny tryb strojenia (odblokowane: Sterowanie, Optymalizacja, Logi)
    // Dla pojedynczych testów nie blokuj UI, tylko dla algorytmów optymalizacji
    if (method !== 'single-tests') {
        document.body.classList.toggle('tuning-active', isLocked);
    }

    // Wyłączamy przełączanie zakładek. Disable run test buttons OUTSIDE of autotune card only
    document.querySelectorAll('.run-test-btn').forEach(btn => {
        try {
            btn.disabled = isLocked && !btn.closest('#autotuning-card');
        } catch (e) { btn.disabled = isLocked; }
    });
    document.querySelectorAll('.method-tab').forEach(tab => tab.disabled = isLocked);
    // Dashboard legacy usunięty

    // Przełącz widoki w panelu optymalizacji
    const cfgPanel = document.getElementById('autotuning-config-panel');
    const progress = document.getElementById('tuning-progress-panel');
    if (cfgPanel) cfgPanel.classList.toggle('autotune-config-hide', isLocked);
    if (progress) progress.style.display = isLocked ? 'block' : 'none';
    // Keep controls bar visible during active tuning so user can Pause/Stop without switching tabs
    const controlsBar = document.getElementById('tuning-controls-bar');
    try {
        if (controlsBar) controlsBar.style.display = (isLocked ? 'flex' : (document.querySelector('.autotune-main-tab.active')?.dataset.tab === 'methods' ? 'flex' : 'none'));
    } catch (e) { /* ignore DOM errors */ }
}

// Update the UI details for the currently testing individual (visible in tuning-progress-panel)
function updateCurrentTestDisplay(gen, totalGen, individualIdx, populationSize, kp, ki, kd, fitness) {
    try {
        const genEl = document.getElementById('current-generation');
        const totGenEl = document.getElementById('ga-gen-total');
        const indivEl = document.getElementById('current-individual');
        const popEl = document.getElementById('population-size');
        const kpEl = document.getElementById('current-kp');
        const kiEl = document.getElementById('current-ki');
        const kdEl = document.getElementById('current-kd');
        const fitnessEl = document.getElementById('current-fitness');
        const statusEl = document.getElementById('tuning-status-text');
        if (genEl && gen !== undefined) genEl.textContent = gen;
        if (totGenEl && totalGen !== undefined) totGenEl.textContent = totalGen;
        if (indivEl && individualIdx !== undefined) indivEl.textContent = individualIdx;
        if (popEl && populationSize !== undefined) popEl.textContent = populationSize;
        if (kpEl && kp !== undefined) kpEl.textContent = (typeof kp === 'number' ? kp.toFixed(3) : '---');
        if (kiEl && ki !== undefined) kiEl.textContent = (typeof ki === 'number' ? ki.toFixed(3) : '---');
        if (kdEl && kd !== undefined) kdEl.textContent = (typeof kd === 'number' ? kd.toFixed(3) : '---');
        if (fitnessEl) fitnessEl.textContent = (isFinite(fitness) ? Number(fitness).toFixed(4) : (fitness === Infinity ? '---' : (fitness === undefined ? '---' : fitness)));
        if (statusEl) statusEl.textContent = `Pokolenie ${gen}/${totalGen} · Osobnik ${individualIdx}/${populationSize}`;
    } catch (e) {
        console.debug('[UI] updateCurrentTestDisplay error', e);
    }
}
window.updateCurrentTestDisplay = updateCurrentTestDisplay;
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
async function runDynamicTest(testType) {
    if (!(await checkTuningPrerequisites())) return;
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
    // Ujednolicenie: firmware oczekuje komendy 'run_metrics_test' - ZAKOMENTOWANE, bo robot nie obsługuje
    // sendBleCommand('run_metrics_test', { kp, ki, kd, testId });
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
function handleJoystickStart(event) { event.preventDefault(); isDragging = true; pollJoystick(); }
function handleJoystickMove(event) { if (!isDragging) return; event.preventDefault(); const joystickCanvas = document.getElementById('joystickCanvas'); let { x, y } = getJoystickPosition(event); const dx = x - joystickCenter.x; const dy = y - joystickCenter.y; const distance = Math.sqrt(dx * dx + dy * dy); if (distance > joystickRadius) { x = joystickCenter.x + (dx / distance) * joystickRadius; y = joystickCenter.y + (dy / distance) * joystickRadius; } drawJoystick(joystickCanvas.getContext('2d'), x, y); const joyX = (x - joystickCenter.x) / joystickRadius; const joyY = -(y - joystickCenter.y) / joystickRadius; currentJoystickX = joyX; currentJoystickY = joyY; const now = Date.now(); if (now - lastJoystickSendTime > JOYSTICK_SEND_INTERVAL) { sendBleMessage({ type: 'joystick', x: joyX, y: joyY }); lastJoystickSendTime = now; } }
function getJoystickPosition(event) { const rect = document.getElementById('joystickCanvas').getBoundingClientRect(); const touch = event.touches ? event.touches[0] : event; return { x: touch.clientX - rect.left, y: touch.clientY - rect.top }; }
function handleJoystickEnd(event) { if (!isDragging) return; event.preventDefault(); isDragging = false; drawJoystick(document.getElementById('joystickCanvas').getContext('2d'), joystickCenter.x, joystickCenter.y); sendBleMessage({ type: 'joystick', x: 0, y: 0 }); }
function pollGamepad() { if (gamepadIndex !== null) { const gp = navigator.getGamepads()[gamepadIndex]; if (!gp) return; if (isMappingButton && actionToMap) { gp.buttons.forEach((button, i) => { if (button.pressed && !lastGamepadState[i]) { Object.keys(gamepadMappings).forEach(key => { if (gamepadMappings[key] === actionToMap) delete gamepadMappings[key]; }); gamepadMappings[i] = actionToMap; saveGamepadMappings(); addLogMessage(`[UI] Akcja '${availableActions[actionToMap].label}' przypisana do przycisku ${i}.`, 'success'); isMappingButton = false; actionToMap = null; renderMappingModal(); } }); } else { gp.buttons.forEach((button, i) => { if (button.pressed && !lastGamepadState[i]) { const action = gamepadMappings[i]; if (action && availableActions[action]) { const element = document.getElementById(availableActions[action].elementId); if (element && !element.disabled) { element.click(); flashElement(element); } } } }); } lastGamepadState = gp.buttons.map(b => b.pressed); let x = gp.axes[0] || 0; let y = gp.axes[1] || 0; if (Math.abs(x) < 0.15) x = 0; if (Math.abs(y) < 0.15) y = 0; sendBleMessage({ type: 'joystick', x: x, y: -y }); } requestAnimationFrame(pollGamepad); }
function pollJoystick() { if (isDragging) { const now = Date.now(); if (now - lastJoystickSendTime > JOYSTICK_SEND_INTERVAL) { sendBleMessage({ type: 'joystick', x: currentJoystickX, y: currentJoystickY }); lastJoystickSendTime = now; } requestAnimationFrame(pollJoystick); } }
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
    // Add trim parameters from displays - now always 0 since corrections are in quaternion
    params['trim_angle'] = 0;
    params['roll_trim'] = 0;
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
    ['balanceSwitch', 'holdPositionSwitch', 'speedModeSwitch', 'disableMagnetometerSwitch'].forEach(id => { const el = document.getElementById(id); if (!el) return; el.addEventListener('change', (e) => { if (AppState.isApplyingConfig) return; const typeMap = { 'balanceSwitch': 'balance_toggle', 'holdPositionSwitch': 'hold_position_toggle', 'speedModeSwitch': 'speed_mode_toggle', 'disableMagnetometerSwitch': 'set_param' }; if (typeMap[id] === 'set_param') { sendBleMessage({ type: 'set_param', key: 'disable_magnetometer', value: e.target.checked ? 1.0 : 0.0 }); } else { sendBleMessage({ type: typeMap[id], enabled: e.target.checked }); } }); });

    // POPRAWKA: Trymy zmieniają fizyczny montaż (qcorr). Wysyłamy DELTY przez adjust_zero/adjust_roll.
    const toolButtons = { 'resetZeroBtn': { type: 'set_pitch_zero' }, 'resetEncodersBtn': { type: 'reset_encoders' }, 'emergencyStopBtn': { type: 'emergency_stop' } };
    // Trim (pitch): wysyłka als delta (deg) -> adjust_zero (obrót wokół Y)
    function updateAndSendTrim(delta) {
        const span = document.getElementById('trimValueDisplay');
        if (!span) return;
        // Aktualizuj jedynie wskaźnik UI (nie jest już odczytem firmware)
        const preview = (parseFloat(span.textContent) || 0) + delta;
        span.textContent = preview.toFixed(2);
        sendBleMessage({ type: 'adjust_zero', value: delta });
        addLogMessage(`[UI] Montaż: Pitch Y+=${delta.toFixed(2)}° (persist)`, 'info');
    }
    document.getElementById('trimMinus01Btn')?.addEventListener('click', () => updateAndSendTrim(-0.1));
    document.getElementById('trimMinus001Btn')?.addEventListener('click', () => updateAndSendTrim(-0.01));
    document.getElementById('trimPlus001Btn')?.addEventListener('click', () => updateAndSendTrim(0.01));
    document.getElementById('trimPlus01Btn')?.addEventListener('click', () => updateAndSendTrim(0.1));
    // Roll trim: aktualizacja + wysyłka set_param
    document.getElementById('resetRollZeroBtn')?.addEventListener('click', () => setRollZero());
    // Reset korekty pionu (pitch trim) - ustawia trim tak, by skorygowany kąt wynosił 0
    document.getElementById('resetZeroBtn')?.addEventListener('click', () => setPitchZero());
    // Reset encoders -> wyślij komendę do firmware
    document.getElementById('resetEncodersBtn')?.addEventListener('click', () => {
        if (!AppState.isConnected) {
            addLogMessage('[UI] Nie połączono z robotem. Nie można zresetować enkoderów.', 'warn');
            return;
        }
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
function setupDpadControls() { document.querySelectorAll('.dpad-btn').forEach(btn => { btn.addEventListener('click', (e) => { const action = e.currentTarget.dataset.dpad; let msg = null; if (action === 'up') msg = { type: 'execute_move', distance_cm: parseFloat(document.getElementById('dpadDistInput').value) }; else if (action === 'down') msg = { type: 'execute_move', distance_cm: -parseFloat(document.getElementById('dpadDistInput').value) }; else if (action === 'left') msg = { type: 'execute_rotate', angle_deg: -parseFloat(document.getElementById('dpadAngleInput').value) }; else if (action === 'right') msg = { type: 'execute_rotate', angle_deg: parseFloat(document.getElementById('dpadAngleInput').value) }; else if (action === 'stop') msg = { type: 'command_stop' }; if (msg) { flashElement(e.currentTarget); try { addLogMessage(`[UI -> ROBOT] Sending: ${msg.type} ${JSON.stringify(msg)}`, 'info'); } catch (err) { } sendBleMessage(msg); } }); }); }
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
function setupControls3D() {
    document.getElementById('reset3dViewBtn').addEventListener('click', () => { camera3D.position.set(28, 22, 48); controls3D.target.set(0, 8, 0); controls3D.update(); }); document.getElementById('toggle3dAnimationBtn').addEventListener('click', () => isAnimation3DEnabled = !isAnimation3DEnabled); document.getElementById('toggle3dMovementBtn').addEventListener('click', () => {
        isMovement3DEnabled = !isMovement3DEnabled; // Reset baseline to current encoder average to avoid jumps when toggling movement
        lastEncoderAvg = (currentEncoderLeft + currentEncoderRight) / 2;
    });
}

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
            // Some encoder setups count up in the opposite direction for "forward" motion.
            // Invert the computed distance here so ground movement follows wheel rotation visually.
            const dist_cm = -((currentEncoderAvg - lastEncoderAvg) / ppr) * Math.PI * wheelDiameter;
            if (groundTexture) {
                // Uzyj juz ustawionej, bezpiecznej rotacji z samego modelu, aby uniknac bledu NaN
                // Pobieramy rotację modelu wokół osi Y, która odpowiada za kurs (yaw)
                const yawRad = robotPivot.rotation.y;
                const dx = Math.sin(yawRad) * dist_cm;
                const dz = Math.cos(yawRad) * dist_cm;
                const squaresPerCm = 1 / 20;
                if (window.DEBUG_3D) console.debug(`[3D] dist_cm=${dist_cm.toFixed(3)} dx=${dx.toFixed(3)} dz=${dz.toFixed(3)} yaw=${THREE.MathUtils.radToDeg(yawRad).toFixed(1)}`);
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
    if (!(await checkTuningPrerequisites())) return;

    const method = document.querySelector('.method-tab.active')?.dataset.method;
    const startBtn = document.getElementById('start-tuning-btn');
    if (startBtn) startBtn.disabled = true; // Prevent double-click while loading deps
    if (!method) {
        addLogMessage('[UI] Nie wybrano metody optymalizacji.', 'warn');
        return;
    }

    // CRITICAL: Request tuning dependencies (algorithms, ml5 for Bayesian) and full configuration from robot
    try {
        await ensureTuningDependencies(method);
    } catch (err) {
        addLogMessage('[UI] Blad: nie udalo sie zaladowac zaleznosci strojenia. Sprobuj ponownie lub otworz debug konsole.', 'error');
        setTuningUiLock(false, '');
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
    // Ensure UI shows last attempts and current progress at start
    try { if (typeof refreshRecentList === 'function') refreshRecentList(); } catch (e) { /* no-op */ }
    document.getElementById('tuning-status-text').textContent = `Uruchamianie (${method || 'N/A'})...`;
    document.getElementById('current-iteration').textContent = '0';
    fitnessChartData = [];
    updateFitnessChart();
    document.getElementById('start-tuning-btn').disabled = true;
    document.getElementById('pause-tuning-btn').disabled = false;
    document.getElementById('stop-tuning-btn').disabled = false;

    addLogMessage(`[UI] Rozpoczynam strojenie po stronie UI metodą: ${method.toUpperCase()}`, 'info');

    try {
        let config;
        if (method === 'ga' || method === 'ga-genetic') {
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
        } else if (method === 'pso' || method === 'pso-particle') {
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

        try { addLogMessage(`[UI] currentTuningSession: ${currentTuningSession.constructor.name} debugId=${currentTuningSession._debugId || 'N/A'} config=${JSON.stringify(config)}`, 'info'); } catch (e) { console.debug('[UI] tuning session log failed', e); }

        // Start the tuning session
        currentTuningSession.run().catch((err) => {
            console.error('[UI] Autostrojenie error:', err);
            addLogMessage(`[UI] Błąd podczas sesji strojenia: ${err?.message ?? String(err)}`, 'error');
        }).finally(() => {
            stopTuning(false);
        });

    } catch (error) {
        console.error('Błąd inicjalizacji strojenia:', error);
        addLogMessage('Błąd inicjalizacji strojenia: ' + error.message, 'error');
        stopTuning(false);
        if (startBtn) startBtn.disabled = false;
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

    // Apply best found parameters to the robot
    const applyBestBtn = document.getElementById('apply-best-btn');
    if (applyBestBtn) {
        applyBestBtn.addEventListener('click', () => {
            const kp = parseFloat(document.getElementById('best-kp')?.textContent) || 0;
            const ki = parseFloat(document.getElementById('best-ki')?.textContent) || 0;
            const kd = parseFloat(document.getElementById('best-kd')?.textContent) || 0;
            applyParameters(kp, ki, kd);
            addLogMessage('[UI] Zastosowano najlepsze parametry (Apply Best).', 'info');
        });
    }
    // Preload algorithms in background to avoid delay on first start
    ensureTuningDependencies().then(() => {
        try { addLogMessage('[UI] Moduly strojenia (GA/PSO) zaladowane i gotowe.', 'info'); } catch (e) { }
    }).catch((err) => {
        try { addLogMessage('[UI] Ostrzezenie: Nie mozna wstępnie zaladowac modulow strojenia: ' + err.message, 'warn'); } catch (e) { }
    });

    // ========================================================================
    // SYSTEM IDENTIFICATION (SYSID) MODULE
    // ========================================================================
    initSystemIdentification();
});

// ========================================================================
// SYSTEM IDENTIFICATION - Telemetry Recording for Model Identification
// ========================================================================

const SysIdState = {
    isRecording: false,
    data: [],
    startTime: 0,
    duration: 5000,
    sampleRate: 200,
    kp: 50,
    impulse: 200,  // PWM value instead of degrees
    impulseApplied: false,
    impulseStartTime: 0,
    chart: null,
    chartCtx: null,
    telemetryHandler: null
};

function initSystemIdentification() {
    const startBtn = document.getElementById('sysid-start-btn');
    const stopBtn = document.getElementById('sysid-stop-btn');
    const exportCsvBtn = document.getElementById('sysid-export-csv-btn');
    const exportMatBtn = document.getElementById('sysid-export-mat-btn');
    const clearBtn = document.getElementById('sysid-clear-btn');

    if (startBtn) startBtn.addEventListener('click', startSysIdRecording);
    if (stopBtn) stopBtn.addEventListener('click', stopSysIdRecording);
    if (exportCsvBtn) exportCsvBtn.addEventListener('click', exportSysIdCSV);
    if (exportMatBtn) exportMatBtn.addEventListener('click', exportSysIdMAT);
    if (clearBtn) clearBtn.addEventListener('click', clearSysIdData);

    // Initialize chart context
    const canvas = document.getElementById('sysid-preview-chart');
    if (canvas) {
        SysIdState.chartCtx = canvas.getContext('2d');
    }
}

async function startSysIdRecording() {
    if (SysIdState.isRecording) return;

    // Check connection
    if (!AppState.isConnected) {
        addLogMessage('[SysID] Błąd: Połącz się z robotem.', 'error');
        return;
    }

    // Check robot state - robot musi balansować żeby reagował na zakłócenie
    if (!['BALANSUJE', 'TRZYMA_POZYCJE'].includes(AppState.lastKnownRobotState)) {
        const ok = confirm(`Robot musi balansować. Aktualny stan: '${AppState.lastKnownRobotState}'.\nCzy włączyć balansowanie?`);
        if (ok) {
            const bsEl = document.getElementById('balanceSwitch');
            if (bsEl) { bsEl.checked = true; bsEl.dispatchEvent(new Event('change')); }
            await new Promise(r => setTimeout(r, 2000));
        } else {
            return;
        }
    }

    // Get config
    SysIdState.kp = parseFloat(document.getElementById('sysid-kp')?.value) || 50;
    SysIdState.duration = (parseFloat(document.getElementById('sysid-duration')?.value) || 5) * 1000;
    SysIdState.impulse = parseFloat(document.getElementById('sysid-impulse')?.value) || 200;  // PWM value
    SysIdState.sampleRate = parseInt(document.getElementById('sysid-sample-rate')?.value) || 200;
    SysIdState.impulseApplied = false;
    SysIdState.impulseStartTime = 0;

    // Save current PID and apply Kp-only mode
    const currentKp = parseFloat(document.getElementById('balanceKpInput')?.value) || SysIdState.kp;
    const currentKi = parseFloat(document.getElementById('balanceKiInput')?.value) || 0;
    const currentKd = parseFloat(document.getElementById('balanceKdInput')?.value) || 0;
    SysIdState.savedPID = { kp: currentKp, ki: currentKi, kd: currentKd };

    // Apply Kp-only (no Ki, no Kd) - use 'key' not 'param' (firmware expects 'key')
    sendBleMessage({ type: 'set_param', key: 'kp_b', value: SysIdState.kp });
    sendBleMessage({ type: 'set_param', key: 'ki_b', value: 0 });
    sendBleMessage({ type: 'set_param', key: 'kd_b', value: 0 });

    addLogMessage(`[SysID] Ustawiono Kp=${SysIdState.kp}, Ki=0, Kd=0`, 'info');

    // Clear data
    SysIdState.data = [];
    SysIdState.isRecording = true;
    SysIdState.startTime = performance.now();

    // Update UI
    updateSysIdUI('recording');

    // Subscribe to telemetry
    SysIdState.telemetryHandler = (evt) => {
        if (!SysIdState.isRecording) return;
        const data = evt.detail || evt;
        if (data.type === 'telemetry') {
            const elapsed = performance.now() - SysIdState.startTime;
            const elapsedSec = elapsed / 1000;

            // Determine current impulse value for recording
            let currentImpulse = 0;
            if (SysIdState.impulseApplied && SysIdState.impulseStartTime > 0) {
                const impulseElapsed = elapsed - SysIdState.impulseStartTime;
                if (impulseElapsed >= 0 && impulseElapsed < 200) {  // 200ms impulse duration
                    currentImpulse = SysIdState.impulse;
                }
            }

            SysIdState.data.push({
                time: elapsedSec,
                angle: data.pitch ?? data.angle ?? 0,
                impulse_pwm: currentImpulse,
                pwm: data.pwm ?? data.pwmLeft ?? 0,
                speed: data.speed ?? data.encoderSpeed ?? 0,
                gyroY: data.gyroY ?? 0
            });

            // Update progress
            const progress = Math.min(100, (elapsed / SysIdState.duration) * 100);
            const progressEl = document.getElementById('sysid-progress');
            if (progressEl) progressEl.value = progress;

            const countEl = document.getElementById('sysid-sample-count');
            if (countEl) countEl.textContent = SysIdState.data.length;

            // Auto-stop when duration reached
            if (elapsed >= SysIdState.duration) {
                stopSysIdRecording();
            }
        }
    };
    window.addEventListener('ble_message', SysIdState.telemetryHandler);

    // Apply PWM disturbance after 1 second using manual_tune_motor (works during balancing)
    setTimeout(() => {
        if (SysIdState.isRecording) {
            SysIdState.impulseApplied = true;
            SysIdState.impulseStartTime = performance.now() - SysIdState.startTime;
            const pwmValue = SysIdState.impulse;
            addLogMessage(`[SysID] Stosowanie zakłócenia PWM: ${pwmValue} na oba silniki (200ms)`, 'info');

            // Start disturbance on both motors (forward direction)
            sendBleMessage({ type: 'manual_tune_motor', motor: 'left', direction: 'fwd', pwm: pwmValue });
            sendBleMessage({ type: 'manual_tune_motor', motor: 'right', direction: 'fwd', pwm: pwmValue });

            // Stop after 200ms
            setTimeout(() => {
                sendBleMessage({ type: 'manual_tune_motor', motor: 'left', direction: 'fwd', pwm: 0 });
                sendBleMessage({ type: 'manual_tune_motor', motor: 'right', direction: 'fwd', pwm: 0 });
                addLogMessage(`[SysID] Zakłócenie zakończone`, 'info');
            }, 200);
        }
    }, 1000);

    addLogMessage(`[SysID] Nagrywanie rozpoczęte (${SysIdState.duration / 1000}s). Zakłócenie za 1s.`, 'info');
}

function stopSysIdRecording() {
    if (!SysIdState.isRecording) return;

    SysIdState.isRecording = false;
    SysIdState.impulseApplied = false;
    SysIdState.impulseStartTime = 0;

    // Remove telemetry handler
    if (SysIdState.telemetryHandler) {
        window.removeEventListener('ble_message', SysIdState.telemetryHandler);
        SysIdState.telemetryHandler = null;
    }

    // Restore original PID (use 'key' not 'param')
    if (SysIdState.savedPID) {
        sendBleMessage({ type: 'set_param', key: 'kp_b', value: SysIdState.savedPID.kp });
        sendBleMessage({ type: 'set_param', key: 'ki_b', value: SysIdState.savedPID.ki });
        sendBleMessage({ type: 'set_param', key: 'kd_b', value: SysIdState.savedPID.kd });
        addLogMessage(`[SysID] Przywrócono PID: Kp=${SysIdState.savedPID.kp}, Ki=${SysIdState.savedPID.ki}, Kd=${SysIdState.savedPID.kd}`, 'info');
    }

    // Update UI
    updateSysIdUI('stopped');

    // Draw chart
    drawSysIdChart();

    addLogMessage(`[SysID] Nagrywanie zakończone. Zebrano ${SysIdState.data.length} próbek.`, 'success');
}

function updateSysIdUI(state) {
    const startBtn = document.getElementById('sysid-start-btn');
    const stopBtn = document.getElementById('sysid-stop-btn');
    const exportCsvBtn = document.getElementById('sysid-export-csv-btn');
    const exportMatBtn = document.getElementById('sysid-export-mat-btn');
    const clearBtn = document.getElementById('sysid-clear-btn');
    const statusText = document.getElementById('sysid-status-text');

    if (state === 'recording') {
        if (startBtn) startBtn.disabled = true;
        if (stopBtn) stopBtn.disabled = false;
        if (exportCsvBtn) exportCsvBtn.disabled = true;
        if (exportMatBtn) exportMatBtn.disabled = true;
        if (clearBtn) clearBtn.disabled = true;
        if (statusText) statusText.textContent = 'Nagrywanie...';
        if (statusText) statusText.style.color = '#61dafb';
    } else if (state === 'stopped') {
        if (startBtn) startBtn.disabled = false;
        if (stopBtn) stopBtn.disabled = true;
        const hasData = SysIdState.data.length > 0;
        if (exportCsvBtn) exportCsvBtn.disabled = !hasData;
        if (exportMatBtn) exportMatBtn.disabled = !hasData;
        if (clearBtn) clearBtn.disabled = !hasData;
        if (statusText) statusText.textContent = hasData ? 'Gotowy do eksportu' : 'Gotowy';
        if (statusText) statusText.style.color = hasData ? '#a2f279' : '#aaa';
    }
}

function drawSysIdChart() {
    const canvas = document.getElementById('sysid-preview-chart');
    if (!canvas || !SysIdState.chartCtx) return;

    const ctx = SysIdState.chartCtx;
    const data = SysIdState.data;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (data.length < 2) return;

    const padding = { left: 50, right: 60, top: 20, bottom: 30 };
    const width = canvas.width - padding.left - padding.right;
    const height = canvas.height - padding.top - padding.bottom;

    // Find min/max for angle
    const times = data.map(d => d.time);
    const angles = data.map(d => d.angle);
    const impulses = data.map(d => d.impulse_pwm || 0);

    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    const minAngle = Math.min(...angles) - 1;
    const maxAngle = Math.max(...angles) + 1;
    const maxImpulse = Math.max(...impulses, 1);

    // Scale functions
    const scaleX = (t) => padding.left + ((t - minTime) / (maxTime - minTime + 0.001)) * width;
    const scaleYAngle = (v) => padding.top + height - ((v - minAngle) / (maxAngle - minAngle + 0.001)) * height;
    const scaleYImpulse = (v) => padding.top + height - (v / maxImpulse) * height * 0.5;  // Scale impulse to half height

    // Draw grid
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let i = 0; i <= 5; i++) {
        const y = padding.top + (height / 5) * i;
        ctx.moveTo(padding.left, y);
        ctx.lineTo(canvas.width - padding.right, y);
    }
    ctx.stroke();

    // Draw zero line for angle
    if (minAngle < 0 && maxAngle > 0) {
        ctx.strokeStyle = '#666';
        ctx.lineWidth = 1;
        ctx.beginPath();
        const zeroY = scaleYAngle(0);
        ctx.moveTo(padding.left, zeroY);
        ctx.lineTo(canvas.width - padding.right, zeroY);
        ctx.stroke();
    }

    // Draw impulse (filled area)
    ctx.fillStyle = 'rgba(247, 183, 49, 0.3)';
    ctx.strokeStyle = '#f7b731';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(scaleX(data[0].time), padding.top + height);
    data.forEach((d, i) => {
        const x = scaleX(d.time);
        const y = scaleYImpulse(d.impulse_pwm || 0);
        ctx.lineTo(x, y);
    });
    ctx.lineTo(scaleX(data[data.length - 1].time), padding.top + height);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Draw angle (solid)
    ctx.strokeStyle = '#a2f279';
    ctx.lineWidth = 2;
    ctx.beginPath();
    data.forEach((d, i) => {
        const x = scaleX(d.time);
        const y = scaleYAngle(d.angle);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Draw labels
    ctx.fillStyle = '#aaa';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${minTime.toFixed(1)}s`, padding.left, canvas.height - 5);
    ctx.fillText(`${maxTime.toFixed(1)}s`, canvas.width - padding.right, canvas.height - 5);

    ctx.textAlign = 'right';
    ctx.fillText(`${maxAngle.toFixed(1)}°`, padding.left - 5, padding.top + 10);
    ctx.fillText(`${minAngle.toFixed(1)}°`, padding.left - 5, canvas.height - padding.bottom);

    // Legend
    ctx.textAlign = 'left';
    ctx.fillStyle = '#a2f279';
    ctx.fillText('● Kąt', canvas.width - 55, 15);
    ctx.fillStyle = '#f7b731';
    ctx.fillText('● Impuls PWM', canvas.width - 55, 28);
}

function exportSysIdCSV() {
    if (SysIdState.data.length === 0) {
        addLogMessage('[SysID] Brak danych do eksportu.', 'warn');
        return;
    }

    const header = 'time_s,angle_deg,impulse_pwm,pwm_output,speed_enc,gyro_y\n';
    const rows = SysIdState.data.map(d =>
        `${d.time.toFixed(4)},${d.angle.toFixed(4)},${d.impulse_pwm.toFixed(2)},${d.pwm.toFixed(2)},${d.speed.toFixed(2)},${d.gyroY.toFixed(4)}`
    ).join('\n');

    const csv = header + rows;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `sysid_data_${new Date().toISOString().slice(0, 19).replace(/[:-]/g, '')}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    addLogMessage(`[SysID] Eksportowano ${SysIdState.data.length} próbek do CSV.`, 'success');
}

function exportSysIdMAT() {
    if (SysIdState.data.length === 0) {
        addLogMessage('[SysID] Brak danych do eksportu.', 'warn');
        return;
    }

    // Create MATLAB script with embedded data
    const time = SysIdState.data.map(d => d.time.toFixed(4)).join(', ');
    const angle = SysIdState.data.map(d => d.angle.toFixed(4)).join(', ');
    const impulse_pwm = SysIdState.data.map(d => d.impulse_pwm.toFixed(2)).join(', ');
    const pwm = SysIdState.data.map(d => d.pwm.toFixed(2)).join(', ');
    const speed = SysIdState.data.map(d => d.speed.toFixed(2)).join(', ');
    const gyroY = SysIdState.data.map(d => d.gyroY.toFixed(4)).join(', ');

    const matlabScript = `%% System Identification Data - RoboBala
% Generated: ${new Date().toISOString()}
% Kp used: ${SysIdState.kp}
% Impulse PWM: ${SysIdState.impulse}
% Sample rate: ${SysIdState.sampleRate} Hz
% Duration: ${SysIdState.duration / 1000} s
% Impulse applied at: 1.0s (duration: 200ms)

% Data arrays
time = [${time}];               % Time in seconds
angle = [${angle}];             % Measured angle in degrees
impulse_pwm = [${impulse_pwm}]; % Impulse PWM input signal
pwm = [${pwm}];                 % PWM output
speed = [${speed}];             % Encoder speed
gyro_y = [${gyroY}];            % Gyroscope Y axis

% Create iddata object for System Identification Toolbox
% y = output (angle), u = input (impulse_pwm)
Ts = ${(1 / SysIdState.sampleRate).toFixed(6)};  % Sample time
data = iddata(angle', impulse_pwm', Ts);
data.InputName = 'Impulse_PWM';
data.OutputName = 'Angle';
data.InputUnit = 'PWM';
data.OutputUnit = 'deg';

% Plot data
figure;
subplot(3,1,1);
plot(time, angle, 'b-');
xlabel('Time [s]'); ylabel('Angle [deg]');
title('Measured Angle Response');
grid on;

subplot(3,1,2);
plot(time, impulse_pwm, 'r-', 'LineWidth', 2);
xlabel('Time [s]'); ylabel('PWM');
title('Impulse Input Signal');
grid on;

subplot(3,1,3);
plot(time, pwm, 'g-');
xlabel('Time [s]'); ylabel('PWM');
title('Control Effort (PWM Output)');
grid on;

% System identification example:
% sys = tfest(data, 2);  % Estimate 2nd order transfer function
% compare(data, sys);

disp('Data loaded successfully!');
disp(['Samples: ' num2str(length(time))]);
disp(['Impulse PWM: ${SysIdState.impulse}']);
`;

    const blob = new Blob([matlabScript], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `sysid_data_${new Date().toISOString().slice(0, 19).replace(/[:-]/g, '')}.m`;
    a.click();
    URL.revokeObjectURL(url);

    addLogMessage(`[SysID] Eksportowano ${SysIdState.data.length} próbek do skryptu MATLAB (.m).`, 'success');
}

function clearSysIdData() {
    SysIdState.data = [];
    updateSysIdUI('stopped');

    // Clear chart
    const canvas = document.getElementById('sysid-preview-chart');
    if (canvas && SysIdState.chartCtx) {
        SysIdState.chartCtx.clearRect(0, 0, canvas.width, canvas.height);
    }

    const countEl = document.getElementById('sysid-sample-count');
    if (countEl) countEl.textContent = '0';

    const progressEl = document.getElementById('sysid-progress');
    if (progressEl) progressEl.value = 0;

    addLogMessage('[SysID] Dane wyczyszczone.', 'info');
}
