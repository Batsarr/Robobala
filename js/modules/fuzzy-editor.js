// ========================================================================
// FUZZY-EDITOR.JS - Edytor Fuzzy Logic Controller dla RoboBala
// ========================================================================
// Punkt 5.1 audytu: Fuzzy Logic jako alternatywa PID.
// Intuicyjny, bez modelu matematycznego, idealny do nauki.
//
// Wejścia (2): error (kąt odchylenia), error_rate (prędkość kątowa)
// Wyjście (1): motor_pwm
// Zbiory: NB, NS, ZE, PS, PB (5 × 5 = 25 reguł)
//
// Komunikacja BLE:
//   {"cmd": "set_control_mode", "mode": "fuzzy"|"pid"}
//   {"cmd": "set_fuzzy_rule", "rule_index": 0-24, "output_set": 0-4}
//   {"cmd": "set_fuzzy_rules_bulk", "rules": [4,4,4,3,2,...]}
// ========================================================================

// Nazwy zbiorów rozmytych (Fuzzy Sets)
const FUZZY_SETS = [
    { key: 'NB', label: 'NB', fullLabel: 'Mocno do tyłu',    color: '#e74c3c' },
    { key: 'NS', label: 'NS', fullLabel: 'Lekko do tyłu',    color: '#e67e22' },
    { key: 'ZE', label: 'ZE', fullLabel: 'Zatrzymaj',         color: '#2ecc71' },
    { key: 'PS', label: 'PS', fullLabel: 'Lekko do przodu',   color: '#3498db' },
    { key: 'PB', label: 'PB', fullLabel: 'Mocno do przodu',   color: '#9b59b6' }
];

// Nazwy osi (wiersze = error_rate, kolumny = error)
const ERROR_LABELS = ['NB', 'NS', 'ZE', 'PS', 'PB'];
const RATE_LABELS  = ['NB', 'NS', 'ZE', 'PS', 'PB'];

// Domyślna matryca reguł 5×5 (indeksy 0=NB, 1=NS, 2=ZE, 3=PS, 4=PB)
// Wiersze: error_rate (NB..PB), Kolumny: error (NB..PB)
// Wartość = indeks zbioru wyjściowego
const DEFAULT_RULES = [
    // error:  NB  NS  ZE  PS  PB
    /* rate NB */ [0, 0, 0, 1, 2],
    /* rate NS */ [0, 0, 1, 2, 3],
    /* rate ZE */ [0, 1, 2, 3, 4],
    /* rate PS */ [1, 2, 3, 4, 4],
    /* rate PB */ [2, 3, 4, 4, 4]
];

// Aktualny stan reguł (kopia robocza)
let currentRules = DEFAULT_RULES.map(row => [...row]);

// Aktualny tryb sterowania
let currentControlMode = 'pid';

// === Definicje zbiorów wejściowych (centra i szerokości) ===
// Odzwierciedlają domyślne wartości z firmware (fuzzy_controller.cpp)
let errorSetsParams = [
    { center: -15.0, width: 8.0 },  // NB
    { center:  -7.0, width: 8.0 },  // NS
    { center:   0.0, width: 8.0 },  // ZE
    { center:   7.0, width: 8.0 },  // PS
    { center:  15.0, width: 8.0 }   // PB
];
let rateSetsParams = [
    { center: -150.0, width: 80.0 }, // NB
    { center:  -75.0, width: 80.0 }, // NS
    { center:    0.0, width: 80.0 }, // ZE
    { center:   75.0, width: 80.0 }, // PS
    { center:  150.0, width: 80.0 }  // PB
];

// Ostatnie wartości telemetryczne do podświetlania reguł
let lastAngle = null;
let lastRate = null;

// Throttle wizualizacji — max ~15 fps, żeby nie obciążać Canvas przy 50Hz telemetrii
let _fuzzyVisualLastTime = 0;
const FUZZY_VISUAL_INTERVAL_MS = 66; // ~15 fps

// ========================================================================
// Inicjalizacja
// ========================================================================

