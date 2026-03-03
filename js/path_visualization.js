// Central path visualization module
(function () {
    window.RB = window.RB || {};
    window.RB.path = window.RB.path || {};

    const P = window.RB.path;

    P.CM_PER_PIXEL = 1.0;
    P.pathCanvas = null;
    P.pathCtx = null;
    P.robotPathX = 0;
    P.robotPathY = 0;
    P.robotPathHeading = 0;
    P.plannedPath = [];
    P.actualPath = [];

    P.initPathVisualization = function initPathVisualization() {
        P.pathCanvas = document.getElementById('pathCanvas');
        if (!P.pathCanvas) return;
        P.pathCtx = P.pathCanvas.getContext('2d');
        P.pathCanvas.width = P.pathCanvas.clientWidth;
        P.pathCanvas.height = P.pathCanvas.clientHeight;
        P.resetPathVisualization();
    };

    P.drawPathVisualization = function drawPathVisualization() {
        if (!P.pathCtx) return;
        P.pathCtx.clearRect(0, 0, P.pathCanvas.width, P.pathCanvas.height);
        const drawPath = (path, color) => {
            P.pathCtx.strokeStyle = color;
            P.pathCtx.lineWidth = 2;
            P.pathCtx.beginPath();
            if (path.length > 0) {
                P.pathCtx.moveTo(path[0].x, path[0].y);
                path.forEach(p => P.pathCtx.lineTo(p.x, p.y));
            }
            P.pathCtx.stroke();
        };
        drawPath(P.plannedPath, '#61dafb');
        drawPath(P.actualPath, '#a2f279');
        if (P.actualPath.length > 0) {
            const lastPos = P.actualPath[P.actualPath.length - 1];
            P.pathCtx.fillStyle = '#ff6347';
            P.pathCtx.beginPath();
            P.pathCtx.arc(lastPos.x, lastPos.y, 4, 0, Math.PI * 2);
            P.pathCtx.fill();
        }
    };

    P.addPlannedPathSegment = function addPlannedPathSegment(type, value) {
        let { x, y, heading } = P.plannedPath.length > 0 ? P.plannedPath[P.plannedPath.length - 1] : { x: P.robotPathX, y: P.robotPathY, heading: P.robotPathHeading };
        let newX = x, newY = y, newHeading = heading;
        const angleRad = (heading - 90) * Math.PI / 180;
        if (type === 'move_fwd') {
            newX += Math.cos(angleRad) * value / P.CM_PER_PIXEL;
            newY += Math.sin(angleRad) * value / P.CM_PER_PIXEL;
        } else if (type === 'move_bwd') {
            newX -= Math.cos(angleRad) * value / P.CM_PER_PIXEL;
            newY -= Math.sin(angleRad) * value / P.CM_PER_PIXEL;
        } else if (type === 'rotate_r') {
            newHeading += value;
        } else if (type === 'rotate_l') {
            newHeading -= value;
        }
        P.plannedPath.push({ x: newX, y: newY, heading: newHeading });
        P.drawPathVisualization();
    };

    P.updateActualPath = function updateActualPath(data) {
        if (data.pos_x_cm !== undefined && data.pos_y_cm !== undefined && data.yaw !== undefined) {
            const actualX = P.robotPathX + (data.pos_x_cm / P.CM_PER_PIXEL);
            const actualY = P.robotPathY - (data.pos_y_cm / P.CM_PER_PIXEL);
            P.actualPath.push({ x: actualX, y: actualY, heading: data.yaw });
            P.drawPathVisualization();
        }
    };

    P.resetPathVisualization = function resetPathVisualization() {
        if (!P.pathCanvas) return;
        P.robotPathX = P.pathCanvas.width / 2;
        P.robotPathY = P.pathCanvas.height / 2;
        P.robotPathHeading = 0;
        P.plannedPath = [{ x: P.robotPathX, y: P.robotPathY, heading: P.robotPathHeading }];
        P.actualPath = [{ x: P.robotPathX, y: P.robotPathY, heading: P.robotPathHeading }];
        const ReportPanel = document.getElementById('sequenceReportPanel');
        if (ReportPanel) { ReportPanel.style.display = 'none'; }
        P.drawPathVisualization();
    };

    // Backwards-compatible global wrappers (do not re-declare existing globals)
    if (typeof window.initPathVisualization === 'undefined') window.initPathVisualization = function () { P.initPathVisualization(); };
    if (typeof window.drawPathVisualization === 'undefined') window.drawPathVisualization = function () { P.drawPathVisualization(); };
    if (typeof window.addPlannedPathSegment === 'undefined') window.addPlannedPathSegment = function (type, value) { P.addPlannedPathSegment(type, value); };
    if (typeof window.updateActualPath === 'undefined') window.updateActualPath = function (data) { P.updateActualPath(data); };
    if (typeof window.resetPathVisualization === 'undefined') window.resetPathVisualization = function () { P.resetPathVisualization(); };

})();
