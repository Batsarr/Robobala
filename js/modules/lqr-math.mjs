// ========================================================================
// LQR-MATH.MJS - model robota balansującego i obliczenie wzmocnień LQR/LQI
// ========================================================================
// Czysta matematyka (bez DOM) — testy: node --test interface/test/
//
// Model: wahadło odwrócone na dwóch kołach, zlinearyzowane wokół pionu.
//   Stan  X = [x, v, th, w] (+ z = ∫x dt dla LQI)
//     x  [m]     droga kół (enkodery, + = przód)
//     v  [m/s]   prędkość kół
//     th [rad]   pochylenie korpusu (+ = środek masy przed osią, w stronę +x)
//     w  [rad/s] prędkość kątowa korpusu
//   Wejście u = ułamek PWM_MAX (-1..1), wspólny dla obu kół.
//   Silnik (oba razem): tau = a*u - b*(v/r - w)
//     a = 2*tau_stall*(1 - minPWM/PWM_MAX)  (część momentu zjada kompensacja martwej strefy)
//     b = 2*tau_stall/omega_nl              (siła przeciwelektromotoryczna)
//   Równania (Lagrange, małe kąty):
//     p*x'' + q*th'' = tau/r
//     q*x'' + J*th'' = M*g*l*th - tau
//     p = M + mw + Iw/r^2,  q = M*l,  J = Ib + M*l^2,  Iw = mw*r^2/2
//
// Firmware stosuje: u = -(Kx*x + Kv*(v - v_ref) + Kth*th + Kw*w + Ki*z)
// ========================================================================

export const G = 9.81;

/**
 * Buduje ciągły model (A, B) z parametrów fizycznych.
 * @param {object} p - { m_body, m_wheels, l_com_cm, i_body, wheel_diam_cm, tau_stall, rpm_nl, min_pwm_frac }
 * @param {boolean} withIntegral - dodaj stan z = ∫x (LQI)
 */
export function buildModel(p, withIntegral = false) {
    const M = p.m_body;
    const mw = p.m_wheels;
    const l = p.l_com_cm / 100;
    const r = p.wheel_diam_cm / 200;
    const Ib = p.i_body > 0 ? p.i_body : (M * l * l) / 3;
    const Iw = (mw * r * r) / 2;
    const dmin = Math.min(Math.max(p.min_pwm_frac || 0, 0), 0.95);
    const wn = (p.rpm_nl * 2 * Math.PI) / 60;
    const a = 2 * p.tau_stall * (1 - dmin);
    const b = wn > 0 ? (2 * p.tau_stall) / wn : 0;

    const pp = M + mw + Iw / (r * r);
    const q = M * l;
    const J = Ib + M * l * l;
    const D = pp * J - q * q;
    const c1 = (J / r + q) / D; // x'' = c1*tau - (q*M*g*l/D)*th
    const c2 = (pp + q / r) / D; // th'' = (pp*M*g*l/D)*th - c2*tau

    const A = [
        [0, 1, 0, 0],
        [0, -c1 * b / r, -q * M * G * l / D, c1 * b],
        [0, 0, 0, 1],
        [0, c2 * b / r, pp * M * G * l / D, -c2 * b],
    ];
    const B = [[0], [c1 * a], [0], [-c2 * a]];
    if (!withIntegral) return { A, B };
    const A5 = A.map(row => [...row, 0]);
    A5.push([1, 0, 0, 0, 0]);
    const B5 = [...B, [0]];
    return { A: A5, B: B5 };
}

// --- algebra macierzy (małe, gęste) ---
const zeros = (n, m) => Array.from({ length: n }, () => new Array(m).fill(0));
const eye = (n) => zeros(n, n).map((r, i) => { r[i] = 1; return r; });
const mul = (X, Y) => X.map(row => Y[0].map((_, j) => row.reduce((s, v, k) => s + v * Y[k][j], 0)));
const add = (X, Y) => X.map((row, i) => row.map((v, j) => v + Y[i][j]));
const sub = (X, Y) => X.map((row, i) => row.map((v, j) => v - Y[i][j]));
const scale = (X, s) => X.map(row => row.map(v => v * s));
const T = (X) => X[0].map((_, j) => X.map(row => row[j]));
const normInf = (X) => Math.max(...X.map(row => row.reduce((s, v) => s + Math.abs(v), 0)));

/** exp(M) — skalowanie i podnoszenie do kwadratu + szereg Taylora */
function expm(Mx) {
    const n = Mx.length;
    const s = Math.max(0, Math.ceil(Math.log2(normInf(Mx) || 1)) + 1);
    const As = scale(Mx, 1 / 2 ** s);
    let term = eye(n);
    let E = eye(n);
    for (let k = 1; k <= 18; k++) {
        term = scale(mul(term, As), 1 / k);
        E = add(E, term);
    }
    for (let i = 0; i < s; i++) E = mul(E, E);
    return E;
}

