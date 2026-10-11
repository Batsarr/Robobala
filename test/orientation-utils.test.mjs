import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRobotEulerFromTelemetryAngles, computeEulerFromQuaternion } from '../js/modules/orientation-utils.mjs';

test('buildRobotEulerFromTelemetryAngles maps pitch/roll/yaw to the robot axes in ZYX order', () => {
  const result = buildRobotEulerFromTelemetryAngles({ pitch: 10, roll: 20, yaw: 30 });

  assert.equal(result.order, 'ZYX');
  assert.equal(result.x, 20 * Math.PI / 180);
  assert.equal(result.y, 10 * Math.PI / 180);
  assert.equal(result.z, 30 * Math.PI / 180);
});

test('computeEulerFromQuaternion returns zero angles for identity quaternion', () => {
  const result = computeEulerFromQuaternion(1, 0, 0, 0);

  assert.ok(result);
  assert.equal(result.yaw, 0);
  assert.equal(result.pitch, 0);
  assert.equal(result.roll, 0);
});
