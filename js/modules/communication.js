// ========================================================================
// COMMUNICATION LAYER - Abstract Communication Interface (ES6 Module)
// ========================================================================
// Warstwa abstrakcji komunikacji z robotem. Oddziela aplikację od
// konkretnego protokołu (BLE), ułatwia testowanie i zmianę protokołu.
// ========================================================================

import { appStore, AppState } from './state.js';

// BLE Service UUIDs
export const SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
export const RX_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a9";
export const TX_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a8";

/**
 * Abstract base class for communication
 */
export class CommunicationLayer {
    constructor() {
        this.messageHandlers = new Map();
        this.isConnected = false;
    }

    async connect() { throw new Error('connect() must be implemented by subclass'); }
    async disconnect() { throw new Error('disconnect() must be implemented by subclass'); }
    async send(message) { throw new Error('send() must be implemented by subclass'); }

    onMessage(type, handler) {
        if (!this.messageHandlers.has(type)) {
            this.messageHandlers.set(type, []);
        }
        this.messageHandlers.get(type).push(handler);
    }

    offMessage(type, handler) {
        if (this.messageHandlers.has(type)) {
            const handlers = this.messageHandlers.get(type);
            const index = handlers.indexOf(handler);
            if (index !== -1) handlers.splice(index, 1);
        }
    }

    notifyHandlers(type, data) {
        if (this.messageHandlers.has(type)) {
            for (const handler of this.messageHandlers.get(type)) {
                try { handler(data); } catch (error) {
                    console.error(`Error in message handler for ${type}:`, error);
                }
            }
        }
        if (this.messageHandlers.has('*')) {
            for (const handler of this.messageHandlers.get('*')) {
                try { handler(type, data); } catch (error) {
                    console.error('Error in wildcard message handler:', error);
                }
            }
        }
    }

    getConnectionStatus() { return this.isConnected; }
}

/**
 * Bluetooth Low Energy (BLE) implementation of CommunicationLayer
 */
