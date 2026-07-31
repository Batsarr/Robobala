/**
 * sensor-mapping.js — ES6 module
 * Sensor mapping, model mapping, quaternion Euler conversion, trim/zero adjustments.
 * Extracted from main.js (lines ~352-830).
 */

import { appStore, AppState } from './state.js';

// ---------------------------------------------------------------------------
// Sensor mapping 3D preview (simple cube with axes)
// ---------------------------------------------------------------------------
let sensorPreview = { scene: null, camera: null, renderer: null, cube: null, axes: null, animId: null };

function initSensorMappingPreview() {
    const container = document.getElementById('sensor-mapping-preview');
    if (!container) return;
    // Clean up existing renderer
    if (sensorPreview.renderer && sensorPreview.renderer.domElement) {
        while (container.firstChild) container.removeChild(container.firstChild);
        sensorPreview.renderer.dispose();
        sensorPreview.renderer = null;
    }
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(3, 3, 6);
    camera.lookAt(0, 0, 0);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);
    const geom = new THREE.BoxGeometry(2, 0.2, 2);
    const mat = new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.2, roughness: 0.7 });
    const cube = new THREE.Mesh(geom, mat);
    // Add small axes helper
    const axes = new THREE.AxesHelper(3);
    scene.add(axes);
    scene.add(cube);
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xffffff, 0.6);
    dir.position.set(5, 10, 7);
    scene.add(dir);
    sensorPreview.scene = scene; sensorPreview.camera = camera; sensorPreview.renderer = renderer; sensorPreview.cube = cube; sensorPreview.axes = axes;
    // Create simple axis labels (X,Y,Z) using sprites so user sees orientation
    const makeAxisLabel = (text, color) => {
        const canvasLabel = document.createElement('canvas'); canvasLabel.width = 128; canvasLabel.height = 64; const ctxLabel = canvasLabel.getContext('2d'); ctxLabel.font = 'bold 30px Arial'; ctxLabel.textAlign = 'center'; ctxLabel.textBaseline = 'middle'; ctxLabel.fillStyle = color || '#ffffff'; ctxLabel.fillText(text, canvasLabel.width / 2, canvasLabel.height / 2);
        const labelTex = new THREE.CanvasTexture(canvasLabel);
        const labelMat = new THREE.SpriteMaterial({ map: labelTex, depthTest: false });
        return new THREE.Sprite(labelMat);
    };
    sensorPreview.xLabel = makeAxisLabel('X', '#ff0000'); sensorPreview.xLabel.scale.set(1.2, 0.6, 1);
    sensorPreview.yLabel = makeAxisLabel('Y', '#00ff00'); sensorPreview.yLabel.scale.set(1.2, 0.6, 1);
    sensorPreview.zLabel = makeAxisLabel('Z', '#0000ff'); sensorPreview.zLabel.scale.set(1.2, 0.6, 1);
    // Attach labels to cube to reflect cube rotation (so labels move with cube)
    cube.add(sensorPreview.xLabel); cube.add(sensorPreview.yLabel); cube.add(sensorPreview.zLabel);
    // Place labels near cube faces (local coordinates so they rotate with cube)
    sensorPreview.xLabel.position.set(1.3, 0, 0);
    sensorPreview.yLabel.position.set(0, 1.3, 0);
    sensorPreview.zLabel.position.set(0, 0, 1.3);
    // Add arrow helpers to indicate positive directions of axes
    sensorPreview.xArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 0), 1.1, 0xff0000);
    sensorPreview.yArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 0), 1.1, 0x00ff00);
    sensorPreview.zArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 0), 1.1, 0x0000ff);
    cube.add(sensorPreview.xArrow); cube.add(sensorPreview.yArrow); cube.add(sensorPreview.zArrow);
    // Face indicator - small plane on cube front to indicate virtual sensor front/top orientation
    const faceGeom = new THREE.PlaneGeometry(0.8, 0.8);
    const faceMat = new THREE.MeshBasicMaterial({ color: 0xff00ff, transparent: true, opacity: 0.75, side: THREE.DoubleSide });
    const faceIndicator = new THREE.Mesh(faceGeom, faceMat);
    faceIndicator.position.set(0, 0, 1.3);
    faceIndicator.lookAt(sensorPreview.camera.position);
    faceIndicator.visible = false;
    cube.add(faceIndicator);
    sensorPreview.faceIndicator = faceIndicator;
    // Animation loop
    function render() {
        sensorPreview.animId = requestAnimationFrame(render);
        renderer.render(scene, camera);
    }
    render();
    // Resize handler
    window.addEventListener('resize', () => {
        if (!sensorPreview.renderer) return;
        const w = container.clientWidth; const h = container.clientHeight;
        sensorPreview.camera.aspect = w / h; sensorPreview.camera.updateProjectionMatrix(); sensorPreview.renderer.setSize(w, h);
    });
    // Update display initial values
    updateSensorMappingDisplays();
    // Buttons wiring
    ['pitchMinus90Btn', 'pitchPlus90Btn', 'rollMinus90Btn', 'rollPlus90Btn', 'yawMinus90Btn', 'yawPlus90Btn'].forEach(id => {
        const b = document.getElementById(id);
        if (!b) return;
        b.addEventListener('click', (e) => {
            const delta = id.includes('Minus') ? -90 : 90;
            if (id.startsWith('pitch')) rotateSensorCube('x', delta);
            if (id.startsWith('roll')) rotateSensorCube('z', delta);
            if (id.startsWith('yaw')) rotateSensorCube('y', delta);
        });
    });
    document.getElementById('setModalPitchZeroBtn')?.addEventListener('click', () => { setPitchZero(); });
    document.getElementById('setModalRollZeroBtn')?.addEventListener('click', () => { setRollZero(); });
    // Małe korekty trimów
    document.getElementById('pitchTrimPlus01Btn')?.addEventListener('click', () => { adjustTrim('pitch', 0.1); });
    document.getElementById('pitchTrimMinus01Btn')?.addEventListener('click', () => { adjustTrim('pitch', -0.1); });
    document.getElementById('pitchTrimPlus001Btn')?.addEventListener('click', () => { adjustTrim('pitch', 0.01); });
    document.getElementById('pitchTrimMinus001Btn')?.addEventListener('click', () => { adjustTrim('pitch', -0.01); });
    document.getElementById('rollTrimPlus01Btn')?.addEventListener('click', () => { adjustTrim('roll', 0.1); });
    document.getElementById('rollTrimMinus01Btn')?.addEventListener('click', () => { adjustTrim('roll', -0.1); });
    document.getElementById('rollTrimPlus001Btn')?.addEventListener('click', () => { adjustTrim('roll', 0.01); });
    document.getElementById('rollTrimMinus001Btn')?.addEventListener('click', () => { adjustTrim('roll', -0.01); });
    document.getElementById('clearModalPitchZeroBtn')?.addEventListener('click', () => {
        // Nowy model: trymy nie są stosowane runtime – nic do czyszczenia.
        addLogMessage('[UI] Trym (Pitch) jest częścią montażu (qcorr) i nie podlega czyszczeniu wartością 0. Użyj przycisków ± lub Ustaw punkt 0.', 'warn');
    });
    document.getElementById('clearModalRollZeroBtn')?.addEventListener('click', () => {
        addLogMessage('[UI] Trym (Roll) jest częścią montażu (qcorr) i nie podlega czyszczeniu wartością 0. Użyj przycisków ± lub Ustaw punkt 0.', 'warn');
    });
    // Nowe: przyciski obrotu montażu (qcorr) o 90° wokół osi X/Y/Z - ZAKOMENTOWANE, bo robot nie obsługuje rotate_mount_90
    /*
    const rotate90 = (axis, steps) => {
        sendBleMessage({ type: 'rotate_mount_90', axis, steps });
        addLogMessage(`[UI] Obrót montażu 90°: axis=${axis.toUpperCase()} steps=${steps}`, 'info');
    };
    document.getElementById('mountXMinus90Btn')?.addEventListener('click', () => rotate90('x', -1));
    document.getElementById('mountXPlus90Btn')?.addEventListener('click', () => rotate90('x', 1));
    document.getElementById('mountYMinus90Btn')?.addEventListener('click', () => rotate90('y', -1));
    document.getElementById('mountYPlus90Btn')?.addEventListener('click', () => rotate90('y', 1));
    document.getElementById('mountZMinus90Btn')?.addEventListener('click', () => rotate90('z', -1));
    document.getElementById('mountZPlus90Btn')?.addEventListener('click', () => rotate90('z', 1));
    */
}