/** Dyskretyzacja z ZOH: [Ad Bd; 0 I] = exp([A B; 0 0]*dt) */
export function discretize(A, B, dt) {
    const n = A.length;
    const m = B[0].length;
    const Mx = zeros(n + m, n + m);
    for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) Mx[i][j] = A[i][j] * dt;
        for (let j = 0; j < m; j++) Mx[i][n + j] = B[i][j] * dt;
    }
    const E = expm(Mx);
    const Ad = E.slice(0, n).map(row => row.slice(0, n));
    const Bd = E.slice(0, n).map(row => row.slice(n));
    return { Ad, Bd };
}

/**
 * Dyskretny LQR (iteracja równania Riccatiego, jedno wejście).
 * Wagi ciągłe Q, R przeliczane na dyskretne (Q*dt, R*dt), więc K nie zależy od dt.
 * @returns {{K:number[], iterations:number, converged:boolean}}
 */
export function dlqr(A, B, Qdiag, R, dt) {
    const { Ad, Bd } = discretize(A, B, dt);
    const n = Ad.length;
    const Q = zeros(n, n);
    Qdiag.forEach((q, i) => { Q[i][i] = q * dt; });
    const Rd = R * dt;
    const AdT = T(Ad);
    const BdT = T(Bd);
    let P = Q.map(row => [...row]);
    let K = zeros(1, n);
    let converged = false;
    let it = 0;
    for (it = 0; it < 400000; it++) {
        const PB = mul(P, Bd);                       // n x 1
        const s = Rd + mul(BdT, PB)[0][0];           // skalar
        const Knew = scale(mul(T(PB), Ad), 1 / s);   // 1 x n
        const Acl = sub(Ad, mul(Bd, Knew));
        const Praw = add(Q, mul(mul(AdT, P), Acl));
        const Pnew = Praw.map((row, i) => row.map((v, j) => 0.5 * (v + Praw[j][i]))); // symetria
        let diff = 0;
        let mag = 0;
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
            diff = Math.max(diff, Math.abs(Pnew[i][j] - P[i][j]));
            mag = Math.max(mag, Math.abs(Pnew[i][j]));
        }
        P = Pnew;
        K = Knew;
        if (!Number.isFinite(diff)) break;
        if (diff <= 1e-10 * Math.max(1, mag)) { converged = true; break; }
    }
    return { K: K[0], iterations: it, converged };
}

/**
 * Symulacja zamkniętej pętli na modelu ciągłym (Euler, nasycenie |u| <= 1).
 * Start: wychylenie th0_deg, reszta 0.
 * @returns {{maxU:number, settleS:number|null, finalThDeg:number, finalXcm:number, fell:boolean}}
 */
export function simulate(A, B, K, th0_deg = 5, seconds = 4, dt = 0.0025) {
    const n = A.length;
    let X = new Array(n).fill(0);
    X[2] = (th0_deg * Math.PI) / 180;
    let maxU = 0;
    let lastOutside = 0;
    let fell = false;
    const steps = Math.round(seconds / dt);
    for (let k = 0; k < steps; k++) {
        let u = -K.reduce((s, kk, i) => s + kk * X[i], 0);
        u = Math.max(-1, Math.min(1, u));
        maxU = Math.max(maxU, Math.abs(u));
        const dX = A.map((row, i) => row.reduce((s, v, j) => s + v * X[j], 0) + B[i][0] * u);
        X = X.map((v, i) => v + dX[i] * dt);
        if (Math.abs(X[2]) > (0.5 * Math.PI) / 180) lastOutside = (k + 1) * dt;
        if (Math.abs(X[2]) > Math.PI / 3) { fell = true; break; }
    }
    return {
        maxU,
        settleS: fell ? null : (lastOutside >= seconds - dt ? null : lastOutside),
        finalThDeg: (X[2] * 180) / Math.PI,
        finalXcm: X[0] * 100,
        fell,
    };
}

/** Pełne obliczenie: model -> K -> symulacja. */
export function computeLqr(phys, weights, useIntegral, dt = 0.0025) {
    const { A, B } = buildModel(phys, useIntegral);
    const Qdiag = [weights.q_x, weights.q_v, weights.q_th, weights.q_w];
    if (useIntegral) Qdiag.push(weights.q_i);
    const res = dlqr(A, B, Qdiag, weights.r, dt);
    const sim = simulate(A, B, res.K, 5, 4, dt);
    return { ...res, sim, A, B };
}
