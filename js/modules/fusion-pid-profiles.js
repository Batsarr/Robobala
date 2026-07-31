// ========================================================================
// FUSION-PID-PROFILES.JS - Dual PID Profiles for Mahony/NDOF (ES6)
// ========================================================================
// Automatyczne przełączanie zestawów PID przy zmianie trybu fuzji IMU.
// Extracted from main.js → Etap 2 modularyzacji
// ========================================================================

import { AppState } from './state.js';

/**
 * FusionPIDProfiles - Manager dwóch zestawów PID (Mahony/NDOF) przechowywanych w EEPROM robota
 */
export const FusionPIDProfiles = {
    mahonyPID: {
        balance: { Kp: 100, Ki: 0, Kd: 1.3, filterAlpha: 1.0, integralLimit: 50 },
        speed: { Kp: 0.1, Ki: 0, Kd: 0.05, filterAlpha: 0.8, integralLimit: 20 },
        position: { Kp: 0.05, Ki: 0, Kd: 0.02, filterAlpha: 0.9, integralLimit: 100 }
    },
    ndofPID: {
        balance: { Kp: 160, Ki: 0, Kd: 2.86, filterAlpha: 1.0, integralLimit: 50 },
        speed: { Kp: 0.16, Ki: 0, Kd: 0.11, filterAlpha: 0.8, integralLimit: 20 },
        position: { Kp: 0.08, Ki: 0, Kd: 0.044, filterAlpha: 0.9, integralLimit: 100 }
    },

    currentFusionMode: 'ndof',
    isSwitching: false,

    init() {
        this.detectCurrentMode();
        this.setupEventListeners();
        this.updateFusionIndicator();
        const addLogMessage = window.addLogMessage;
        if (addLogMessage) addLogMessage('[FusionPID] 📊 Moduł profili PID zainicjalizowany. Tryb: ' +
            (this.currentFusionMode === 'mahony' ? '⚡ Mahony (~500Hz)' : '🔄 NDOF (~100Hz)'), 'info');
    },

    detectCurrentMode() {
        const checkbox = document.getElementById('useMahonyFilterInput');
        this.currentFusionMode = checkbox?.checked ? 'mahony' : 'ndof';
        return this.currentFusionMode;
    },

    updateFromSync(key, value) {
        const mappings = {
            'kp_b': () => this.mahonyPID.balance.Kp = value,
            'ki_b': () => this.mahonyPID.balance.Ki = value,
            'kd_b': () => this.mahonyPID.balance.Kd = value,
            'balance_pid_derivative_filter_alpha': () => this.mahonyPID.balance.filterAlpha = value,
            'balance_pid_integral_limit': () => this.mahonyPID.balance.integralLimit = value,
            'kp_s': () => this.mahonyPID.speed.Kp = value,
            'ki_s': () => this.mahonyPID.speed.Ki = value,
            'kd_s': () => this.mahonyPID.speed.Kd = value,
            'speed_pid_filter_alpha': () => this.mahonyPID.speed.filterAlpha = value,
            'speed_pid_integral_limit': () => this.mahonyPID.speed.integralLimit = value,
            'kp_p': () => this.mahonyPID.position.Kp = value,
            'ki_p': () => this.mahonyPID.position.Ki = value,
            'kd_p': () => this.mahonyPID.position.Kd = value,
            'position_pid_filter_alpha': () => this.mahonyPID.position.filterAlpha = value,
            'position_pid_integral_limit': () => this.mahonyPID.position.integralLimit = value,
            'kp_b_ndof': () => this.ndofPID.balance.Kp = value,
            'ki_b_ndof': () => this.ndofPID.balance.Ki = value,
            'kd_b_ndof': () => this.ndofPID.balance.Kd = value,
            'balance_pid_derivative_filter_alpha_ndof': () => this.ndofPID.balance.filterAlpha = value,
            'balance_pid_integral_limit_ndof': () => this.ndofPID.balance.integralLimit = value,
            'kp_s_ndof': () => this.ndofPID.speed.Kp = value,
            'ki_s_ndof': () => this.ndofPID.speed.Ki = value,
            'kd_s_ndof': () => this.ndofPID.speed.Kd = value,
            'speed_pid_filter_alpha_ndof': () => this.ndofPID.speed.filterAlpha = value,
            'speed_pid_integral_limit_ndof': () => this.ndofPID.speed.integralLimit = value,
            'kp_p_ndof': () => this.ndofPID.position.Kp = value,
            'ki_p_ndof': () => this.ndofPID.position.Ki = value,
            'kd_p_ndof': () => this.ndofPID.position.Kd = value,
            'position_pid_filter_alpha_ndof': () => this.ndofPID.position.filterAlpha = value,
            'position_pid_integral_limit_ndof': () => this.ndofPID.position.integralLimit = value,
        };
        if (mappings[key]) mappings[key]();
    },

    getCurrentPID() {
        return this.currentFusionMode === 'mahony' ? this.mahonyPID : this.ndofPID;
    },

    loadCurrentPIDToUI() {
        if (this.isSwitching) return;
        this.isSwitching = true;
        const pid = this.getCurrentPID();

        this.setInputValue('balanceKpInput', pid.balance.Kp);
        this.setInputValue('balanceKiInput', pid.balance.Ki);
        this.setInputValue('balanceKdInput', pid.balance.Kd);
        this.setInputValue('balanceFilterAlphaInput', pid.balance.filterAlpha * 100);
        this.setInputValue('balanceIntegralLimitInput', pid.balance.integralLimit);

        this.setInputValue('speedKpInput', pid.speed.Kp);
        this.setInputValue('speedKiInput', pid.speed.Ki);
        this.setInputValue('speedKdInput', pid.speed.Kd);
        this.setInputValue('speedFilterAlphaInput', pid.speed.filterAlpha * 100);
        this.setInputValue('speedIntegralLimitInput', pid.speed.integralLimit);

        this.setInputValue('positionKpInput', pid.position.Kp);
        this.setInputValue('positionKiInput', pid.position.Ki);
        this.setInputValue('positionKdInput', pid.position.Kd);
        this.setInputValue('positionFilterAlphaInput', pid.position.filterAlpha * 100);
        this.setInputValue('positionIntegralLimitInput', pid.position.integralLimit);

        this.isSwitching = false;
    },

    setInputValue(inputId, value) {
        const input = document.getElementById(inputId);
        if (input) input.value = value;
    },

    getParamKey(baseKey) {
        if (this.currentFusionMode === 'ndof') {
            const ndofKeys = ['kp_b', 'ki_b', 'kd_b', 'balance_pid_derivative_filter_alpha', 'balance_pid_integral_limit',
                'kp_s', 'ki_s', 'kd_s', 'speed_pid_filter_alpha', 'speed_pid_integral_limit',
                'kp_p', 'ki_p', 'kd_p', 'position_pid_filter_alpha', 'position_pid_integral_limit'];
            if (ndofKeys.includes(baseKey)) return baseKey + '_ndof';
        }
        return baseKey;
    },

    onFusionModeChange(newMode) {
        if (this.isSwitching) return;
        const oldMode = this.currentFusionMode;
        if (oldMode === newMode) return;

        this.saveCurrentToProfile();
        this.currentFusionMode = newMode;
        this.loadCurrentPIDToUI();
        this.updateFusionIndicator();

        const addLogMessage = window.addLogMessage;
        const modeName = newMode === 'mahony' ? '⚡ Mahony (~500Hz)' : '🔄 NDOF (~100Hz)';
        if (addLogMessage) addLogMessage(`[FusionPID] 🔄 Przełączono na profil ${modeName}`, 'info');
    },

    updateFusionIndicator() {
        const indicator = document.getElementById('fusionModeIndicator');
        const sysidIndicator = document.getElementById('sysidFusionIndicator');
        const indicator4 = document.getElementById('fusionModeIndicator4');
        const indicator5 = document.getElementById('fusionModeIndicator5');
        const indicators = [indicator, sysidIndicator, indicator4, indicator5].filter(el => el);

        indicators.forEach(ind => {
            if (this.currentFusionMode === 'mahony') {
                ind.innerHTML = ind.id === 'fusionModeIndicator' ? '⚡ Mahony (~500Hz)' : '⚡ Mahony';
                ind.className = 'fusion-indicator fusion-mahony';
                ind.title = 'Własna fuzja Mahony - szybka (~500Hz), mniejsze Kp/Kd';
            } else {
                ind.innerHTML = ind.id === 'fusionModeIndicator' ? '🔄 NDOF (~100Hz)' : '🔄 NDOF';
                ind.className = 'fusion-indicator fusion-ndof';
                ind.title = 'Wbudowana fuzja BNO055 - stabilna (~100Hz), większe Kp/Kd';
            }
        });
    },

    setupEventListeners() {
        const checkbox = document.getElementById('useMahonyFilterInput');
        if (checkbox) {
            checkbox.addEventListener('change', (e) => {
                this.onFusionModeChange(e.target.checked ? 'mahony' : 'ndof');
            });
        }
    },

    saveCurrentToProfile() {
        const pid = this.getCurrentPID();
        const addLogMessage = window.addLogMessage;

        pid.balance.Kp = this.getInputValue('balanceKpInput', pid.balance.Kp);
        pid.balance.Ki = this.getInputValue('balanceKiInput', pid.balance.Ki);
        pid.balance.Kd = this.getInputValue('balanceKdInput', pid.balance.Kd);
        pid.balance.filterAlpha = this.getInputValue('balanceFilterAlphaInput', pid.balance.filterAlpha * 100) / 100;
        pid.balance.integralLimit = this.getInputValue('balanceIntegralLimitInput', pid.balance.integralLimit);

        pid.speed.Kp = this.getInputValue('speedKpInput', pid.speed.Kp);
        pid.speed.Ki = this.getInputValue('speedKiInput', pid.speed.Ki);
        pid.speed.Kd = this.getInputValue('speedKdInput', pid.speed.Kd);
        pid.speed.filterAlpha = this.getInputValue('speedFilterAlphaInput', pid.speed.filterAlpha * 100) / 100;
        pid.speed.integralLimit = this.getInputValue('speedIntegralLimitInput', pid.speed.integralLimit);

        pid.position.Kp = this.getInputValue('positionKpInput', pid.position.Kp);
        pid.position.Ki = this.getInputValue('positionKiInput', pid.position.Ki);
        pid.position.Kd = this.getInputValue('positionKdInput', pid.position.Kd);
        pid.position.filterAlpha = this.getInputValue('positionFilterAlphaInput', pid.position.filterAlpha * 100) / 100;
        pid.position.integralLimit = this.getInputValue('positionIntegralLimitInput', pid.position.integralLimit);

        if (addLogMessage) addLogMessage(`[FusionPID] 💾 Zapisano profil ${this.currentFusionMode === 'mahony' ? 'Mahony' : 'NDOF'} do cache`, 'info');
    },

    getInputValue(inputId, defaultValue) {
        const input = document.getElementById(inputId);
        if (input) { const val = parseFloat(input.value); return isNaN(val) ? defaultValue : val; }
        return defaultValue;
    },

    syncFusionModeFromCheckbox() {
        const checkbox = document.getElementById('useMahonyFilterInput');
        if (checkbox) {
            const newMode = checkbox.checked ? 'mahony' : 'ndof';
            if (this.currentFusionMode !== newMode) {
                this.currentFusionMode = newMode;
                this.updateFusionIndicator();
                const addLogMessage = window.addLogMessage;
                if (addLogMessage) addLogMessage(`[FusionPID] 🔄 Tryb fuzji zsynchronizowany z firmware: ${newMode === 'mahony' ? '⚡ Mahony' : '🔄 NDOF'}`, 'info');
            }
        }
    }
};

export function initFusionPIDProfiles() {
    FusionPIDProfiles.init();
}

// Window bridge
window.FusionPIDProfiles = FusionPIDProfiles;
window.initFusionPIDProfiles = initFusionPIDProfiles;
