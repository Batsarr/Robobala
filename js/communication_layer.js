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
            // Notify handlers about successful connection
            try { this.notifyHandlers('connected', { deviceName: this.getDeviceName() }); } catch (e) { /* no-op */ }
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
        // Notify handlers about successful mock connection
        try { this.notifyHandlers('connected', { deviceName: this.getDeviceName() }); } catch (e) { /* no-op */ }
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
