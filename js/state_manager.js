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
