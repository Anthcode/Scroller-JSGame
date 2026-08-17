// ThemeManager (theme.js): temat classic jako zrodlo prawdy dla grafiki, walidacja
// konfiguracji tematu. Podmiana w locie i fallback - patrz kolejne testy nizej (Task 4).
const { test, expect } = require('@playwright/test');
const { gotoGame } = require('./helpers');

test.describe('ThemeManager: classic + walidacja', () => {
    test('strona startuje z tematem classic', async ({ page }) => {
        await gotoGame(page);
        expect(await page.evaluate(() => currentThemeName)).toBe('classic');
        expect(await page.evaluate(() => currentTheme.name)).toBe('classic');
        expect(await page.evaluate(() => currentTheme.layers.length)).toBe(7);
    });

    test('walidacja odrzuca config bez dokladnie jednej warstwy ground', async ({ page }) => {
        await gotoGame(page);
        const msg = await page.evaluate(() => {
            try {
                validateThemeConfig({
                    name: 'x',
                    layers: [{ file: 'a.png', xspeed: 0, role: 'sky' }],
                    player: {}, enemies: {}
                });
                return null;
            } catch (e) { return e.message; }
        });
        expect(msg).toContain('ground');
    });

    test('walidacja odrzuca gracza bez wymaganego stanu (np. death)', async ({ page }) => {
        await gotoGame(page);
        const msg = await page.evaluate(() => {
            // Kopia poprawnego configu classic z wycietym stanem death gracza
            const cfg = JSON.parse(JSON.stringify(THEME_DEFAULTS));
            delete cfg.player.states.death;
            try { validateThemeConfig(cfg); return null; } catch (e) { return e.message; }
        });
        expect(msg).toContain('death');
    });

    test('THEME_DEFAULTS przechodzi wlasna walidacje', async ({ page }) => {
        await gotoGame(page);
        const ok = await page.evaluate(() => {
            try { validateThemeConfig(THEME_DEFAULTS); return true; } catch { return false; }
        });
        expect(ok).toBe(true);
    });

    test('warstwy classic zbudowane z THEME_DEFAULTS (role sky/ground, xspeed)', async ({ page }) => {
        await gotoGame(page);
        const layers = await page.evaluate(() => ({
            count: parallaxLayers.length,
            skySpeed: skyLayer.xspeed,
            groundSpeed: groundLayer.xspeed,
            midSpeeds: midLayers.map(l => l.xspeed)
        }));
        expect(layers.count).toBe(7);
        expect(layers.skySpeed).toBe(0);
        expect(layers.groundSpeed).toBe(1.0);
        expect(layers.midSpeeds).toEqual([0.2, 0.3, 0.46, 0.6, 0.8]);
    });
});
