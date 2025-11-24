// ============================================================================
// RoboBala - Integrated Main Application
// Bridges New Mobile UI with Existing Robot Communication Layer
// ============================================================================

// ============================================================================
// INITIALIZATION
// ============================================================================

// Initialize communication layer (from original main.js)
const SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
const RX_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a9";
const TX_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a8";
const commLayer = new BLECommunication(SERVICE_UUID, RX_UUID, TX_UUID);

// Backward compatibility wrapper for AppState
const AppState = new Proxy({}, {
    get(target, prop) {
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

// Global variables
window.telemetryData = {};
let bleDevice, rxCharacteristic, txCharacteristic;
let bleBuffer = '', bleMessageQueue = [], isSendingBleMessage = false;
const bleChunks = new Map();
const BLE_SEND_INTERVAL = 20;

// ============================================================================
// BLE COMMUNICATION FUNCTIONS
// ============================================================================

async function connectBLE() {
    addLogMessage('[UI] Proszę o wybranie urządzenia Bluetooth...', 'info');
    try {
        const connected = await commLayer.connect();
        
        if (!connected) {
            throw new Error('Failed to connect to device');
        }
        
        bleDevice = commLayer.device;
        rxCharacteristic = commLayer.rxCharacteristic;
        txCharacteristic = commLayer.txCharacteristic;
        
        const deviceName = commLayer.getDeviceName();
        addLogMessage(`[UI] Łączenie z ${deviceName}...`, 'info');
        
        const connectBtn = document.getElementById('connectBtn');
        connectBtn.disabled = true;
        connectBtn.querySelector('span').textContent = 'Łączenie...';
        
        AppState.isConnected = true;
        AppState.isSynced = false;
        appStore.setState('connection.deviceName', deviceName);
        
        const connectionDot = document.getElementById('connectionDot');
        const connectionText = document.getElementById('connectionText');
        
        if (connectionDot) connectionDot.classList.add('connected');
        if (connectionText) connectionText.textContent = 'Połączony';
        
        addLogMessage('[UI] Połączono! Rozpoczynam synchronizację...', 'success');
        connectBtn.querySelector('span').textContent = 'Synchronizowanie...';
        
        AppState.isSynced = false;
        AppState.tempParams = {};
        AppState.tempTuningParams = {};
        AppState.tempStates = {};
        
        sendBleMessage({ type: 'request_full_config' });
        
        clearTimeout(AppState.syncTimeout);
        AppState.syncTimeout = setTimeout(() => {
            if (!AppState.isSynced && AppState.isConnected) {
                addLogMessage('[UI] BŁĄD: Timeout synchronizacji. Robot nie odpowiedział na czas (20s).', 'error');
                if (connectionText) connectionText.textContent = 'Błąd synchronizacji';
                connectBtn.querySelector('span').textContent = 'SPRÓBUJ PONOWNIE';
                connectBtn.disabled = false;
            }
        }, 20000);
    } catch (error) {
        addLogMessage(`[UI] Błąd połączenia BLE: ${error}`, 'error');
        onDisconnected();
    }
}

function onDisconnected() {
    AppState.isConnected = false;
    AppState.isSynced = false;
    appStore.setState('ui.isLocked', true);
    
    const connectBtn = document.getElementById('connectBtn');
    const connectionDot = document.getElementById('connectionDot');
    const connectionText = document.getElementById('connectionText');
    
    if (connectBtn) {
        connectBtn.disabled = false;
        connectBtn.querySelector('span').textContent = 'Połącz z Robotem';
    }
    
    if (connectionDot) connectionDot.classList.remove('connected');
    if (connectionText) connectionText.textContent = 'Rozłączony';
    
    ['balanceToggle', 'holdPositionToggle', 'speedModeToggle'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.checked = false;
    });
    
    addLogMessage('[UI] Rozłączono z robotem', 'warn');
}

function sendBleMessage(message) {
    try {
        if (['request_full_config', 'set_param', 'save_tunings'].includes(message.type)) {
            addLogMessage(`[UI -> ROBOT] Sending: ${message.type}`, 'info');
        }
    } catch (e) { }
    
    if (commLayer && commLayer.getConnectionStatus()) {
        commLayer.send(message);
    } else {
        bleMessageQueue.push(message);
        processBleQueue();
    }
}

async function processBleQueue() {
    if (isSendingBleMessage || bleMessageQueue.length === 0 || !rxCharacteristic) return;
    isSendingBleMessage = true;
    const message = bleMessageQueue.shift();
    
    try {
        const encoder = new TextEncoder();
        await rxCharacteristic.writeValueWithoutResponse(encoder.encode(JSON.stringify(message) + '\n'));
    } catch (error) {
        addLogMessage(`[UI] Błąd wysyłania danych BLE: ${error}`, 'error');
    }
    
    setTimeout(() => {
        isSendingBleMessage = false;
        processBleQueue();
    }, BLE_SEND_INTERVAL);
}

// ============================================================================
// MESSAGE PROCESSING
// ============================================================================

function processCompleteMessage(data) {
    if (!data || !data.type) return;
    
    switch (data.type) {
        case 'telemetry':
            updateTelemetryUI(data);
            window.telemetryData = data;
            break;
            
        case 'sync_begin':
            clearTimeout(AppState.syncTimeout);
            AppState.isSynced = false;
            const connectionText = document.getElementById('connectionText');
            if (connectionText) connectionText.textContent = 'Synchronizowanie...';
            addLogMessage('[UI] Rozpoczęto odbieranie konfiguracji...', 'info');
            break;
            
        case 'set_param':
            if (!AppState.isSynced) {
                if (data.key === 'balancing' || data.key === 'holding_pos' || data.key === 'speed_mode') {
                    if (!AppState.tempStates) AppState.tempStates = {};
                    AppState.tempStates[data.key] = data.value;
                } else {
                    if (!AppState.tempParams) AppState.tempParams = {};
                    AppState.tempParams[data.key] = data.value;
                }
            } else {
                applySingleParam(data.key, data.value);
            }
            break;
            
        case 'sync_complete':
            AppState.isApplyingConfig = true;
            
            // Apply parameters
            for (const [key, value] of Object.entries(AppState.tempParams || {})) {
                applySingleParam(key, value);
            }
            
            // Apply states
            if (AppState.tempStates) {
                if (AppState.tempStates.balancing !== undefined) {
                    const el = document.getElementById('balanceToggle');
                    if (el) el.checked = AppState.tempStates.balancing;
                }
                if (AppState.tempStates.holding_pos !== undefined) {
                    const el = document.getElementById('holdPositionToggle');
                    if (el) el.checked = AppState.tempStates.holding_pos;
                }
                if (AppState.tempStates.speed_mode !== undefined) {
                    const el = document.getElementById('speedModeToggle');
                    if (el) el.checked = AppState.tempStates.speed_mode;
                }
            }
            
            AppState.isApplyingConfig = false;
            clearTimeout(AppState.syncTimeout);
            AppState.isSynced = true;
            
            const connText = document.getElementById('connectionText');
            const connBtn = document.getElementById('connectBtn');
            
            if (connText) connText.textContent = 'Połączony';
            if (connBtn) connBtn.querySelector('span').textContent = 'Rozłącz';
            
            addLogMessage('[UI] Synchronizacja konfiguracji zakończona pomyślnie.', 'success');
            
            AppState.tempParams = {};
            AppState.tempTuningParams = {};
            AppState.tempStates = {};
            break;
            
        case 'log':
            addLogMessage(`[ROBOT] ${data.message}`, data.level || 'info');
            break;
            
        case 'ack':
            const level = data.success ? 'success' : 'error';
            addLogMessage(`[ROBOT] ${data.command}: ${data.message || (data.success ? 'OK' : 'BŁĄD')}`, level);
            break;
    }
}

function applySingleParam(key, value) {
    // Map old parameter keys to new UI element IDs
    const paramMap = {
        'kp_b': 'balanceKp',
        'ki_b': 'balanceKi',
        'kd_b': 'balanceKd',
        'balance_pid_derivative_filter_alpha': 'balanceFilterAlpha',
        'balance_pid_integral_limit': 'balanceIntegralLimit'
    };
    
    const elementId = paramMap[key];
    if (elementId) {
        const element = document.getElementById(elementId);
        if (element) {
            // Convert percentage values
            if (key.includes('alpha') && typeof value === 'number') {
                element.value = (value * 100).toFixed(0);
            } else {
                element.value = value;
            }
        }
    }
}

function updateTelemetryUI(data) {
    // Update telemetry displays
    const updates = {
        'pitchValue': data.pitch !== undefined ? `${data.pitch.toFixed(1)}°` : '0.0°',
        'rollValue': data.roll !== undefined ? `${data.roll.toFixed(1)}°` : '0.0°',
        'yawValue': data.yaw !== undefined ? `${data.yaw.toFixed(1)}°` : '0.0°',
        'loopTimeValue': data.loopTime !== undefined ? `${data.loopTime} μs` : '0 μs'
    };
    
    for (const [id, value] of Object.entries(updates)) {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
    }
}

// ============================================================================
// UI EVENT HANDLERS
// ============================================================================

function setupIntegratedEventHandlers() {
    // Connect button
    const connectBtn = document.getElementById('connectBtn');
    if (connectBtn) {
        connectBtn.addEventListener('click', () => {
            if (AppState.isConnected) {
                commLayer.disconnect();
            } else {
                connectBLE();
            }
        });
    }
    
    // Emergency FAB
    const emergencyFab = document.getElementById('emergencyFab');
    if (emergencyFab) {
        emergencyFab.addEventListener('click', () => {
            if (confirm('Czy na pewno chcesz wykonać awaryjne zatrzymanie robota?')) {
                sendBleMessage({ type: 'emergency_stop' });
                addLogMessage('[UI] AWARYJNE ZATRZYMANIE wykonane', 'error');
            }
        });
    }
    
    // Toggle switches
    const toggleHandlers = {
        'balanceToggle': 'balance_toggle',
        'holdPositionToggle': 'hold_position_toggle',
        'speedModeToggle': 'speed_mode_toggle'
    };
    
    for (const [id, messageType] of Object.entries(toggleHandlers)) {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', (e) => {
                if (AppState.isApplyingConfig) return;
                sendBleMessage({ type: messageType, enabled: e.target.checked });
                const state = e.target.checked ? 'włączono' : 'wyłączono';
                addLogMessage(`${id.replace('Toggle', '')} ${state}`, e.target.checked ? 'success' : 'warn');
            });
        }
    }
    
    // Save/Load config buttons
    const saveConfig = document.getElementById('saveConfig');
    if (saveConfig) {
        saveConfig.addEventListener('click', () => {
            if (AppState.isConnected && confirm("Czy na pewno chcesz trwale zapisać bieżącą konfigurację do pamięci EEPROM robota?")) {
                addLogMessage('[UI] Wysłano polecenie zapisu konfiguracji do EEPROM...', 'info');
                sendBleMessage({ type: 'save_tunings' });
            } else if (!AppState.isConnected) {
                addLogMessage('[UI] Połącz z robotem przed zapisem konfiguracji.', 'warn');
            }
        });
    }
    
    const loadConfig = document.getElementById('loadConfig');
    if (loadConfig) {
        loadConfig.addEventListener('click', () => {
            if (confirm("UWAGA! Spowoduje to nadpisanie wszystkich niezapisanych zmian w panelu. Kontynuować?")) {
                AppState.isSynced = false;
                AppState.tempParams = {};
                AppState.tempStates = {};
                sendBleMessage({ type: 'request_full_config' });
            }
        });
    }
    
    // Parameter inputs - send changes to robot
    document.querySelectorAll('input[type="number"]').forEach(input => {
        input.addEventListener('change', (e) => {
            if (AppState.isApplyingConfig) return;
            
            const paramMap = {
                'balanceKp': 'kp_b',
                'balanceKi': 'ki_b',
                'balanceKd': 'kd_b',
                'balanceFilterAlpha': 'balance_pid_derivative_filter_alpha',
                'balanceIntegralLimit': 'balance_pid_integral_limit'
            };
            
            const key = paramMap[e.target.id];
            if (key) {
                let value = parseFloat(e.target.value);
                
                // Convert percentage to decimal
                if (key.includes('alpha')) {
                    value = value / 100.0;
                }
                
                sendBleMessage({ type: 'set_param', key: key, value: value });
                addLogMessage(`[UI] Ustawiono ${key}: ${value}`, 'info');
            }
        });
    });
}

