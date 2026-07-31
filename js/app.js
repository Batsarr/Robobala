// ========================================================================
// APP.JS - ES6 Module Entry Point for RoboBala Interface
// ========================================================================
// Ten plik jest punktem wejściowym architektury modułowej ES6.
// Importuje wyodrębnione moduły i inicjalizuje je w prawidłowej kolejności.
//
// STRATEGIA MIGRACJI:
// Etap 1 (zakończony): Moduły ES6 ładowane równolegle z main.js.
//   Moduły przypisywały eksporty do window.*, nadpisując wersje z main.js.
//
// Etap 2 (obecny): Kod przeniesiony z main.js do modułów ES6.
//   main.js zawiera tylko: module bridge, unikalne sekcje (sensor/model mapping,
//   trymy, kalibracja, logi), DOMContentLoaded orchestrator, window exports.
//   19 modułów ES6 dostarcza całą logikę aplikacji.
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

// 8. Autotune - algorytmy strojenia (GA, PSO, Bayesian) + sesja
import {
    initAutotune,
    GeneticAlgorithm,
    ParticleSwarmOptimization,
    BayesianOptimization,
    startTuning,
    pauseTuning,
    resumeTuning,
    stopTuning,
    handleCancel
} from './modules/autotune.js';

// 9. BLE Processor - przetwarzanie wiadomości BLE
import './modules/ble-processor.js';

// 10. Signal Analyzer - wykres sygnałów
import './modules/signal-analyzer.js';

// 11. Presets - presety PID
import './modules/presets.js';

// 12. Input Controls - joystick, gamepad, sekwencje
import './modules/input-controls.js';

// 13. QR Code - parowanie urządzeń
import './modules/qr-code.js';

// 14. Sensor Mapping - mapowanie czujnika IMU
import './modules/sensor-mapping.js';

// 15. UI Helpers
import './modules/ui-helpers.js';

// 16. System Identification (SysID)
import {
    initSystemIdentification,
    SysIdState
} from './modules/sysid.js';

// 17. Fusion PID Profiles - Mahony vs NDOF
import {
    initFusionPIDProfiles,
    FusionPIDProfiles
} from './modules/fusion-pid-profiles.js';

// 18. Parameter Controls
import {
    setupNumericInputs,
    setupParameterListeners,
    setupManualTuneButtons,
    sendFullConfigToRobot
} from './modules/parameter-controls.js';

// 19. Calibration
import {
    setupCalibrationModal,
    showCalibrationModal,
    hideCalibrationModal,
    updateCalibrationProgress
} from './modules/calibration.js';

// --- Inicjalizacja modułów ---

// Hook PID Education + Diagnostics do updateTelemetryUI
// Musi być wywołany PO załadowaniu wszystkich modułów,
// aby prawidłowo opakować window.updateTelemetryUI
hookPIDToTelemetry();

// Inicjalizacja modułów wymagających DOM
document.addEventListener('DOMContentLoaded', () => {
    // PID Education i Diagnostics (usunięte z main.js — jedyna inicjalizacja tutaj)
    initPIDEducation();
    initPIDDiagnostics();

    // UWAGA: setupCommunicationHandlers() jest wywoływane w main.js DOMContentLoaded
    // Nie wywołuj ponownie — zduplikowane handlery powodują podwójne przetwarzanie wiadomości.

    // Fuzzy Logic Editor (wyłącznie w module — brak odpowiednika w main.js)
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
    FUZZY_SETS, DEFAULT_RULES,
    // Autotune
    initAutotune, GeneticAlgorithm, ParticleSwarmOptimization, BayesianOptimization,
    startTuning, pauseTuning, resumeTuning, stopTuning, handleCancel,
    // SysID
    initSystemIdentification, SysIdState,
    // Fusion PID Profiles
    initFusionPIDProfiles, FusionPIDProfiles,
    // Parameter Controls
    setupNumericInputs, setupParameterListeners, setupManualTuneButtons, sendFullConfigToRobot,
    // Calibration
    setupCalibrationModal, showCalibrationModal, hideCalibrationModal, updateCalibrationProgress
};
