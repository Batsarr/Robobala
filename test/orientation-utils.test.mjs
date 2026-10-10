import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRobotEulerFromTelemetryAngles, computeEulerFromQuaternion } from '../js/modules/orientation-utils.mjs';

const D = Math.PI / 180;
const mul = (A, B) => A.map((r, i) => B[0].map((_, j) => r.reduce((s, _v, k) => s + A[i][k] * B[k][j], 0)));
const T = (A) => A[0].map((_, j) => A.map(r => r[j]));
const Rx = (t) => [[1, 0, 0], [0, Math.cos(t), -Math.sin(t)], [0, Math.sin(t), Math.cos(t)]];
const Ry = (t) => [[Math.cos(t), 0, Math.sin(t)], [0, 1, 0], [-Math.sin(t), 0, Math.cos(t)]];
const Rz = (t) => [[Math.cos(t), -Math.sin(t), 0], [Math.sin(t), Math.cos(t), 0], [0, 0, 1]];
// robot (X przod, Y lewo, Z gora) -> three (x = -y_r, y = z_r, z = -x_r)
const M = [[0, -1, 0], [0, 0, 1], [-1, 0, 0]];
const apply = (A, v) => A.map(r => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]);
// Macierz Three.js dla Euler 'YXZ': Ry(y) * Rx(x) * Rz(z)
const threeYXZ = (e) => mul(mul(Ry(e.y), Rx(e.x)), Rz(e.z));
const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-9);

test('buildRobotEulerFromTelemetryAngles: pitch/roll/yaw -> Euler YXZ (x=-pitch, y=yaw, z=-roll)', () => {
  const result = buildRobotEulerFromTelemetryAngles({ pitch: 10, roll: 20, yaw: 30 });

  assert.equal(result.order, 'YXZ');
  assert.equal(result.x, -10 * D);
  assert.equal(result.y, 30 * D);
  assert.equal(result.z, -20 * D);
});

test('konwersja robot Z-up -> Three Y-up == M * R_robot * M^T dla dowolnych katow', () => {
  for (const [pitch, roll, yaw] of [[10, 0, 0], [0, 15, 0], [0, 0, 40], [12, -7, 33], [-25, 18, -120]]) {
    const Rr = mul(mul(Rz(yaw * D), Ry(pitch * D)), Rx(roll * D));
    const expected = mul(mul(M, Rr), T(M));
    const got = threeYXZ(buildRobotEulerFromTelemetryAngles({ pitch, roll, yaw }));
    for (let i = 0; i < 3; i++) assert.ok(near(got[i], expected[i]), `pitch=${pitch} roll=${roll} yaw=${yaw}`);
  }
});

test('pochylenie robota do przodu (pitch > 0) = pochylenie modelu do przodu (-Z), nie obrot wokol pionu', () => {
  const R = threeYXZ(buildRobotEulerFromTelemetryAngles({ pitch: 10, roll: 0, yaw: 0 }));
  const up = apply(R, [0, 1, 0]);            // gora modelu
  assert.ok(up[2] < -0.17 && up[2] > -0.18);  // przesuniecie w -Z (przod) = sin(10 deg)
  assert.ok(Math.abs(up[0]) < 1e-12);
  assert.ok(up[1] > 0.98);                    // nadal pionowo, nie lezy
  const fwdRobot = apply(M, apply(mul(mul(Rz(0), Ry(10 * D)), Rx(0)), [0, 0, 1]));
  assert.ok(near(up, fwdRobot));              // to samo co gora robota przeliczona M
});

test('yaw = obrot wokol pionu sceny (Y), roll = przechyl na bok (X sceny)', () => {
  const yawR = threeYXZ(buildRobotEulerFromTelemetryAngles({ pitch: 0, roll: 0, yaw: 90 }));
  assert.ok(near(apply(yawR, [0, 1, 0]), [0, 1, 0]));
  const rollR = threeYXZ(buildRobotEulerFromTelemetryAngles({ pitch: 0, roll: 10, yaw: 0 }));
  const up = apply(rollR, [0, 1, 0]);
  assert.ok(Math.abs(up[2]) < 1e-12 && Math.abs(up[0]) > 0.17);
});

test('computeEulerFromQuaternion returns zero angles for identity quaternion', () => {
  const result = computeEulerFromQuaternion(1, 0, 0, 0);

  assert.ok(result);
  assert.equal(result.yaw, 0);
  assert.equal(result.pitch, 0);
  assert.equal(result.roll, 0);
});
