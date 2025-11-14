# Architektura Aplikacji RoboBala

## Przegląd

Aplikacja została rozszerzona o dwie kluczowe warstwy architektoniczne zgodnie z rekomendacjami wysokiego priorytetu z `ANALIZA_I_ZALECENIA.md`:

1. **State Management (Zarządzanie Stanem)** - Scentralizowane zarządzanie stanem aplikacji
2. **Communication Abstraction Layer (Warstwa Abstrakcji Komunikacji)** - Oddzielenie protokołu komunikacji od logiki aplikacji

## Struktura Warstw

```
┌─────────────────────────────────────────┐
│          UI Layer (index.html)          │
│    (Interfejs użytkownika, Canvas,      │
│     Wykresy, Wizualizacja 3D)          │
└────────────────┬────────────────────────┘
                 │
┌────────────────▼────────────────────────┐
│      Application Logic (main.js)        │
│  (Logika biznesowa, Event handlers)    │
└─────┬──────────────────────────┬────────┘
      │                          │
      │                          │
┌─────▼──────────────┐  ┌────────▼─────────────┐
│  State Manager     │  │ Communication Layer  │
│ (state_manager.js) │  │(communication_layer) │
│                    │  │                      │
│ - AppStore         │  │ - CommunicationLayer │
│ - Observer Pattern │  │ - BLECommunication  │
│ - Reactive Updates │  │ - MockCommunication │
└────────────────────┘  └──────────────────────┘
```

## 1. State Manager (state_manager.js)

### Cel
Scentralizowane zarządzanie stanem aplikacji z reaktywnymi aktualizacjami UI poprzez wzorzec obserwatora.

### Główne Komponenty

#### AppStore Class
Główna klasa zarządzająca stanem aplikacji:

```javascript
const appStore = new AppStore();

// Pobieranie stanu
const isConnected = appStore.getState('connection.isConnected');

// Aktualizacja stanu
appStore.setState('connection.isConnected', true);

// Subskrypcja zmian
const listenerId = appStore.subscribe('connection.isConnected', (newValue) => {
    console.log('Connection status changed:', newValue);
});

// Anulowanie subskrypcji
appStore.unsubscribe(listenerId);
```

### Struktura Stanu

```javascript
{
    connection: {
        isConnected: false,
        isSynced: false,
        deviceName: null,
        syncTimeout: null
    },
    robot: {
        state: 'IDLE',
        balancing: false,
        holdingPosition: false,
        speedMode: false
    },
    telemetry: {
        pitch: 0,
        roll: 0,
        yaw: 0,
        speed: 0,
        // ... więcej danych telemetrycznych
    },
    ui: {
        isApplyingConfig: false,
        isSyncingConfig: false,
        isLocked: true
    },
    tuning: {
        isActive: false,
        activeMethod: '',
        isPaused: false
    },
    sequence: {
        isRunning: false,
        currentStep: 0
    },
    // ... więcej kategorii
}
```

### Zalety
- **Single Source of Truth** - Jeden punkt zarządzania stanem
- **Reaktywność** - Automatyczne aktualizacje UI przy zmianach stanu
- **Debugowanie** - Łatwiejsze śledzenie zmian stanu
- **Testowanie** - Łatwiejsze testowanie logiki bez UI
- **Separacja** - Oddzielenie stanu od logiki biznesowej

## 2. Communication Layer (communication_layer.js)

### Cel
Abstrakcyjna warstwa komunikacji umożliwiająca łatwą zmianę protokołu komunikacji bez modyfikacji logiki aplikacji.

### Główne Komponenty

#### CommunicationLayer (Abstract Base Class)
Abstrakcyjna klasa bazowa definiująca interfejs komunikacji:

```javascript
class CommunicationLayer {
    async connect() { /* ... */ }
    async disconnect() { /* ... */ }
    async send(message) { /* ... */ }
    onMessage(type, handler) { /* ... */ }
    offMessage(type, handler) { /* ... */ }
}
```

#### BLECommunication
Implementacja dla Bluetooth Low Energy:

```javascript
const commLayer = new BLECommunication(SERVICE_UUID, RX_UUID, TX_UUID);

// Połączenie
await commLayer.connect();

// Wysyłanie wiadomości
await commLayer.send({ type: 'set_param', key: 'kp_b', value: 95.0 });

// Odbieranie wiadomości
commLayer.onMessage('telemetry', (data) => {
    console.log('Telemetry received:', data);
});

// Rozłączenie
await commLayer.disconnect();
```

#### MockCommunication
Implementacja testowa do rozwoju bez fizycznego urządzenia:

```javascript
const mockComm = new MockCommunication();
await mockComm.connect(); // Symuluje połączenie
await mockComm.send({ type: 'test' }); // Loguje do konsoli
```

### Zalety
- **Abstrakcja** - Oddzielenie protokołu od logiki aplikacji
- **Testowalność** - MockCommunication dla testów jednostkowych
- **Elastyczność** - Łatwa zmiana protokołu (np. WebSocket, HTTP)
- **Niezawodność** - Centralna obsługa błędów komunikacji
- **Chunking** - Automatyczna obsługa dzielonych wiadomości

## 3. Integracja z Istniejącym Kodem

### Backward Compatibility (Kompatybilność Wsteczna)

Aby zachować pełną kompatybilność z istniejącym kodem, zastosowano **Proxy wrapper** dla `AppState`:

```javascript
const AppState = new Proxy({}, {
    get(target, prop) {
        // Mapowanie starych nazw na nowe ścieżki stanu
        const stateMap = {
            'isConnected': 'connection.isConnected',
            'isSynced': 'connection.isSynced',
            // ... więcej mapowań
        };
        return appStore.getState(stateMap[prop]);
    },
    set(target, prop, value) {
        // Automatyczne przekierowanie do appStore
        appStore.setState(stateMap[prop], value);
        return true;
    }
});
```