// ---------------------------------------------------------------------------
// IMU Mapping helpers
// ---------------------------------------------------------------------------

// Gather IMU mapping from sensor mapping modal
function gatherIMUMappingFromUI() {
    const mapping = {
        pitch: { source: parseInt(document.getElementById('imuPitchSource')?.value || '0'), sign: parseInt(getActiveSign('imuPitchSign')) },
        yaw: { source: parseInt(document.getElementById('imuYawSource')?.value || '1'), sign: parseInt(getActiveSign('imuYawSign')) },
        roll: { source: parseInt(document.getElementById('imuRollSource')?.value || '2'), sign: parseInt(getActiveSign('imuRollSign')) }
    };
    return mapping;
}

function updateIMUMappingUIFromData(data) {
    if (!data || !data.pitch) return;
    const p = document.getElementById('imuPitchSource'); if (p) p.value = data.pitch.source || '0';
    const y = document.getElementById('imuYawSource'); if (y) y.value = data.yaw.source || '1';
    const r = document.getElementById('imuRollSource'); if (r) r.value = data.roll.source || '2';
    setSignButtons('imuPitchSign', parseInt(data.pitch.sign));
    setSignButtons('imuYawSign', parseInt(data.yaw.sign));
    setSignButtons('imuRollSign', parseInt(data.roll.sign));
}

