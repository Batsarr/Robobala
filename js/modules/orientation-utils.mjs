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

/**
 * Jedyne miejsce zamiany osi: robot (Z-up) -> scena Three.js (Y-up).
 *
 * Robot (firmware, imu_math.h quaternionToRobotAnglesDeg), uklad prawoskretny:
 *   X = przod, Y = lewo, Z = gora; yaw wokol Z, pitch wokol Y, roll wokol X,
 *   kolejnosc Tait-Bryan ZYX:  R_robot = Rz(yaw) * Ry(pitch) * Rx(roll).
 *   pitch > 0 = robot pochyla sie DO PRZODU (gora porusza sie w strone +X).
 * Three.js (model): X = prawo, Y = gora, Z = do kamery; przod robota = -Z
 *   (kamera "z tylu" w widoku z perspektywy robota stoi na +Z), kola na +/-X.
 *
 * Macierz zmiany bazy M (robot -> three): x_t = -y_r, y_t = z_r, z_t = -x_r (det = +1).
 * Obrot o kat t wokol osi a robota to obrot o t wokol osi M*a w scenie:
 *   yaw   wokol Z  -> wokol +Y  o  +yaw
 *   pitch wokol Y  -> wokol -X  o  +pitch  == wokol +X o -pitch
 *   roll  wokol X  -> wokol -Z  o  +roll   == wokol +Z o -roll
 * Zlozenie: R_three = M R_robot M^T = Ry(yaw) * Rx(-pitch) * Rz(-roll),
 * czyli Euler Three.js w kolejnosci 'YXZ' z (x=-pitch, y=yaw, z=-roll).
 * Wartosci pitch/roll/yaw sa DOKLADNIE tymi z dashboardu (window.telemetryData).
 */
export function buildRobotOrientationAngles(values = {}) {
    const pitchValue = Number(values.pitch ?? 0);
    const rollValue = Number(values.roll ?? 0);
    const yawValue = Number(values.yaw ?? 0);

    const pitch = Number.isFinite(pitchValue) ? pitchValue : 0;
    const roll = Number.isFinite(rollValue) ? rollValue : 0;
    const yaw = Number.isFinite(yawValue) ? yawValue : 0;

    return {
        x: -pitch * DEG_TO_RAD,
        y: yaw * DEG_TO_RAD,
        z: -roll * DEG_TO_RAD,
        order: 'YXZ'
    };
}

export function buildRobotEulerFromTelemetryAngles(values = {}) {
    return buildRobotOrientationAngles(values);
}
