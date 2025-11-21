Debugging - 3D & Joystick (RoboBala UI)

Krótka instrukcja jak szybko zweryfikować środowisko i zebrać logi, które pomogą zidentyfikować dlaczego 3D i joystick nie wyświetlają się w aktualnym interfejsie.

1) Uruchom serwer statyczny (w katalogu /interface):
   python3 -m http.server 8000

2) Otwórz stronę w przeglądarce (Chrome/Firefox):
   http://localhost:8000/index.html

3) Otwórz Developer Tools (F12) -> Console i Network.

4) Uwaga: w prawym dolnym rogu strony pojawi się panel diagnostyczny (debug overlay) z informacjami:
   - THREE: "OK" lub "MISSING"
   - OrbitControls: "OK" lub "MISSING"
   - WebGL: "OK" lub "NO"
   - 3D size: aktualne wymiary elementu robot3d-container
   - Joystick size: aktualne wymiary elementu joystickWrapper
   - Last error: ostatni błąd JS (jeśli wystąpił)

5) Spróbuj nacisnąć przyciski w panelu diagnostycznym:
   - Re-init 3D: wymusza uruchomienie ponowne inicjalizacji 3D
   - Re-init Joy: wymusza uruchomienie ponowne inicjalizacji joysticka

6) Co zbierać do raportu:
   - Zrzut ekranu panelu diagnostycznego (dolny prawy róg)
   - Konsolę: znajdź linie zaczynające się od [UI], np.:
     [UI] DOMContentLoaded main handler starting
     [UI] THREE defined: true
     [UI] OrbitControls available: true
     [UI] WebGL available: true
     [UI] init3DVisualization called
     [UI] 3D renderer size: 640 x 400
     [UI] initJoystick called
     [UI] joystickCanvas size: 180 x 180
   - Przykłady błędów:
     - Jeśli THREE missing: sprawdź w zakładce Network czy 3rd-party CDN script (three.min.js) załadował się prawidłowo.
     - Jeśli WebGL: NO: WebGL może być zablokowane/wyłączone w przeglądarce.
     - Jeśli ostatni błąd (Last error) ma stack trace: skopiuj go.

7) Jeśli problem wystąpił tylko po aktualizacji repo: skopiuj zawartość pliku index.html i listę zmian plików (git status; git diff).

8) Przykładowe kroki naprawcze (zależnie od powodu):
   - Brak THREE/OrbitControls w Network: upewnij się, że CDN działa albo ustaw lokalną kopię w <script>.<br>
   - WebGL: NO: spróbuj włączyć WebGL w ustawieniach przeglądarki lub zaktualizować sterowniki.
   - Elementy z rozmiarem 0x0: sprawdź czy kontener nie jest ukryty (display:none) lub czy styl CSS/układ strony nie powoduje 0 szerokości/wysokości; spróbuj rozwinąć panel/resize okna.

9) Jeśli chcesz, możesz wkleić wyniki konsoli i ekran debug overlay tutaj — dodam dalsze poprawki i spróbuję wprowadzić fixy bezpośrednio w kodzie.

---
Drobna nota: dodałem w repo nowy panel diagnostyczny i kilka "watchdog" przywołań inicjalizujących 3D oraz joystick, które próbują ponawiać inicjalizację do momentu, gdy elementy są widoczne (lub upłynie krótki timeout). Jeśli masz wątpliwości, zrób powyższe kroki i podeślij rezultaty.
