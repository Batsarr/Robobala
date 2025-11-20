// ui_core.js - Minimalny moduł inicjalizacyjny przywracający joystick i wizualizację 3D po usunięciu monolitycznego main.js
// Ładowany po: state_manager.js, communication_layer.js, helpers.js, ui_components.js, path_visualization.js
// Zawiera tylko brakujące globalne zmienne i funkcje animacji 3D + inicjalizację po DOMContentLoaded.

(function () {
    // ==== BRAKUJĄCE GLOBALNE ZMIENNE JOYSTICKA (unik ReferenceError) ====
    if (typeof window.joystickCenter === 'undefined') window.joystickCenter = { x: 0, y: 0 };
    if (typeof window.joystickRadius === 'undefined') window.joystickRadius = 0;
    if (typeof window.knobRadius === 'undefined') window.knobRadius = 0;
    if (typeof window.isDragging === 'undefined') window.isDragging = false;
    if (typeof window.lastJoystickSendTime === 'undefined') window.lastJoystickSendTime = 0;

    // Jeśli istnieją już symbole (np. z wcześniejszego bundle), nie nadpisuj.
    if (typeof window.JOYSTICK_SEND_INTERVAL === 'undefined') {
        window.JOYSTICK_SEND_INTERVAL = 20;
    }

    // Proste logowanie (fallback jeśli addLogMessage nie istnieje jeszcze)
    if (typeof window.addLogMessage === 'undefined') {
        window.addLogMessage = function (msg, level) {
            console.log('[LOG][' + (level || 'info') + '] ' + msg);
        };
    }

    // Globalne zmienne 3D jeśli brak
    window.scene3D = window.scene3D || null;
    window.camera3D = window.camera3D || null;
    window.renderer3D = window.renderer3D || null;
    window.controls3D = window.controls3D || null;
    window.robotPivot = window.robotPivot || null;
    window.leftWheel = window.leftWheel || null;
    window.rightWheel = window.rightWheel || null;
    window.groundMesh = window.groundMesh || null;
    window.groundTexture = window.groundTexture || null;
    window.skyDome = window.skyDome || null;
    window.robotPerspectiveZoom = window.robotPerspectiveZoom || 40;
    window.isAnimation3DEnabled = window.isAnimation3DEnabled !== undefined ? window.isAnimation3DEnabled : true;
    window.isMovement3DEnabled = window.isMovement3DEnabled !== undefined ? window.isMovement3DEnabled : false;
    window.lastEncoderAvg = window.lastEncoderAvg || 0;
    window.currentEncoderLeft = window.currentEncoderLeft || 0;
    window.currentEncoderRight = window.currentEncoderRight || 0;
    window.modelMapping = window.modelMapping || { pitch: { source: 0, sign: 1 }, yaw: { source: 1, sign: 1 }, roll: { source: 2, sign: 1 } };

    // Bezpieczne helpery mapowania (jeśli nie zdefiniowane w innym module)
    if (typeof window.applyModelMappingToEuler === 'undefined') {
        window.applyModelMappingToEuler = function (e) {
            const arr = [e.pitch, e.yaw, e.roll];
            return {
                pitch: (arr[window.modelMapping.pitch.source] || 0) * window.modelMapping.pitch.sign,
                yaw: (arr[window.modelMapping.yaw.source] || 0) * window.modelMapping.yaw.sign,
                roll: (arr[window.modelMapping.roll.source] || 0) * window.modelMapping.roll.sign
            };
        };
    }

    if (typeof window.computeEulerFromQuaternion === 'undefined') {
        window.computeEulerFromQuaternion = function (qw, qx, qy, qz) {
            try {
                if ([qw, qx, qy, qz].some(v => typeof v !== 'number' || Number.isNaN(v))) return null;
                const n = Math.hypot(qw, qx, qy, qz) || 1; qw /= n; qx /= n; qy /= n; qz /= n;
                const siny_cosp = 2 * (qw * qz + qx * qy);
                const cosy_cosp = 1 - 2 * (qy * qy + qz * qz);
                const yaw = Math.atan2(siny_cosp, cosy_cosp);
                const sinp = 2 * (qw * qy - qz * qx);
                const pitch = Math.abs(sinp) >= 1 ? Math.sign(sinp) * (Math.PI / 2) : Math.asin(sinp);
                const sinr_cosp = 2 * (qw * qx + qy * qz);
                const cosr_cosp = 1 - 2 * (qx * qx + qy * qy);
                const roll = Math.atan2(sinr_cosp, cosr_cosp);
                return { yaw: THREE.MathUtils.radToDeg(yaw), pitch: THREE.MathUtils.radToDeg(pitch), roll: THREE.MathUtils.radToDeg(roll) };
            } catch (e) { return null; }
        };
    }

    // Aktualizacja animacji 3D (uproszczona wersja z main.js)
    if (typeof window.update3DAnimation === 'undefined') {
        window.update3DAnimation = function () {
            if (!window.isAnimation3DEnabled || !window.robotPivot) return;
            if (typeof window.telemetryData?.qw === 'number') {
                try {
                    const eulRaw = window.computeEulerFromQuaternion(window.telemetryData.qw, window.telemetryData.qx, window.telemetryData.qy, window.telemetryData.qz);
                    const mapped = eulRaw ? window.applyModelMappingToEuler(eulRaw) : { pitch: 0, yaw: 0, roll: 0 };
                    // Używamy tylko pitch jako przechył dla prostoty; pełne odwzorowanie kwaternionu można dodać później
                    // Tworzymy kwaternion z mapped (kolejność YXZ jak w oryginale)
                    const qMappedEuler = new THREE.Quaternion().setFromEuler(new THREE.Euler(
                        THREE.MathUtils.degToRad(mapped.pitch),
                        THREE.MathUtils.degToRad(mapped.yaw),
                        THREE.MathUtils.degToRad(mapped.roll),
                        'YXZ'
                    ));
                    window.robotPivot.quaternion.slerp(qMappedEuler, 0.35);
                } catch (err) { /* no-op */ }
            }
            window.robotPivot.position.y = 4.4;
            const ppr = parseFloat(document.getElementById('encoderPprInput')?.value) || 820;
            const wheelRotationL = (window.currentEncoderLeft / ppr) * 2 * Math.PI;
            const wheelRotationR = (window.currentEncoderRight / ppr) * 2 * Math.PI;
            if (window.leftWheel) window.leftWheel.rotation.z = -wheelRotationL;
            if (window.rightWheel) window.rightWheel.rotation.z = -wheelRotationR;
        };
    }

    if (typeof window.animate3D === 'undefined') {
        window.animate3D = function () {
            requestAnimationFrame(window.animate3D);
            try { window.update3DAnimation(); } catch (_) { }
            if (window.skyDome) window.skyDome.rotation.y += 0.00005;
            if (window.controls3D && window.renderer3D && window.scene3D && window.camera3D) {
                window.controls3D.update();
                window.renderer3D.render(window.scene3D, window.camera3D);
            }
        };
    }

    // ==== IMPLEMENTACJA setupControls3D JEŚLI BRAK ====
    if (typeof window.setupControls3D === 'undefined') {
        window.setupControls3D = function () {
            const resetBtn = document.getElementById('reset3dViewBtn');
            const animBtn = document.getElementById('toggle3dAnimationBtn');
            const moveBtn = document.getElementById('toggle3dMovementBtn');
            if (resetBtn && !resetBtn.__rbBound) {
                resetBtn.__rbBound = true;
                resetBtn.addEventListener('click', () => {
                    if (!window.camera3D || !window.controls3D) return;
                    window.camera3D.position.set(28, 22, 48);
                    window.controls3D.target.set(0, 8, 0);
                    window.controls3D.update();
                });
            }
            if (animBtn && !animBtn.__rbBound) {
                animBtn.__rbBound = true;
                animBtn.addEventListener('click', () => { window.isAnimation3DEnabled = !window.isAnimation3DEnabled; });
            }
            if (moveBtn && !moveBtn.__rbBound) {
                moveBtn.__rbBound = true;
                moveBtn.addEventListener('click', () => { window.isMovement3DEnabled = !window.isMovement3DEnabled; window.lastEncoderAvg = (window.currentEncoderLeft + window.currentEncoderRight) / 2; });
            }
        };
    }

    // ==== FALLBACK KOMUNIKACJI sendBleMessage / sendBleCommand / connectBLE JEŚLI BRAK ====
    if (typeof window.sendBleMessage === 'undefined') {
        window.sendBleMessage = function (msg) {
            console.warn('[ui_core] sendBleMessage fallback (brak warstwy BLE). Message=', msg);
        };
    }
    if (typeof window.sendBleCommand === 'undefined') {
        window.sendBleCommand = function (type, payload) {
            window.sendBleMessage(Object.assign({ type: type }, payload || {}));
        };
    }
    if (typeof window.connectBLE === 'undefined') {
        window.connectBLE = async function () {
            addLogMessage('[UI] Fallback connectBLE: brak warstwy BLE.', 'warn');
            return false;
        };
    }

    // Inicjalizacja po DOM
    document.addEventListener('DOMContentLoaded', () => {
        // Joystick (funkcja initJoystick dostarczona przez ui_components.js)
        if (typeof window.initJoystick === 'function') {
            try { window.initJoystick(); } catch (e) { console.warn('initJoystick error', e); }
            window.addEventListener('resize', () => { try { window.initJoystick(); } catch (e) { } });
            // Podpięcie eventów ruchu (o ile nie zrobił tego inny moduł)
            const jc = document.getElementById('joystickCanvas');
            if (jc && !jc.__rbBound) {
                jc.__rbBound = true;
                jc.addEventListener('mousedown', handleJoystickStart); document.addEventListener('mousemove', handleJoystickMove); document.addEventListener('mouseup', handleJoystickEnd);
                jc.addEventListener('touchstart', handleJoystickStart, { passive: false }); document.addEventListener('touchmove', handleJoystickMove, { passive: false }); document.addEventListener('touchend', handleJoystickEnd); document.addEventListener('touchcancel', handleJoystickEnd);
            }
        }
        // Wizualizacja 3D
        if (typeof window.init3DVisualization === 'function') {
            try { window.init3DVisualization(); window.setupControls3D?.(); window.animate3D(); addLogMessage('[UI] 3D wizualizacja zainicjalizowana.', 'info'); } catch (e) { console.warn('init3DVisualization error', e); }
        }
    });
})();
