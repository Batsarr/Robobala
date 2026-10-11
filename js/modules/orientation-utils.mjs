const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

export function computeEulerFromQuaternion(qw, qx, qy, qz) {
    if ([qw, qx, qy, qz].some(v => typeof v !== 'number' || Number.isNaN(v))) {
        return null;
    }

    const n = Math.hypot(qw, qx, qy, qz) || 1;
    qw /= n;
    qx /= n;
    qy /= n;
    qz /= n;

    const sinyCosp = 2 * (qw * qz + qx * qy);
    const cosyCosp = 1 - 2 * (qy * qy + qz * qz);
    const yaw = Math.atan2(sinyCosp, cosyCosp);

    const sinp = 2 * (qw * qy - qz * qx);
    const pitch = Math.abs(sinp) >= 1 ? Math.sign(sinp) * (Math.PI / 2) : Math.asin(sinp);

    const sinrCosp = 2 * (qw * qx + qy * qz);
    const cosrCosp = 1 - 2 * (qx * qx + qy * qy);
    const roll = Math.atan2(sinrCosp, cosrCosp);

    return {
        yaw: yaw * RAD_TO_DEG,
        pitch: pitch * RAD_TO_DEG,
        roll: roll * RAD_TO_DEG
    };
}

export function buildRobotOrientationAngles(values = {}) {
    const pitchValue = Number(values.pitch ?? 0);
    const rollValue = Number(values.roll ?? 0);
    const yawValue = Number(values.yaw ?? 0);

    const pitch = Number.isFinite(pitchValue) ? pitchValue : 0;
    const roll = Number.isFinite(rollValue) ? rollValue : 0;
    const yaw = Number.isFinite(yawValue) ? yawValue : 0;

    return {
        x: roll * DEG_TO_RAD,
        y: pitch * DEG_TO_RAD,
        z: yaw * DEG_TO_RAD,
        // Firmware sends yaw/pitch/roll in ZYX convention.
        order: 'ZYX'
    };
}

export function buildRobotEulerFromTelemetryAngles(values = {}) {
    return buildRobotOrientationAngles(values);
}
