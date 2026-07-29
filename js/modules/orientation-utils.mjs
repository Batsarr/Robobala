const DEG_TO_RAD = Math.PI / 180;

export function buildRobotOrientationAngles(values = {}) {
    const pitch = Number(values.pitch ?? 0);
    const roll = Number(values.roll ?? 0);
    const yaw = Number(values.yaw ?? 0);

    return {
        x: roll * DEG_TO_RAD,
        y: pitch * DEG_TO_RAD,
        z: yaw * DEG_TO_RAD,
        order: 'XYZ'
    };
}

export function buildRobotEulerFromTelemetryAngles(values = {}) {
    return buildRobotOrientationAngles(values);
}
