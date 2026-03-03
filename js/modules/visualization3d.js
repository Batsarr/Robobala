// ========================================================================
// VISUALIZATION 3D - Wizualizacja Three.js robota (ES6 Module)
// ========================================================================

import { currentEncoderLeft, currentEncoderRight } from './telemetry.js';

// --- 3D Scene variables ---
let scene3D, camera3D, renderer3D, controls3D;
let robotPivot, leftWheel, rightWheel;
let groundMesh, groundTexture, skyDome;
let robotPerspectiveZoom = 40;
let isAnimation3DEnabled = true;
let isMovement3DEnabled = false;
let lastEncoderAvg = 0;

// Expose some vars for external access
export { scene3D, camera3D, renderer3D, robotPivot, isAnimation3DEnabled };

export function createCheckerTexture(squareSizeCm = 20, colorA = '#C8C8C8', colorB = '#787878') {
    const size = 256;
    const squares = 2;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const s = size / squares;
    for (let y = 0; y < squares; y++) {
        for (let x = 0; x < squares; x++) {
            ctx.fillStyle = ((x + y) % 2 === 0) ? colorA : colorB;
            ctx.fillRect(x * s, y * s, s, s);
        }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 8;
    tex.encoding = THREE.sRGBEncoding;
    return tex;
}

export function createSkyDome() {
    const width = 2048, height = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, '#87CEEB');
    grad.addColorStop(0.6, '#B0E0E6');
    grad.addColorStop(1, '#E6F2FA');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    for (let i = 0; i < 150; i++) {
        const x = Math.random() * width;
        const y = Math.random() * height * 0.6;
        const radius = 20 + Math.random() * 80;
        const blur = 10 + Math.random() * 20;
        ctx.filter = `blur(${blur}px)`;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
        if (x > width - radius * 2) {
            ctx.beginPath();
            ctx.arc(x - width, y, radius, 0, Math.PI * 2);
            ctx.fill();
        }
        if (x < radius * 2) {
            ctx.beginPath();
            ctx.arc(x + width, y, radius, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    ctx.filter = 'none';

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.encoding = THREE.sRGBEncoding;

    const skyGeo = new THREE.SphereGeometry(1000, 32, 16);
    const skyMat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide });
    return new THREE.Mesh(skyGeo, skyMat);
}

export function createCustomWheel(totalRadius, tireThickness, width) {
    const wheelGroup = new THREE.Group();
    const tireMaterial = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 });
    const rimMaterial = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.4 });
    const rimRadius = totalRadius - tireThickness;

    const tire = new THREE.Mesh(new THREE.TorusGeometry(rimRadius + tireThickness / 2, tireThickness / 2, 16, 100), tireMaterial);
    wheelGroup.add(tire);

    const rimShape = new THREE.Shape();
    rimShape.absarc(0, 0, rimRadius, 0, Math.PI * 2, false);
    const holePath = new THREE.Path();
    holePath.absarc(0, 0, rimRadius * 0.85, 0, Math.PI * 2, true);
    rimShape.holes.push(holePath);
    const extrudeSettings = { depth: width * 0.4, bevelEnabled: false };
    const outerRimGeometry = new THREE.ExtrudeGeometry(rimShape, extrudeSettings);
    outerRimGeometry.center();
    const outerRim = new THREE.Mesh(outerRimGeometry, rimMaterial);
    wheelGroup.add(outerRim);

    const hubRadius = rimRadius * 0.2;
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(hubRadius, hubRadius, width * 0.5, 24), rimMaterial);
    hub.rotateX(Math.PI / 2);
    wheelGroup.add(hub);

    const spokeLength = (rimRadius * 0.85) - hubRadius;
    const spokeGeometry = new THREE.BoxGeometry(spokeLength, rimRadius * 0.15, width * 0.4);
    spokeGeometry.translate(hubRadius + spokeLength / 2, 0, 0);
    for (let i = 0; i < 6; i++) {
        const spoke = new THREE.Mesh(spokeGeometry, rimMaterial);
        spoke.rotation.z = i * (Math.PI / 3);
        wheelGroup.add(spoke);
    }
    return wheelGroup;
}

