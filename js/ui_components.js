// ========================================================================
// UI COMPONENTS - Funkcje inicjalizacji i rysowania komponentów interfejsu
// ========================================================================
// Ten plik zawiera funkcje odpowiedzialne za inicjalizację, rysowanie
// i interakcję z komponentami wizualnymi interfejsu (Joystick, Analizator 
// Sygnałów, Wizualizacja 3D, Wizualizacja Ścieżki, akordeony itp.)
// ========================================================================

// Uwaga: Ten plik jest częścią modularnej wersji UI. Nie należy go ładować
// razem z 'js/main.js' (bundled), ponieważ skrypt 'main.js' zawiera te
// same definicje i powoduje błąd: "Uncaught SyntaxError: redeclaration of let ...".

if (typeof window.toggleAccordion === 'undefined') {
    window.toggleAccordion = function (header) {
        const content = header.nextElementSibling;
        header.classList.toggle('active');
        const isOpening = header.classList.contains('active');
        if (!isOpening) {
            content.classList.remove('auto-height');
            content.style.maxHeight = '0px';
            content.style.padding = '0px 15px';
        } else {
            // Specjalne traktowanie panelu strojenia: stała wysokość po otwarciu
            if (content.classList.contains('autotune-pane')) {
                const desktopH = 600; // px
                const mobileVH = 70; // vh
                const isMobile = window.matchMedia('(max-width: 768px)').matches;
                if (isMobile) {
                    content.style.maxHeight = mobileVH + 'vh';
                } else {
                    content.style.maxHeight = desktopH + 'px';
                }
                content.style.overflow = 'hidden';
            } else {
                content.style.maxHeight = content.scrollHeight + 40 + 'px';
            }
            content.style.padding = '15px';
            setTimeout(() => {
                if (header.classList.contains('active') && !content.classList.contains('autotune-pane')) content.classList.add('auto-height');
            }, 450);
        }
    };
}
if (typeof window.initSignalAnalyzerChart === 'undefined') {
    window.initSignalAnalyzerChart = function () {
        const ctx = document.getElementById('signalAnalyzerChart').getContext('2d');
        signalAnalyzerChart = new Chart(ctx, {
            type: 'line', data: { labels: Array(200).fill(''), datasets: [] },
            options: {
                animation: false, responsive: true, maintainAspectRatio: false,
                scales: {
                    x: {
                        display: true,
                        title: { display: true, text: 'Czas', color: '#fff' },
                        ticks: { color: '#fff' }
                    },
                    y: { type: 'linear', display: true, position: 'left', id: 'y-pitch', ticks: { color: availableTelemetry['pitch']?.color || '#61dafb' }, title: { display: true, text: 'Pitch (°)', color: availableTelemetry['pitch']?.color || '#61dafb' } },
                    y1: { type: 'linear', display: false, position: 'right', id: 'y-speed', ticks: { color: availableTelemetry['speed']?.color || '#f7b731' }, title: { display: true, text: 'Speed (imp/s)', color: availableTelemetry['speed']?.color || '#f7b731' }, grid: { drawOnChartArea: false } }
                },
                plugins: {
                    legend: { labels: { color: '#fff' } },
                    tooltip: { mode: 'index', intersect: false }
                },
                onClick: handleChartClick,
                onHover: (event, activeElements, chart) => {
                    if (chartRangeSelection.isSelecting) {
                        chart.canvas.style.cursor = 'crosshair';
                    } else {
                        chart.canvas.style.cursor = 'default';
                    }
                }
            }
        });

        // Add range selection functionality
        const canvas = ctx.canvas;
        let selectionStart = null;

        canvas.addEventListener('mousedown', (e) => {
            if (e.shiftKey) {
                chartRangeSelection.isSelecting = true;
                const rect = canvas.getBoundingClientRect();
                selectionStart = e.clientX - rect.left;
                chartRangeSelection.startIndex = getChartIndexFromX(selectionStart);
            }
        });

        canvas.addEventListener('mousemove', (e) => {
            if (chartRangeSelection.isSelecting && selectionStart !== null) {
                const rect = canvas.getBoundingClientRect();
                const currentX = e.clientX - rect.left;
                chartRangeSelection.endIndex = getChartIndexFromX(currentX);
                highlightSelectedRange();
            }
        });

        canvas.addEventListener('mouseup', (e) => {
            if (chartRangeSelection.isSelecting) {
                chartRangeSelection.isSelecting = false;
                selectionStart = null;
                // Range is now selected and stored in chartRangeSelection
                if (chartRangeSelection.startIndex !== null && chartRangeSelection.endIndex !== null) {
                    addLogMessage(`[UI] Zakres zaznaczony: ${chartRangeSelection.startIndex} - ${chartRangeSelection.endIndex}. Użyj "Eksport CSV (Zakres)" aby wyeksportować.`, 'info');
                }
            }
        });
    };
}
if (typeof window.setupSignalChartControls === 'undefined') {
    window.setupSignalChartControls = function () {
        const container = document.getElementById('signalChartControls'); container.innerHTML = '';
        const defaultChecked = ['pitch', 'speed'];
        Object.keys(availableTelemetry).forEach((key) => {
            const label = document.createElement('label'); const checkbox = document.createElement('input');
            checkbox.type = 'checkbox'; checkbox.value = key; checkbox.checked = defaultChecked.includes(key);
            checkbox.addEventListener('change', (e) => {
                const varName = e.target.value, datasetLabel = availableTelemetry[varName].label, datasetColor = availableTelemetry[varName].color;
                let dataset = signalAnalyzerChart.data.datasets.find(ds => ds.label === datasetLabel);
                if (e.target.checked) {
                    if (!dataset) {
                        let yAxisID = 'y-pitch';
                        if (['speed', 'target_speed', 'output'].includes(varName)) { yAxisID = 'y-speed'; signalAnalyzerChart.options.scales['y1'].display = true; }
                        signalAnalyzerChart.data.datasets.push({ label: datasetLabel, data: Array(signalAnalyzerChart.data.labels.length).fill(null), borderColor: datasetColor, fill: false, tension: 0.1, pointRadius: 0, yAxisID: yAxisID });
                    }
                } else {
                    const datasetIndex = signalAnalyzerChart.data.datasets.findIndex(ds => ds.label === datasetLabel);
                    if (datasetIndex > -1) { signalAnalyzerChart.data.datasets.splice(datasetIndex, 1); }
                    if (!signalAnalyzerChart.data.datasets.some(ds => ds.yAxisID === 'y-speed')) { signalAnalyzerChart.options.scales['y1'].display = false; }
                }
                signalAnalyzerChart.update(); updateCursorInfo();
            });
            label.appendChild(checkbox); label.append(` ${availableTelemetry[key].label}`); container.appendChild(label);
            if (checkbox.checked) checkbox.dispatchEvent(new Event('change'));
        });
    };
}
if (typeof window.updateChart === 'undefined') {
    window.updateChart = function (data) {
        if (isChartPaused) return;
        const chartData = signalAnalyzerChart.data;
        const currentTimeLabel = (Date.now() / 1000).toFixed(1);
        if (chartData.labels.length >= 200) { chartData.labels.shift(); chartData.datasets.forEach(ds => ds.data.shift()); }
        chartData.labels.push(currentTimeLabel);
        chartData.datasets.forEach(ds => {
            const key = Object.keys(availableTelemetry).find(k => availableTelemetry[k].label === ds.label);
            const value = (key && data[key] !== undefined) ? data[key] : null;
            ds.data.push(value);
        });
        signalAnalyzerChart.update('none');
    };
}
if (typeof window.setupSignalAnalyzerControls === 'undefined') {
    window.setupSignalAnalyzerControls = function () {
        document.getElementById('pauseChartBtn').addEventListener('click', () => { isChartPaused = true; document.getElementById('pauseChartBtn').style.display = 'none'; document.getElementById('resumeChartBtn').style.display = 'inline-block'; addLogMessage('[UI] Wykres wstrzymany.', 'info'); });
        document.getElementById('resumeChartBtn').addEventListener('click', () => { isChartPaused = false; document.getElementById('resumeChartBtn').style.display = 'none'; document.getElementById('pauseChartBtn').style.display = 'inline-block'; addLogMessage('[UI] Wykres wznowiony.', 'info'); });
        document.getElementById('cursorABBtn').addEventListener('click', toggleCursors);
        document.getElementById('exportCsvBtn').addEventListener('click', () => exportChartDataToCsv(false));
        document.getElementById('exportRangeCsvBtn').addEventListener('click', () => {
            if (chartRangeSelection.startIndex === null || chartRangeSelection.endIndex === null) {
                addLogMessage('[UI] Najpierw zaznacz zakres! Przytrzymaj Shift i przeciągnij myszką po wykresie.', 'warn');
                return;
            }
            exportChartDataToCsv(true);
        });
        document.getElementById('resetZoomBtn').addEventListener('click', () => {
            if (signalAnalyzerChart.resetZoom) {
                signalAnalyzerChart.resetZoom();
                addLogMessage('[UI] Widok wykresu zresetowany.', 'info');
            }
        });
        document.getElementById('exportPngBtn').addEventListener('click', exportChartToPng);
    };
}
function toggleCursors() { const cursorInfo = document.getElementById('cursorInfo'); if (cursorInfo.style.display === 'none') { cursorInfo.style.display = 'flex'; cursorA = { index: Math.floor(signalAnalyzerChart.data.labels.length * 0.25) }; cursorB = { index: Math.floor(signalAnalyzerChart.data.labels.length * 0.75) }; updateCursorInfo(); } else { cursorInfo.style.display = 'none'; cursorA = null; cursorB = null; } signalAnalyzerChart.update(); }
function handleChartClick(event) { if (!cursorA && !cursorB) return; const activePoints = signalAnalyzerChart.getElementsAtEventForMode(event, 'index', { intersect: false }, true); if (activePoints.length > 0) { const clickedIndex = activePoints[0].index; if (cursorA && cursorB) { const distA = Math.abs(clickedIndex - cursorA.index); const distB = Math.abs(clickedIndex - cursorB.index); if (distA < distB) { cursorA.index = clickedIndex; } else { cursorB.index = clickedIndex; } } else if (cursorA) { cursorA.index = clickedIndex; } updateCursorInfo(); signalAnalyzerChart.update(); } }
function updateCursorInfo() { if (!cursorA && !cursorB) { document.getElementById('cursorInfo').style.display = 'none'; return; } document.getElementById('cursorInfo').style.display = 'flex'; const labels = signalAnalyzerChart.data.labels; const datasets = signalAnalyzerChart.data.datasets; if (cursorA) { document.getElementById('cursorAX').textContent = labels[cursorA.index] || '---'; document.getElementById('cursorAY').textContent = datasets.length > 0 && datasets[0].data[cursorA.index] !== undefined ? datasets[0].data[cursorA.index].toFixed(2) : '---'; } if (cursorB) { document.getElementById('cursorBX').textContent = labels[cursorB.index] || '---'; document.getElementById('cursorBY').textContent = datasets.length > 0 && datasets[0].data[cursorB.index] !== undefined ? datasets[0].data[cursorB.index].toFixed(2) : '---'; } if (cursorA && cursorB) { const timeA = parseFloat(labels[cursorA.index]); const timeB = parseFloat(labels[cursorB.index]); document.getElementById('cursorDeltaT').textContent = `${Math.abs(timeB - timeA).toFixed(2)}s`; datasets.forEach(ds => { const valA = ds.data[cursorA.index]; const valB = ds.data[cursorB.index]; if (valA !== null && valB !== null) { if (ds.yAxisID === 'y-pitch') document.getElementById('cursorDeltaYPitch').textContent = `${(valB - valA).toFixed(2)}°`; else if (ds.yAxisID === 'y-speed') document.getElementById('cursorDeltaYSpeed').textContent = `${(valB - valA).toFixed(0)} imp/s`; } }); } }
function getChartIndexFromX(xPixel) {
    const chart = signalAnalyzerChart;
    const xScale = chart.scales['x'];
    const dataLength = chart.data.labels.length;

    // Calculate which index this X coordinate corresponds to
    const xStart = xScale.left;
    const xEnd = xScale.right;
    const xRange = xEnd - xStart;

    // Prevent division by zero
    if (xRange === 0 || dataLength === 0) {
        return 0;
    }

    const relativeX = (xPixel - xStart) / xRange;
    const index = Math.round(relativeX * (dataLength - 1));

    return Math.max(0, Math.min(dataLength - 1, index));
}

