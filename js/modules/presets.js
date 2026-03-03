// presets.js — ES6 module: PID Preset management
// Cross-module dependencies accessed via window.*: addLogMessage, parameterMapping, AppState

const CUSTOM_PRESET_PREFIX = 'pid_custom_preset_v4_';
const builtInPresetsData = { '1': { name: "1. PID Zbalansowany (Startowy)", params: { balanceKpInput: 95.0, balanceKiInput: 0.0, balanceKdInput: 3.23 } }, '2': { name: "2. PID Mieciutki (Plynny)", params: { balanceKpInput: 80.0, balanceKiInput: 0.0, balanceKdInput: 2.8 } }, '3': { name: "3. PID Agresywny (Sztywny)", params: { balanceKpInput: 110.0, balanceKiInput: 0.0, balanceKdInput: 4.0 } } };

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

// --- Exports ---
export {
    CUSTOM_PRESET_PREFIX,
    builtInPresetsData,
    saveCurrentAsPreset,
    applySelectedPreset,
    populatePresetSelect,
    deleteSelectedPreset
};

// --- Expose on window for cross-module access ---
window.CUSTOM_PRESET_PREFIX = CUSTOM_PRESET_PREFIX;
window.builtInPresetsData = builtInPresetsData;
window.saveCurrentAsPreset = saveCurrentAsPreset;
window.applySelectedPreset = applySelectedPreset;
window.populatePresetSelect = populatePresetSelect;
window.deleteSelectedPreset = deleteSelectedPreset;