export function createRobotModel3D() {
    const BODY_WIDTH = 9.0, BODY_HEIGHT = 6.0, BODY_DEPTH = 3.5, WHEEL_GAP = 1.0;
    const MAST_HEIGHT = 14.5, MAST_THICKNESS = 1.5;
    const BATTERY_WIDTH = 6.0, BATTERY_HEIGHT = 1.0, BATTERY_DEPTH = 3.0;
    const TIRE_THICKNESS = 1.0, WHEEL_WIDTH = 2.0;
    const WHEEL_RADIUS_3D = 4.1;

    const pivot = new THREE.Object3D();
    const model = new THREE.Group();
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x1C1C1C });
    const batteryMaterial = new THREE.MeshStandardMaterial({ color: 0x4169E1 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(BODY_WIDTH, BODY_HEIGHT, BODY_DEPTH), bodyMaterial);
    body.position.y = WHEEL_RADIUS_3D;
    model.add(body);

    const mast = new THREE.Mesh(new THREE.BoxGeometry(MAST_THICKNESS, MAST_HEIGHT, MAST_THICKNESS), bodyMaterial);
    mast.position.y = WHEEL_RADIUS_3D + BODY_HEIGHT / 2 + MAST_HEIGHT / 2;
    model.add(mast);

    const battery = new THREE.Mesh(new THREE.BoxGeometry(BATTERY_WIDTH, BATTERY_HEIGHT, BATTERY_DEPTH), batteryMaterial);
    battery.position.y = mast.position.y + MAST_HEIGHT / 2 + BATTERY_HEIGHT / 2;
    model.add(battery);

    leftWheel = createCustomWheel(WHEEL_RADIUS_3D, TIRE_THICKNESS, WHEEL_WIDTH);
    leftWheel.rotation.y = Math.PI / 2;
    leftWheel.position.set(-(BODY_WIDTH / 2 + WHEEL_GAP), WHEEL_RADIUS_3D, 0);
    model.add(leftWheel);

    rightWheel = createCustomWheel(WHEEL_RADIUS_3D, TIRE_THICKNESS, WHEEL_WIDTH);
    rightWheel.rotation.y = Math.PI / 2;
    rightWheel.position.set(BODY_WIDTH / 2 + WHEEL_GAP, WHEEL_RADIUS_3D, 0);
    model.add(rightWheel);

    model.position.y = -WHEEL_RADIUS_3D;
    pivot.add(model);
    return pivot;
}

export function setupControls3D() {
    document.getElementById('reset3dViewBtn').addEventListener('click', () => {
        camera3D.position.set(28, 22, 48);
        controls3D.target.set(0, 8, 0);
        controls3D.update();
    });
    document.getElementById('toggle3dAnimationBtn').addEventListener('click', () => isAnimation3DEnabled = !isAnimation3DEnabled);
    document.getElementById('toggle3dMovementBtn').addEventListener('click', () => {
        isMovement3DEnabled = !isMovement3DEnabled;
        lastEncoderAvg = (currentEncoderLeft + currentEncoderRight) / 2;
    });
}

export function init3DVisualization() {
    const container = document.getElementById('robot3d-container');
    scene3D = new THREE.Scene();
    camera3D = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 2000);
    camera3D.position.set(28, 22, 48);
    camera3D.lookAt(0, 8, 0);

    renderer3D = new THREE.WebGLRenderer({ antialias: true });
    renderer3D.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer3D.domElement);

    controls3D = new THREE.OrbitControls(camera3D, renderer3D.domElement);
    controls3D.target.set(0, 8, 0);
    controls3D.maxPolarAngle = Math.PI / 2;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene3D.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.9);
    directionalLight.position.set(10, 20, 15);
    scene3D.add(directionalLight);

    const PLANE_SIZE_CM = 2000;
    groundTexture = createCheckerTexture(40);
    const repeats = PLANE_SIZE_CM / 40;
    groundTexture.repeat.set(repeats, repeats);
    const groundMaterial = new THREE.MeshStandardMaterial({ map: groundTexture, roughness: 1.0, metalness: 0.0 });
    const groundGeo = new THREE.PlaneGeometry(PLANE_SIZE_CM, PLANE_SIZE_CM, 1, 1);
    groundMesh = new THREE.Mesh(groundGeo, groundMaterial);
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.position.y = 0;
    scene3D.add(groundMesh);

    robotPivot = createRobotModel3D();
    robotPivot.position.y = 4.1;
    scene3D.add(robotPivot);

    skyDome = createSkyDome();
    scene3D.add(skyDome);

    window.addEventListener('resize', () => {
        const width = container.clientWidth;
        const height = container.clientHeight;
        camera3D.aspect = width / height;
        camera3D.updateProjectionMatrix();
        renderer3D.setSize(width, height);
    });

    setupControls3D();

    // Calibration modal setup if exists
    if (typeof window.setupCalibrationModal === 'function') {
        window.setupCalibrationModal();
    }
}