function highlightSelectedRange() {
    // Update the chart to show selected range
    // The visual feedback is provided through the selection state and console messages
    if (chartRangeSelection.startIndex !== null && chartRangeSelection.endIndex !== null) {
        const start = Math.min(chartRangeSelection.startIndex, chartRangeSelection.endIndex);
        const end = Math.max(chartRangeSelection.startIndex, chartRangeSelection.endIndex);
        // Visual highlighting could be added here with a Chart.js plugin in future
        // For now, we rely on user feedback through the log system
    }
}

function exportChartDataToCsv(exportRange = false) {
    const data = signalAnalyzerChart.data;
    let csvContent = "data:text/csv;charset=utf-8,";
    let headers = ['Time'];
    data.datasets.forEach(ds => headers.push(ds.label));
    csvContent += headers.join(',') + '\n';

    let startIdx = 0;
    let endIdx = data.labels.length - 1;

    // If exporting range and a range is selected, use it
    if (exportRange && chartRangeSelection.startIndex !== null && chartRangeSelection.endIndex !== null) {
        startIdx = Math.min(chartRangeSelection.startIndex, chartRangeSelection.endIndex);
        endIdx = Math.max(chartRangeSelection.startIndex, chartRangeSelection.endIndex);
        addLogMessage(`[UI] Eksportowanie zakresu: ${startIdx} - ${endIdx}`, 'info');
    }

    for (let i = startIdx; i <= endIdx; i++) {
        let row = [data.labels[i]];
        data.datasets.forEach(ds => {
            const value = ds.data[i] !== null ? ds.data[i].toFixed(4) : '';
            row.push(value);
        });
        csvContent += row.join(',') + '\n';
    }
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    const filename = exportRange ? "telemetry_data_range.csv" : "telemetry_data.csv";
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    const message = exportRange ? '[UI] Zaznaczony zakres wyeksportowany do CSV.' : '[UI] Dane wykresu wyeksportowane do CSV.';
    addLogMessage(message, 'info');
}
function exportChartToPng() { const link = document.createElement('a'); link.download = 'telemetry_chart.png'; link.href = signalAnalyzerChart.toBase64Image(); link.click(); addLogMessage('[UI] Wykres wyeksportowany do PNG.', 'info'); }