function rotateSensorCube(axis, deg) {
    if (!sensorPreview.cube) return;
    const rad = THREE.MathUtils.degToRad(deg);
    if (axis === 'x') sensorPreview.cube.rotateX(rad);
    else if (axis === 'y') sensorPreview.cube.rotateY(rad);
    else if (axis === 'z') sensorPreview.cube.rotateZ(rad);
    updateSensorMappingDisplays();
    // Apply rotation transform to current IMU mapping values (UI only until user saves)
    if (Math.abs(deg) % 90 === 0) {
        try { applyRotationToIMUMapping(axis, deg); } catch (e) { /* no-op */ }
    }
}

function mappingObjToMatrix(mapping) {
    // mapping: { pitch:{source,sign}, yaw:{...}, roll:{...} }
    const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    const setRow = (rowIdx, m) => { const col = parseInt(m.source); const sign = parseInt(m.sign) || 1; M[rowIdx][col] = sign; };
    setRow(0, mapping.pitch);
    setRow(1, mapping.yaw);
    setRow(2, mapping.roll);
    return M;
}

function matrixToMappingObj(M) {
    const findInRow = (row) => {
        for (let c = 0; c < 3; c++) {
            const v = M[row][c]; if (v === 0) continue; return { source: c, sign: v };
        }
        // default fallback
        return { source: 0, sign: 1 };
    };
    return { pitch: findInRow(0), yaw: findInRow(1), roll: findInRow(2) };
}

function multiplyMatrix(A, B) {
    const R = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { let s = 0; for (let k = 0; k < 3; k++) s += A[i][k] * B[k][j]; R[i][j] = s; }
    return R;
}

// ---------------------------------------------------------------------------
// Rotation matrix / IMU rotation
// ---------------------------------------------------------------------------

