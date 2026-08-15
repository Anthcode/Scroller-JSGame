// ==== RDZEŃ ====
// Canvas, kontekst i stałe współdzielone przez wszystkie pozostałe pliki. Musi być
// załadowany jako pierwszy <script> w game-demo.html - world.js/player.js/enemy.js/game.js
// czytają z niego canvas/ctx/GROUND_LINE_Y, a game.js/script.js korzystają z timeScale.

const canvas = document.querySelector('canvas');
const ctx = canvas.getContext('2d');

canvas.width = 800;
canvas.height = 600;

// Wspólna "linia gruntu" (stopy postaci) dopasowana do warstwy layer1, niezależna od
// wysokości sprite'a - każda encja liczy swoje y od tego samego dołu.
const GROUND_LINE_Y = canvas.height - 116;

// Suwak "Prędkość gry" w panelu ⚙️ działa teraz jako dodatkowy mnożnik na wierzchu tempa
// wyznaczanego przez krzywą trudności (worldSpeed, patrz game.js) - stąd neutralne 1.0,
// zamiast dawnego 2, przy którym świat i tak jechał już podwojony.
let gamespeed = 1;

// Mnożnik normalizujący ruch względem 60 klatek/s, żeby gra na wyświetlaczu 90/120Hz nie
// chodziła 1.5-2x szybciej niż na 60Hz. Clamp na 3 klatki chroni przed jednym wielkim
// skokiem pozycji po powrocie z uśpionej/zminimalizowanej karty (ogromne deltaTime).
const TARGET_FRAME_MS = 1000 / 60;
let timeScale = 1;

function updateTimeScale(deltaTime) {
    timeScale = Math.min(Math.max(deltaTime / TARGET_FRAME_MS, 0), 3);
}

// localStorage bywa niedostępny (tryb prywatny, przekroczony limit) - te wrappery nigdy
// nie rzucają, więc nieudany zapis/odczyt rekordu nie wywali pętli gry.
function safeStorageGet(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        return raw === null ? fallback : raw;
    } catch {
        return fallback;
    }
}

function safeStorageSet(key, value) {
    try {
        localStorage.setItem(key, value);
    } catch {
        // ignorujemy - najwyżej rekord nie przetrwa do następnej sesji
    }
}
