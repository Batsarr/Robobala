import test from 'node:test';
import assert from 'node:assert/strict';
import { buildModel, computeLqr, simulate } from '../js/modules/lqr-math.mjs';

// Wartości domyślne z eeprom_manager.cpp (_load_default_ext_params) + koło 8 cm, min PWM 1230/2047
const PHYS = { m_body: 0.8, m_wheels: 0.1, l_com_cm: 5, i_body: 0, wheel_diam_cm: 8, tau_stall: 0.3, rpm_nl: 300, min_pwm_frac: 1230 / 2047 };
const W = { q_x: 25, q_v: 4, q_th: 400, q_w: 1, q_i: 5, r: 4 };

test('model: wahadło niestabilne bez sterowania (grawitacja przewraca)', () => {
    const { A, B } = buildModel(PHYS);
    assert.ok(A[3][2] > 0, 'th\'\' rośnie z th');
    assert.ok(B[1][0] > 0, 'u>0 rozpędza koła do przodu');
    assert.ok(B[3][0] < 0, 'u>0 odchyla korpus do tyłu (reakcja)');
    const sim = simulate(A, B, [0, 0, 0, 0], 2, 2);
    assert.equal(sim.fell, true);
});

test('LQR: zbiega, łapie 5° bez przewrócenia, znak K kąta ujemny (u>0 gdy pochylony do przodu)', () => {
    const r = computeLqr(PHYS, W, false);
    assert.equal(r.converged, true);
    assert.equal(r.K.length, 4);
    assert.ok(r.K[2] < 0, `K_th=${r.K[2]}`);
    assert.equal(r.sim.fell, false);
    assert.ok(r.sim.settleS !== null && r.sim.settleS < 1.5, `settle=${r.sim.settleS}`);
});

test('LQI: 5 wzmocnień, całka ze znakiem jak pozycja', () => {
    const r = computeLqr(PHYS, W, true);
    assert.equal(r.converged, true);
    assert.equal(r.K.length, 5);
    assert.equal(Math.sign(r.K[4]), Math.sign(r.K[0]));
    assert.equal(r.sim.fell, false);
});

test('większe R = mniej PWM', () => {
    const soft = computeLqr(PHYS, { ...W, r: 40 }, false);
    const hard = computeLqr(PHYS, { ...W, r: 0.4 }, false);
    assert.ok(Math.abs(soft.K[2]) < Math.abs(hard.K[2]));
});
