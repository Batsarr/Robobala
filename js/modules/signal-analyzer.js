// signal-analyzer.js — ES6 module: Signal Analyzer chart & controls
// Cross-module dependencies accessed via window.*: addLogMessage, availableTelemetry, showNotification

let signalAnalyzerChart; let isChartPaused = false; let cursorA = null, cursorB = null;
let chartRangeSelection = { isSelecting: false, startIndex: null, endIndex: null };

function initSignalAnalyzerChart() {
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
}
function setupSignalChartControls() {
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
}
function updateChart(data) {
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
}
function setupSignalAnalyzerControls() {
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

// --- Composite initializer ---
function initSignalAnalyzer() {
    initSignalAnalyzerChart();
    setupSignalChartControls();
    setupSignalAnalyzerControls();
}

// --- Exports ---
export {
    signalAnalyzerChart,
    isChartPaused,
    cursorA,
    cursorB,
    chartRangeSelection,
    initSignalAnalyzerChart,
    setupSignalChartControls,
    updateChart,
    setupSignalAnalyzerControls,
    toggleCursors,
    handleChartClick,
    updateCursorInfo,
    getChartIndexFromX,
    highlightSelectedRange,
    exportChartDataToCsv,
    exportChartToPng,
    initSignalAnalyzer
};

// --- Expose on window for cross-module access ---
window.signalAnalyzerChart = signalAnalyzerChart;
window.isChartPaused = isChartPaused;
window.cursorA = cursorA;
window.cursorB = cursorB;
window.chartRangeSelection = chartRangeSelection;
window.initSignalAnalyzerChart = initSignalAnalyzerChart;
window.setupSignalChartControls = setupSignalChartControls;
window.updateChart = updateChart;
window.setupSignalAnalyzerControls = setupSignalAnalyzerControls;
window.toggleCursors = toggleCursors;
window.handleChartClick = handleChartClick;
window.updateCursorInfo = updateCursorInfo;
window.getChartIndexFromX = getChartIndexFromX;
window.highlightSelectedRange = highlightSelectedRange;
window.exportChartDataToCsv = exportChartDataToCsv;
window.exportChartToPng = exportChartToPng;
window.initSignalAnalyzer = initSignalAnalyzer;