function initFuzzyEditor() {
    const container = document.getElementById('fuzzy-editor-panel');
    if (!container) {
        console.warn('[fuzzy-editor] Nie znaleziono #fuzzy-editor-panel w DOM');
        return;
    }

    renderFuzzyPanel(container);
    attachFuzzyEvents();

    console.log('[fuzzy-editor] Edytor Fuzzy Logic zainicjalizowany.');
}

// ========================================================================
// Renderowanie panelu
// ========================================================================

function renderFuzzyPanel(container) {
    container.innerHTML = `
        <!-- Przełącznik trybu sterowania -->
        <div class="fuzzy-mode-switch">
            <span class="fuzzy-mode-label">Tryb sterowania:</span>
            <div class="fuzzy-mode-toggle">
                <button id="fuzzy-mode-pid" class="fuzzy-mode-btn active" data-control="pid">PID</button>
                <button id="fuzzy-mode-fuzzy" class="fuzzy-mode-btn" data-control="fuzzy">Fuzzy Logic</button>
            </div>
        </div>

        <!-- Legenda zbiorów -->
        <div class="fuzzy-legend">
            <div class="fuzzy-legend-title">📖 Znaczenie symboli (wyjście PWM):</div>
            <div class="fuzzy-legend-items">
                ${FUZZY_SETS.map(s => `
                    <span class="fuzzy-legend-item" style="border-left: 3px solid ${s.color};">
                        <strong>${s.label}</strong> = ${s.fullLabel}
                    </span>
                `).join('')}
            </div>
        </div>

        <!-- Opis edukacyjny -->
        <div class="fuzzy-edu-info">
            <strong style="color: #61dafb;">💡 Jak to działa?</strong>
            <p>Każda komórka w tabeli to <strong>reguła</strong>: „Jeśli kąt odchylenia jest <em>[kolumna]</em> 
            i prędkość kątowa jest <em>[wiersz]</em>, to wyślij na silniki <em>[wartość w komórce]</em>."</p>
            <p>Przykład: Jeśli robot mocno się przechyla do tyłu (NB) i prędkość odchylenia rośnie (NB) → 
            wyślij <strong>NB</strong> (mocna korekcja do tyłu).</p>
        </div>

        <!-- ====== Wizualizacja zbiorów rozmytych (Canvas na żywo) ====== -->
        <div class="fuzzy-canvas-section">
            <div class="fuzzy-canvas-title">📈 Funkcje przynależności — wizualizacja na żywo</div>
            <div class="fuzzy-canvas-row">
                <div class="fuzzy-canvas-box">
                    <div class="fuzzy-canvas-label">Kąt odchylenia [°]</div>
                    <canvas id="fuzzy-angle-canvas" width="440" height="160"></canvas>
                    <div class="fuzzy-canvas-hint" id="fuzzy-angle-hint">Popchnij robota — zobaczysz jak marker się przesuwa!</div>
                </div>
                <div class="fuzzy-canvas-box">
                    <div class="fuzzy-canvas-label">Prędkość kątowa [°/s]</div>
                    <canvas id="fuzzy-rate-canvas" width="440" height="160"></canvas>
                    <div class="fuzzy-canvas-hint" id="fuzzy-rate-hint">Im szybciej się przechyla, tym dalej marker.</div>
                </div>
            </div>
        </div>

        <!-- Tabela reguł 5×5 -->
        <div class="fuzzy-table-wrapper">
            <div class="fuzzy-table-label-y">
                <span class="fuzzy-axis-label">Prędkość kątowa ↓</span>
            </div>
            <div class="fuzzy-table-container">
                <div class="fuzzy-table-label-x">
                    <span class="fuzzy-axis-label">Kąt odchylenia →</span>
                </div>
                <table class="fuzzy-rules-table" id="fuzzy-rules-table">
                    <thead>
                        <tr>
                            <th class="fuzzy-corner-cell">rate \\ error</th>
                            ${ERROR_LABELS.map(l => `<th class="fuzzy-col-header">${l}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        ${RATE_LABELS.map((rateLabel, ri) => `
                            <tr>
                                <th class="fuzzy-row-header">${rateLabel}</th>
                                ${ERROR_LABELS.map((_, ei) => {
                                    const ruleIdx = ri * 5 + ei;
                                    const val = currentRules[ri][ei];
                                    return `<td class="fuzzy-cell" data-rule="${ruleIdx}" data-row="${ri}" data-col="${ei}">
                                        <button class="fuzzy-cell-btn" style="background: ${FUZZY_SETS[val].color};" title="${FUZZY_SETS[val].fullLabel}">
                                            ${FUZZY_SETS[val].label}
                                        </button>
                                    </td>`;
                                }).join('')}
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>

        <!-- Przyciski akcji -->
        <div class="fuzzy-actions">
            <button id="fuzzy-reset-btn" class="fuzzy-action-btn" title="Przywróć domyślne reguły">🔄 Domyślne reguły</button>
            <button id="fuzzy-send-all-btn" class="fuzzy-action-btn fuzzy-send-btn" title="Wyślij wszystkie reguły do robota">📤 Wyślij do robota</button>
        </div>

        <!-- ====== Suwaki parametrów zbiorów rozmytych ====== -->
        <div class="fuzzy-sliders-section" id="fuzzy-sliders-section">
            <div class="fuzzy-sliders-title">🎛️ Parametry zbiorów rozmytych
                <button id="fuzzy-sliders-toggle" class="fuzzy-sliders-toggle-btn" title="Pokaż/ukryj suwaki">▶</button>
            </div>
            <div class="fuzzy-sliders-body" id="fuzzy-sliders-body" style="display:none;">
                <div class="fuzzy-sliders-group">
                    <div class="fuzzy-sliders-group-title">Kąt odchylenia — centra i szerokości</div>
                    ${FUZZY_SETS.map((s, i) => `
                        <div class="fuzzy-slider-row">
                            <span class="fuzzy-slider-label" style="color:${s.color}">${s.label}</span>
                            <label>centrum: <input type="number" class="fuzzy-slider-input" id="err-center-${i}" value="${errorSetsParams[i].center}" step="0.5" data-type="error" data-index="${i}" data-param="center"></label>
                            <label>szer.: <input type="number" class="fuzzy-slider-input" id="err-width-${i}" value="${errorSetsParams[i].width}" step="0.5" min="0.5" data-type="error" data-index="${i}" data-param="width"></label>
                        </div>
                    `).join('')}
                </div>
                <div class="fuzzy-sliders-group">
                    <div class="fuzzy-sliders-group-title">Prędkość kątowa — centra i szerokości</div>
                    ${FUZZY_SETS.map((s, i) => `
                        <div class="fuzzy-slider-row">
                            <span class="fuzzy-slider-label" style="color:${s.color}">${s.label}</span>
                            <label>centrum: <input type="number" class="fuzzy-slider-input" id="rate-center-${i}" value="${rateSetsParams[i].center}" step="1" data-type="rate" data-index="${i}" data-param="center"></label>
                            <label>szer.: <input type="number" class="fuzzy-slider-input" id="rate-width-${i}" value="${rateSetsParams[i].width}" step="1" min="1" data-type="rate" data-index="${i}" data-param="width"></label>
                        </div>
                    `).join('')}
                </div>
                <button id="fuzzy-sliders-reset" class="fuzzy-action-btn" title="Przywróć domyślne parametry zbiorów">🔄 Domyślne parametry zbiorów</button>
            </div>
        </div>

        <!-- Status -->
        <div class="fuzzy-status" id="fuzzy-status">
            <span class="fuzzy-status-dot"></span>
            <span id="fuzzy-status-text">Tryb: PID (kliknij "Fuzzy Logic" aby przełączyć)</span>
        </div>
    `;
}

// ========================================================================
// Obsługa zdarzeń
// ========================================================================

function attachFuzzyEvents() {
    // Przełącznik PID / Fuzzy
    document.getElementById('fuzzy-mode-pid')?.addEventListener('click', () => {
        setControlMode('pid');
    });
    document.getElementById('fuzzy-mode-fuzzy')?.addEventListener('click', () => {
        setControlMode('fuzzy');
    });

    // Kliknięcia w komórki tabeli — cykliczne przełączanie wartości
    const table = document.getElementById('fuzzy-rules-table');
    if (table) {
        table.addEventListener('click', (e) => {
            const btn = e.target.closest('.fuzzy-cell-btn');
            if (!btn) return;
            const cell = btn.closest('.fuzzy-cell');
            if (!cell) return;

            const row = parseInt(cell.dataset.row);
            const col = parseInt(cell.dataset.col);
            const ruleIdx = parseInt(cell.dataset.rule);

            // Cykliczne przełączanie: 0 → 1 → 2 → 3 → 4 → 0
            const newVal = (currentRules[row][col] + 1) % 5;
            currentRules[row][col] = newVal;

            // Aktualizuj widok
            const set = FUZZY_SETS[newVal];
            btn.textContent = set.label;
            btn.style.background = set.color;
            btn.title = set.fullLabel;

            // Wyślij pojedynczą regułę do firmware
            sendFuzzyRule(ruleIdx, newVal);
        });
    }

    // Reset do domyślnych
    document.getElementById('fuzzy-reset-btn')?.addEventListener('click', () => {
        currentRules = DEFAULT_RULES.map(row => [...row]);
        refreshTable();
        updateStatus('Przywrócono domyślne reguły', 'info');
    });

    // Wyślij wszystkie reguły
    document.getElementById('fuzzy-send-all-btn')?.addEventListener('click', () => {
        sendAllFuzzyRules();
    });

    // === Suwaki zbiorów rozmytych ===
    attachSlidersEvents();

    // Początkowe rysowanie Canvasów (bez markera)
    drawFuzzySets('fuzzy-angle-canvas', null, -20, 20, errorSetsParams);
    drawFuzzySets('fuzzy-rate-canvas', null, -200, 200, rateSetsParams);
}

// ========================================================================
// Suwaki parametrów zbiorów
// ========================================================================

function attachSlidersEvents() {
    // Toggle rozwinięcia sekcji
    const toggleBtn = document.getElementById('fuzzy-sliders-toggle');
    const body = document.getElementById('fuzzy-sliders-body');
    if (toggleBtn && body) {
        toggleBtn.addEventListener('click', () => {
            const isHidden = body.style.display === 'none';
            body.style.display = isHidden ? 'block' : 'none';
            toggleBtn.textContent = isHidden ? '▼' : '▶';
        });
    }

    // Nasłuchuj zmian w inputach
    document.querySelectorAll('.fuzzy-slider-input').forEach(input => {
        input.addEventListener('change', () => {
            const type = input.dataset.type;     // "error" | "rate"
            const index = parseInt(input.dataset.index);
            const param = input.dataset.param;   // "center" | "width"
            const value = parseFloat(input.value);
            if (isNaN(value)) return;

            // Aktualizuj lokalne parametry
            const arr = (type === 'error') ? errorSetsParams : rateSetsParams;
            arr[index][param] = value;

            // Przerysuj canvas
            if (type === 'error') {
                drawFuzzySets('fuzzy-angle-canvas', lastAngle, -20, 20, errorSetsParams);
            } else {
                drawFuzzySets('fuzzy-rate-canvas', lastRate, -200, 200, rateSetsParams);
            }

            // Wyślij do firmware
            sendFuzzySetParam(type, index, arr[index].center, arr[index].width);
        });
    });

    // Reset suwaków do domyślnych
    document.getElementById('fuzzy-sliders-reset')?.addEventListener('click', () => {
        errorSetsParams = [
            { center: -15.0, width: 8.0 },
            { center:  -7.0, width: 8.0 },
            { center:   0.0, width: 8.0 },
            { center:   7.0, width: 8.0 },
            { center:  15.0, width: 8.0 }
        ];
        rateSetsParams = [
            { center: -150.0, width: 80.0 },
            { center:  -75.0, width: 80.0 },
            { center:    0.0, width: 80.0 },
            { center:   75.0, width: 80.0 },
            { center:  150.0, width: 80.0 }
        ];
        // Aktualizuj inputy
        FUZZY_SETS.forEach((_, i) => {
            const ec = document.getElementById(`err-center-${i}`);
            const ew = document.getElementById(`err-width-${i}`);
            const rc = document.getElementById(`rate-center-${i}`);
            const rw = document.getElementById(`rate-width-${i}`);
            if (ec) ec.value = errorSetsParams[i].center;
            if (ew) ew.value = errorSetsParams[i].width;
            if (rc) rc.value = rateSetsParams[i].center;
            if (rw) rw.value = rateSetsParams[i].width;
        });
        drawFuzzySets('fuzzy-angle-canvas', lastAngle, -20, 20, errorSetsParams);
        drawFuzzySets('fuzzy-rate-canvas', lastRate, -200, 200, rateSetsParams);
        updateStatus('Przywrócono domyślne parametry zbiorów', 'info');
    });
}

/**
 * Wysyła zmianę parametrów zbioru do firmware (set_fuzzy_set).
 */
function sendFuzzySetParam(type, index, center, width) {
    const msg = JSON.stringify({
        cmd: 'set_fuzzy_set',
        set_type: type,    // "error" lub "rate"
        index: index,
        center: center,
        width: width
    });
    if (typeof window.sendBleMessage === 'function') {
        window.sendBleMessage(msg);
        console.log(`[fuzzy-editor] Set ${type}[${index}]: center=${center}, width=${width}`);
    }
}

// ========================================================================
// Rysowanie funkcji przynależności na Canvas
// ========================================================================

/**
 * Rysuje 5 trójkątnych funkcji przynależności na Canvasie.
 * @param {string} canvasId  - ID elementu <canvas>
 * @param {number|null} currentVal - aktualna wartość (marker) lub null
 * @param {number} minVal   - minimalna wartość osi X
 * @param {number} maxVal   - maksymalna wartość osi X
 * @param {Array} setsParams - tablica 5 obiektów {center, width}
 */
function drawFuzzySets(canvasId, currentVal, minVal, maxVal, setsParams) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    const pad = { left: 40, right: 10, top: 10, bottom: 28 };
    const plotW = W - pad.left - pad.right;
    const plotH = H - pad.top - pad.bottom;

    // Czyszczenie
    ctx.clearRect(0, 0, W, H);

    // Tło wykresu
    ctx.fillStyle = '#12141a';
    ctx.fillRect(pad.left, pad.top, plotW, plotH);

    // Linie siatki
    ctx.strokeStyle = '#2a2d35';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
        const y = pad.top + (plotH / 4) * i;
        ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + plotW, y); ctx.stroke();
    }
    for (let i = 0; i <= 8; i++) {
        const x = pad.left + (plotW / 8) * i;
        ctx.beginPath(); ctx.moveTo(x, pad.top); ctx.lineTo(x, pad.top + plotH); ctx.stroke();
    }

    // Przelicznik wartości → piksele
    function valToX(val) {
        return pad.left + ((val - minVal) / (maxVal - minVal)) * plotW;
    }
    function muToY(mu) {
        return pad.top + plotH - mu * plotH;
    }

    // Półprzezroczyste kolory
    const colors = FUZZY_SETS.map(s => s.color);
    const alphaFill = 0.18;
    const alphaStroke = 0.85;

    // Oblicz przynależności do podświetlenia
    let memberships = null;
    if (currentVal !== null && currentVal !== undefined) {
        memberships = setsParams.map(s => {
            if (s.width <= 0) return 0;
            const dist = Math.abs(currentVal - s.center);
            return dist >= s.width ? 0 : 1 - dist / s.width;
        });
    }

    // Rysuj każdy trójkąt
    for (let i = 0; i < 5; i++) {
        const s = setsParams[i];
        const leftEdge = s.center - s.width;
        const rightEdge = s.center + s.width;
        const x0 = valToX(leftEdge);
        const x1 = valToX(s.center);
        const x2 = valToX(rightEdge);
        const yBase = muToY(0);
        const yTop = muToY(1);

        // Wypełnienie
        ctx.beginPath();
        ctx.moveTo(x0, yBase);
        ctx.lineTo(x1, yTop);
        ctx.lineTo(x2, yBase);
        ctx.closePath();
        ctx.fillStyle = hexToRgba(colors[i], alphaFill);
        ctx.fill();

        // Kontur
        ctx.beginPath();
        ctx.moveTo(x0, yBase);
        ctx.lineTo(x1, yTop);
        ctx.lineTo(x2, yBase);
        ctx.strokeStyle = hexToRgba(colors[i], alphaStroke);
        ctx.lineWidth = 2;
        ctx.stroke();

        // Etykieta zbioru
        ctx.fillStyle = colors[i];
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(FUZZY_SETS[i].label, x1, yTop - 3);

        // Wypełnienie aktywnej przynależności (jeśli jest marker)
        if (memberships && memberships[i] > 0.01) {
            const mu = memberships[i];
            const yMu = muToY(mu);
            // Zacieniowany trapez od 0 do mu
            const xLeft = valToX(s.center - s.width * (1 - mu));
            const xRight = valToX(s.center + s.width * (1 - mu));
            ctx.beginPath();
            ctx.moveTo(x0, yBase);
            ctx.lineTo(xLeft, yMu);
            ctx.lineTo(xRight, yMu);
            ctx.lineTo(x2, yBase);
            ctx.closePath();
            ctx.fillStyle = hexToRgba(colors[i], 0.35);
            ctx.fill();

            // Linia poziomu µ
            ctx.beginPath();
            ctx.moveTo(xLeft, yMu);
            ctx.lineTo(xRight, yMu);
            ctx.strokeStyle = hexToRgba(colors[i], 0.7);
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 3]);
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }

    // Oś X — wartości
    ctx.fillStyle = '#888';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    const tickCount = 8;
    for (let i = 0; i <= tickCount; i++) {
        const val = minVal + (maxVal - minVal) * (i / tickCount);
        const x = valToX(val);
        ctx.fillText(val.toFixed(0), x, H - 4);
        // Mały tick
        ctx.beginPath();
        ctx.moveTo(x, pad.top + plotH);
        ctx.lineTo(x, pad.top + plotH + 4);
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    // Oś Y — etykiety 0 i 1
    ctx.fillStyle = '#888';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('1.0', pad.left - 4, pad.top + 10);
    ctx.fillText('0.0', pad.left - 4, pad.top + plotH + 2);
    ctx.fillText('µ', pad.left - 4, pad.top + plotH / 2 + 4);

    // === MARKER — pionowa linia aktualnej wartości ===
    if (currentVal !== null && currentVal !== undefined) {
        const xM = valToX(currentVal);
        // Linia
        ctx.beginPath();
        ctx.moveTo(xM, pad.top);
        ctx.lineTo(xM, pad.top + plotH);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2.5;
        ctx.stroke();
        // Etykieta wartości
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(currentVal.toFixed(1), xM, pad.top + plotH + 16);
        // Kółko na górze
        ctx.beginPath();
        ctx.arc(xM, pad.top + 2, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#61dafb';
        ctx.fill();
    }

    // Ramka
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1;
    ctx.strokeRect(pad.left, pad.top, plotW, plotH);
}

/**
 * Konwertuje hex na rgba.
 */
function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
}