function getRotationMatrix(axis, deg) {
    const d = ((deg % 360) + 360) % 360; // normalize
    // Build RA for +90 degree rotation - adapt sign for negative angle
    const q = (d === 270) ? -90 : d; // for -90 deg normalized to 270; make it -90 to handle below
    let RA = null;
    if (axis === 'x') {
        if (q === 90) RA = [[1, 0, 0], [0, 0, -1], [0, 1, 0]];
        else if (q === -90) RA = [[1, 0, 0], [0, 0, 1], [0, -1, 0]];
        else if (q === 180) RA = [[1, 0, 0], [0, -1, 0], [0, 0, -1]];
        else RA = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    } else if (axis === 'y') {
        if (q === 90) RA = [[0, 0, 1], [0, 1, 0], [-1, 0, 0]];
        else if (q === -90) RA = [[0, 0, -1], [0, 1, 0], [1, 0, 0]];
        else if (q === 180) RA = [[-1, 0, 0], [0, 1, 0], [0, 0, -1]];
        else RA = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    } else { // z
        if (q === 90) RA = [[0, -1, 0], [1, 0, 0], [0, 0, 1]];
        else if (q === -90) RA = [[0, 1, 0], [-1, 0, 0], [0, 0, 1]];
        else if (q === 180) RA = [[-1, 0, 0], [0, -1, 0], [0, 0, 1]];
        else RA = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    }
    return RA;
}

function applyRotationToIMUMapping(axis, deg) {
    const cur = gatherIMUMappingFromUI();
    const M = mappingObjToMatrix(cur);
    const R = getRotationMatrix(axis, deg);
    const Mprime = multiplyMatrix(M, R);
    const newMap = matrixToMappingObj(Mprime);
    updateIMUMappingUIFromData(newMap);
}

function updateSensorMappingDisplays() {
    if (!sensorPreview.cube) return;
    const q = sensorPreview.cube.quaternion;
    const eul = new THREE.Euler().setFromQuaternion(q, 'ZYX');
    const yaw = THREE.MathUtils.radToDeg(eul.x);
    const pitch = THREE.MathUtils.radToDeg(eul.y);
    const roll = THREE.MathUtils.radToDeg(eul.z);
    document.getElementById('modal-pitch-display').textContent = pitch.toFixed(2) + '°';
    document.getElementById('modal-roll-display').textContent = roll.toFixed(2) + '°';
    document.getElementById('modal-yaw-display').textContent = yaw.toFixed(2) + '°';
}

function updateModalTelemetryDisplay() {
    const e = getRawEuler();
    const pd = document.getElementById('modal-pitch-telemetry');
    const rd = document.getElementById('modal-roll-telemetry');
    const yd = document.getElementById('modal-yaw-telemetry');
    if (pd) pd.textContent = (e.pitch || 0).toFixed(2) + '°';
    if (rd) rd.textContent = (e.roll || 0).toFixed(2) + '°';
    if (yd) yd.textContent = (e.yaw || 0).toFixed(2) + '°';
}

// ---------------------------------------------------------------------------
// Model Mapping (wizualizacja 3D)
// ---------------------------------------------------------------------------
let modelMapping = { pitch: { source: 0, sign: 1 }, yaw: { source: 1, sign: 1 }, roll: { source: 2, sign: 1 } }; // domyślne: identity

function openModelMappingModal() { const m = document.getElementById('model-mapping-modal'); if (!m) return; m.style.display = 'flex'; updateModelMappingUI(); }
function closeModelMappingModal() { const m = document.getElementById('model-mapping-modal'); if (!m) return; m.style.display = 'none'; }

function updateModelMappingUI() {
    // Ustaw dropdowny
    const sPitch = document.getElementById('modelPitchSource'); const sYaw = document.getElementById('modelYawSource'); const sRoll = document.getElementById('modelRollSource');
    if (sPitch) sPitch.value = String(modelMapping.pitch.source);
    if (sYaw) sYaw.value = String(modelMapping.yaw.source);
    if (sRoll) sRoll.value = String(modelMapping.roll.source);
    // Ustaw przyciski sign
    setSignButtons('modelPitchSign', modelMapping.pitch.sign);
    setSignButtons('modelYawSign', modelMapping.yaw.sign);
    setSignButtons('modelRollSign', modelMapping.roll.sign);
    // Podgląd
    const cur = document.getElementById('model-mapping-current');
    if (cur) { cur.textContent = `pitch: src=${modelMapping.pitch.source} sign=${modelMapping.pitch.sign} | yaw: src=${modelMapping.yaw.source} sign=${modelMapping.yaw.sign} | roll: src=${modelMapping.roll.source} sign=${modelMapping.roll.sign}`; }
}

