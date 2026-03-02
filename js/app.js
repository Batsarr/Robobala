// ========================================================================
// APP.JS - ES6 Module Entry Point for RoboBala Interface
// ========================================================================
// Ten plik jest punktem wejściowym architektury modułowej ES6.
// Importuje wyodrębnione moduły i inicjalizuje je w prawidłowej kolejności.
//
// STRATEGIA MIGRACJI:
// Etap 1 (obecny): Moduły ES6 ładowane są równolegle z main.js.
//   Moduły przypisują swoje eksporty do window.*, nadpisując wersje z main.js.
//   Dzięki temu nic się nie psuje - main.js dostarcza pełną funkcjonalność,
//   a moduły dostarczają kanoniczne, testowalne implementacje.
//
// Etap 2 (przyszły): Stopniowe przenoszenie kodu z main.js do modułów.
//   Gdy moduł przejmie daną funkcjonalność, odpowiedni kod jest usuwany z main.js.
//
// Etap 3 (docelowy): main.js jest pusty lub usunięty.
//   Cała logika pochodzi z modułów ES6, ładowanych przez app.js.
// ========================================================================

// --- Import modułów (kolejność zależności) ---

// 1. State - fundament, brak zależności
import {
    AppStore,
    appStore,
    AppState,
    parameterMapping
} from './modules/state.js';

// 2. Communication - zależy od state
import {
    CommunicationLayer,
    BLECommunication,
    MockCommunication,
    commLayer,
    sendBleMessage,
    connectBLE,
    onDisconnected,
    setupCommunicationHandlers
} from './modules/communication.js';

// 3. Telemetry - zależy od state, communication
import {
    normalizeTelemetryData,
    updateTelemetryUI,
    applySingleParam,
    applySingleAutotuneParam,
    applyFullConfig,
    pitchHistory,
    speedHistory,
    currentEncoderLeft,
    currentEncoderRight
} from './modules/telemetry.js';

// 4. Visualization 3D - zależy od telemetry
import {
    init3DVisualization,
    animate3D,
    update3DAnimation
} from './modules/visualization3d.js';

// 5. PID Tuning - zależy od telemetry
import {
    PIDEducation,
    PIDDiagnostics,
    initPIDEducation,
    initPIDDiagnostics,
    updatePIDEducation,
    updatePIDDiagnostics,
    hookPIDToTelemetry
} from './modules/pid-tuning.js';

// 6. UI Modes - tryby interfejsu (Student / Zaawansowany / Expert)
import {
    initUIModes,
    setMode,
    getMode,
    MODES
} from './modules/ui-modes.js';

// 7. Fuzzy Logic Editor - edytor reguł rozmytych
import {
    initFuzzyEditor,
    getRules,
    setRules,
    getControlMode,
    setControlMode as setFuzzyControlMode,
    sendAllFuzzyRules,
    FUZZY_SETS,
    DEFAULT_RULES
} from './modules/fuzzy-editor.js';

// --- Inicjalizacja modułów ---

// Hook PID Education + Diagnostics do updateTelemetryUI
// Musi być wywołany PO załadowaniu wszystkich modułów,
// aby prawidłowo opakować window.updateTelemetryUI
hookPIDToTelemetry();

// Inicjalizacja modułów wymagających DOM
document.addEventListener('DOMContentLoaded', () => {
    // PID Education i Diagnostics
    initPIDEducation();
    initPIDDiagnostics();

    // Komunikacja - setup handlerów
    setupCommunicationHandlers();

    // Fuzzy Logic Editor
    initFuzzyEditor();

    // UI Modes - MUSI być ostatni (ukrywa elementy po ich załadowaniu)
    initUIModes();

    console.log('[app.js] Moduły ES6 załadowane i zainicjalizowane.');
});

// ========================================================================
// Eksport dla ewentualnego użycia przez inne moduły
// ========================================================================
export {
    // State
    AppStore, appStore, AppState, parameterMapping,
    // Communication
    CommunicationLayer, BLECommunication, MockCommunication,
    commLayer, sendBleMessage, connectBLE,
    // Telemetry
    normalizeTelemetryData, updateTelemetryUI,
    applySingleParam, applySingleAutotuneParam, applyFullConfig,
    // Visualization
    init3DVisualization, animate3D,
    // PID
    PIDEducation, PIDDiagnostics,
    initPIDEducation, initPIDDiagnostics,
    // UI Modes
    initUIModes, setMode, getMode, MODES,
    // Fuzzy Editor
    initFuzzyEditor, getRules, setRules,
    getControlMode, setFuzzyControlMode, sendAllFuzzyRules,
    FUZZY_SETS, DEFAULT_RULES
};