// ========================================================================
// Podświetlanie aktywnych reguł w tabeli
// ========================================================================

/**
 * Na podstawie przynależności do zbiorów error i rate podświetla
 * aktywne komórki w tabeli 5x5 (grubszy border + glow).
 */
function highlightActiveRules(angle, rate) {
    const table = document.getElementById('fuzzy-rules-table');
    if (!table) return;

    // Oblicz przynależności
    const muErr = errorSetsParams.map(s => {
        if (s.width <= 0) return 0;
        const d = Math.abs(angle - s.center);
        return d >= s.width ? 0 : 1 - d / s.width;
    });
    const muRate = rateSetsParams.map(s => {
        if (s.width <= 0) return 0;
        const d = Math.abs(rate - s.center);
        return d >= s.width ? 0 : 1 - d / s.width;
    });

    // Iteruj komórki
    table.querySelectorAll('.fuzzy-cell').forEach(cell => {
        const ri = parseInt(cell.dataset.row); // rate index
        const ei = parseInt(cell.dataset.col); // error index
        const strength = Math.min(muErr[ei], muRate[ri]);
        const btn = cell.querySelector('.fuzzy-cell-btn');
        if (btn) {
            if (strength > 0.01) {
                const opacity = Math.min(strength * 1.5, 1.0);
                btn.style.borderColor = `rgba(255,255,255,${opacity})`;
                btn.style.boxShadow = `0 0 ${Math.round(opacity * 12)}px rgba(97,218,251,${opacity * 0.6})`;
            } else {
                btn.style.borderColor = 'transparent';
                btn.style.boxShadow = 'none';
            }
        }
    });
}

