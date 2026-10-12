import test from 'node:test';
import assert from 'node:assert/strict';

// Port 1:1 FuzzyController::configurePD + compute (src/Control/fuzzy_controller.cpp, v4) — bez całki.
function configurePD(kp, kd, emax, prog) {
    const he = emax / 2;
    const uS = kp * he;
    const uB = uS * (1 + prog);
    const r = (kd > 1e-4 && uS > 0) ? 2 * uS / kd : 1e6;
    const hr = r / 2;
    const err = [0, 1, 2, 3, 4].map(i => ({ c: (i - 2) * he, w: he }));
    const rate = [0, 1, 2, 3, 4].map(i => ({ c: (i - 2) * hr, w: hr }));
    const out = [-uB, -uS, 0, uS, uB];
    const rules = [];
    for (let e = 0; e < 5; e++) for (let q = 0; q < 5; q++) rules.push([e, q, Math.min(4, Math.max(0, e + q - 2))]);
    return { err, rate, out, rules };
}
const tri = (v, s) => { const d = Math.abs(v - s.c); return d >= s.w ? 0 : 1 - d / s.w; };
function compute(f, e, de) {
    const clamp = (v, sets) => Math.min(Math.max(v, sets[0].c), sets[4].c);
    e = clamp(e, f.err); de = clamp(de, f.rate);
    const me = f.err.map(s => tri(e, s));
    const mr = f.rate.map(s => tri(de, s));
    let num = 0, den = 0;
    for (const [i, j, o] of f.rules) { const w = me[i] * mr[j]; num += w * f.out[o]; den += w; }
    return den > 1e-6 ? num / den : 0;
}

test('progresja 1 = dokładnie PD (Kp·e + Kd·ė) w zakresie liniowym', () => {
    const f = configurePD(100, 1.3, 10, 1);
    for (const [e, de] of [[0, 0], [1, 0], [0, 50], [2.5, -40], [-3, 20], [4, 100]]) {
        assert.ok(Math.abs(compute(f, e, de) - (100 * e + 1.3 * de)) < 1e-6, `e=${e} de=${de}`);
    }
});

test('poza zakresem: nasycenie (nie spada do zera jak v3)', () => {
    const f = configurePD(100, 1.3, 10, 1);
    assert.ok(compute(f, 25, 0) >= compute(f, 10, 0));
    assert.ok(compute(f, 25, 0) > 0);
});

test('progresja 2: przy pionie jak PD, przy dużym wychyleniu mocniej', () => {
    const lin = configurePD(100, 1.3, 10, 1);
    const prog = configurePD(100, 1.3, 10, 2);
    assert.ok(Math.abs(compute(prog, 1, 0) - compute(lin, 1, 0)) < 1e-6);
    assert.ok(compute(prog, 9, 0) > compute(lin, 9, 0));
});

test('powierzchnia monotoniczna w kącie (brak „schodków” odwracających znak)', () => {
    const f = configurePD(100, 1.3, 10, 2);
    let prev = -Infinity;
    for (let e = -15; e <= 15; e += 0.25) {
        const u = compute(f, e, 30);
        assert.ok(u >= prev - 1e-9, `e=${e}`);
        prev = u;
    }
});