// ============================================================================
// COMMUNICATION LAYER SETUP
// ============================================================================

function setupCommunicationHandlers() {
    commLayer.onMessage('disconnected', () => {
        onDisconnected();
    });
    
    commLayer.onMessage('*', (type, data) => {
        if (type !== 'disconnected') {
            processCompleteMessage(data);
        }
    });
    
    appStore.subscribe('connection.isConnected', (value) => {
        // Update UI based on connection state
    });
}

// ============================================================================
// MAIN INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    // Setup communication
    setupCommunicationHandlers();
    
    // Setup integrated event handlers
    setupIntegratedEventHandlers();
    
    // Hide splash screen after 2 seconds
    const splashScreen = document.getElementById('splashScreen');
    setTimeout(() => {
        if (splashScreen) {
            splashScreen.classList.add('exiting');
            setTimeout(() => {
                splashScreen.classList.remove('active', 'exiting');
            }, 500);
        }
    }, 2000);
    
    addLogMessage('[UI] Aplikacja uruchomiona', 'success');
    addLogMessage('[UI] System gotowy do pracy', 'success');
});

// ============================================================================
// LOG SYSTEM (from new UI)
// ============================================================================

function addLogMessage(message, type = 'info') {
    const logMessages = document.getElementById('logMessages');
    const logBadge = document.getElementById('logBadge');
    const logAutoscroll = document.getElementById('logAutoscroll');
    
    if (!logMessages) return;
    
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry ${type}`;
    
    const time = new Date().toLocaleTimeString('pl-PL');
    logEntry.innerHTML = `<span class="log-time">${time}</span>${message}`;
    
    logMessages.appendChild(logEntry);
    
    // Update badge
    if (logBadge) {
        const count = parseInt(logBadge.textContent) || 0;
        logBadge.textContent = count + 1;
    }
    
    // Auto-scroll if enabled
    if (logAutoscroll && logAutoscroll.checked) {
        logMessages.scrollTop = logMessages.scrollHeight;
    }
}

// Make addLogMessage globally available
window.addLogMessage = addLogMessage;