export function update3DAnimation() {
    if (isAnimation3DEnabled && robotPivot) {
        // Use quaternion from telemetry + mapping
        if (typeof window.telemetryData?.qw === 'number') {
            try {
                const qRaw = new THREE.Quaternion(
                    window.telemetryData.qx,
                    window.telemetryData.qy,
                    window.telemetryData.qz,
                    window.telemetryData.qw
                ).normalize();

                const modelMapping = window.modelMapping || { pitch: { sign: 1 }, yaw: { sign: 1 }, roll: { sign: 1 } };
                const signs = [modelMapping.pitch.sign, modelMapping.yaw.sign, modelMapping.roll.sign];
                const negCount = signs.filter(s => s === -1).length;
                let qCorr = new THREE.Quaternion();

                const computeEulerFromQuaternion = window.computeEulerFromQuaternion || (() => null);
                const applyModelMappingToEuler = window.applyModelMappingToEuler || ((e) => e);

                const eulRaw = computeEulerFromQuaternion(window.telemetryData.qw, window.telemetryData.qx, window.telemetryData.qy, window.telemetryData.qz);
                let mapped = eulRaw ? applyModelMappingToEuler(eulRaw) : { pitch: 0, yaw: 0, roll: 0 };

                if (negCount % 2 === 0) {
                    if (negCount === 2) {
                        const idx = signs.findIndex(s => s === 1);
                        const axisVec = idx === 0 ? new THREE.Vector3(1, 0, 0) : (idx === 1 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1));
                        qCorr.setFromAxisAngle(axisVec, Math.PI);
                    }
                }

                const qMappedEuler = new THREE.Quaternion().setFromEuler(new THREE.Euler(
                    THREE.MathUtils.degToRad(mapped.pitch),
                    THREE.MathUtils.degToRad(mapped.yaw),
                    THREE.MathUtils.degToRad(mapped.roll),
                    'YXZ'
                ));
                const qResult = new THREE.Quaternion().multiplyQuaternions(qCorr, qMappedEuler).normalize();
                robotPivot.quaternion.slerp(qResult, 0.35);
            } catch (err) {
                console.error('Quaternion mapping error:', err);
            }
        }

        robotPivot.position.y = 4.4;

        const isRobotPerspective = document.getElementById('robotPerspectiveCheckbox')?.checked;
        controls3D.enabled = !isRobotPerspective;

        if (isRobotPerspective) {
            const offset = new THREE.Vector3(0, 15, robotPerspectiveZoom);
            offset.applyQuaternion(robotPivot.quaternion);
            const cameraPosition = robotPivot.position.clone().add(offset);
            camera3D.position.lerp(cameraPosition, 0.1);
            const lookAtPosition = robotPivot.position.clone().add(new THREE.Vector3(0, 10, 0));
            camera3D.lookAt(lookAtPosition);
        }

        const ppr = parseFloat(document.getElementById('encoderPprInput')?.value) || 820;
        const wheelRotationL = (currentEncoderLeft / ppr) * 2 * Math.PI;
        const wheelRotationR = (currentEncoderRight / ppr) * 2 * Math.PI;
        if (leftWheel) leftWheel.rotation.z = -wheelRotationL;
        if (rightWheel) rightWheel.rotation.z = -wheelRotationR;

        if (isMovement3DEnabled) {
            const wheelDiameter = parseFloat(document.getElementById('wheelDiameterInput')?.value) || 8.2;
            const currentEncoderAvg = (currentEncoderLeft + currentEncoderRight) / 2;
            const dist_cm = -((currentEncoderAvg - lastEncoderAvg) / ppr) * Math.PI * wheelDiameter;
            if (groundTexture) {
                const yawRad = robotPivot.rotation.y;
                const dx = Math.sin(yawRad) * dist_cm;
                const dz = Math.cos(yawRad) * dist_cm;
                const squaresPerCm = 1 / 20;
                if (window.DEBUG_3D) console.debug(`[3D] dist_cm=${dist_cm.toFixed(3)} dx=${dx.toFixed(3)} dz=${dz.toFixed(3)} yaw=${THREE.MathUtils.radToDeg(yawRad).toFixed(1)}`);
                groundTexture.offset.x += dx * squaresPerCm;
                groundTexture.offset.y -= dz * squaresPerCm;
                groundTexture.needsUpdate = true;
            }
            const logicalX = (groundTexture ? -groundTexture.offset.x * 20 : 0);
            const logicalZ = (groundTexture ? -groundTexture.offset.y * 20 : 0);
            const posXEl = document.getElementById('robot3d-position-x');
            const posZEl = document.getElementById('robot3d-position-z');
            if (posXEl) posXEl.textContent = logicalX.toFixed(1) + ' cm';
            if (posZEl) posZEl.textContent = logicalZ.toFixed(1) + ' cm';
            lastEncoderAvg = currentEncoderAvg;
        }
    }
}

export function animate3D() {
    requestAnimationFrame(animate3D);
    update3DAnimation();
    if (skyDome) skyDome.rotation.y += 0.00005;
    if (controls3D && renderer3D && scene3D && camera3D) {
        controls3D.update();
        renderer3D.render(scene3D, camera3D);
    }
}

// Backward compatibility
window.init3DVisualization = init3DVisualization;
window.animate3D = animate3D;
window.update3DAnimation = update3DAnimation;
