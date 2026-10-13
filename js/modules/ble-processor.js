/**
 * ble-processor.js — ES6 module
 * Central BLE message dispatcher and tuning history management for RoboBala.
 *
 * Extracted from main.js (lines ~1302–1660).
 * All cross-module calls go through window.* for backward compatibility.
 */

import { appStore, AppState } from './state.js';

// ─── Tuning History ────────────────────────────────────────────────────────────
// Export as window property so that modular scripts can safely push into the same array
window.tuningHistory = window.tuningHistory || [];
const tuningHistory = window.tuningHistory;

// ─── processCompleteMessage ────────────────────────────────────────────────────
/**
 * The main switch dispatcher for every incoming BLE JSON message.
 * Dispatches by data.type: telemetry, status_update, imu_mapping, model_mapping,
 * sync_begin, set_param, set_tuning_config_param, ack, sync_complete, log,
 * tuner_live_status, tuner_live_chart_data, tuning_result, tuning_iteration_result,
 * min_pwm_autotune_result, test_result / metrics_result, tuner_session_end.
 */
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
                    // Aktualizuj cache profili PID dla dwóch trybów fuzji
                    if (typeof FusionPIDProfiles !== 'undefined') {
                        FusionPIDProfiles.updateFromSync(data.key, data.value);
                    }
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

            // Po synchronizacji: wykryj aktualny tryb fuzji z checkboxa (zsynchronizowanego z firmware)
            // UWAGA: NIE wywołujemy loadCurrentPIDToUI() tutaj, ponieważ applySingleParam() już
            // zaktualizowało wszystkie wartości PID z firmware. Wywoływalibyśmy nadpisanie poprawnych
            // wartości z firmware starymi wartościami z cache.
            if (typeof FusionPIDProfiles !== 'undefined') {
                FusionPIDProfiles.syncFusionModeFromCheckbox();
                // Nie wywołujemy loadCurrentPIDToUI() - UI jest już zsynchronizowane!
                // FusionPIDProfiles.loadCurrentPIDToUI(); // USUNIĘTE - powodowało nadpisywanie UI
            }

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

// ─── refreshRecentList ─────────────────────────────────────────────────────────
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

// ─── refreshHistoryTable ───────────────────────────────────────────────────────
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

// ─── handleTunerResult ─────────────────────────────────────────────────────────
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

// ─── IMU rate UI updater ───────────────────────────────────────────────────────
// Uses actual IMU rate from firmware (ir field) instead of measuring telemetry packet rate
let _imuRateIntervalId = null;

function imuRateUpdater() {
    try {
        const el = document.getElementById('imuRateValue');
        if (!el) return;
        // Read IMU rate from last telemetry data (field 'ir' = imu_rate_hz)
        const imuRate = window._lastImuRateHz;
        if (imuRate !== undefined && imuRate > 0) {
            el.textContent = imuRate;
        } else {
            el.textContent = '--';
        }
    } catch (e) { /* no-op */ }
}

function startImuRateUpdater() {
    if (_imuRateIntervalId) return; // already running
    // Run update periodically (200ms) for responsive display
    _imuRateIntervalId = setInterval(imuRateUpdater, 200);
}

// ─── handleTuningIterationResult ───────────────────────────────────────────────
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

// ─── exportHistoryCsv ──────────────────────────────────────────────────────────
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

// ─── initBleProcessor ──────────────────────────────────────────────────────────
/**
 * Initialization wrapper – call once after DOM is ready.
 * Starts the periodic IMU rate updater.
 */
function initBleProcessor() {
    startImuRateUpdater();
}

// ─── Cross-module helpers (resolved via window.*) ──────────────────────────────
// These functions are expected to exist on window from other modules / main.js:
//   window.normalizeTelemetryData, window.updateTelemetryUI
//   window.applySingleParam, window.applySingleAutotuneParam, window.applyFullConfig
//   window.updateIMUMappingUIFromData, window.updateModelMappingUI
//   window.addLogMessage, window.setTuningUiLock
//   window.handleCancel
//   window.updateCalibrationProgress
//   window.updateAutotuneTuningChart
//   window.handleDynamicTestResult
//
// Local helpers used inside processCompleteMessage that live in global scope:
//   computeEulerFromQuaternion, applyModelMappingToEuler, updateChart,
//   updateActualPath, checkAndExecuteNextSequenceStep, sensorWizard,
//   setWizardProgress, updateSensorWizardUI, modelMapping,
//   FusionPIDProfiles, updateSearchSpaceInputs, updateTunerStatus,
//   updateBestDisplay, applyParameters, addTestToResultsTable, showNotification,
//   updateSignSummary

// Convenience references – resolve once so the switch body stays readable.
// Fall back to window.* when called; keeps backward compat with non-module code.
function addLogMessage(...args)              { return window.addLogMessage(...args); }
function updateTelemetryUI(...args)          { return window.updateTelemetryUI(...args); }
function updateIMUMappingUIFromData(...args)  { return window.updateIMUMappingUIFromData(...args); }
function updateModelMappingUI(...args)        { return window.updateModelMappingUI(...args); }
function applySingleParam(...args)            { return window.applySingleParam(...args); }
function applySingleAutotuneParam(...args)    { return window.applySingleAutotuneParam(...args); }
function handleCancel(...args)                { return window.handleCancel(...args); }
function updateAutotuneTuningChart(...args)   { return window.updateAutotuneTuningChart(...args); }
function handleDynamicTestResult(...args)     { return window.handleDynamicTestResult(...args); }
function updateTunerStatus(...args)           { return window.updateTunerStatus(...args); }
function updateBestDisplay(...args)           { return window.updateBestDisplay(...args); }
function applyParameters(...args)             { return window.applyParameters(...args); }
function showNotification(...args)            { return window.showNotification(...args); }

// ─── Window backward-compatibility bindings ────────────────────────────────────
window.processCompleteMessage    = processCompleteMessage;
window.tuningHistory             = tuningHistory;
window.refreshRecentList         = refreshRecentList;
window.refreshHistoryTable       = refreshHistoryTable;
window.handleTunerResult         = handleTunerResult;
window.handleTuningIterationResult = handleTuningIterationResult;
window.exportHistoryCsv          = exportHistoryCsv;
window.imuRateUpdater            = imuRateUpdater;
window.initBleProcessor          = initBleProcessor;

// ─── ES6 exports ───────────────────────────────────────────────────────────────
export {
    processCompleteMessage,
    tuningHistory,
    refreshRecentList,
    refreshHistoryTable,
    handleTunerResult,
    handleTuningIterationResult,
    exportHistoryCsv,
    imuRateUpdater,
    startImuRateUpdater,
    initBleProcessor
};