if (typeof window.saveCurrentAsPreset === 'undefined') {
    window.saveCurrentAsPreset = function () {
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
    };
}
if (typeof window.populatePresetSelect === 'undefined') {
    window.populatePresetSelect = function () { const select = document.getElementById('pidPresetSelect'); select.innerHTML = ''; for (const [index, preset] of Object.entries(builtInPresetsData)) { const option = document.createElement('option'); option.value = index; option.textContent = preset.name; select.appendChild(option); } for (let i = 0; i < localStorage.length; i++) { const key = localStorage.key(i); if (key.startsWith(CUSTOM_PRESET_PREFIX)) { const presetName = key.substring(CUSTOM_PRESET_PREFIX.length); const option = document.createElement('option'); option.value = key; option.textContent = `Wlasny: ${presetName}`; select.appendChild(option); } } };
}
if (typeof window.deleteSelectedPreset === 'undefined') {
    window.deleteSelectedPreset = function () { const select = document.getElementById('pidPresetSelect'); const selectedValue = select.value; if (!selectedValue.startsWith(CUSTOM_PRESET_PREFIX)) { addLogMessage('[UI] Nie mozna usunac wbudowanego presetu.', 'warn'); return; } if (confirm(`Czy na pewno chcesz usunac preset '${selectedValue.substring(CUSTOM_PRESET_PREFIX.length)}'?`)) { localStorage.removeItem(selectedValue); addLogMessage(`[UI] Usunieto preset.`, 'info'); populatePresetSelect(); } };
}
if (typeof window.applySelectedPreset === 'undefined') {
    window.applySelectedPreset = async function () {
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
    };
}

