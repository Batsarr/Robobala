// ============================================================================
// RoboBala - Mobile-First Control Interface
// Main JavaScript - UI Logic Only (No Robot Communication)
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    // ========================================================================
    // SPLASH SCREEN
    // ========================================================================
    const splashScreen = document.getElementById('splashScreen');
    
    // Hide splash after 2 seconds with smooth animation
    setTimeout(() => {
        splashScreen.classList.add('exiting');
        setTimeout(() => {
            splashScreen.classList.remove('active', 'exiting');
        }, 500);
    }, 2000);

    // ========================================================================
    // SIDEBAR NAVIGATION
    // ========================================================================
    const menuToggle = document.getElementById('menuToggle');
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    const sidebarClose = document.getElementById('sidebarClose');
    const menuLinks = document.querySelectorAll('.sidebar-menu a');

    function openSidebar() {
        sidebar.classList.add('active');
        sidebarOverlay.classList.add('active');
        menuToggle.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeSidebar() {
        sidebar.classList.remove('active');
        sidebarOverlay.classList.remove('active');
        menuToggle.classList.remove('active');
        document.body.style.overflow = '';
    }

    menuToggle.addEventListener('click', () => {
        if (sidebar.classList.contains('active')) {
            closeSidebar();
        } else {
            openSidebar();
        }
    });

    sidebarClose.addEventListener('click', closeSidebar);
    sidebarOverlay.addEventListener('click', closeSidebar);

    // View Navigation
    menuLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const viewId = link.getAttribute('data-view');
            
            // Update active menu item
            menuLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            
            // Switch view
            document.querySelectorAll('.view').forEach(view => {
                view.classList.remove('active');
            });
            document.getElementById(`view${capitalize(viewId)}`).classList.add('active');
            
            // Close sidebar on mobile
            closeSidebar();
            
            // Scroll to top
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    });

    function capitalize(str) {
        return str.split('-').map(word => 
            word.charAt(0).toUpperCase() + word.slice(1)
        ).join('');
    }

    // ========================================================================
    // THEME TOGGLE
    // ========================================================================
    const themeToggle = document.getElementById('themeToggle');
    const themeIcon = themeToggle.querySelector('.theme-icon');
    const themeLabel = themeToggle.querySelector('.theme-label');

    // Load saved theme
    const savedTheme = localStorage.getItem('robobala-theme') || 'dark';
    document.body.className = `theme-${savedTheme}`;
    updateThemeButton(savedTheme);

    themeToggle.addEventListener('click', () => {
        const currentTheme = document.body.classList.contains('theme-dark') ? 'dark' : 'light';
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        
        document.body.className = `theme-${newTheme}`;
        localStorage.setItem('robobala-theme', newTheme);
        updateThemeButton(newTheme);
    });

    function updateThemeButton(theme) {
        if (theme === 'dark') {
            themeIcon.textContent = '🌙';
            themeLabel.textContent = 'Tryb Ciemny';
        } else {
            themeIcon.textContent = '☀️';
            themeLabel.textContent = 'Tryb Jasny';
        }
    }

    // ========================================================================
    // LOG SHEET (Collapsible Bottom Sheet)
    // ========================================================================
    const logSheet = document.getElementById('logSheet');
    const logHeader = document.getElementById('logHeader');
    const logToggle = document.getElementById('logToggle');
    const logMessages = document.getElementById('logMessages');
    const logBadge = document.getElementById('logBadge');
    const clearLogs = document.getElementById('clearLogs');
    const logAutoscroll = document.getElementById('logAutoscroll');

    let logCount = 0;

    logHeader.addEventListener('click', () => {
        logSheet.classList.toggle('expanded');
    });

    clearLogs.addEventListener('click', (e) => {
        e.stopPropagation();
        logMessages.innerHTML = '';
        logCount = 0;
        updateLogBadge();
        addLog('Logi wyczyszczone', 'info');
    });

    function addLog(message, type = 'info') {
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry ${type}`;
        
        const time = new Date().toLocaleTimeString('pl-PL');
        logEntry.innerHTML = `<span class="log-time">${time}</span>${message}`;
        
        logMessages.appendChild(logEntry);
        logCount++;
        updateLogBadge();
        
        // Auto-scroll if enabled
        if (logAutoscroll.checked) {
            logMessages.scrollTop = logMessages.scrollHeight;
        }
    }

    function updateLogBadge() {
        logBadge.textContent = logCount;
    }

    // Add initial log
    addLog('Aplikacja uruchomiona', 'success');

    // ========================================================================
    // EMERGENCY FAB
    // ========================================================================
    const emergencyFab = document.getElementById('emergencyFab');

    emergencyFab.addEventListener('click', () => {
        if (confirm('Czy na pewno chcesz wykonać awaryjne zatrzymanie robota?')) {
            addLog('AWARYJNE ZATRZYMANIE wykonane', 'error');
            // TODO: Send emergency stop command to robot
            alert('Robot zatrzymany awaryjnie!');
        }
    });

    // ========================================================================
    // TABS
    // ========================================================================
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const targetId = tab.getAttribute('data-tab');
            const tabContainer = tab.closest('.card');
            
            // Update tab buttons
            tabContainer.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            // Update tab content
            tabContainer.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });
            tabContainer.querySelector(`#tab${capitalize(targetId)}`).classList.add('active');
        });
    });

    // ========================================================================
    // ACCORDION
    // ========================================================================
    document.querySelectorAll('.accordion-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const content = btn.nextElementSibling;
            const isActive = btn.classList.contains('active');
            
            // Close all accordions in same container
            const container = btn.closest('.card');
            container.querySelectorAll('.accordion-btn').forEach(b => {
                b.classList.remove('active');
                b.nextElementSibling.classList.remove('active');
            });
            
            // Toggle current accordion
            if (!isActive) {
                btn.classList.add('active');
                content.classList.add('active');
            }
        });
    });

    // ========================================================================
    // PARAMETER INPUTS (Plus/Minus Buttons)
    // ========================================================================
    document.querySelectorAll('.input-group').forEach(group => {
        const input = group.querySelector('input[type="number"]');
        const minusBtn = group.querySelector('.btn-minus');
        const plusBtn = group.querySelector('.btn-plus');
        
        if (!input || !minusBtn || !plusBtn) return;
        
        const step = parseFloat(input.getAttribute('step')) || 1;
        const min = parseFloat(input.getAttribute('min'));
        const max = parseFloat(input.getAttribute('max'));
        
        minusBtn.addEventListener('click', () => {
            let value = parseFloat(input.value) || 0;
            value -= step;
            if (!isNaN(min)) value = Math.max(min, value);
            input.value = value.toFixed(getDecimalPlaces(step));
            input.dispatchEvent(new Event('change'));
        });
        
        plusBtn.addEventListener('click', () => {
            let value = parseFloat(input.value) || 0;
            value += step;
            if (!isNaN(max)) value = Math.min(max, value);
            input.value = value.toFixed(getDecimalPlaces(step));
            input.dispatchEvent(new Event('change'));
        });
    });

    function getDecimalPlaces(num) {
        const match = ('' + num).match(/(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/);
        if (!match) return 0;
        return Math.max(0, (match[1] ? match[1].length : 0) - (match[2] ? +match[2] : 0));
    }

    // ========================================================================
    // JOYSTICK
    // ========================================================================
    const joystickCanvas = document.getElementById('joystickCanvas');
    const joystickCtx = joystickCanvas.getContext('2d');
    
    let joystickActive = false;
    let joystickCenter = { x: 0, y: 0 };
    let joystickKnob = { x: 0, y: 0 };
    let joystickRadius = 0;
    let knobRadius = 0;

    function initJoystick() {
        const size = joystickCanvas.parentElement.offsetWidth;
        joystickCanvas.width = size;
        joystickCanvas.height = size;
        
        joystickCenter = { x: size / 2, y: size / 2 };
        joystickRadius = size / 2 * 0.75;
        knobRadius = size / 2 * 0.25;
        
        joystickKnob = { ...joystickCenter };
        drawJoystick();
    }

    function drawJoystick() {
        joystickCtx.clearRect(0, 0, joystickCanvas.width, joystickCanvas.height);
        
        // Draw outer circle
        joystickCtx.beginPath();
        joystickCtx.arc(joystickCenter.x, joystickCenter.y, joystickRadius, 0, Math.PI * 2);
        joystickCtx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        joystickCtx.fill();
        
        // Draw knob
        joystickCtx.beginPath();
        joystickCtx.arc(joystickKnob.x, joystickKnob.y, knobRadius, 0, Math.PI * 2);
        joystickCtx.fillStyle = '#61dafb';
        joystickCtx.fill();
        
        // Draw center dot
        joystickCtx.beginPath();
        joystickCtx.arc(joystickCenter.x, joystickCenter.y, 4, 0, Math.PI * 2);
        joystickCtx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        joystickCtx.fill();
    }

    function handleJoystickStart(e) {
        e.preventDefault();
        joystickActive = true;
        handleJoystickMove(e);
    }

    function handleJoystickMove(e) {
        if (!joystickActive) return;
        e.preventDefault();
        
        const rect = joystickCanvas.getBoundingClientRect();
        const touch = e.touches ? e.touches[0] : e;
        
        let x = touch.clientX - rect.left;
        let y = touch.clientY - rect.top;
        
        const dx = x - joystickCenter.x;
        const dy = y - joystickCenter.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance > joystickRadius) {
            const angle = Math.atan2(dy, dx);
            x = joystickCenter.x + Math.cos(angle) * joystickRadius;
            y = joystickCenter.y + Math.sin(angle) * joystickRadius;
        }
        
        joystickKnob = { x, y };
        drawJoystick();
        
        // Calculate normalized values (-1 to 1)
        const normalizedX = (x - joystickCenter.x) / joystickRadius;
        const normalizedY = -(y - joystickCenter.y) / joystickRadius;
        
        // TODO: Send joystick values to robot
        // console.log('Joystick:', { x: normalizedX, y: normalizedY });
    }

    function handleJoystickEnd(e) {
        if (!joystickActive) return;
        e.preventDefault();
        
        joystickActive = false;
        joystickKnob = { ...joystickCenter };
        drawJoystick();
        
        // TODO: Send zero values to robot
    }

    joystickCanvas.addEventListener('mousedown', handleJoystickStart);
    joystickCanvas.addEventListener('mousemove', handleJoystickMove);
    document.addEventListener('mouseup', handleJoystickEnd);
    
    joystickCanvas.addEventListener('touchstart', handleJoystickStart, { passive: false });
    joystickCanvas.addEventListener('touchmove', handleJoystickMove, { passive: false });
    document.addEventListener('touchend', handleJoystickEnd);

    window.addEventListener('resize', initJoystick);
    initJoystick();

    // ========================================================================
    // CONNECTION BUTTON
    // ========================================================================
    const connectBtn = document.getElementById('connectBtn');
    const connectionDot = document.getElementById('connectionDot');
    const connectionText = document.getElementById('connectionText');

    let isConnected = false;

    connectBtn.addEventListener('click', () => {
        if (isConnected) {
            // Disconnect
            isConnected = false;
            connectBtn.querySelector('span').textContent = 'Połącz z Robotem';
            connectBtn.classList.remove('btn-secondary');
            connectBtn.classList.add('btn-primary');
            connectionDot.classList.remove('connected');
            connectionText.textContent = 'Rozłączony';
            addLog('Rozłączono z robotem', 'warn');
        } else {
            // Connect (simulated)
            addLog('Próba połączenia z robotem...', 'info');
            
            setTimeout(() => {
                isConnected = true;
                connectBtn.querySelector('span').textContent = 'Rozłącz';
                connectBtn.classList.remove('btn-primary');
                connectBtn.classList.add('btn-secondary');
                connectionDot.classList.add('connected');
                connectionText.textContent = 'Połączony';
                addLog('Połączono z robotem pomyślnie', 'success');
            }, 1000);
        }
    });

    // ========================================================================
    // TOGGLES (Simulate State Changes)
    // ========================================================================
    const balanceToggle = document.getElementById('balanceToggle');
    const holdPositionToggle = document.getElementById('holdPositionToggle');
    const speedModeToggle = document.getElementById('speedModeToggle');

    balanceToggle.addEventListener('change', (e) => {
        const state = e.target.checked ? 'włączono' : 'wyłączono';
        addLog(`Balansowanie ${state}`, e.target.checked ? 'success' : 'warn');
    });

    holdPositionToggle.addEventListener('change', (e) => {
        const state = e.target.checked ? 'włączono' : 'wyłączono';
        addLog(`Trzymanie pozycji ${state}`, e.target.checked ? 'success' : 'warn');
    });

    speedModeToggle.addEventListener('change', (e) => {
        const state = e.target.checked ? 'włączono' : 'wyłączono';
        addLog(`Tryb prędkości ${state}`, e.target.checked ? 'success' : 'warn');
    });

    // ========================================================================
    // 3D VISUALIZATION (Placeholder)
    // ========================================================================
    const robot3DContainer = document.getElementById('robot3DContainer');
    const reset3DView = document.getElementById('reset3DView');
    const toggle3DAnimation = document.getElementById('toggle3DAnimation');

    reset3DView.addEventListener('click', () => {
        addLog('Widok 3D zresetowany', 'info');
    });

    toggle3DAnimation.addEventListener('click', () => {
        addLog('Animacja 3D przełączona', 'info');
    });

    // TODO: Initialize THREE.js scene here
    // For now, show placeholder
    robot3DContainer.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: var(--text-secondary); font-size: 3rem;">🤖</div>';

    // ========================================================================
    // PARAMETER CHANGE LOGGING
    // ========================================================================
    document.querySelectorAll('input[type="number"]').forEach(input => {
        input.addEventListener('change', (e) => {
            const label = e.target.closest('.param-group')?.querySelector('label')?.textContent.trim() || 'Parametr';
            addLog(`${label}: ${e.target.value}`, 'info');
        });
    });

    // ========================================================================
    // SAVE/LOAD CONFIG
    // ========================================================================
    const saveConfig = document.getElementById('saveConfig');
    const loadConfig = document.getElementById('loadConfig');

    if (saveConfig) {
        saveConfig.addEventListener('click', () => {
            if (confirm('Czy na pewno chcesz zapisać konfigurację na robocie?')) {
                addLog('Zapisywanie konfiguracji...', 'info');
                setTimeout(() => {
                    addLog('Konfiguracja zapisana pomyślnie', 'success');
                }, 1000);
            }
        });
    }

    if (loadConfig) {
        loadConfig.addEventListener('click', () => {
            if (confirm('Czy na pewno chcesz wczytać konfigurację z robota? Niezapisane zmiany zostaną utracone.')) {
                addLog('Wczytywanie konfiguracji...', 'info');
                setTimeout(() => {
                    addLog('Konfiguracja wczytana pomyślnie', 'success');
                }, 1000);
            }
        });
    }

    // ========================================================================
    // SIMULATE TELEMETRY UPDATES
    // ========================================================================
    const pitchValue = document.getElementById('pitchValue');
    const rollValue = document.getElementById('rollValue');
    const yawValue = document.getElementById('yawValue');
    const loopTimeValue = document.getElementById('loopTimeValue');

    function updateTelemetry() {
        if (!isConnected) return;
        
        // Simulate random telemetry values
        pitchValue.textContent = (Math.random() * 10 - 5).toFixed(1) + '°';
        rollValue.textContent = (Math.random() * 5 - 2.5).toFixed(1) + '°';
        yawValue.textContent = (Math.random() * 360).toFixed(1) + '°';
        loopTimeValue.textContent = Math.floor(Math.random() * 500 + 3000) + ' μs';
    }

    // Update telemetry every 100ms when connected
    setInterval(updateTelemetry, 100);

    // ========================================================================
    // DEMO LOGS
    // ========================================================================
    setTimeout(() => addLog('System gotowy do pracy', 'success'), 2500);
});