export class BLECommunication extends CommunicationLayer {
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
        this.sendInterval = 5;
        this.chunks = new Map();
    }

    async connect(targetDeviceName = null) {
        try {
            const filters = [];
            if (targetDeviceName) {
                filters.push({ name: targetDeviceName, services: [this.serviceUuid] });
            } else {
                filters.push({ namePrefix: 'RoboBala', services: [this.serviceUuid] });
            }

            this.device = await navigator.bluetooth.requestDevice({
                filters: filters,
                optionalServices: [this.serviceUuid]
            });

            this.device.addEventListener('gattserverdisconnected', () => {
                this.handleDisconnection();
            });

            const server = await this.device.gatt.connect();
            const service = await server.getPrimaryService(this.serviceUuid);
            this.rxCharacteristic = await service.getCharacteristic(this.rxUuid);
            this.txCharacteristic = await service.getCharacteristic(this.txUuid);

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

    async disconnect() {
        if (this.device && this.device.gatt.connected) {
            await this.device.gatt.disconnect();
        }
        this.handleDisconnection();
    }

    handleDisconnection() {
        this.isConnected = false;
        this.device = null;
        this.rxCharacteristic = null;
        this.txCharacteristic = null;
        this.messageQueue = [];
        this.buffer = '';
        this.chunks.clear();
        this.notifyHandlers('disconnected', {});
    }

    handleNotification(event) {
        const value = event.target.value;
        const decoder = new TextDecoder('utf-8');
        this.buffer += decoder.decode(value);

        let newlineIndex;
        while ((newlineIndex = this.buffer.indexOf('\n')) !== -1) {
            const line = this.buffer.substring(0, newlineIndex).trim();
            this.buffer = this.buffer.substring(newlineIndex + 1);

            if (line) {
                try {
                    const data = JSON.parse(line);
                    if ((data.type === 'chunk' || data.type === 'chunk_stream') && data.id !== undefined) {
                        this.handleChunk({ id: data.id, i: data.i, total: data.total, data: data.data });
                    } else {
                        this.notifyHandlers(data.type, data);
                    }
                } catch (error) {
                    console.error('JSON parse error:', error, 'Data:', line);
                }
            }
        }
    }

    handleChunk(chunk) {
        const { id, i, total, data } = chunk;
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

        entry.parts.set(i, data || '');
        if (total) entry.total = total;

        if (entry.parts.size === entry.total && entry.total > 0) {
            clearTimeout(entry.timer);
            let combined = '';
            for (let idx = 0; idx < entry.total; idx++) {
                combined += entry.parts.get(idx) || '';
            }
            this.chunks.delete(id);
            try {
                const fullMessage = JSON.parse(combined);
                this.notifyHandlers(fullMessage.type, fullMessage);
            } catch (error) {
                console.error('Error assembling chunks:', error, 'Data:', combined);
            }
        }
    }

    async send(message) {
        this.messageQueue.push(message);
        this.processQueue();
    }

    async sendImmediate(message) {
        if (!this.rxCharacteristic || !this.isConnected) return;
        try {
            const encoder = new TextEncoder();
            const data = JSON.stringify(message) + '\n';
            await this.rxCharacteristic.writeValueWithoutResponse(encoder.encode(data));
        } catch (error) {
            // Silently ignore errors for immediate sends (joystick)
        }
    }

    async processQueue() {
        if (this.isSending || this.messageQueue.length === 0 || !this.rxCharacteristic) return;
        this.isSending = true;
        const message = this.messageQueue.shift();
        try {
            const encoder = new TextEncoder();
            const data = JSON.stringify(message) + '\n';
            await this.rxCharacteristic.writeValueWithoutResponse(encoder.encode(data));
        } catch (error) {
            console.error('BLE send error:', error);
        }
        setTimeout(() => {
            this.isSending = false;
            this.processQueue();
        }, this.sendInterval);
    }

    getDeviceName() {
        return this.device ? this.device.name : null;
    }
}

/**
 * Mock communication for testing
 */
export class MockCommunication extends CommunicationLayer {
    constructor() {
        super();
        this.mockDelay = 50;
    }

    async connect() {
        await new Promise(resolve => setTimeout(resolve, this.mockDelay));
        this.isConnected = true;
        return true;
    }

    async disconnect() {
        await new Promise(resolve => setTimeout(resolve, this.mockDelay));
        this.isConnected = false;
        this.notifyHandlers('disconnected', {});
    }

    async send(message) {
        if (!this.isConnected) throw new Error('Not connected');
        await new Promise(resolve => setTimeout(resolve, this.mockDelay));
        console.log('Mock send:', message);

        if (message.type === 'request_full_config') {
            setTimeout(() => {
                this.notifyHandlers('sync_begin', {});
                this.notifyHandlers('set_param', { key: 'kp_b', value: 95.0 });
                this.notifyHandlers('sync_end', {});
            }, 100);
        }
    }

    getDeviceName() { return 'MockRoboBala'; }
}

// Create singleton communication layer
export const commLayer = new BLECommunication(SERVICE_UUID, RX_UUID, TX_UUID);

// Legacy BLE variables for backward compatibility
let bleDevice, rxCharacteristic, txCharacteristic;
let bleBuffer = '', bleMessageQueue = [], isSendingBleMessage = false;
const bleChunks = new Map();
const BLE_SEND_INTERVAL = 20;

/**
 * Send a BLE message using the communication layer (or legacy fallback)
 */
export function sendBleMessage(message) {
    try {
        if (['run_metrics_test', 'cancel_test', 'request_full_config', 'set_param', 'execute_move', 'execute_rotate', 'command_stop'].includes(message.type)) {
            if (typeof window.addLogMessage === 'function') {
                window.addLogMessage(`[UI -> ROBOT] Sending: ${message.type} ${JSON.stringify(message)}`, 'info');
            }
        }
    } catch (e) { /* ignore logging errors */ }

    if (commLayer && commLayer.getConnectionStatus()) {
        if (message.type === 'joystick' && typeof commLayer.sendImmediate === 'function') {
            commLayer.sendImmediate(message);
        } else {
            commLayer.send(message);
        }
    } else {
        bleMessageQueue.push(message);
        processBleQueue();
    }
}

async function _sendRawBleMessage(message) {
    if (!rxCharacteristic) return;
    try {
        const encoder = new TextEncoder();
        await rxCharacteristic.writeValueWithoutResponse(encoder.encode(JSON.stringify(message) + '\n'));
    } catch (error) {
        if (typeof window.addLogMessage === 'function') {
            window.addLogMessage(`[UI] Blad wysylania danych BLE: ${error}`, 'error');
        }
    }
}

async function processBleQueue() {
    if (isSendingBleMessage || bleMessageQueue.length === 0 || !rxCharacteristic) return;
    isSendingBleMessage = true;
    const message = bleMessageQueue.shift();
    await _sendRawBleMessage(message);
    setTimeout(() => {
        isSendingBleMessage = false;
        processBleQueue();
    }, BLE_SEND_INTERVAL);
}

/**
 * Connect to BLE device
 */
export async function connectBLE() {
    const targetDevice = getTargetDeviceFromURL();
    const addLog = window.addLogMessage || console.log;

    if (targetDevice) {
        addLog(`[UI] Laczenie z konkretnym robotem: ${targetDevice}...`, 'info');
    } else {
        addLog('[UI] Prosze o wybranie urzadzenia Bluetooth...', 'info');
    }

    try {
        const connected = await commLayer.connect(targetDevice);
        if (!connected) throw new Error('Failed to connect to device');

        if (targetDevice) clearDeviceFromURL();

        bleDevice = commLayer.device;
        rxCharacteristic = commLayer.rxCharacteristic;
        txCharacteristic = commLayer.txCharacteristic;

        const deviceName = commLayer.getDeviceName();
        addLog(`[UI] Laczenie z ${deviceName}...`, 'info');

        const connectBtn = document.getElementById('connectBleBtn');
        if (connectBtn) connectBtn.disabled = true;
        const connText = document.getElementById('connectionText');
        if (connText) connText.textContent = 'Laczenie...';

        AppState.isConnected = true;
        AppState.isSynced = false;
        appStore.setState('connection.deviceName', deviceName);

        document.getElementById('connectionStatus').className = 'status-indicator status-ok';
        document.getElementById('connectionText').textContent = 'Polaczony';
        addLog('[UI] Polaczono! Rozpoczynam synchronizacje...', 'success');
        document.body.classList.remove('ui-locked');
        document.getElementById('connectBleBtn').textContent = 'Synchronizowanie...';

        const qrBtn = document.getElementById('showQrBtn');
        if (qrBtn) {
            qrBtn.disabled = false;
            qrBtn.style.background = '#61dafb';
            qrBtn.style.opacity = '1';
            qrBtn.title = 'Pokaż kod QR do połączenia z tym robotem';
        }

        AppState.isSynced = false;
        AppState.tempParams = {};
        AppState.tempTuningParams = {};
        AppState.tempStates = {};

        sendBleMessage({ type: 'request_full_config' });

        clearTimeout(AppState.syncTimeout);
        AppState.syncTimeout = setTimeout(() => {
            if (!AppState.isSynced && AppState.isConnected) {
                addLog('[UI] BLAD: Timeout synchronizacji. Robot nie odpowiedzial na czas (20s).', 'error');
                document.getElementById('connectionText').textContent = 'Blad synchronizacji';
                document.getElementById('connectBleBtn').textContent = 'SPROBUJ PONOWNIE ZSYNCHRONIZOWAC';
                document.getElementById('connectBleBtn').style.backgroundColor = '#ff6347';
                document.getElementById('connectBleBtn').disabled = false;
            }
        }, 20000);
    } catch (error) {
        addLog(`[UI] Blad polaczenia BLE: ${error}`, 'error');
        onDisconnected();
    }
}

/**
 * Handle BLE disconnection
 */
export function onDisconnected() {
    AppState.isConnected = false;
    AppState.isSynced = false;
    appStore.setState('ui.isLocked', true);
    document.body.classList.add('ui-locked');

    if (AppState.isTuningActive) {
        if (typeof window.handleCancel === 'function') window.handleCancel();
    }

    const connectBtn = document.getElementById('connectBleBtn');
    if (connectBtn) {
        connectBtn.disabled = false;
        connectBtn.textContent = 'POLACZ Z ROBOTEM';
        connectBtn.style.backgroundColor = '';
    }

    document.getElementById('connectionStatus').className = 'status-indicator status-disconnected';
    document.getElementById('connectionText').textContent = 'Rozlaczony';

    const qrBtn = document.getElementById('showQrBtn');
    if (qrBtn) {
        qrBtn.disabled = true;
        qrBtn.style.background = '#555';
        qrBtn.style.opacity = '0.5';
        qrBtn.title = 'Połącz się z robotem, aby wygenerować kod QR';
    }

    ['balanceSwitch', 'holdPositionSwitch', 'speedModeSwitch'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.checked = false;
    });
}

