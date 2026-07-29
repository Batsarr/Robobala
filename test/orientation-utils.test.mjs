import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRobotEulerFromTelemetryAngles } from '../js/modules/orientation-utils.mjs';

test('buildRobotEulerFromTelemetryAngles maps pitch/roll/yaw to the robot axes in XYZ order', () => {
  const result = buildRobotEulerFromTelemetryAngles({ pitch: 10, roll: 20, yaw: 30 });

  assert.equal(result.order, 'XYZ');
  assert.equal(result.x, 20 * Math.PI / 180);
  assert.equal(result.y, 10 * Math.PI / 180);
  assert.equal(result.z, 30 * Math.PI / 180);
});