// ========================================================================
// Aktualizacja wizualizacji na żywo (wywoływana z telemetrii)
// ========================================================================

/**
 * Aktualizuje Canvas'y i podświetlenie reguł na podstawie telemetrii.
 * Wywoływana z telemetry.js przy każdym pakiecie danych.
 *
 * @param {number} angle   - kąt odchylenia od pionu [°]
 * @param {number} speed   - prędkość kątowa (gyroY) [°/s]
 */
function updateFuzzyVisuals(angle, speed) {
    lastAngle = angle;
    lastRate = speed;

    // Throttle — nie rysuj częściej niż ~15 fps
    const now = performance.now();
    if (now - _fuzzyVisualLastTime < FUZZY_VISUAL_INTERVAL_MS) return;
    _fuzzyVisualLastTime = now;

    drawFuzzySets('fuzzy-angle-canvas', angle, -20, 20, errorSetsParams);
    drawFuzzySets('fuzzy-rate-canvas', speed, -200, 200, rateSetsParams);
    highlightActiveRules(angle, speed);

    // Aktualizuj hinty
    const angleHint = document.getElementById('fuzzy-angle-hint');
    if (angleHint) {
        const idx = getDominantSet(angle, errorSetsParams);
        angleHint.textContent = idx !== null
            ? `Aktywny zbiór: ${FUZZY_SETS[idx].label} (${FUZZY_SETS[idx].fullLabel}) — kąt: ${angle.toFixed(1)}°`
            : `Kąt: ${angle.toFixed(1)}° — poza zakresem zbiorów`;
    }
    const rateHint = document.getElementById('fuzzy-rate-hint');
    if (rateHint) {
        const idx = getDominantSet(speed, rateSetsParams);
        rateHint.textContent = idx !== null
            ? `Aktywny zbiór: ${FUZZY_SETS[idx].label} (${FUZZY_SETS[idx].fullLabel}) — prędkość: ${speed.toFixed(1)}°/s`
            : `Prędkość: ${speed.toFixed(1)}°/s — poza zakresem zbiorów`;
    }
}

