// ========================================================================
// LQR-PANEL.JS - karta „LQR / LQI”: test znaku, model, wagi, obliczenie i wysyłka K
// ========================================================================
// Pola mają class="config-value" i wpisy w parameterMapping (state.js), więc:
//   - wartości przychodzą z robota w sync (set_param lqr_*), panel nie ma własnych liczb,
//   - ręczna zmiana pola wysyła set_param (bramka canSendParams w parameter-controls.js).
// Matematyka: lqr-math.mjs (testy: node --test interface/test/).
// ========================================================================

import { computeLqr } from './lqr-math.mjs';

const PWM_MAX = 2047;
const K_INPUTS = ['lqrKxInput', 'lqrKvInput', 'lqrKthInput', 'lqrKwInput', 'lqrKiInput'];

let thSign = 1;
let lastLiveMs = 0;

const num = (id) => parseFloat(document.getElementById(id)?.value);

function readPhysical() {
    const minPwm = ['minPwmLeftFwdInput', 'minPwmLeftBwdInput', 'minPwmRightFwdInput', 'minPwmRightBwdInput']
        .map(num).filter(v => !Number.isNaN(v));
    return {
        m_body: num('lqrMBodyInput'),
        m_wheels: num('lqrMWheelsInput'),
        l_com_cm: num('lqrLComInput'),
        i_body: num('lqrIBodyInput') || 0,
        wheel_diam_cm: num('wheelDiameterInput'),
        tau_stall: num('lqrTauStallInput'),
        rpm_nl: num('lqrRpmNlInput'),
        min_pwm_frac: minPwm.length ? minPwm.reduce((a, b) => a + b, 0) / minPwm.length / PWM_MAX : 0,
    };
}

function readWeights() {
    return {
        q_x: num('lqrQxInput'), q_v: num('lqrQvInput'), q_th: num('lqrQthInput'),
        q_w: num('lqrQwInput'), q_i: num('lqrQiInput'), r: num('lqrRInput'),
    };
}

function showResult(html, level) {
    const el = document.getElementById('lqrResult');
    if (!el) return;
    el.innerHTML = html;
    el.className = 'lqr-result' + (level ? ` lqr-${level}` : '');
}

function onCompute() {
    const phys = readPhysical();
    const weights = readWeights();
    const missing = [...Object.entries(phys), ...Object.entries(weights)]
        .filter(([k, v]) => k !== 'i_body' && k !== 'min_pwm_frac' && !(v > 0 || (k === 'q_i' && v === 0) || (k === 'q_x' && v === 0)))
        .map(([k]) => k);
    if (missing.length) {
        showResult(`🔴 Brak/zero: ${missing.join(', ')} — połącz z robotem (sync) albo uzupełnij pola.`, 'bad');
        return;
    }
    const useI = !!document.getElementById('lqrUseIInput')?.checked;
    let res;
    try {
        res = computeLqr(phys, weights, useI);
    } catch (e) {
        showResult(`🔴 Błąd obliczeń: ${e.message}`, 'bad');
        return;
    }
    if (!res.converged || res.K.some(v => !Number.isFinite(v))) {
        showResult('🔴 Riccati nie zbiegł — sprawdź parametry (masa, l, moment, obroty).', 'bad');
        return;
    }
    const [kx, kv, kth, kw, ki = 0] = res.K;
    const vals = { lqrKxInput: kx, lqrKvInput: kv, lqrKthInput: kth, lqrKwInput: kw, lqrKiInput: ki };
    for (const [id, v] of Object.entries(vals)) {
        const el = document.getElementById(id);
        if (el) el.value = +v.toFixed(4);
    }
    const s = res.sim;
    const pwmPct = Math.round(s.maxU * 100);
    const level = s.fell ? 'bad' : (s.maxU >= 0.999 || s.settleS === null || s.settleS > 1.5) ? 'warn' : 'ok';
    const dot = { ok: '🟢', warn: '🟡', bad: '🔴' }[level];
    showResult(
        `${dot} K = [kąt ${kth.toFixed(2)}, ω ${kw.toFixed(3)}, x ${kx.toFixed(2)}, v ${kv.toFixed(2)}${useI ? `, ∫x ${ki.toFixed(2)}` : ''}]<br>` +
        `Symulacja 5°: max PWM <strong>${pwmPct}%</strong>, powrót do ±0.5° w <strong>${s.settleS === null ? '—' : s.settleS.toFixed(2) + ' s'}</strong>` +
        `${s.fell ? ' — <strong>przewraca się</strong>' : ''}. ` +
        (level === 'warn' ? 'PWM w nasyceniu albo wolno — zwiększ R lub zmniejsz Q kąt.' : '') +
        `<br><small>Nie wysłano — kliknij „📤 Wyślij K”.</small>`,
        level);
}

function onSendK() {
    if (!window.AppState?.isConnected || !window.AppState?.isSynced) {
        window.addLogMessage?.('[LQR] Wysyłka K po połączeniu i synchronizacji z robotem.', 'warn');
        return;
    }
    const keys = { lqrKxInput: 'lqr_k_x', lqrKvInput: 'lqr_k_v', lqrKthInput: 'lqr_k_th', lqrKwInput: 'lqr_k_w', lqrKiInput: 'lqr_k_i' };
    let sent = 0;
    for (const id of K_INPUTS) {
        const v = num(id);
        if (Number.isNaN(v)) continue;
        window.sendBleMessage?.({ type: 'set_param', key: keys[id], value: v });
        sent++;
    }
    window.addLogMessage?.(`[LQR] Wysłano ${sent} wzmocnień K. Zapisz w EEPROM, jeśli robot balansuje dobrze.`, 'success');
}

/** Parametr z robota (sync). Pola obsługuje applySingleParam; tu tylko stan lokalny. */
function onParam(key, value) {
    if (key === 'lqr_th_sign') thSign = (parseFloat(value) < 0) ? -1 : 1;
}

/** Telemetria: kąt w konwencji LQR i pozycja kół (test znaku). ~10 Hz. */
function onTelemetry(data) {
    const now = performance.now();
    if (now - lastLiveMs < 100) return;
    lastLiveMs = now;
    const pitch = (typeof data.pitch === 'number') ? data.pitch : null;
    const thEl = document.getElementById('lqrLiveTh');
    if (thEl && pitch !== null) thEl.textContent = (thSign * pitch).toFixed(1);
    const el = data.encoder_left ?? data.el;
    const er = data.encoder_right ?? data.er;
    const ppr = num('encoderPprInput');
    const d = num('wheelDiameterInput');
    const xEl = document.getElementById('lqrLiveX');
    if (xEl && typeof el === 'number' && typeof er === 'number' && ppr > 0 && d > 0) {
        xEl.textContent = (((el + er) / 2 / ppr) * Math.PI * d).toFixed(1);
    }
}

function initLqrPanel() {
    document.getElementById('lqrComputeBtn')?.addEventListener('click', onCompute);
    document.getElementById('lqrSendKBtn')?.addEventListener('click', onSendK);
    document.getElementById('lqrThSignInput')?.addEventListener('change', (e) => {
        thSign = (parseFloat(e.target.value) < 0) ? -1 : 1;
    });
}

window.LqrPanel = { init: initLqrPanel, onParam, onTelemetry, compute: onCompute };

export { initLqrPanel };