function setSignButtons(containerId, sign) { const c = document.getElementById(containerId); if (!c) return; c.querySelectorAll('button').forEach(btn => { const s = parseInt(btn.dataset.sign); if (s === sign) { btn.classList.add('active'); } else { btn.classList.remove('active'); } }); }

function updateSignBadge(badgeId, sign) {
    const el = document.getElementById(badgeId);
    if (!el) return;
    const prefixMap = { 'balanceSignBadge': 'B', 'speedSignBadge': 'S', 'positionSignBadge': 'P' };
    const prefix = prefixMap[badgeId] || '';
    el.textContent = `${prefix}:${sign === -1 ? '-' : '+'}`;
    el.classList.toggle('negative', sign === -1);
    updateSignSummary();
}

function updateSignSummary() {
    const b = getActiveSign('balanceSign');
    const s = getActiveSign('speedSign');
    const p = getActiveSign('positionSign');
    const el = document.getElementById('signSummary');
    if (!el) return;
    el.textContent = `B:${b === -1 ? '-' : '+'} S:${s === -1 ? '-' : '+'} P:${p === -1 ? '-' : '+'}`;
}

function gatherModelMappingFromUI() { modelMapping.pitch.source = parseInt(document.getElementById('modelPitchSource').value); modelMapping.yaw.source = parseInt(document.getElementById('modelYawSource').value); modelMapping.roll.source = parseInt(document.getElementById('modelRollSource').value); modelMapping.pitch.sign = getActiveSign('modelPitchSign'); modelMapping.yaw.sign = getActiveSign('modelYawSign'); modelMapping.roll.sign = getActiveSign('modelRollSign'); }

function getActiveSign(containerId) { const c = document.getElementById(containerId); if (!c) return 1; const active = c.querySelector('button.active'); return active ? parseInt(active.dataset.sign) : 1; }

function resetModelMapping() { modelMapping = { pitch: { source: 0, sign: 1 }, yaw: { source: 1, sign: 1 }, roll: { source: 2, sign: 1 } }; updateModelMappingUI(); }

function applyModelMappingToEuler(e) { // e={pitch,yaw,roll}; zwraca przemapowane
    const arr = [e.pitch, e.yaw, e.roll];
    return {
        pitch: (arr[modelMapping.pitch.source] || 0) * modelMapping.pitch.sign,
        yaw: (arr[modelMapping.yaw.source] || 0) * modelMapping.yaw.sign,
        roll: (arr[modelMapping.roll.source] || 0) * modelMapping.roll.sign
    };
}

// ---------------------------------------------------------------------------
// Euler from quaternion
// ---------------------------------------------------------------------------

function computeEulerFromQuaternion(qw, qx, qy, qz) {
    try {
        if ([qw, qx, qy, qz].some(v => typeof v !== 'number' || Number.isNaN(v))) return null;
        // ZYX (yaw-pitch-roll) zgodnie z firmware (imu_math.h)
        const n = Math.hypot(qw, qx, qy, qz) || 1;
        qw /= n; qx /= n; qy /= n; qz /= n;
        const siny_cosp = 2 * (qw * qz + qx * qy);
        const cosy_cosp = 1 - 2 * (qy * qy + qz * qz);
        const yaw = Math.atan2(siny_cosp, cosy_cosp);
        const sinp = 2 * (qw * qy - qz * qx);
        const pitch = Math.abs(sinp) >= 1 ? Math.sign(sinp) * (Math.PI / 2) : Math.asin(sinp);
        const sinr_cosp = 2 * (qw * qx + qy * qz);
        const cosr_cosp = 1 - 2 * (qx * qx + qy * qy);
        const roll = Math.atan2(sinr_cosp, cosr_cosp);
        return {
            yaw: THREE.MathUtils.radToDeg(yaw),
            pitch: THREE.MathUtils.radToDeg(pitch),
            roll: THREE.MathUtils.radToDeg(roll)
        };
    } catch (_) { return null; }
}

