// ========================================================================
// QR CODE MODULE (ES6)
// ========================================================================
// Generate QR codes for easy pairing with specific robots
// ========================================================================

/**
 * Get target device name from URL parameter
 * @returns {string|null} Device name from URL or null
 */
function getTargetDeviceFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('device');
}

/**
 * Clear device parameter from URL without reload
 */
function clearDeviceFromURL() {
    const url = new URL(window.location);
    url.searchParams.delete('device');
    window.history.replaceState({}, '', url);
}

/**
 * Generate a connection URL for a specific device
 * The URL is deterministic - same device name always produces the same QR code
 * This allows users to print the QR code for permanent use
 * @param {string} deviceName - The BLE device name
 * @returns {string} Full URL with device parameter
 */
function generateConnectionURL(deviceName) {
    // Use origin + pathname to get a clean base URL
    // This ensures the QR code is always the same for a given device name
    const baseUrl = window.location.origin + window.location.pathname;
    return `${baseUrl}?device=${encodeURIComponent(deviceName)}`;
}

/**
 * Generate QR code for the current device or specified device name
 * @param {string} deviceName - Device name to generate QR for
 */
async function generateQRCode(deviceName) {
    const container = document.getElementById('qr-code-container');
    const linkInput = document.getElementById('qr-link-input');
    const deviceNameSpan = document.getElementById('qr-device-name');

    if (!container || !deviceName) return;

    // Clear previous QR
    container.innerHTML = '';

    // Generate connection URL
    const connectionURL = generateConnectionURL(deviceName);

    // Update UI
    if (deviceNameSpan) deviceNameSpan.textContent = deviceName;
    if (linkInput) linkInput.value = connectionURL;

    try {
        if (typeof QRCode !== 'undefined') {
            const canvas = document.createElement('canvas');
            await QRCode.toCanvas(canvas, connectionURL, {
                width: 200,
                margin: 2,
                color: { dark: '#000000', light: '#ffffff' }
            });
            container.appendChild(canvas);
            return;
        }

        // Fallback via Google Chart API (server-side image)
        const encoded = encodeURIComponent(connectionURL);
        const size = 200;
        const src = `https://chart.googleapis.com/chart?cht=qr&chs=${size}x${size}&chl=${encoded}&chld=L|1`;
        const img = document.createElement('img');
        img.src = src;
        img.alt = 'QR code';
        img.width = size;
        img.height = size;
        img.style.background = '#ffffff';
        container.appendChild(img);
        console.warn('QRCode lib not available - using Google Chart API fallback');
    } catch (error) {
        console.error('Error generating QR code:', error);
        container.innerHTML = '<p style="color: #ff6347;">Błąd generowania kodu QR</p>';
    }
}

/**
 * Show QR modal with current connected device
 * QR code can only be generated when connected to a device
 */
function showQRModal() {
    const modal = document.getElementById('qr-modal');
    if (!modal) return;

    // QR code generation requires an active connection
    if (!AppState.isConnected) {
        window.addLogMessage('[UI] Aby wygenerować kod QR, najpierw połącz się z robotem.', 'warning');
        return;
    }

    // Get current connected device name
    let deviceName = null;

    if (window.commLayer && window.commLayer.getDeviceName && window.commLayer.getDeviceName()) {
        deviceName = window.commLayer.getDeviceName();
    } else if (AppState && appStore) {
        const storedName = appStore.getState('connection.deviceName');
        if (storedName) deviceName = storedName;
    }

    if (!deviceName) {
        window.addLogMessage('[UI] Nie można określić nazwy połączonego urządzenia.', 'error');
        return;
    }

    // Generate QR and show modal
    generateQRCode(deviceName);
    modal.style.display = 'flex';
}

/**
 * Hide QR modal
 */
function hideQRModal() {
    const modal = document.getElementById('qr-modal');
    if (modal) modal.style.display = 'none';
}

/**
 * Copy connection link to clipboard
 */
