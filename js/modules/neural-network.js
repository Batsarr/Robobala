export function initNeuralNetworkPanel() {
    const statusEl = document.getElementById('nnStatusText');
    const logEl = document.getElementById('nnLog');
    const bar = document.getElementById('nnProgressBar');
    const fileInput = document.getElementById('nnFileInput');
    const uploadBtn = document.getElementById('nnUploadBtn');
    const deleteBtn = document.getElementById('nnDeleteBtn');

    function log(msg) { if (logEl) logEl.textContent = msg; }
    function b64FromArrayBuffer(buf) {
        const bytes = new Uint8Array(buf);
        let bin = '';
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        return btoa(bin);
    }

    function waitForAck(command, timeoutMs) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                window.removeEventListener('ble_message', handler);
                reject(new Error('Timeout waiting for ack: ' + command));
            }, timeoutMs);
            function handler(ev) {
                const d = (ev && ev.detail) ? ev.detail : null;
                if (!d || d.type !== 'ack' || d.command !== command) return;
                clearTimeout(timer);
                window.removeEventListener('ble_message', handler);
                resolve(d);
            }
            window.addEventListener('ble_message', handler);
        });
    }

    uploadBtn?.addEventListener('click', async () => {
        const file = fileInput?.files?.[0];
        if (!file) { log('Wybierz plik .bin'); return; }
        const buf = await file.arrayBuffer();
        const view = new DataView(buf);
        if (buf.byteLength < 8) { log('Plik za krotki (minimum 8 B)'); return; }
        const magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
        if (magic !== 'TWIP') { log('Zly magic (oczekiwano TWIP)'); return; }
        const version = view.getUint16(4, true);
        const count = view.getUint16(6, true);
        if (version !== 1 && version !== 2) { log('Zla wersja modelu: ' + version + ' (oczekiwano 1 lub 2)'); return; }
        const expectedCount = version === 1 ? 1249 : 1281;
        if (count !== expectedCount) { log('Zla liczba wag: ' + count + ' (oczekiwano ' + expectedCount + ')'); return; }
        if (buf.byteLength !== 8 + count * 4) { log('Nieprawidlowy rozmiar pliku (oczekiwano ' + (8 + count * 4) + ' B)'); return; }

        log('Upload: wersja ' + version + ', ' + count + ' wag, ' + buf.byteLength + ' B');
        try {
            let ackBeginPromise = waitForAck('nn_upload_begin', 3000);
            window.sendBleMessage({ type: 'nn_upload_begin', filename: file.name, size: buf.byteLength, weight_count: count });
            let ackBegin = await ackBeginPromise;
            if (!ackBegin.success) throw new Error(ackBegin.message || 'Blad rozpoczecia uploadu');

            const CHUNK = 120;
            let offset = 0;
            const total = buf.byteLength;
            let chunkIndex = 0;
            const totalChunks = Math.ceil(total / CHUNK);
            while (offset < total) {
                const end = Math.min(offset + CHUNK, total);
                const chunk = buf.slice(offset, end);
                const b64 = b64FromArrayBuffer(chunk);
                let ackChunk = null;
                for (let attempt = 1; attempt <= 3; attempt++) {
                    const promise = waitForAck('nn_upload_chunk', 3000);
                    window.sendBleMessage({ type: 'nn_upload_chunk', data: b64 });
                    ackChunk = await promise;
                    if (ackChunk.success) break;
                    log('Chunk ' + (chunkIndex + 1) + '/' + totalChunks + ' fail: ' + (ackChunk.message || 'blad') + ' (proba ' + attempt + '/3)');
                }
                if (!ackChunk || !ackChunk.success) throw new Error('Blad chunku ' + (chunkIndex + 1) + ': ' + ((ackChunk && ackChunk.message) || 'timeout'));

                offset = end;
                chunkIndex++;
                const pct = Math.round(offset / total * 100);
                if (bar) bar.style.width = pct + '%';
                log('Upload: ' + pct + '% (' + chunkIndex + '/' + totalChunks + ')');
            }

            const ackEndPromise = waitForAck('nn_upload_end', 5000);
            window.sendBleMessage({ type: 'nn_upload_end' });
            const ackEnd = await ackEndPromise;
            if (!ackEnd.success) throw new Error(ackEnd.message || 'Model odrzucony przez ESP32');
            if (statusEl) statusEl.textContent = ackEnd.message || 'model wgrany';
            log('Upload zakonczony: ' + (ackEnd.message || 'OK'));
            if (bar) bar.style.width = '100%';
        } catch (e) {
            log('Blad uploadu: ' + e.message);
            if (bar) bar.style.width = '0%';
            console.error('[NN upload]', e);
        }
    });

    deleteBtn?.addEventListener('click', () => {
        window.sendBleMessage?.({ type: 'nn_delete_model' });
        log('Usunieto model (jesli istnial)');
        if (bar) bar.style.width = '0%';
        if (statusEl) statusEl.textContent = 'brak modelu';
    });

    const reverseSignBtn = document.getElementById('nnReverseSignBtn');
    let nnOutputSign = 1;
    reverseSignBtn?.addEventListener("click", () => {
        nnOutputSign = -nnOutputSign;
        window.sendBleMessage?.("nn_reverse_output", { sign: nnOutputSign });
        log('Znak wyjscia NN: ' + (nnOutputSign < 0 ? '-' : '+'));
    });

    function refreshStatus() { window.sendBleMessage?.({ type: 'nn_model_status' }); }
    refreshStatus();
}

export default initNeuralNetworkPanel;
