// cel: Pilnuje, żeby przyciski „Znak sprzężenia” w panelu wysyłały klucze, które firmware naprawdę obsługuje (regresja 2026-10-14)
// tagi: testy, panel, firmware, pid, kontrakt
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const czytaj = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const mainJs = czytaj('interface/js/main.js');
const telemetryJs = czytaj('interface/js/modules/telemetry.js');
const controlLoop = czytaj('src/Control/control_loop.cpp');
const commandHandler = czytaj('src/Communication/command_handler.cpp');

const blokMapy = mainJs.match(/const signButtonMap = \{([\s\S]*?)\};/);
const kluczePanelu = [...blokMapy[1].matchAll(/'(\w+)':\s*'(\w+)'/g)].map(m => ({ kontener: m[1], klucz: m[2] }));

test('panel ma 3 przełączniki znaku (balans, prędkość, pozycja)', () => {
    assert.deepEqual(kluczePanelu.map(k => k.kontener), ['balanceSign', 'speedSign', 'positionSign']);
});

test('każdy klucz znaku wysyłany przez panel jest obsłużony w set_param firmware', () => {
    for (const { klucz } of kluczePanelu) {
        assert.ok(controlLoop.includes(`strcmp(key, "${klucz}")`), `firmware nie zna klucza ${klucz}`);
    }
});

test('panel wysyła 1 dla znaku − i 0 dla znaku + (firmware: value >= 0.5 = odwrócony)', () => {
    assert.match(mainJs, /value: sign === -1 \? 1 : 0/);
});

test('panel odczytuje znak z kluczy, które firmware wysyła w sync', () => {
    const wysylane = [...commandHandler.matchAll(/sendSingleParam\("(\w+_pid_reverse)"/g)].map(m => m[1]);
    assert.equal(wysylane.length, 3);
    for (const k of wysylane) assert.ok(telemetryJs.includes(`${k}:`), `telemetry.js nie obsługuje ${k}`);
});
