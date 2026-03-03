/**
 * ui-helpers.js — ES6 module for RoboBala UI helper utilities
 *
 * Extracted from main.js. Contains:
 *   - Log buffer management (allLogsBuffer, pushLog, renderAllLogs, addLogMessage, clearLogs)
 *   - Generic debounce utility
 *   - Accordion helpers (toggleAccordion, updateAccordionHeight, accordionObserver)
 *   - Autotune chart relocation (relocateAutotuneChart)
 *   - initUIHelpers() bootstrap
 *
 * This module is standalone — no imports from other modules.
 */

// ---------------------------------------------------------------------------
// Log buffer
// ---------------------------------------------------------------------------
const allLogsBuffer = [];
const ALL_LOGS_MAX = 2000;

function pushLog(message, level = 'info') {
    const ts = new Date().toLocaleTimeString();
    allLogsBuffer.push({ ts, level, message });
    if (allLogsBuffer.length > ALL_LOGS_MAX) allLogsBuffer.shift();
    const logCard = document.getElementById('log-card');
    const autoEl = document.getElementById('logsAutoscroll');
    if (logCard && logCard.classList.contains('open')) {
        const shouldScroll = (autoEl && autoEl.checked) === true;
        renderAllLogs(shouldScroll);
    }
}

// ---------------------------------------------------------------------------
// Render all logs
// ---------------------------------------------------------------------------
function renderAllLogs(keepScrollBottom = false) {
    const box = document.getElementById('log-history'); if (!box) return;
    const wasBottom = (box.scrollTop + box.clientHeight + 8) >= box.scrollHeight;
    box.innerHTML = '';
    for (const row of allLogsBuffer) {
        const div = document.createElement('div');
        let color = '#ccc';
        if (row.level === 'error') color = '#ff6347';
        else if (row.level === 'warn') color = '#f7b731';
        else if (row.level === 'success') color = '#a2f279';
        div.style.color = color;
        div.textContent = `[${row.ts}] ${row.message}`;
        box.appendChild(div);
    }
    if (keepScrollBottom || wasBottom) { box.scrollTop = box.scrollHeight; }
}

// ---------------------------------------------------------------------------
// Debounce
// ---------------------------------------------------------------------------
const debounce = (func, delay) => { let timeout; return function (...args) { const context = this; clearTimeout(timeout); timeout = setTimeout(() => func.apply(context, args), delay); }; };

// ---------------------------------------------------------------------------
// addLogMessage / clearLogs
// ---------------------------------------------------------------------------
function addLogMessage(message, level = 'info') { pushLog(message, level); const logCard = document.getElementById('log-card'); const autoEl = document.getElementById('logsAutoscroll'); if (logCard && logCard.classList.contains('open')) { renderAllLogs((autoEl && autoEl.checked) === true); } }
function clearLogs() { if (typeof allLogsBuffer !== 'undefined') { allLogsBuffer.length = 0; } const box = document.getElementById('log-history'); if (box) box.innerHTML = ''; }

// ---------------------------------------------------------------------------
// Accordion helpers
// ---------------------------------------------------------------------------
function toggleAccordion(header) {
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
}

function updateAccordionHeight(content) {
    if (content && content.classList.contains('active')) {
        content.classList.remove('auto-height');
        content.style.maxHeight = content.scrollHeight + 40 + 'px';
        // Ustaw auto po chwili by nie ucinać późniejszych elementów (np. pojawiające się help-texty)
        clearTimeout(content._autoTimer);
        content._autoTimer = setTimeout(() => {
            if (content.classList.contains('active')) content.classList.add('auto-height');
        }, 300);
    }
}

// Obserwator zmian dla dynamicznego dopasowania wysokości (np. rozwinięcie wielu help-text)
const accordionObserver = new MutationObserver(mutations => {
    mutations.forEach(m => {
        const content = m.target.closest && m.target.closest('.accordion-content');
        if (content && content.classList.contains('active')) {
            // Nie zmieniaj wysokości stałego panelu strojenia
            if (!content.classList.contains('autotune-pane')) {
                updateAccordionHeight(content);
            }
        }
    });
});

// ---------------------------------------------------------------------------
// Relocate autotune chart
// ---------------------------------------------------------------------------
// Relokacja wykresu procesu strojenia pod aktywny przycisk URUCHOM
function relocateAutotuneChart(method) {
    const chartWrapper = document.querySelector('.autotune-tuning-chart-wrapper');
    if (!chartWrapper) return;
    let targetBtn = null;
    if (method === 'ga-genetic' || method === 'ga') targetBtn = document.getElementById('run-ga-tune');
    else if (method === 'pso-particle' || method === 'pso') targetBtn = document.getElementById('run-pso-tune');
    else if (method === 'single-tests') targetBtn = document.querySelector('.run-test-btn[data-test-type="step_response"]');
    if (!targetBtn) return;
    // Wstaw chart tuż za przyciskiem
    if (targetBtn.parentElement && targetBtn.parentElement.contains(targetBtn)) {
        // Unikaj wielokrotnego przenoszenia jeśli już jest poniżej
        if (chartWrapper._lastMethod !== method) {
            targetBtn.insertAdjacentElement('afterend', chartWrapper);
            chartWrapper._lastMethod = method;
            // Aktualizacja wysokości akordeonu
            const accordionContent = chartWrapper.closest('.accordion-content');
            updateAccordionHeight(accordionContent);
        }
    }
}

// ---------------------------------------------------------------------------
// Init — wire up accordion observer on DOMContentLoaded
// ---------------------------------------------------------------------------
function initUIHelpers() {
    document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('.accordion-content').forEach(ac => {
            accordionObserver.observe(ac, { childList: true, subtree: true });
        });
    });
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
export {
    allLogsBuffer,
    ALL_LOGS_MAX,
    pushLog,
    renderAllLogs,
    debounce,
    addLogMessage,
    clearLogs,
    toggleAccordion,
    updateAccordionHeight,
    accordionObserver,
    relocateAutotuneChart,
    initUIHelpers
};

// ---------------------------------------------------------------------------
// Backward-compatible window.* assignments for legacy code
// ---------------------------------------------------------------------------
window.allLogsBuffer      = allLogsBuffer;
window.ALL_LOGS_MAX       = ALL_LOGS_MAX;
window.pushLog            = pushLog;
window.renderAllLogs      = renderAllLogs;
window.debounce           = debounce;
window.addLogMessage      = addLogMessage;
window.clearLogs          = clearLogs;
window.toggleAccordion    = toggleAccordion;
window.updateAccordionHeight = updateAccordionHeight;
window.accordionObserver  = accordionObserver;
window.relocateAutotuneChart = relocateAutotuneChart;
window.initUIHelpers      = initUIHelpers;
