// WorldDirector (world.js): automat zmieniający pogodę/cykl dnia w trakcie rozgrywki,
// wpięty w updateGame() (game.js, WYŁĄCZNIE gdy gameState==='playing') i w player.js
// (bezwładność w deszczu, znoszenie wiatrem w skoku). tests/weather-ui.spec.js (niezmieniony)
// pozostaje regresyjnym strażnikiem ręcznego panelu debug - nie startuje gry, więc
// WorldDirector w ogóle się tam nie uruchamia.
const { test, expect } = require('@playwright/test');
const { gotoGame, startGame } = require('./helpers');

test.describe('WorldDirector - stan startowy i harmonogram', () => {
    test('startGame resetuje WorldDirector: pogoda "none", dzien od zera, daySpeed zsynchronizowany z rampa trudnosci', async ({ page }) => {
        await gotoGame(page);
        await startGame(page);

        const state = await page.evaluate(() => ({ weatherMode, dayTime, daySpeed }));

        expect(state.weatherMode).toBe('none');
        expect(state.dayTime).toBeLessThan(0.05);
        expect(state.daySpeed).toBeCloseTo(1 / 7200, 10); // TARGET_FRAME_MS/DAY_CYCLE_MS - pelny cykl w 120s
    });

    test('po ~30s+ WorldDirector zaczyna zmiane pogody', async ({ page }) => {
        await gotoGame(page);
        await startGame(page);

        const result = await page.evaluate(() => {
            elapsedMs = 40000; // powyzej gornej granicy jittera (30000 +/- 5000)
            updateWorldDirector(elapsedMs);
            return { transitionActive: !!weatherTransition, weatherMode };
        });

        expect(result.transitionActive || result.weatherMode !== 'none').toBe(true);
    });

    test('reczna zmiana pogody podczas gry odsuwa nastepna automatyczna zmiane zamiast zostac nadpisana', async ({ page }) => {
        await gotoGame(page);
        await startGame(page);

        const result = await page.evaluate(() => {
            elapsedMs = 5000;
            changeWeather('rain'); // reczna zmiana - odsuwa worldDirectorNextChangeAtMs o pelny interwal
            const scheduledAt = worldDirectorNextChangeAtMs;
            updateWorldDirector(elapsedMs + 1000); // wciaz daleko przed zaplanowana automatyczna zmiana
            return { weatherModeAfter: weatherMode, scheduledAt, elapsedMs };
        });

        expect(result.weatherModeAfter).toBe('rain');
        expect(result.scheduledAt).toBeGreaterThan(result.elapsedMs);
    });
});

test.describe('WorldDirector - fizyka gracza', () => {
    test('deszcz daje bezwladnosc (lerp) zamiast natychmiastowej predkosci', async ({ page }) => {
        await gotoGame(page);
        await startGame(page);

        const result = await page.evaluate(() => {
            weatherMode = 'rain';
            player.velocityX = 0;
            player.keys.right = true;
            timeScale = 1;
            player.update(16.67, { left: 0, right: canvas.width, top: 0, bottom: canvas.height });
            return { velocityX: player.velocityX, speed: player.speed };
        });

        expect(result.velocityX).toBeGreaterThan(0);
        expect(result.velocityX).toBeLessThan(result.speed); // lerp - jeszcze nie osiagnal pelnej predkosci po jednej klatce
    });

    test('poza deszczem sterowanie zostaje natychmiastowe (bez regresji)', async ({ page }) => {
        await gotoGame(page);
        await startGame(page);

        const result = await page.evaluate(() => {
            weatherMode = 'none';
            player.velocityX = 0;
            player.keys.right = true;
            timeScale = 1;
            player.update(16.67, { left: 0, right: canvas.width, top: 0, bottom: canvas.height });
            return { velocityX: player.velocityX, speed: player.speed };
        });

        expect(result.velocityX).toBe(result.speed);
    });

    test('silny wiatr znosi gracza w powietrzu proporcjonalnie do windForce', async ({ page }) => {
        await gotoGame(page);
        await startGame(page);

        const velocityX = await page.evaluate(() => {
            weatherMode = 'none';
            windForce = 3;
            player.isJumping = true;
            player.velocityX = 0;
            player.keys.left = false;
            player.keys.right = false;
            // Bez "window." - timeScale to global `let` (core.js), a window.timeScale byłoby
            // osobną, nieużywaną własnością window (let-y nie trafiają na globalThis) - patrz
            // identyczny wzorzec w parallax.spec.js (bare `timeScale = 1`, nie window.timeScale).
            timeScale = 1;
            player.update(16.67, { left: 0, right: canvas.width, top: 0, bottom: canvas.height });
            return player.velocityX;
        });

        expect(velocityX).toBeCloseTo(3 * 0.15 * 1, 5);
    });
});

test.describe('WorldDirector - mnoznik wyniku', () => {
    test('noc + silny wiatr = x1.8', async ({ page }) => {
        await gotoGame(page);
        const result = await page.evaluate(() => { dayTime = 0.1; windForce = 3; return getScoreMultiplier(); });
        expect(result).toBe(1.8);
    });

    test('sama noc albo sam silny wiatr = x1.2', async ({ page }) => {
        await gotoGame(page);
        const nightOnly = await page.evaluate(() => { dayTime = 0.1; windForce = 1; return getScoreMultiplier(); });
        const windOnly = await page.evaluate(() => { dayTime = 0.5; windForce = 3; return getScoreMultiplier(); });
        expect(nightOnly).toBe(1.2);
        expect(windOnly).toBe(1.2);
    });

    test('dzien + slaby wiatr = x1 (bez zmian)', async ({ page }) => {
        await gotoGame(page);
        const result = await page.evaluate(() => { dayTime = 0.5; windForce = 1; return getScoreMultiplier(); });
        expect(result).toBe(1);
    });
});
