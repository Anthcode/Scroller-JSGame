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

// ==== SEEDOWANY PRNG (spawner wrogów) ====
// mulberry32: mały, szybki generator liczb pseudolosowych z jawnym seedem - w
// przeciwieństwie do Math.random() dwa uruchomienia z tym samym seedem dają identyczną
// sekwencję. Używany WYŁĄCZNIE przez spawner (randomSpawnInterval/pickEnemyType/spawnEnemy
// w game.js, hoverPhase w enemy.js) - to jedyne losowania, które wpływają na układ wrogów
// i mają być powtarzalne przez ?seed= w URL. Pogoda/gwiazdy zostają przy zwykłym
// Math.random() - to czysta dekoracja, nieistotna dla powtarzalności biegu.
function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

let currentSeed = null;
let rng = Math.random;

function seedGameRNG(seed) {
    currentSeed = seed >>> 0;
    rng = mulberry32(currentSeed);
}

// ?seed=X z URL odtwarza dokładnie ten sam układ wrogów; bez niego losowy seed (widoczny
// graczowi na ekranie game over - game.js), więc każdy bieg da się potem odtworzyć.
(function initGameRNG() {
    const urlSeed = new URLSearchParams(location.search).get('seed');
    const parsed = urlSeed !== null ? Number(urlSeed) : NaN;
    seedGameRNG(Number.isFinite(parsed) ? parsed : (Date.now() ^ (Math.random() * 0xFFFFFFFF)) >>> 0);
})();