// Usunięto legacy mapowanie IMU (Quaternion-First). Euler liczony bezpośrednio z kwaternionu.

// Zwraca SUROWE kąty Euler'a z aktualnej telemetrii kwaternionu (bez mapowania IMU)
function getRawEuler() {
    if (!window.telemetryData) return { pitch: 0, yaw: 0, roll: 0 };
    const { qw, qx, qy, qz } = window.telemetryData;
    const eul = (typeof qw === 'number') ? computeEulerFromQuaternion(qw, qx, qy, qz) : null;
    return eul || { pitch: 0, yaw: 0, roll: 0 };
}

// ---------------------------------------------------------------------------
// Pitch / Roll zero & trim
// ---------------------------------------------------------------------------

// GLOBALNE: ustawianie punktu 0 dla Pitch i Roll.
// Firmware: adjust_zero dodaje deltę do baseTargetAngleTrim.
// Telemetria pitch to już kąt po trymach, więc delta = -pitch spowoduje że następny odczyt będzie 0.
// Uwzględniamy też offset UI, który jest tymczasową korektą wyświetlania.
function setPitchZero() {
    if (!window.telemetryData) {
        addLogMessage('[UI] Brak danych telemetrii (pitch).', 'warn');
        return;
    }
    // Odczytaj aktualny pitch z telemetrii (już po trymach i offsetach)
    let currentPitch = Number(window.telemetryData.pitch);
    if (typeof currentPitch !== 'number' || isNaN(currentPitch)) {
        if (typeof window.telemetryData.qw === 'number') {
            const eul = computeEulerFromQuaternion(window.telemetryData.qw, window.telemetryData.qx, window.telemetryData.qy, window.telemetryData.qz);
            currentPitch = eul ? eul.pitch : 0;
        } else {
            addLogMessage('[UI] Nieprawidłowy odczyt pitch.', 'error');
            return;
        }
    }
    // Zaokrąglij lekko, by uniknąć flipa znaku przy ±0.00x
    currentPitch = Math.round(currentPitch * 100) / 100;
    if (isNaN(currentPitch)) {
        addLogMessage('[UI] Nieprawidlowy odczyt pitch.', 'error');
        return;
    }
    // Delta = -currentPitch -> po dodaniu do trim montażu, następny odczyt pitch = 0
    const delta = -currentPitch;
    sendBleMessage({ type: 'adjust_zero', value: delta });
    const val = document.getElementById('angleVal');
    if (val) val.textContent = '0.0 °';
    pitchHistory.push(0);
    if (pitchHistory.length > HISTORY_LENGTH) pitchHistory.shift();
    updateChart({ pitch: 0 });
    addLogMessage(`[UI] Punkt 0 (Pitch) ustawiony. Delta trim=${delta.toFixed(2)}°.`, 'success');
}

function setRollZero() {
    if (!window.telemetryData) {
        addLogMessage('[UI] Brak danych telemetrii (roll).', 'warn');
        return;
    }
    // Odczytaj aktualny roll z telemetrii (już po trymach i offsetach)
    let currentRoll = Number(window.telemetryData.roll);
    if (typeof currentRoll !== 'number' || isNaN(currentRoll)) {
        if (typeof window.telemetryData.qw === 'number') {
            const eul = computeEulerFromQuaternion(window.telemetryData.qw, window.telemetryData.qx, window.telemetryData.qy, window.telemetryData.qz);
            currentRoll = eul ? eul.roll : 0;
        } else {
            addLogMessage('[UI] Nieprawidłowy odczyt roll.', 'error');
            return;
        }
    }
    currentRoll = Math.round(currentRoll * 100) / 100;
    if (isNaN(currentRoll)) {
        addLogMessage('[UI] Nieprawidlowy odczyt roll.', 'error');
        return;
    }
    // Delta = -currentRoll -> po dodaniu do trim montażu, następny odczyt roll = 0
    const delta = -currentRoll;
    sendBleMessage({ type: 'adjust_roll', value: delta });
    const val = document.getElementById('rollVal');
    if (val) val.textContent = '0.0 °';
    updateChart({ roll: 0 });
    addLogMessage(`[UI] Punkt 0 (Roll) ustawiony. Delta trim=${delta.toFixed(2)}°.`, 'success');
}

