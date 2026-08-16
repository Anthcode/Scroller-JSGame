// Rekord w localStorage (safeStorageGet/Set, core.js) - zapisywany przy przejsciu do
// 'gameover' (enterGameOver, game.js), musi przetrwac przeladowanie strony.
const { test, expect } = require('@playwright/test');
const { gotoGame, startGame, runFrames } = require('./helpers');

test.describe('Rekord (localStorage)', () => {
    test('nowy wynik wyzszy od rekordu jest zapisywany i przezywa reload', async ({ page }) => {
        await gotoGame(page);
        await startGame(page);
        // WorldDirector (world.js) potrafi podnosic mnoznik wyniku do x1.8 (noc+wiatr) - pinujemy
        // neutralne warunki, zeby test mierzyl zapis rekordu, nie zbieg okolicznosci pogodowych.
        await page.evaluate(() => { weatherMode = 'none'; dayTime = 0.5; windForce = 1; });

        await page.evaluate(() => { score = 999999; });
        await page.evaluate(() => {
            player.hp = 0;
            player.alive = false;
            player.animator.play('death', { force: true });
        });
        await runFrames(page, 70);
        await page.waitForFunction(() => gameState === 'gameover');

        // Realna petla gry dolicza punkty za dystans co prawdziwa klatke, wiec zanim
        // enterGameOver() zapisal wynik, moglo doleciec kilka dodatkowych punktow ponad 999999
        // (patrz ta sama uwaga w game-flow.spec.js) - liczy sie, ze zapisalo COS bliskiego
        // ustawionej wartosci, nie dokladnie 999999.
        const bestAfterLoss = await page.evaluate(() => bestScore);
        expect(bestAfterLoss).toBeGreaterThanOrEqual(999999);
        expect(bestAfterLoss).toBeLessThan(999999 + 50);

        await page.reload();
        await page.waitForFunction(() => typeof gameState !== 'undefined');
        const bestAfterReload = await page.evaluate(() => bestScore);
        // Zapis do localStorage zaokragla w dol (enterGameOver: Math.floor(bestScore)) -
        // po reloadzie odczytujemy juz liczbe calkowita.
        expect(bestAfterReload).toBe(Math.floor(bestAfterLoss));
    });

    test('wynik nizszy od rekordu nie nadpisuje go', async ({ page }) => {
        await gotoGame(page);
        await page.evaluate(() => { safeStorageSet('parallaxfx.bestScore', '500'); });
        await page.reload();
        await page.waitForFunction(() => typeof gameState !== 'undefined');
        expect(await page.evaluate(() => bestScore)).toBe(500);

        await startGame(page);
        await page.evaluate(() => { weatherMode = 'none'; dayTime = 0.5; windForce = 1; });
        await page.evaluate(() => { score = 10; });
        await page.evaluate(() => {
            player.hp = 0;
            player.alive = false;
            player.animator.play('death', { force: true });
        });
        await runFrames(page, 70);
        await page.waitForFunction(() => gameState === 'gameover');

        expect(await page.evaluate(() => bestScore)).toBe(500);
    });
});
