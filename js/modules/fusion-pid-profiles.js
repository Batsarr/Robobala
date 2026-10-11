// ========================================================================
// FUSION-PID-PROFILES.JS - Single PID Profile (Mahony only, NDOF removed)
// ========================================================================
// NDOF został usunięty - tylko jeden zestaw PID dla filtra Mahony (~500Hz)
// ========================================================================

import { AppState } from './state.js';

/**
 * FusionPIDProfiles - Pojedynczy zestaw PID (Mahony) przechowywany w EEPROM robota
 * NDOF został usunięty - nie ma już przełączania profili
 */
export const FusionPIDProfiles = {
    mahonyPID: {
        balance: { Kp: 100, Ki: 0, Kd: 1.3, filterAlpha: 1.0, integralLimit: 50 },
        speed: { Kp: 0.1, Ki: 0, Kd: 0.05, filterAlpha: 0.8, integralLimit: 20 },
        position: { Kp: 0.05, Ki: 0, Kd: 0.02, filterAlpha: 0.9, integralLimit: 100 }
    },

    init() {
        const addLogMessage = window.addLogMessage;
        if (addLogMessage) addLogMessage('[FusionPID] 📊 Moduł profili PID zainicjalizowany (tylko Mahony).', 'info');
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
        };
        if (mappings[key]) mappings[key]();
    },

    getCurrentPID() {
        return this.mahonyPID;
    },

    loadCurrentPIDToUI() {
        const pid = this.mahonyPID;

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
    },

    setInputValue(inputId, value) {
        const input = document.getElementById(inputId);
        if (input) input.value = value;
    },

    getParamKey(baseKey) {
        // NDOF usunięty - zawsze zwracamy klucz bazowy (Mahony)
        return baseKey;
    },

    saveCurrentToProfile() {
        const pid = this.mahonyPID;
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

        if (addLogMessage) addLogMessage('[FusionPID] 💾 Zapisano profil PID do cache', 'info');
    },

    getInputValue(inputId, defaultValue) {
        const input = document.getElementById(inputId);
        if (input) { const val = parseFloat(input.value); return isNaN(val) ? defaultValue : val; }
        return defaultValue;
    }
};

export function initFusionPIDProfiles() {
    FusionPIDProfiles.init();
}

// Window bridge
window.FusionPIDProfiles = FusionPIDProfiles;
window.initFusionPIDProfiles = initFusionPIDProfiles;