function adjustTrim(axis, delta) {
    // axis: 'pitch' or 'roll'
    // delta: number like 0.1 or -0.01
    sendBleMessage({ type: axis === 'pitch' ? 'adjust_zero' : 'adjust_roll', value: delta });
    addLogMessage(`[UI] Korekta ${axis} o ${delta.toFixed(2)}°`, 'success');
}

// ---------------------------------------------------------------------------
// Convenience references to globals kept in window.*
// (sendBleMessage, addLogMessage, telemetryData, showNotification,
//  pitchHistory, HISTORY_LENGTH, updateChart are defined elsewhere in main.js)
// ---------------------------------------------------------------------------
const sendBleMessage   = (...a) => window.sendBleMessage(...a);
const addLogMessage    = (...a) => window.addLogMessage(...a);
const showNotification = (...a) => window.showNotification(...a);
// pitchHistory & friends are mutable arrays living on the main scope — access
// them via window so we always reference the live instance.
const pitchHistory     = (typeof window !== 'undefined' && window.pitchHistory) || [];
const HISTORY_LENGTH   = (typeof window !== 'undefined' && window.HISTORY_LENGTH) || 600;
const updateChart      = (...a) => window.updateChart(...a);

// ---------------------------------------------------------------------------
// initSensorMapping — wires all event listeners that were inline in main.js
// ---------------------------------------------------------------------------
function initSensorMapping() {
    // --- Model Mapping modal events ---
    document.getElementById('modelMappingBtn')?.addEventListener('click', () => { openModelMappingModal(); sendBleMessage({ type: 'get_model_mapping' }); });
    document.getElementById('modelMappingCloseBtn')?.addEventListener('click', () => closeModelMappingModal());
    document.getElementById('modelMappingLoadBtn')?.addEventListener('click', () => { sendBleMessage({ type: 'get_model_mapping' }); });
    document.getElementById('modelMappingSaveBtn')?.addEventListener('click', () => {
        if (!AppState.isConnected) { addLogMessage('[UI] Musisz być połączony z robotem aby zapisać mapowanie modelu 3D.', 'warn'); return; }
        if (!confirm('Zapisz mapowanie modelu 3D do pamięci EEPROM robota?')) return;
        gatherModelMappingFromUI();
        sendBleMessage({ type: 'set_model_mapping', mapping: modelMapping });
        addLogMessage('[UI] Wyslano mapowanie modelu 3D do robota.', 'info');
    });

    // Feedback sign toggles wiring - init once here (not in the test result handler)
    const signButtonMap = {
        'balanceSign': 'balance_feedback_sign',
        'speedSign': 'speed_feedback_sign',
        'positionSign': 'position_feedback_sign'
    };
    Object.keys(signButtonMap).forEach(containerId => {
        const el = document.getElementById(containerId);
        if (!el) return;
        el.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', () => {
                const sign = parseInt(btn.dataset.sign);
                // Only send change if robot is IDLE
                const robotState = appStore.getState('robot.state');
                if (robotState !== 'IDLE') {
                    showNotification('Zmiana znaku tylko w trybie IDLE', 'warn');
                    return;
                }
                const key = signButtonMap[containerId];
                sendBleMessage({ type: 'set_param', key: key, value: sign });
                setSignButtons(containerId, sign);
                updateSignBadge(containerId + 'Badge', sign);
            });
        });
    });

    // Disable sign toggles outside of IDLE for safety
    appStore.subscribe('robot.state', (newVal) => {
        const isIdle = (newVal === 'IDLE');
        Object.keys(signButtonMap).forEach(containerId => {
            const el = document.getElementById(containerId);
            if (!el) return;
            el.querySelectorAll('button').forEach(btn => {
                btn.disabled = !isIdle;
            });
            el.classList.toggle('disabled', !isIdle);
        });
    });

    // Initial summary update
    updateSignSummary();

    document.getElementById('modelMappingResetBtn')?.addEventListener('click', () => { resetModelMapping(); addLogMessage('[UI] Przywrócono domyślne mapowanie modelu (identity).', 'info'); });

    // Toggle pomocy w modalum model mapping
    const mmHelp = document.getElementById('modelMappingHelp');
    const mmHelpBox = document.getElementById('modelMappingHelpText');
    if (mmHelp && mmHelpBox) {
        mmHelp.addEventListener('click', () => {
            mmHelpBox.classList.toggle('visible');
            mmHelpBox.setAttribute('aria-hidden', mmHelpBox.classList.contains('visible') ? 'false' : 'true');
        });
    }

    // Listenery znaków
    ['modelPitchSign', 'modelYawSign', 'modelRollSign'].forEach(id => { const c = document.getElementById(id); if (!c) return; c.querySelectorAll('button').forEach(btn => { btn.addEventListener('click', () => { c.querySelectorAll('button').forEach(b => b.classList.remove('active')); btn.classList.add('active'); }); }); });
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
export {
    sensorPreview,
    initSensorMappingPreview,
    gatherIMUMappingFromUI,
    updateIMUMappingUIFromData,
    rotateSensorCube,
    mappingObjToMatrix,
    matrixToMappingObj,
    multiplyMatrix,
    getRotationMatrix,
    applyRotationToIMUMapping,
    updateSensorMappingDisplays,
    updateModalTelemetryDisplay,
    modelMapping,
    openModelMappingModal,
    closeModelMappingModal,
    updateModelMappingUI,
    setSignButtons,
    updateSignBadge,
    updateSignSummary,
    gatherModelMappingFromUI,
    getActiveSign,
    resetModelMapping,
    applyModelMappingToEuler,
    computeEulerFromQuaternion,
    getRawEuler,
    setPitchZero,
    setRollZero,
    adjustTrim,
    initSensorMapping
};