/**
 * Zwraca indeks dominującego zbioru (najwyższa przynależność) lub null.
 */
function getDominantSet(val, setsParams) {
    let bestIdx = null;
    let bestMu = 0;
    for (let i = 0; i < setsParams.length; i++) {
        const s = setsParams[i];
        if (s.width <= 0) continue;
        const d = Math.abs(val - s.center);
        const mu = d >= s.width ? 0 : 1 - d / s.width;
        if (mu > bestMu) {
            bestMu = mu;
            bestIdx = i;
        }
    }
    return bestMu > 0.01 ? bestIdx : null;
}

// ========================================================================
// Odświeżanie tabeli
// ========================================================================

function refreshTable() {
    const table = document.getElementById('fuzzy-rules-table');
    if (!table) return;

    table.querySelectorAll('.fuzzy-cell').forEach(cell => {
        const row = parseInt(cell.dataset.row);
        const col = parseInt(cell.dataset.col);
        const val = currentRules[row][col];
        const set = FUZZY_SETS[val];
        const btn = cell.querySelector('.fuzzy-cell-btn');
        if (btn) {
            btn.textContent = set.label;
            btn.style.background = set.color;
            btn.title = set.fullLabel;
        }
    });
}

// ========================================================================
// Komunikacja BLE
// ========================================================================

