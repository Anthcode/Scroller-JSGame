// Tlo: warstwy paralaksy (Layers, world.js) i ich tempo wzgledem worldSpeed (game.js).
// Patrz PR #18 (naprawa podwojnego mnozenia predkosci) i PR #20 (zamrozenie na game over).
const { test, expect } = require('@playwright/test');
const { gotoGame, startGame, runFrames } = require('./helpers');

test.describe('Paralaksa', () => {
    test('game over zamraza warstwy paralaksy w miejscu', async ({ page }) => {
        await gotoGame(page);
        await startGame(page);

        await page.evaluate(() => {
            player.hp = 0;
            player.alive = false;
            player.animator.play('death', { force: true });
        });
        await runFrames(page, 70);
        await page.waitForFunction(() => gameState === 'gameover');
        expect(await page.evaluate(() => worldSpeed)).toBe(0);

        // layer1.update() jest wolane z realnej petli anime() (script.js), nie z updateGame() -
        // trzeba wiec dac prawdziwemu rAF chwile na przejscie kilku klatek, nie symulowac ich
        // recznie przez runFrames (ktore dotyka tylko updateGame()).
        const before = await page.evaluate(() => layer1.x);
        await page.waitForTimeout(300);
        const after = await page.evaluate(() => layer1.x);
        expect(after).toBe(before);
    });

    test('menu NIE zamraza tla (worldSpeed > 0)', async ({ page }) => {
        await gotoGame(page);
        const ws = await page.evaluate(() => worldSpeed);
        expect(ws).toBeGreaterThan(0);
    });

    test('warstwy blizsze scrolluja szybciej niz dalsze (mnozniki paralaksy)', async ({ page }) => {
        await gotoGame(page);
        const speeds = await page.evaluate(() => {
            worldSpeed = 4;
            gamespeed = 1;
            timeScale = 1;
            layer1.update(); // grunt, xspeed 1.0
            layer6.update(); // dalekie wzgorza, xspeed 0.2
            return { layer1: layer1.speed, layer6: layer6.speed };
        });
        expect(speeds.layer1).toBeGreaterThan(speeds.layer6);
        // Regresja: layer1 kiedys dostawal blednie gamespeed jako mnoznik (predkosc do kwadratu)
        // zamiast stalej analogicznej do reszty warstw - przy worldSpeed=4 powinno byc dokladnie 4.
        expect(speeds.layer1).toBeCloseTo(4, 5);
    });
});