/**
 * Setup communication layer message handlers
 */
export function setupCommunicationHandlers() {
    commLayer.onMessage('disconnected', () => {
        onDisconnected();
    });

    commLayer.onMessage('*', (type, data) => {
        if (type !== 'disconnected') {
            if (typeof window.processCompleteMessage === 'function') {
                window.processCompleteMessage(data);
            }
        }
    });

    appStore.subscribe('connection.isConnected', (value) => {
        document.body.classList.toggle('ui-locked', !value);
        document.querySelectorAll('.dpad-btn').forEach(btn => {
            try { btn.disabled = !value; } catch (e) { }
        });
    });

    appStore.subscribe('robot.state', (value) => {
        const stateEl = document.getElementById('robotStateVal');
        if (stateEl) stateEl.textContent = value;
    });

    appStore.subscribe('tuning.isActive', (value) => {
        if (typeof window.setTuningUiLock === 'function') {
            window.setTuningUiLock(value, appStore.getState('tuning.activeMethod'));
        }
        if (value && typeof window.refreshRecentList === 'function') window.refreshRecentList();
    });
}

// URL helpers for QR auto-connect
function getTargetDeviceFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('device');
}

function clearDeviceFromURL() {
    const url = new URL(window.location);
    url.searchParams.delete('device');
    window.history.replaceState({}, '', url);
}

// Backward compatibility - expose on window
window.commLayer = commLayer;
window.sendBleMessage = sendBleMessage;
window.connectBLE = connectBLE;
window.onDisconnected = onDisconnected;
window.setupCommunicationHandlers = setupCommunicationHandlers;
window.getTargetDeviceFromURL = getTargetDeviceFromURL;
window.clearDeviceFromURL = clearDeviceFromURL;

// Legacy backward compatibility
window.bleDevice = bleDevice;
window.handleBleNotification = function() {}; // stub - handled by commLayer now
