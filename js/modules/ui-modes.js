// ========================================================================
// UI-MODES.JS - Tryby interfejsu: Student / Zaawansowany / Expert
// ========================================================================
// Rekomendacja z audytu (Punkt 9.2): ukrywanie zaawansowanych funkcji
// przed początkującymi uczniami, aby ich nie przytłaczać.
//
// Tryb Student widzi TYLKO:
//   - Panel Sterowania (joystick + Start/Stop)
//   - Dashboard (uproszczony)
//   - Wizualizacja 3D
//   - Nauka PID (edukacja + diagnostyka)
//   - Fuzzy Logic Controller (edytor reguł)
//   - Logi (uproszczone)
//
// Tryb Zaawansowany dodaje:
//   - Analizator sygnałów (wykresy)
//   - Kaskady PID (Prędkość/Pozycja)
//   - Identyfikacja Systemu (SysID)
//   - Sterowanie Autonomiczne
//   - Parametry sprzętowe, kalibracja PWM
//
// Tryb Expert dodaje:
//   - Algorytmy Genetyczne, PSO, Bayesian
//   - Filtr Mahony, Predykcja kąta
//   - Pełne mapowanie sensorów
//   - Profile fuzji PID
//   - Surowe parametry
// ========================================================================

const STORAGE_KEY = 'roboBala_uiMode';

const MODES = {
    student: {
        label: '👨‍🎓 Student',
        description: 'Nauka PID, Joystick, 3D widok, Fuzzy Logic',
        level: 0
    },
    advanced: {
        label: '🔧 Zaawansowany',
        description: '+ SysID, Analizator, Kaskada, Autonomia',
        level: 1
    },
    expert: {
        label: '⚙️ Expert',
        description: '+ GA, PSO, Predykcja, surowe parametry',
        level: 2
    }
};

let currentMode = 'student';

// ========================================================================
// Inicjalizacja
// ========================================================================

/**
 * Inicjalizuje system trybów interfejsu.
 * Odczytuje zapisany tryb z localStorage, renderuje przełącznik,
 * i aplikuje widoczność sekcji.
 */
function initUIModes() {
    // Odczytaj zapisany tryb
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && MODES[saved]) {
        currentMode = saved;
    }

    // Wyrenderuj przełącznik w headerze
    renderModeSwitcher();

    // Zastosuj tryb
    applyMode(currentMode);

    console.log(`[ui-modes] Zainicjalizowano w trybie: ${currentMode}`);
}

// ========================================================================
// Renderowanie przełącznika trybów
// ========================================================================

function renderModeSwitcher() {
    const header = document.querySelector('h1');
    if (!header) return;

    // Sprawdź czy przełącznik już istnieje
    if (document.getElementById('ui-mode-switcher')) return;

    const switcher = document.createElement('div');
    switcher.id = 'ui-mode-switcher';
    switcher.className = 'ui-mode-switcher';

    for (const [key, mode] of Object.entries(MODES)) {
        const btn = document.createElement('button');
        btn.className = 'ui-mode-btn' + (key === currentMode ? ' active' : '');
        btn.dataset.mode = key;
        btn.textContent = mode.label;
        btn.title = mode.description;
        btn.addEventListener('click', () => setMode(key));
        switcher.appendChild(btn);
    }

    // Wstaw pod nagłówek
    header.insertAdjacentElement('afterend', switcher);
}

// ========================================================================
// Zmiana trybu
// ========================================================================

/**
 * Ustawia tryb interfejsu i zapisuje w localStorage.
 * @param {string} mode - Klucz trybu: 'student' | 'advanced' | 'expert'
 */
function setMode(mode) {
    if (!MODES[mode]) return;
    currentMode = mode;
    localStorage.setItem(STORAGE_KEY, mode);

    // Aktualizuj aktywny przycisk
    document.querySelectorAll('.ui-mode-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
    });

    applyMode(mode);

    console.log(`[ui-modes] Przełączono na tryb: ${mode}`);
}

/**
 * Zwraca aktualny tryb.
 * @returns {string}
 */
function getMode() {
    return currentMode;
}

// ========================================================================
// Aplikowanie widoczności
// ========================================================================

/**
 * Ukrywa/pokazuje sekcje HTML na podstawie atrybutu data-mode.
 *
 * Logika: element z data-mode="X" jest widoczny, jeśli poziom
 * aktualnego trybu >= poziom X.
 *   student (0)  → widzi student
 *   advanced (1) → widzi student + advanced
 *   expert (2)   → widzi student + advanced + expert
 *
 * Dla akordeonów (button.accordion-header z data-mode) ukrywa też
 * następny element rodzeństwa (accordion-content).
 *
 * @param {string} mode - Klucz aktualnego trybu
 */
function applyMode(mode) {
    const currentLevel = MODES[mode]?.level ?? 0;

    document.querySelectorAll('[data-mode]').forEach(el => {
        // Pomiń przyciski przełącznika trybów — one zawsze muszą być widoczne
        if (el.closest('#ui-mode-switcher')) return;

        const elMode = el.dataset.mode;
        const elLevel = MODES[elMode]?.level ?? 0;
        const visible = currentLevel >= elLevel;

        if (visible) {
            el.classList.remove('mode-hidden');
        } else {
            el.classList.add('mode-hidden');
        }

        // Jeśli to button.accordion-header — ukryj/pokaż też accordion-content
        if (el.classList.contains('accordion-header')) {
            const content = el.nextElementSibling;
            if (content && content.classList.contains('accordion-content')) {
                if (visible) {
                    content.classList.remove('mode-hidden');
                } else {
                    content.classList.add('mode-hidden');
                }
            }
        }
    });

    // Dodaj klasę na body do ewentualnych styli CSS
    document.body.dataset.uiMode = mode;
}

// ========================================================================
// Eksporty
// ========================================================================

// Eksport do window.* (kompatybilność z main.js)
window.UIModes = {
    init: initUIModes,
    setMode,
    getMode,
    MODES
};

export {
    initUIModes,
    setMode,
    getMode,
    MODES,
    currentMode
};