To oznacza, że **cały istniejący kod działa bez zmian**:

```javascript
// Stary kod nadal działa:
AppState.isConnected = true;
if (AppState.isConnected) { /* ... */ }

// Wewnętrznie używa nowego state managera
```

### Message Routing

Wszystkie wiadomości z warstwy komunikacji są automatycznie przekierowywane do istniejącej funkcji `processCompleteMessage()`:

```javascript
function setupCommunicationHandlers() {
    // Obsługa rozłączenia
    commLayer.onMessage('disconnected', () => {
        onDisconnected();
    });
    
    // Routing wszystkich wiadomości
    commLayer.onMessage('*', (type, data) => {
        if (type !== 'disconnected') {
            processCompleteMessage(data);
        }
    });
}
```

## 4. Migracja i Najlepsze Praktyki

### Dla Nowego Kodu

**Zalecane:** Używaj bezpośrednio nowych warstw:

```javascript
// State management
appStore.setState('robot.balancing', true);
appStore.subscribe('robot.balancing', (value) => {
    updateBalanceUI(value);
});

// Communication
commLayer.send({ type: 'set_param', key: 'kp_b', value: 100 });
commLayer.onMessage('telemetry', handleTelemetry);
```

### Dla Istniejącego Kodu

**Akceptowalne:** Kontynuuj używanie kompatybilnych wrapperów:

```javascript
// Nadal działa dzięki Proxy
AppState.isConnected = true;

// Nadal działa dzięki warunkowej logice
sendBleMessage({ type: 'test' });
```

### Stopniowa Migracja

1. **Nowy kod** - Używaj bezpośrednio `appStore` i `commLayer`
2. **Refaktoryzacja** - Stopniowo migruj stary kod do nowej architektury
3. **Konsystencja** - Trzymaj się jednego stylu w ramach funkcji/modułu

## 5. Korzyści Architektury

### Przed Refaktoryzacją
```javascript
// Stan rozproszony w globalnych zmiennych
let isConnected = false;
let bleDevice = null;
let lastKnownRobotState = 'IDLE';

// Bezpośrednie użycie BLE API
bleDevice = await navigator.bluetooth.requestDevice(...);
rxCharacteristic.writeValue(...);
```

**Problemy:**
- Stan rozproszony w wielu zmiennych globalnych
- Trudne testowanie bez fizycznego urządzenia
- Ścisłe powiązanie z BLE API
- Brak reaktywnych aktualizacji UI

### Po Refaktoryzacji
```javascript
// Scentralizowany stan
appStore.setState('connection.isConnected', true);

// Abstrakcja komunikacji
await commLayer.send({ type: 'test' });

// Reaktywne UI
appStore.subscribe('connection.isConnected', updateConnectionUI);
```

**Zalety:**
- ✅ Scentralizowany, łatwy do śledzenia stan
- ✅ Łatwe testowanie z MockCommunication
- ✅ Możliwość zmiany protokołu bez zmian w logice
- ✅ Automatyczne, reaktywne aktualizacje UI
- ✅ Lepsze oddzielenie warstw (Separation of Concerns)
- ✅ Pełna kompatybilność wsteczna

## 6. Testowanie

### Testowanie State Manager

```javascript
// Utwórz instancję
const store = new AppStore();

// Test subskrypcji
let callbackInvoked = false;
store.subscribe('test.value', () => {
    callbackInvoked = true;
});

store.setState('test.value', 123);
console.assert(callbackInvoked === true);
console.assert(store.getState('test.value') === 123);
```

### Testowanie Communication Layer

```javascript
// Użyj MockCommunication
const mockComm = new MockCommunication();

await mockComm.connect();
console.assert(mockComm.isConnected === true);

mockComm.onMessage('test', (data) => {
    console.log('Test message received:', data);
});

await mockComm.send({ type: 'test', data: 'hello' });
```

## 7. Przyszłe Rozszerzenia

### Możliwe Ulepszenia

1. **Middleware dla State Manager**
   - Logowanie zmian stanu
   - Walidacja stanu
   - Zapisywanie historii (undo/redo)

2. **Dodatkowe Communication Layers**
   - WebSocketCommunication dla zdalnego dostępu
   - HTTPCommunication dla REST API
   - SerialCommunication dla połączenia USB

3. **Persystencja Stanu**
   - Automatyczny zapis stanu do localStorage
   - Przywracanie stanu po odświeżeniu strony

4. **DevTools**
   - Panel debugowania stanu
   - Wizualizacja przepływu wiadomości
   - Time-travel debugging

## 8. Zgodność z Rekomendacjami

Ta implementacja realizuje **Priorytet Wysoki** z `ANALIZA_I_ZALECENIA.md`:

✅ **"Wprowadzić State Management i warstwę abstrakcji komunikacji"**
- State Manager (AppStore) - scentralizowane zarządzanie stanem
- Communication Layer - abstrakcja protokołu komunikacji

✅ **"Zachowując oczywiście pełne działanie kodu"**
- Proxy wrapper zapewnia 100% kompatybilność wsteczną
- Zero zmian wymaganych w istniejącym kodzie
- Wszystkie funkcje działają identycznie

## Podsumowanie

Nowa architektura wprowadza solidne fundamenty dla dalszego rozwoju aplikacji, jednocześnie zachowując pełną kompatybilność z istniejącym kodem. Stopniowa migracja może odbywać się w tempie odpowiednim dla zespołu, bez ryzyka wprowadzenia błędów do działającego systemu.