// ========================================================================
// SEKWENCJE - Funkcje odpowiedzialne za tworzenie, edytowanie i wykonywanie sekwencji
// ========================================================================
// Ten plik zawiera funkcje odpowiedzialne za zarządzanie sekwencjami
// ruchów robota, w tym ich tworzenie, edytowanie, usuwanie oraz wykonywanie.
// ========================================================================

if (typeof window.setupSequenceControls === 'undefined') {
    window.setupSequenceControls = function () { document.getElementById('add-sequence-step-btn').addEventListener('click', addSequenceStep); document.getElementById('run-sequence-btn').addEventListener('click', runSequence); document.getElementById('stop-sequence-btn').addEventListener('click', stopSequenceExecution); document.getElementById('clear-sequence-btn').addEventListener('click', clearSequence); };
}
if (typeof window.addSequenceStep === 'undefined') {
    window.addSequenceStep = function () {
        const list = document.getElementById('sequence-list'); if (list.children.length >= MAX_SEQUENCE_STEPS) { addLogMessage(`[UI] Osiagnieto maksymalna liczbe krokow (${MAX_SEQUENCE_STEPS}).`, 'warn'); return; }
        const stepDiv = document.createElement('div'); stepDiv.className = 'sequence-step';
        stepDiv.innerHTML = `<select class="sequence-type"><option value="move_fwd">Przod (cm)</option><option value="move_bwd">Tyl (cm)</option><option value="rotate_r">Obrot Prawo (st.)</option><option value="rotate_l">Obrot Lewo (st.)</option><option value="wait_ms">Czekaj (ms)</option><option value="wait_condition">Czekaj az (np. pitch < 0.5)</option><option value="set_param">Ustaw parametr (np. Kp=100)</option></select><input type="text" class="sequence-value" value="20"><button class="remove-step-btn">&times;</button>`;
        list.appendChild(stepDiv); updateAccordionHeight(list.closest('.accordion-content'));
        stepDiv.querySelector('.sequence-type').addEventListener('change', (e) => {
            const valueInput = stepDiv.querySelector('.sequence-value'); const type = e.target.value;
            if (type === 'wait_condition') { valueInput.type = 'text'; valueInput.value = 'pitch < 0.5'; }
            else if (type === 'set_param') { valueInput.type = 'text'; valueInput.value = 'balanceKpInput=100.0'; }
            else { valueInput.type = 'number'; valueInput.value = '20'; }
        });
        stepDiv.querySelector('.remove-step-btn').addEventListener('click', () => { stepDiv.remove(); updateAccordionHeight(list.closest('.accordion-content')); });
    };
}
if (typeof window.runSequence === 'undefined') {
    window.runSequence = function () { if (AppState.isSequenceRunning) return; if (AppState.lastKnownRobotState !== 'TRZYMA_POZYCJE' && AppState.lastKnownRobotState !== 'BALANSUJE') { addLogMessage(`[UI] Nie mozna rozpoczac sekwencji. Robot w stanie '${AppState.lastKnownRobotState}'.`, 'error'); return; } const steps = document.querySelectorAll('.sequence-step'); if (steps.length === 0) return; resetPathVisualization(); AppState.isSequenceRunning = true; currentSequenceStep = 0; updateSequenceUI(); addLogMessage(`[UI] Rozpoczeto sekwencje z ${steps.length} krokow.`, 'info'); executeNextSequenceStep(); };
}
if (typeof window.stopSequenceExecution === 'undefined') {
    window.stopSequenceExecution = function () { if (!AppState.isSequenceRunning) return; AppState.isSequenceRunning = false; sendBleMessage({ type: 'command_stop' }); updateSequenceUI(); addLogMessage('[UI] Sekwencja zatrzymana.', 'warn'); };
}
if (typeof window.clearSequence === 'undefined') {
    window.clearSequence = function () { if (AppState.isSequenceRunning) stopSequenceExecution(); const list = document.getElementById('sequence-list'); list.innerHTML = ''; updateAccordionHeight(list.closest('.accordion-content')); resetPathVisualization(); };
}
if (typeof window.updateSequenceUI === 'undefined') {
    window.updateSequenceUI = function () { document.querySelectorAll('.sequence-step').forEach((step, index) => { step.classList.toggle('executing', AppState.isSequenceRunning && index === currentSequenceStep); }); document.getElementById('run-sequence-btn').disabled = AppState.isSequenceRunning; document.getElementById('add-sequence-step-btn').disabled = AppState.isSequenceRunning; document.getElementById('clear-sequence-btn').disabled = AppState.isSequenceRunning; document.getElementById('stop-sequence-btn').disabled = !AppState.isSequenceRunning; };
}
if (typeof window.checkAndExecuteNextSequenceStep === 'undefined') {
    window.checkAndExecuteNextSequenceStep = function (previousState) { const wasWorking = ['RUCH_AUTONOMICZNY', 'OBROT_AUTONOMICZNY'].includes(previousState); const isReady = ['TRZYMA_POZYCJE', 'BALANSUJE'].includes(AppState.lastKnownRobotState); if (AppState.isSequenceRunning && wasWorking && isReady) { addLogMessage(`[UI] Krok ${currentSequenceStep + 1} zakonczony.`, 'info'); currentSequenceStep++; executeNextSequenceStep(); } };
}
if (typeof window.evaluateCondition === 'undefined') {
    window.evaluateCondition = function (expr) {
        if (typeof expr !== 'string') return null;
        const m = expr.match(/^\s*([a-zA-Z_][\w]*)\s*(==|!=|>=|<=|>|<)\s*(-?\d+(?:\.\d+)?)\s*$/);
        if (!m) return null;
        const [, key, op, rhsStr] = m;
        const lhs = window.telemetryData ? window.telemetryData[key] : undefined;
        const rhs = parseFloat(rhsStr);
        if (typeof lhs !== 'number' || Number.isNaN(lhs)) return null;
        switch (op) {
            case '==': return lhs === rhs;
            case '!=': return lhs !== rhs;
            case '>': return lhs > rhs;
            case '<': return lhs < rhs;
            case '>=': return lhs >= rhs;
            case '<=': return lhs <= rhs;
            default: return null;
        }
    };
}
if (typeof window.waitForCondition === 'undefined') {
    window.waitForCondition = function (expr, timeoutMs = 10000, intervalMs = 100) {
        return new Promise((resolve, reject) => {
            const start = Date.now();
            const timer = setInterval(() => {
                const ok = evaluateCondition(expr);
                if (ok === true) { clearInterval(timer); resolve(); }
                else if (Date.now() - start > timeoutMs) { clearInterval(timer); reject(new Error('timeout')); }
            }, intervalMs);
        });
    };
}
if (typeof window.executeNextSequenceStep === 'undefined') {
    window.executeNextSequenceStep = function () {
        const steps = document.querySelectorAll('.sequence-step');
        if (!AppState.isSequenceRunning || currentSequenceStep >= steps.length) { if (AppState.isSequenceRunning) { AppState.isSequenceRunning = false; addLogMessage('[UI] Sekwencja ukonczona.', 'success'); showSequenceReport(); } updateSequenceUI(); return; }
        updateSequenceUI();
        const stepNode = steps[currentSequenceStep], type = stepNode.querySelector('.sequence-type').value, value = stepNode.querySelector('.sequence-value').value; let command = {};
        switch (type) {
            case 'move_fwd': command = { type: 'execute_move', distance_cm: parseFloat(value) }; break;
            case 'move_bwd': command = { type: 'execute_move', distance_cm: -parseFloat(value) }; break;
            case 'rotate_r': command = { type: 'execute_rotate', angle_deg: parseFloat(value) }; break;
            case 'rotate_l': command = { type: 'execute_rotate', angle_deg: -parseFloat(value) }; break;
            case 'wait_ms': {
                const duration = parseInt(value);
                const ms = Number.isFinite(duration) ? duration : 0;
                addLogMessage(`[UI] Czekam ${ms} ms...`, 'info');
                setTimeout(() => { currentSequenceStep++; executeNextSequenceStep(); }, ms);
                return; // nie wysyłamy komendy do robota
            }
            case 'wait_condition': {
                const cond = String(value || '').trim();
                if (!cond) { addLogMessage('[UI] Pusty warunek. Pomijam.', 'warn'); currentSequenceStep++; executeNextSequenceStep(); return; }
                addLogMessage(`[UI] Czekam az warunek bedzie prawdziwy: ${cond}`, 'info');
                waitForCondition(cond).then(() => {
                    addLogMessage('[UI] Warunek spelniony.', 'success');
                    currentSequenceStep++;
                    executeNextSequenceStep();
                }).catch(() => {
                    addLogMessage('[UI] Timeout czekania na warunek. Przechodze dalej.', 'warn');
                    currentSequenceStep++;
                    executeNextSequenceStep();
                });
                return; // nie wysyłamy komendy do robota
            }
            case 'set_param': {
                const parts = String(value).split('=');
                const inputId = parts[0]?.trim();
                const paramValue = parts[1]?.trim();
                if (inputId && paramValue) {
                    const snakeKey = parameterMapping[inputId];
                    if (snakeKey) {
                        let val = parseFloat(paramValue);
                        if (['turn_factor', 'expo_joystick', 'joystick_sensitivity', 'joystick_deadzone', 'balance_pid_derivative_filter_alpha', 'speed_pid_filter_alpha', 'position_pid_filter_alpha', 'weights_itae', 'weights_overshoot', 'weights_control_effort'].includes(snakeKey)) {
                            val /= 100.0;
                        }
                        addLogMessage(`[UI] Ustaw parametr: ${snakeKey} = ${val}`, 'info');
                        sendBleMessage({ type: 'set_param', key: snakeKey, value: val });
                        // natychmiast przejdź dalej
                        currentSequenceStep++;
                        executeNextSequenceStep();
                        return;
                    } else {
                        addLogMessage(`[UI] Nieznany parametr: ${inputId}.`, 'error'); currentSequenceStep++; executeNextSequenceStep(); return;
                    }
                } else { addLogMessage(`[UI] Nieprawidlowy format: ${value}.`, 'error'); currentSequenceStep++; executeNextSequenceStep(); return; }
            }
        }
        addLogMessage(`[UI] Wysylanie kroku ${currentSequenceStep + 1}/${steps.length}: ${JSON.stringify(command)}`, 'info');
        sendBleMessage(command);
        if (['move_fwd', 'move_bwd', 'rotate_r', 'rotate_l'].includes(type)) { addPlannedPathSegment(type, parseFloat(value)); }
    }
    // Path visualization and state are centralized in "RB.path" (see js/path_visualization.js).
    // Backwards-compatible global wrappers are available: initPathVisualization, drawPathVisualization, addPlannedPathSegment, updateActualPath, resetPathVisualization
    function showSequenceReport() { document.getElementById('sequence-report-panel').style.display = 'block'; document.getElementById('avgHeadingError').textContent = 'X.X °'; document.getElementById('maxHeadingError').textContent = 'Y.Y °'; document.getElementById('totalDistanceCovered').textContent = 'Z.Z cm'; }

    if (typeof window.initJoystick === 'undefined') {
        window.initJoystick = function () {
            const wrapper = document.getElementById('joystickWrapper');
            const size = wrapper.clientWidth;
            const joystickCanvas = document.getElementById('joystickCanvas');
            const joystickCtx = joystickCanvas.getContext('2d');
            joystickCanvas.width = size;
            joystickCanvas.height = size;
            joystickCenter = { x: size / 2, y: size / 2 };
            joystickRadius = size / 2 * 0.75;
            knobRadius = size / 2 * 0.25;
            drawJoystick(joystickCtx, joystickCenter.x, joystickCenter.y);
        };
    }
    function drawJoystick(ctx, x, y) {
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.beginPath();
        ctx.arc(joystickCenter.x, joystickCenter.y, joystickRadius, 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x, y, knobRadius, 0, 2 * Math.PI);
        ctx.fillStyle = '#61dafb';
        ctx.fill();
    }
    function handleJoystickStart(event) { event.preventDefault(); isDragging = true; }
    function handleJoystickMove(event) { if (!isDragging) return; event.preventDefault(); const joystickCanvas = document.getElementById('joystickCanvas'); let { x, y } = getJoystickPosition(event); const dx = x - joystickCenter.x; const dy = y - joystickCenter.y; const distance = Math.sqrt(dx * dx + dy * dy); if (distance > joystickRadius) { x = joystickCenter.x + (dx / distance) * joystickRadius; y = joystickCenter.y + (dy / distance) * joystickRadius; } drawJoystick(joystickCanvas.getContext('2d'), x, y); const now = Date.now(); if (now - lastJoystickSendTime > JOYSTICK_SEND_INTERVAL) { const joyX = (x - joystickCenter.x) / joystickRadius; const joyY = -(y - joystickCenter.y) / joystickRadius; sendBleMessage({ type: 'joystick', x: joyX, y: joyY }); lastJoystickSendTime = now; } }
    function getJoystickPosition(event) { const rect = document.getElementById('joystickCanvas').getBoundingClientRect(); const touch = event.touches ? event.touches[0] : event; return { x: touch.clientX - rect.left, y: touch.clientY - rect.top }; }
    function handleJoystickEnd(event) { if (!isDragging) return; event.preventDefault(); isDragging = false; drawJoystick(document.getElementById('joystickCanvas').getContext('2d'), joystickCenter.x, joystickCenter.y); sendBleMessage({ type: 'joystick', x: 0, y: 0 }); }
    function pollGamepad() { if (gamepadIndex !== null) { const gp = navigator.getGamepads()[gamepadIndex]; if (!gp) return; if (isMappingButton && actionToMap) { gp.buttons.forEach((button, i) => { if (button.pressed && !lastGamepadState[i]) { Object.keys(gamepadMappings).forEach(key => { if (gamepadMappings[key] === actionToMap) delete gamepadMappings[key]; }); gamepadMappings[i] = actionToMap; saveGamepadMappings(); addLogMessage(`[UI] Akcja '${availableActions[actionToMap].label}' przypisana do przycisku ${i}.`, 'success'); isMappingButton = false; actionToMap = null; renderMappingModal(); } }); } else { gp.buttons.forEach((button, i) => { if (button.pressed && !lastGamepadState[i]) { const action = gamepadMappings[i]; if (action && availableActions[action]) { const element = document.getElementById(availableActions[action].elementId); if (element && !element.disabled) { element.click(); flashElement(element); } } } }); } lastGamepadState = gp.buttons.map(b => b.pressed); let x = gp.axes[0] || 0; let y = gp.axes[1] || 0; if (Math.abs(x) < 0.15) x = 0; if (Math.abs(y) < 0.15) y = 0; sendBleMessage({ type: 'joystick', x: x, y: -y }); } requestAnimationFrame(pollGamepad); }
    window.addEventListener('gamepadconnected', (e) => { gamepadIndex = e.gamepad.index; document.getElementById('gamepadStatus').textContent = 'Polaczony'; document.getElementById('gamepadStatus').style.color = '#a2f279'; addLogMessage(`[UI] Gamepad polaczony: ${e.gamepad.id}`, 'success'); });
    window.addEventListener('gamepaddisconnected', (e) => { gamepadIndex = null; document.getElementById('gamepadStatus').textContent = 'Brak'; document.getElementById('gamepadStatus').style.color = '#f7b731'; addLogMessage('[UI] Gamepad rozlaczony.', 'warn'); });
    function startMapping(action, buttonElement) { if (gamepadIndex === null) { addLogMessage("Podlacz gamepada, aby rozpoczac mapowanie!", "warn"); return; } isMappingButton = true; actionToMap = action; document.querySelectorAll('.mapping-button').forEach(btn => btn.textContent = "Przypisz"); buttonElement.textContent = "Czekam..."; addLogMessage(`[UI] Nasluchiwanie na przycisk dla akcji: ${availableActions[action].label}...`, "info"); }
    function renderMappingModal() { const list = document.getElementById('gamepad-mapping-list'); list.innerHTML = ''; for (const [action, config] of Object.entries(availableActions)) { const row = document.createElement('div'); row.className = 'mapping-row'; const buttonIndex = Object.keys(gamepadMappings).find(key => gamepadMappings[key] === action); row.innerHTML = `<span class="mapping-label">${config.label}</span><span class="mapping-display">${buttonIndex !== undefined ? `Przycisk ${buttonIndex}` : 'Brak'}</span><button class="mapping-button" data-action="${action}">Przypisz</button>`; list.appendChild(row); } list.querySelectorAll('.mapping-button').forEach(button => { button.addEventListener('click', (e) => { const action = e.target.dataset.action; startMapping(action, e.target); }); }); }
    if (typeof window.init3DVisualization === 'undefined') {
        window.init3DVisualization = function () { const container = document.getElementById('robot3d-container'); scene3D = new THREE.Scene(); camera3D = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 2000); camera3D.position.set(28, 22, 48); camera3D.lookAt(0, 8, 0); renderer3D = new THREE.WebGLRenderer({ antialias: true }); renderer3D.setSize(container.clientWidth, container.clientHeight); container.appendChild(renderer3D.domElement); controls3D = new THREE.OrbitControls(camera3D, renderer3D.domElement); controls3D.target.set(0, 8, 0); controls3D.maxPolarAngle = Math.PI / 2; const ambientLight = new THREE.AmbientLight(0xffffff, 0.8); scene3D.add(ambientLight); const directionalLight = new THREE.DirectionalLight(0xffffff, 0.9); directionalLight.position.set(10, 20, 15); scene3D.add(directionalLight); const PLANE_SIZE_CM = 2000; groundTexture = createCheckerTexture(40); const repeats = PLANE_SIZE_CM / 40; groundTexture.repeat.set(repeats, repeats); const groundMaterial = new THREE.MeshStandardMaterial({ map: groundTexture, roughness: 1.0, metalness: 0.0 }); const groundGeo = new THREE.PlaneGeometry(PLANE_SIZE_CM, PLANE_SIZE_CM, 1, 1); groundMesh = new THREE.Mesh(groundGeo, groundMaterial); groundMesh.rotation.x = -Math.PI / 2; groundMesh.position.y = 0; scene3D.add(groundMesh); robotPivot = createRobotModel3D(); robotPivot.position.y = 4.1; scene3D.add(robotPivot); skyDome = createSkyDome(); scene3D.add(skyDome); window.addEventListener('resize', () => { const width = container.clientWidth; const height = container.clientHeight; camera3D.aspect = width / height; camera3D.updateProjectionMatrix(); renderer3D.setSize(width, height); }); setupControls3D(); setupCalibrationModal(); };
    }
    function createCustomWheel(totalRadius, tireThickness, width) { const wheelGroup = new THREE.Group(); const tireMaterial = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 }); const rimMaterial = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.4 }); const rimRadius = totalRadius - tireThickness; const tire = new THREE.Mesh(new THREE.TorusGeometry(rimRadius + tireThickness / 2, tireThickness / 2, 16, 100), tireMaterial); wheelGroup.add(tire); const rimShape = new THREE.Shape(); rimShape.absarc(0, 0, rimRadius, 0, Math.PI * 2, false); const holePath = new THREE.Path(); holePath.absarc(0, 0, rimRadius * 0.85, 0, Math.PI * 2, true); rimShape.holes.push(holePath); const extrudeSettings = { depth: width * 0.4, bevelEnabled: false }; const outerRimGeometry = new THREE.ExtrudeGeometry(rimShape, extrudeSettings); outerRimGeometry.center(); const outerRim = new THREE.Mesh(outerRimGeometry, rimMaterial); wheelGroup.add(outerRim); const hubRadius = rimRadius * 0.2; const hub = new THREE.Mesh(new THREE.CylinderGeometry(hubRadius, hubRadius, width * 0.5, 24), rimMaterial); hub.rotateX(Math.PI / 2); wheelGroup.add(hub); const spokeLength = (rimRadius * 0.85) - hubRadius; const spokeGeometry = new THREE.BoxGeometry(spokeLength, rimRadius * 0.15, width * 0.4); spokeGeometry.translate(hubRadius + spokeLength / 2, 0, 0); for (let i = 0; i < 6; i++) { const spoke = new THREE.Mesh(spokeGeometry, rimMaterial); spoke.rotation.z = i * (Math.PI / 3); wheelGroup.add(spoke); } return wheelGroup; }
    function createRobotModel3D() { const BODY_WIDTH = 9.0, BODY_HEIGHT = 6.0, BODY_DEPTH = 3.5, WHEEL_GAP = 1.0; const MAST_HEIGHT = 14.5, MAST_THICKNESS = 1.5; const BATTERY_WIDTH = 6.0, BATTERY_HEIGHT = 1.0, BATTERY_DEPTH = 3.0; const TIRE_THICKNESS = 1.0, WHEEL_WIDTH = 2.0; const WHEEL_RADIUS_3D = 4.1; const pivot = new THREE.Object3D(); const model = new THREE.Group(); const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x1C1C1C }); const batteryMaterial = new THREE.MeshStandardMaterial({ color: 0x4169E1 }); const body = new THREE.Mesh(new THREE.BoxGeometry(BODY_WIDTH, BODY_HEIGHT, BODY_DEPTH), bodyMaterial); body.position.y = WHEEL_RADIUS_3D; model.add(body); const mast = new THREE.Mesh(new THREE.BoxGeometry(MAST_THICKNESS, MAST_HEIGHT, MAST_THICKNESS), bodyMaterial); mast.position.y = WHEEL_RADIUS_3D + BODY_HEIGHT / 2 + MAST_HEIGHT / 2; model.add(mast); const battery = new THREE.Mesh(new THREE.BoxGeometry(BATTERY_WIDTH, BATTERY_HEIGHT, BATTERY_DEPTH), batteryMaterial); battery.position.y = mast.position.y + MAST_HEIGHT / 2 + BATTERY_HEIGHT / 2; model.add(battery); leftWheel = createCustomWheel(WHEEL_RADIUS_3D, TIRE_THICKNESS, WHEEL_WIDTH); leftWheel.rotation.y = Math.PI / 2; leftWheel.position.set(-(BODY_WIDTH / 2 + WHEEL_GAP), WHEEL_RADIUS_3D, 0); model.add(leftWheel); rightWheel = createCustomWheel(WHEEL_RADIUS_3D, TIRE_THICKNESS, WHEEL_WIDTH); rightWheel.rotation.y = Math.PI / 2; rightWheel.position.set(BODY_WIDTH / 2 + WHEEL_GAP, WHEEL_RADIUS_3D, 0); model.add(rightWheel); model.position.y = -WHEEL_RADIUS_3D; pivot.add(model); return pivot; }
    function createCheckerTexture(squareSizeCm = 20, colorA = '#C8C8C8', colorB = '#787878') { const size = 256; const squares = 2; const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size; const ctx = canvas.getContext('2d'); const s = size / squares; for (let y = 0; y < squares; y++) { for (let x = 0; x < squares; x++) { ctx.fillStyle = ((x + y) % 2 === 0) ? colorA : colorB; ctx.fillRect(x * s, y * s, s, s); } } const tex = new THREE.CanvasTexture(canvas); tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 8; tex.encoding = THREE.sRGBEncoding; return tex; }
    function createSkyDome() {
        const width = 2048, height = 1024;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        // Create gradient background
        const grad = ctx.createLinearGradient(0, 0, 0, height);
        grad.addColorStop(0, '#87CEEB');
        grad.addColorStop(0.6, '#B0E0E6');
        grad.addColorStop(1, '#E6F2FA');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);

        // Draw clouds with seamless wrapping
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        for (let i = 0; i < 150; i++) {
            const x = Math.random() * width;
            const y = Math.random() * height * 0.6;
            const radius = 20 + Math.random() * 80;
            const blur = 10 + Math.random() * 20;
            ctx.filter = `blur(${blur}px)`;

            // Draw the cloud
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();

            // Draw the cloud again on the opposite edge to create seamless wrapping
            // If cloud is near the right edge, draw it also on the left edge
            if (x > width - radius * 2) {
                ctx.beginPath();
                ctx.arc(x - width, y, radius, 0, Math.PI * 2);
                ctx.fill();
            }
            // If cloud is near the left edge, draw it also on the right edge
            if (x < radius * 2) {
                ctx.beginPath();
                ctx.arc(x + width, y, radius, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.filter = 'none';

        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.encoding = THREE.sRGBEncoding;

        const skyGeo = new THREE.SphereGeometry(1000, 32, 16);
        const skyMat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide });
        const skyDome = new THREE.Mesh(skyGeo, skyMat);
        return skyDome;
    }
    if (typeof window.updateAccordionHeight === 'undefined') {
        window.updateAccordionHeight = function (content) {
            if (content && content.classList.contains('active')) {
                content.classList.remove('auto-height');
                content.style.maxHeight = content.scrollHeight + 40 + 'px';
                // Ustaw auto po chwili by nie ucinać późniejszych elementów (np. pojawiające się help-texty)
                clearTimeout(content._autoTimer);
                content._autoTimer = setTimeout(() => {
                    if (content.classList.contains('active')) content.classList.add('auto-height');
                }, 300);
            }
        };
    }
}