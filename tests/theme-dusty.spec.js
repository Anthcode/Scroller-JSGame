// Realna sciezka ladowania tematu z dysku (fetch theme.json + preload PNG) - w
// odroznieniu od tests/theme.spec.js, ktory testuje mechanike na syntetycznych tematach.
const { test, expect } = require('@playwright/test');
const { gotoGame, startGame, runFrames } = require('./helpers');

test.describe('Temat dusty-daylight', () => {
    test('setTheme laduje temat z images/themes/dusty-daylight', async ({ page }) => {
        await gotoGame(page);
        const ok = await page.evaluate(() => setTheme('dusty-daylight'));
        expect(ok).toBe(true);
        const state = await page.evaluate(() => ({
            name: currentThemeName,
            layerCount: parallaxLayers.length,
            layerSpeeds: parallaxLayers.map(l => l.xspeed),
            playerSheet: PLAYER_ANIM_DATA.sheets[0].src,
            playerFrame: PLAYER_ANIM_DATA.frameWidth,
            walkerFrame: ENEMY_TYPES.walker.animData.frameWidth
        }));
        expect(state.name).toBe('dusty-daylight');
        expect(state.layerCount).toBe(5);
        expect(state.layerSpeeds).toEqual([0, 0.2, 0.46, 0.8, 1.0]);
        expect(state.playerSheet).toContain('themes/dusty-daylight/player.png');
        expect(state.playerFrame).toBe(256);
        expect(state.walkerFrame).toBe(160);
    });

    test('rozgrywka dziala na dusty-daylight (fizyka + spawny bez bledow)', async ({ page }) => {
        await gotoGame(page);
        await page.evaluate(() => setTheme('dusty-daylight'));
        await startGame(page);
        await page.evaluate(() => spawnEnemy());
        await runFrames(page, 120);
        expect(await page.evaluate(() => gameState)).toBe('playing');
        expect(await page.evaluate(() => player.alive)).toBe(true);
    });

    test('?theme=dusty-daylight w URL laduje temat na starcie', async ({ page }) => {
        await page.goto('/game-demo.html?theme=dusty-daylight');
        await page.waitForFunction(() => typeof gameState !== 'undefined' && gameState === 'menu');
        await page.waitForFunction(() => currentThemeName === 'dusty-daylight');
        expect(await page.evaluate(() => parallaxLayers.length)).toBe(5);
    });

    test('powrot do classic przywraca komplet 7 warstw', async ({ page }) => {
        await gotoGame(page);
        await page.evaluate(() => setTheme('dusty-daylight'));
        await page.evaluate(() => setTheme('classic'));
        expect(await page.evaluate(() => parallaxLayers.length)).toBe(7);
        expect(await page.evaluate(() => PLAYER_ANIM_DATA.sheets[0])).toContain('character.png');
    });
});
