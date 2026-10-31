export function initNeuralNetworkPanel() {
    const statusEl = document.getElementById('nnStatusText');
    const logEl = document.getElementById('nnLog');
    const bar = document.getElementById('nnProgressBar');
    const fileInput = document.getElementById('nnFileInput');
    const uploadBtn = document.getElementById('nnUploadBtn');
    const deleteBtn = document.getElementById('nnDeleteBtn');

    function log(msg) { if (logEl) logEl.textContent = msg; }

    // query status
    async function refreshStatus() {
        window.sendBleMessage?.({ type: 'nn_model_status' });
    }

    function b64FromArrayBuffer(buf) {
        const bytes = new Uint8Array(buf);
        let bin = '';
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        return btoa(bin);
    }

    uploadBtn?.addEventListener('click', async () => {
        const file = fileInput?.files?.[0];
        if (!file) { log('Wybierz plik .bin'); return; }
        const buf = await file.arrayBuffer();
        const view = new DataView(buf);
        if (buf.byteLength < 8) { log('Plik za krotki'); return; }
        // magic
        const magic = String.fromCharCode(view.getUint8(0),view.getUint8(1),view.getUint8(2),view.getUint8(3));
        if (magic !== 'TWIP') { log('Zly magic (oczekiwano TWIP)'); return; }
        const version = view.getUint16(4, true);
        const count = view.getUint16(6, true);
        if (count !== 1249) { log(`Zla liczba wag: ${count} (oczekiwano 1249)`); return; }
        if (buf.byteLength !== 8 + count * 4) { log('Nieprawidlowy rozmiar pliku'); return; }

        // send begin
        window.sendBleMessage?.({ type: 'nn_upload_begin', filename: file.name, size: buf.byteLength, weight_count: count });
        // chunk
        const CHUNK = 180;
        let offset = 0;
        const total = buf.byteLength;
        log('Wgrywanie...');
        while (offset < total) {
            const end = Math.min(offset + CHUNK, total);
            const chunk = buf.slice(offset, end);
            const b64 = b64FromArrayBuffer(chunk);
            window.sendBleMessage?.({ type: 'nn_upload_chunk', data: b64 });
            offset = end;
            const pct = Math.round(offset / total * 100);
            if (bar) bar.style.width = pct + '%';
            await new Promise(r => setTimeout(r, 40)); // pace BLE queue
        }
        window.sendBleMessage?.({ type: 'nn_upload_end' });
        log('Wyslano model, oczekiwanie na potwierdzenie');
    });

    deleteBtn?.addEventListener('click', () => {
        window.sendBleMessage?.({ type: 'nn_delete_model' });
        log('Usunieto model (jesli istnial)');
        if (bar) bar.style.width = '0%';
    });

    // handle acks
    window.addEventListener('ble_message', (ev) => {
        const d = ev.detail || ev; // best effort
    });
    // Lightweight: listen via global process? Instead poll nn_status each 5s after upload not needed
    refreshStatus();
}

export default initNeuralNetworkPanel;