/**
 * Przełącza tryb sterowania PID ↔ Fuzzy Logic.
 */
function setControlMode(mode) {
    currentControlMode = mode;

    // Aktualizuj przycisiki
    document.getElementById('fuzzy-mode-pid')?.classList.toggle('active', mode === 'pid');
    document.getElementById('fuzzy-mode-fuzzy')?.classList.toggle('active', mode === 'fuzzy');

    // Aktualizuj status
    if (mode === 'fuzzy') {
        updateStatus('Tryb: Fuzzy Logic — robot sterowany regułami rozmytymi', 'active');
    } else {
        updateStatus('Tryb: PID — klasyczny regulator', 'idle');
    }

    // Wyślij komendę BLE
    const msg = JSON.stringify({ cmd: 'set_control_mode', mode: mode });
    if (typeof window.sendBleMessage === 'function') {
        window.sendBleMessage(msg);
        console.log(`[fuzzy-editor] Wysłano: ${msg}`);
    } else {
        console.warn('[fuzzy-editor] sendBleMessage niedostępne — tryb offline');
    }
}

/**
 * Wysyła pojedynczą regułę do firmware.
 */
function sendFuzzyRule(ruleIndex, outputSet) {
    const msg = JSON.stringify({
        cmd: 'set_fuzzy_rule',
        rule_index: ruleIndex,
        output_set: outputSet
    });

    if (typeof window.sendBleMessage === 'function') {
        window.sendBleMessage(msg);
        console.log(`[fuzzy-editor] Reguła ${ruleIndex} → ${FUZZY_SETS[outputSet].label}`);
    }
}