// ---------------------------------------------------------------------------
// Backward-compatible window.* aliases
// ---------------------------------------------------------------------------
window.sensorPreview              = sensorPreview;
window.initSensorMappingPreview   = initSensorMappingPreview;
window.gatherIMUMappingFromUI     = gatherIMUMappingFromUI;
window.updateIMUMappingUIFromData = updateIMUMappingUIFromData;
window.rotateSensorCube           = rotateSensorCube;
window.mappingObjToMatrix         = mappingObjToMatrix;
window.matrixToMappingObj         = matrixToMappingObj;
window.multiplyMatrix             = multiplyMatrix;
window.getRotationMatrix          = getRotationMatrix;
window.applyRotationToIMUMapping  = applyRotationToIMUMapping;
window.updateSensorMappingDisplays = updateSensorMappingDisplays;
window.updateModalTelemetryDisplay = updateModalTelemetryDisplay;
window.modelMapping               = modelMapping;
window.openModelMappingModal      = openModelMappingModal;
window.closeModelMappingModal     = closeModelMappingModal;
window.updateModelMappingUI       = updateModelMappingUI;
window.setSignButtons             = setSignButtons;
window.updateSignBadge            = updateSignBadge;
window.updateSignSummary          = updateSignSummary;
window.gatherModelMappingFromUI   = gatherModelMappingFromUI;
window.getActiveSign              = getActiveSign;
window.resetModelMapping          = resetModelMapping;
window.applyModelMappingToEuler   = applyModelMappingToEuler;
window.computeEulerFromQuaternion = computeEulerFromQuaternion;
window.getRawEuler                = getRawEuler;
window.setPitchZero               = setPitchZero;
window.setRollZero                = setRollZero;
window.adjustTrim                 = adjustTrim;
window.initSensorMapping          = initSensorMapping;