async function copyConnectionLink() {
    const linkInput = document.getElementById('qr-link-input');
    if (!linkInput) return;

    try {
        await navigator.clipboard.writeText(linkInput.value);
        window.addLogMessage('[UI] Link skopiowany do schowka!', 'success');

        // Visual feedback
        const btn = document.getElementById('qr-copy-link-btn');
        if (btn) {
            const originalText = btn.textContent;
            btn.textContent = '✓ OK!';
            btn.style.background = '#4caf50';
            setTimeout(() => {
                btn.textContent = originalText;
                btn.style.background = '#61dafb';
            }, 2000);
        }
    } catch (error) {
        console.error('Failed to copy:', error);
        // Fallback - select the text
        linkInput.select();
        document.execCommand('copy');
        window.addLogMessage('[UI] Link skopiowany (fallback)', 'info');
    }
}

/**
 * Print QR code for permanent use
 * Opens a print-friendly page with the QR code and device info
 */
function printQRCode() {
    const deviceName = document.getElementById('qr-device-name')?.textContent || 'RoboBala';
    const qrContainer = document.getElementById('qr-code-container');
    const linkInput = document.getElementById('qr-link-input');

    if (!qrContainer) return;

    // Get QR code image/canvas
    const qrElement = qrContainer.querySelector('canvas') || qrContainer.querySelector('img');
    if (!qrElement) {
        window.addLogMessage('[UI] Nie można znaleźć kodu QR do wydruku', 'error');
        return;
    }

    // Convert canvas to image if needed
    let qrImageSrc;
    if (qrElement.tagName === 'CANVAS') {
        qrImageSrc = qrElement.toDataURL('image/png');
    } else {
        qrImageSrc = qrElement.src;
    }

    // Create print window
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Kod QR - ${deviceName}</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    min-height: 100vh;
                    margin: 0;
                    padding: 20px;
                    box-sizing: border-box;
                }
                .container {
                    text-align: center;
                    border: 3px solid #333;
                    border-radius: 16px;
                    padding: 30px;
                    max-width: 350px;
                }
                h1 {
                    margin: 0 0 10px 0;
                    font-size: 1.5em;
                }
                .device-name {
                    font-size: 1.8em;
                    font-weight: bold;
                    color: #2196F3;
                    margin: 15px 0;
                    padding: 10px;
                    background: #f0f0f0;
                    border-radius: 8px;
                }
                .qr-code {
                    margin: 20px 0;
                }
                .qr-code img {
                    width: 200px;
                    height: 200px;
                }
                .instructions {
                    font-size: 0.9em;
                    color: #666;
                    margin-top: 15px;
                }
                .link {
                    font-size: 0.7em;
                    color: #999;
                    word-break: break-all;
                    margin-top: 10px;
                }
                @media print {
                    body { padding: 0; }
                    .container { border: 2px solid #000; }
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🤖 RoboBala</h1>
                <div class="device-name">${deviceName}</div>
                <div class="qr-code">
                    <img src="${qrImageSrc}" alt="QR Code">
                </div>
                <div class="instructions">
                    Zeskanuj kod QR aby połączyć się z robotem
                </div>
                <div class="link">${linkInput?.value || ''}</div>
            </div>
            <script>
                window.onload = function() {
                    window.print();
                }
            </script>
        </body>
        </html>
    `);
    printWindow.document.close();
}

/**
 * Show auto-connect banner when page is opened from QR code
 * Web Bluetooth API requires user gesture (click) to initiate connection
 * @param {string} deviceName - Target device name from URL
 */
function showAutoConnectBanner(deviceName) {
    // Create banner element
    const banner = document.createElement('div');
    banner.id = 'qr-autoconnect-banner';
    banner.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.9);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        padding: 20px;
    `;

    banner.innerHTML = `
        <div style="background: #1e1e1e; border-radius: 16px; padding: 30px; max-width: 400px; text-align: center; border: 2px solid #61dafb;">
            <div style="font-size: 48px; margin-bottom: 20px;">🤖</div>
            <h2 style="color: #61dafb; margin-bottom: 15px;">Połączenie z Robotem</h2>
            <p style="color: #ccc; margin-bottom: 10px;">Wykryto kod QR dla urządzenia:</p>
            <div style="background: #333; padding: 12px 20px; border-radius: 8px; margin-bottom: 20px;">
                <strong style="color: #4caf50; font-size: 1.3em;">${deviceName}</strong>
            </div>
            <p style="color: #888; font-size: 0.85em; margin-bottom: 20px;">
                Upewnij się, że robot jest <strong style="color: #4caf50;">włączony</strong> i w zasięgu Bluetooth.
            </p>
            <div style="background: #2a2a3a; border: 1px solid #61dafb; border-radius: 8px; padding: 12px; margin-bottom: 20px;">
                <p style="color: #aaa; font-size: 0.8em; margin: 0;">
                    💡 Po kliknięciu pojawi się okno przeglądarki - wybierz urządzenie <strong style="color: #61dafb;">${deviceName}</strong> i kliknij "Paruj"
                </p>
            </div>
            <button id="qr-autoconnect-btn" style="
                background: #4caf50;
                color: white;
                border: none;
                padding: 15px 40px;
                font-size: 1.2em;
                border-radius: 8px;
                cursor: pointer;
                width: 100%;
                margin-bottom: 10px;
            ">
                🔗 Połącz z ${deviceName}
            </button>
            <button id="qr-autoconnect-cancel" style="
                background: transparent;
                color: #888;
                border: 1px solid #555;
                padding: 10px 20px;
                font-size: 0.9em;
                border-radius: 6px;
                cursor: pointer;
                width: 100%;
            ">
                Anuluj
            </button>
        </div>
    `;

    document.body.appendChild(banner);

    // Handle connect button click
    document.getElementById('qr-autoconnect-btn').addEventListener('click', async () => {
        banner.remove();
        await connectBLE();
    });

    // Handle cancel button click
    document.getElementById('qr-autoconnect-cancel').addEventListener('click', () => {
        clearDeviceFromURL();
        banner.remove();
    });
}

/**
 * Initialize QR code UI event listeners
 */
function initQRCode() {
    // Show QR button
    const showQrBtn = document.getElementById('showQrBtn');
    showQrBtn?.addEventListener('click', showQRModal);

    // Close QR modal
    const closeBtn = document.getElementById('qr-close-btn');
    closeBtn?.addEventListener('click', hideQRModal);

    // Copy link button
    const copyBtn = document.getElementById('qr-copy-link-btn');
    copyBtn?.addEventListener('click', copyConnectionLink);

    // Print QR button
    const printBtn = document.getElementById('qr-print-btn');
    printBtn?.addEventListener('click', printQRCode);

    // Close on backdrop click
    const modal = document.getElementById('qr-modal');
    modal?.addEventListener('click', (e) => {
        if (e.target === modal) hideQRModal();
    });

    // Check if page was opened from QR code (device parameter in URL)
    const targetDevice = getTargetDeviceFromURL();
    if (targetDevice) {
        window.addLogMessage(`[UI] Wykryto parametr urządzenia z kodu QR: ${targetDevice}`, 'info');
        // Show connection banner - user must click due to Web Bluetooth security requirements
        setTimeout(() => {
            showAutoConnectBanner(targetDevice);
        }, 300);
    }
}

// ========================================================================
// EXPORTS
// ========================================================================

export {
    getTargetDeviceFromURL,
    clearDeviceFromURL,
    generateConnectionURL,
    generateQRCode,
    showQRModal,
    hideQRModal,
    copyConnectionLink,
    printQRCode,
    showAutoConnectBanner,
    initQRCode
};

// ========================================================================
// BACKWARD COMPATIBILITY — window.* globals
// ========================================================================
window.getTargetDeviceFromURL = getTargetDeviceFromURL;
window.clearDeviceFromURL = clearDeviceFromURL;
window.generateConnectionURL = generateConnectionURL;
window.generateQRCode = generateQRCode;
window.showQRModal = showQRModal;
window.hideQRModal = hideQRModal;
window.copyConnectionLink = copyConnectionLink;
window.printQRCode = printQRCode;
window.showAutoConnectBanner = showAutoConnectBanner;
window.initQRCode = initQRCode;
