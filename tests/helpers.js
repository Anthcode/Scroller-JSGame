// ==== POMOCNIKI TESTOWE ====
// Gra trzyma cały stan w globalnym scope strony (zwykłe <script>, bez modułów - patrz
// index.html), więc testy sterują nim wprost przez page.evaluate(). Realna pętla gry
// (anime() w script.js) startuje automatycznie po załadowaniu strony i działa cały czas w tle
// przez requestAnimationFrame - synchroniczne bloki page.evaluate() (np. runFrames poniżej)
// nie są przez nią przerywane w trakcie wykonywania (JS w stronie jest jednowątkowy), więc dają
// deterministyczne, powtarzalne kroki fizyki niezależne od prawdziwego taktu rAF.

// Otwiera grę i czeka aż wystartuje stan 'menu' (czyli core.js/game.js/script.js się wykonały).
async function gotoGame(page) {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof gameState !== 'undefined' && gameState === 'menu');
}

// Startuje rozgrywkę tak samo jak realne wejście (Spacja) - przez prawdziwą funkcję startGame(),
// nie przez symulację klawiatury, żeby test nie zależał od tego, który listener klawiatury
// akurat obsługuje dany klawisz.
async function startGame(page) {
    await page.evaluate(() => window.startGame());
    await page.waitForFunction(() => gameState === 'playing');
}

// Wykonuje `count` kroków fizyki o ustalonym deltaTime (domyślnie 1 klatka @60fps), z
// timeScale wymuszonym na 1 - deterministycznie, bez czekania na prawdziwe klatki przeglądarki.
// To dokładnie ta technika, którą zweryfikowano geometrię stompa/demo w PR-ach #20/#21 (sweep
// po jednakowym kroku czasu zamiast zgadywania na realnym, zaszumionym timingu rAF).
async function runFrames(page, count = 1, deltaTime = 1000 / 60) {
    await page.evaluate(({ count, deltaTime }) => {
        for (let i = 0; i < count; i++) {
            window.timeScale = 1;
            window.updateGame(deltaTime);
        }
    }, { count, deltaTime });
}

module.exports = { gotoGame, startGame, runFrames };