/**
 * Wysyła wszystkie 25 reguł do firmware (bulk).
 */
function sendAllFuzzyRules() {
    const flat = currentRules.flat();
    const msg = JSON.stringify({
        cmd: 'set_fuzzy_rules_bulk',
        rules: flat
    });

    if (typeof window.sendBleMessage === 'function') {
        window.sendBleMessage(msg);
        updateStatus('Wysłano wszystkie 25 reguł do robota ✅', 'success');
        console.log(`[fuzzy-editor] Wysłano bulk: ${JSON.stringify(flat)}`);
    } else {
        updateStatus('Brak połączenia BLE — nie wysłano', 'error');
    }
}

// ========================================================================
// Status
// ========================================================================

function updateStatus(text, type = 'idle') {
    const statusText = document.getElementById('fuzzy-status-text');
    const statusDot = document.querySelector('.fuzzy-status-dot');
    if (statusText) statusText.textContent = text;
    if (statusDot) {
        statusDot.className = 'fuzzy-status-dot';
        statusDot.classList.add(`fuzzy-status-${type}`);
    }
}

// ========================================================================
// API publiczne
// ========================================================================

function getRules() {
    return currentRules.map(row => [...row]);
}

function setRules(rules) {
    if (Array.isArray(rules) && rules.length === 5) {
        currentRules = rules.map(row => [...row]);
        refreshTable();
    }
}

function getControlMode() {
    return currentControlMode;
}

// ========================================================================
// Eksporty
// ========================================================================

window.FuzzyEditor = {
    init: initFuzzyEditor,
    getRules,
    setRules,
    getControlMode,
    setControlMode,
    sendAllFuzzyRules,
    updateFuzzyVisuals
};

export {
    initFuzzyEditor,
    getRules,
    setRules,
    getControlMode,
    setControlMode,
    sendAllFuzzyRules,
    updateFuzzyVisuals,
    FUZZY_SETS,
    DEFAULT_RULES
};
