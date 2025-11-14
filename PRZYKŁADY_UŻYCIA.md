# Przykłady Użycia Nowej Architektury

## Spis Treści
1. [State Manager - Podstawy](#state-manager---podstawy)
2. [Communication Layer - Podstawy](#communication-layer---podstawy)
3. [Praktyczne Przykłady](#praktyczne-przykłady)
4. [Migracja Starego Kodu](#migracja-starego-kodu)

---

## State Manager - Podstawy

### Przykład 1: Odczyt Stanu

```javascript
// Odczyt pojedynczej wartości
const isConnected = appStore.getState('connection.isConnected');
console.log('Connected:', isConnected); // false lub true

// Odczyt całej kategorii
const robotState = appStore.getState('robot');
console.log('Robot state:', robotState);
// { state: 'IDLE', balancing: false, ... }

// Odczyt całego stanu
const fullState = appStore.getState();
console.log('Full state:', fullState);
```

### Przykład 2: Aktualizacja Stanu

```javascript
// Aktualizacja pojedynczej wartości
appStore.setState('connection.isConnected', true);

// Aktualizacja wielu wartości jednocześnie (bardziej efektywne)
appStore.batchUpdate({
    'connection.isConnected': true,
    'connection.isSynced': true,
    'robot.state': 'BALANCING'
});
```

### Przykład 3: Subskrypcja Zmian (Reaktywny UI)

```javascript
// Subskrybuj zmiany stanu połączenia
const listenerId = appStore.subscribe('connection.isConnected', (value) => {
    console.log('Connection status changed to:', value);
    
    // Automatyczna aktualizacja UI
    const statusEl = document.getElementById('connectionStatus');
    statusEl.className = value ? 'status-ok' : 'status-disconnected';
    statusEl.textContent = value ? 'Connected' : 'Disconnected';
});

// Później: anulowanie subskrypcji (jeśli potrzebne)
appStore.unsubscribe(listenerId);
```

### Przykład 4: Subskrypcja Wielu Ścieżek

```javascript
// Nasłuchuj zmian w wielu miejscach
appStore.subscribe(['robot.balancing', 'robot.speedMode'], (value, path) => {
    console.log(`${path} changed to:`, value);
    
    if (path === 'robot.balancing') {
        updateBalanceIndicator(value);
    } else if (path === 'robot.speedMode') {
        updateSpeedModeIndicator(value);
    }
});
```

---

## Communication Layer - Podstawy

### Przykład 1: Połączenie z Robotem

```javascript
// Połączenie (automatycznie używa BLECommunication)
try {
    const connected = await commLayer.connect();
    if (connected) {
        console.log('Successfully connected to:', commLayer.getDeviceName());
    }
} catch (error) {
    console.error('Connection failed:', error);
}
```

### Przykład 2: Wysyłanie Wiadomości

```javascript
// Wysłanie prostej wiadomości
await commLayer.send({
    type: 'set_param',
    key: 'kp_b',
    value: 95.0
});

// Wysłanie złożonej wiadomości
await commLayer.send({
    type: 'start_tuning',
    method: 'genetic_algorithm',
    params: {
        population: 20,
        generations: 30
    }
});
```

### Przykład 3: Odbieranie Wiadomości

```javascript
// Nasłuchuj konkretnego typu wiadomości
commLayer.onMessage('telemetry', (data) => {
    console.log('Telemetry:', data);
    updateDashboard(data);
});

// Nasłuchuj wszystkich wiadomości (wildcard)
commLayer.onMessage('*', (type, data) => {
    console.log(`Message type: ${type}`, data);
});

// Anulowanie nasłuchiwania
const handler = (data) => { /* ... */ };
commLayer.onMessage('telemetry', handler);
// Później:
commLayer.offMessage('telemetry', handler);
```

### Przykład 4: Rozłączenie

```javascript
// Bezpieczne rozłączenie
await commLayer.disconnect();
console.log('Disconnected from robot');
```

---

## Praktyczne Przykłady

### Przykład 1: Przycisk Połączenia

```javascript
document.getElementById('connectBtn').addEventListener('click', async () => {
    try {
        // Aktualizuj UI - połączenie w toku
        appStore.setState('ui.isLocked', true);
        
        // Połącz z robotem
        const connected = await commLayer.connect();
        
        if (connected) {
            // Aktualizuj stan
            appStore.batchUpdate({
                'connection.isConnected': true,
                'connection.deviceName': commLayer.getDeviceName(),
                'ui.isLocked': false
            });
            
            // Wyślij żądanie konfiguracji
            await commLayer.send({ type: 'request_full_config' });
        }
    } catch (error) {
        console.error('Connection error:', error);
        appStore.setState('ui.isLocked', false);
    }
});
```

### Przykład 2: Dashboard z Automatyczną Aktualizacją

```javascript
// Subskrybuj zmiany telemetrii
appStore.subscribe('telemetry.pitch', (value) => {
    document.getElementById('pitchValue').textContent = value.toFixed(2) + '°';
});

appStore.subscribe('telemetry.speed', (value) => {
    document.getElementById('speedValue').textContent = value.toFixed(0) + ' imp/s';
});

appStore.subscribe('telemetry.roll', (value) => {
    document.getElementById('rollValue').textContent = value.toFixed(2) + '°';
});

// Odbieraj telemetrię i aktualizuj stan
commLayer.onMessage('telemetry', (data) => {
    // Stan automatycznie zaktualizuje wszystkie subskrybowane elementy
    appStore.batchUpdate({
        'telemetry.pitch': data.pitch,
        'telemetry.speed': data.speed,
        'telemetry.roll': data.roll,
        'telemetry.yaw': data.yaw
    });
});
```

### Przykład 3: Kontrolka Balansu z Dwustronną Synchronizacją

```javascript
const balanceSwitch = document.getElementById('balanceSwitch');

// UI -> Robot: Wysłanie komendy po kliknięciu
balanceSwitch.addEventListener('change', async (e) => {
    const enabled = e.target.checked;
    
    // Wyślij komendę do robota
    await commLayer.send({
        type: 'set_state',
        key: 'balancing',
        value: enabled
    });
});

// Robot -> UI: Aktualizacja UI po zmianie stanu robota
appStore.subscribe('robot.balancing', (value) => {
    // Aktualizuj przełącznik jeśli zmiana przyszła z robota
    balanceSwitch.checked = value;
});

// Odbierz potwierdzenie z robota
commLayer.onMessage('set_param', (data) => {
    if (data.key === 'balancing') {
        appStore.setState('robot.balancing', data.value);
    }
});
```

### Przykład 4: Okno Modalne z Zarządzaniem Stanem

```javascript
// Stan okna modalnego
appStore.setState('ui.modalOpen', false);

// Funkcja otwierania modala
function openConfigModal() {
    appStore.setState('ui.modalOpen', true);
    document.getElementById('configModal').style.display = 'flex';
}

// Funkcja zamykania modala
function closeConfigModal() {
    appStore.setState('ui.modalOpen', false);
    document.getElementById('configModal').style.display = 'none';
}

// Blokuj inne akcje gdy modal jest otwarty
appStore.subscribe('ui.modalOpen', (isOpen) => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
});
```

### Przykład 5: System Notyfikacji Reaktywny

```javascript
// Dodaj kategorię notyfikacji do stanu
appStore.state.notifications = [];

// Funkcja dodawania notyfikacji
function addNotification(message, type = 'info') {
    const notifications = appStore.getState('notifications') || [];
    notifications.push({ 
        id: Date.now(), 
        message, 
        type,
        timestamp: new Date()
    });
    appStore.setState('notifications', [...notifications]);
}

// Automatyczne wyświetlanie notyfikacji
appStore.subscribe('notifications', (notifications) => {
    const container = document.getElementById('notificationContainer');
    container.innerHTML = '';
    
    notifications.forEach(notif => {
        const el = document.createElement('div');
        el.className = `notification notification-${notif.type}`;
        el.textContent = notif.message;
        container.appendChild(el);
    });
});

// Użycie
commLayer.onMessage('error', (data) => {
    addNotification(data.message, 'error');
});
```

---

## Migracja Starego Kodu

### Przed: Stary Kod (Nadal Działa!)

```javascript
// Stary sposób - nadal w pełni obsługiwany
let isConnected = false;

function connectOld() {
    isConnected = true;
    updateUI();
}

function updateUI() {
    if (isConnected) {
        document.getElementById('status').textContent = 'Connected';
    }
}
```

### Po: Nowy Kod (Zalecany dla Nowych Funkcji)

```javascript
// Nowy sposób - reaktywny i scentralizowany
function connectNew() {
    appStore.setState('connection.isConnected', true);
}

// UI aktualizuje się automatycznie
appStore.subscribe('connection.isConnected', (value) => {
    document.getElementById('status').textContent = value ? 'Connected' : 'Disconnected';
});
```

### Etap Przejściowy: Hybrydowe Podejście

```javascript
// Możesz mieszać stary i nowy kod podczas migracji
// AppState używa Proxy, więc oba sposoby działają

// Stary sposób
AppState.isConnected = true; // ✅ Działa - aktualizuje appStore

// Nowy sposób
appStore.setState('connection.isConnected', true); // ✅ Działa

// Odczyt
console.log(AppState.isConnected); // ✅ Działa - czyta z appStore
console.log(appStore.getState('connection.isConnected')); // ✅ Działa

// Subskrypcje działają dla obu
appStore.subscribe('connection.isConnected', (value) => {
    console.log('Changed to:', value); // ✅ Wywołane dla obu metod
});
```

---

## Testowanie z MockCommunication

### Przykład: Rozwój UI bez Fizycznego Robota

```javascript
// W trybie deweloperskim użyj MockCommunication
const isDevelopment = true;

let commLayer;
if (isDevelopment) {
    // Mock dla testów
    commLayer = new MockCommunication();
    commLayer.mockDelay = 100; // Symuluj opóźnienie 100ms
} else {
    // Produkcja - prawdziwe BLE
    commLayer = new BLECommunication(SERVICE_UUID, RX_UUID, TX_UUID);
}

// Reszta kodu identyczna - abstrakcja działa!
await commLayer.connect();
await commLayer.send({ type: 'test' });
```

### Przykład: Unit Test

```javascript
// test-state-manager.js
function testStateManager() {
    const store = new AppStore();
    
    // Test 1: Ustawianie i odczyt
    store.setState('test.value', 42);
    console.assert(store.getState('test.value') === 42, 'State set/get failed');
    
    // Test 2: Subskrypcja
    let callbackInvoked = false;
    store.subscribe('test.value', (value) => {
        callbackInvoked = true;
        console.assert(value === 100, 'Callback value incorrect');
    });
    
    store.setState('test.value', 100);
    console.assert(callbackInvoked === true, 'Callback not invoked');
    
    console.log('✅ All tests passed!');
}

testStateManager();
```

---

## Dobre Praktyki

### 1. Używaj Batch Update dla Wielu Zmian

```javascript
// ❌ Nieefektywne - wielokrotne powiadomienia
appStore.setState('telemetry.pitch', 10);
appStore.setState('telemetry.roll', 5);
appStore.setState('telemetry.yaw', 180);

// ✅ Efektywne - jedno powiadomienie
appStore.batchUpdate({
    'telemetry.pitch': 10,
    'telemetry.roll': 5,
    'telemetry.yaw': 180
});
```

### 2. Czyść Subskrypcje Gdy Nie Są Potrzebne

```javascript
// Zapisz ID subskrypcji
const listenerId = appStore.subscribe('robot.state', handleRobotState);

// Później, gdy komponent jest niszczony
appStore.unsubscribe(listenerId);
```

### 3. Używaj Ścieżek Dot-Notation

```javascript
// ✅ Zalecane
appStore.setState('connection.isConnected', true);

// ❌ Unikaj (potencjalne problemy z reaktywnością)
const conn = appStore.getState('connection');
conn.isConnected = true; // To NIE wywoła subskrypcji!
```

### 4. Nazwij Handlery dla Łatwiejszego Debugowania

```javascript
// ✅ Named function - łatwiejsze debugowanie
function handleTelemetry(data) {
    console.log('Telemetry:', data);
}
commLayer.onMessage('telemetry', handleTelemetry);

// ❌ Anonymous function - trudniejsze debugowanie
commLayer.onMessage('telemetry', (data) => {
    console.log('Telemetry:', data);
});
```

---

## Podsumowanie

Nowa architektura zapewnia:
- 🎯 **Scentralizowany stan** - jeden punkt prawdy
- ⚡ **Reaktywny UI** - automatyczne aktualizacje
- 🔌 **Abstrakcja protokołu** - łatwa zmiana komunikacji
- 🧪 **Testowalność** - MockCommunication dla testów
- 🔄 **Kompatybilność** - stary kod działa bez zmian

Zacznij używać nowej architektury w nowym kodzie, stopniowo migrując stary kod w miarę potrzeb!
