// ThemeManager (theme.js): temat classic jako zrodlo prawdy dla grafiki, walidacja
// konfiguracji tematu. Podmiana w locie i fallback - patrz kolejne testy nizej (Task 4).
const { test, expect } = require('@playwright/test');
const { gotoGame, startGame, runFrames } = require('./helpers');

// Buduje w stronie syntetyczny temat z placeholderow (createPlaceholderSheet) i rejestruje
// go jako window.__applyTestTheme() - jeden helper dla testow swapu i spawnow, zeby nie
// powtarzac duzego literalu konfiguracji w kazdym page.evaluate().
async function injectTestTheme(page) {
    await page.evaluate(() => {
        window.__applyTestTheme = () => {
            const sheet = (rows) => createPlaceholderSheet({
                frameWidth: 100, frameHeight: 100, rows, cols: 10, color: '#ff4400'
            });
            const playerStates = {
                idle:         { row: 0, frameCount: 4, frameInterval: 80, startFrame: 0, loop: true,  locked: false, next: null },
                'move-left':  { row: 1, frameCount: 4, frameInterval: 80, startFrame: 0, loop: true,  locked: false, next: null },
                'move-right': { row: 2, frameCount: 4, frameInterval: 80, startFrame: 0, loop: true,  locked: false, next: null },
                jump:         { row: 3, frameCount: 4, frameInterval: 80, startFrame: 0, loop: true,  locked: false, next: null },
                hit:          { row: 4, frameCount: 2, frameInterval: 80, startFrame: 0, loop: false, locked: true,  next: 'idle' },
                death:        { row: 5, frameCount: 4, frameInterval: 80, startFrame: 0, loop: false, locked: true,  next: null }
            };
            const enemyStates = {
                idle:  { row: 0, frameCount: 1, frameInterval: 200, startFrame: 0, loop: true,  locked: false, next: null },
                move:  { row: 1, frameCount: 2, frameInterval: 150, startFrame: 0, loop: true,  locked: false, next: null },
                hit:   { row: 2, frameCount: 2, frameInterval: 70,  startFrame: 0, loop: false, locked: true,  next: 'idle' },
                death: { row: 3, frameCount: 2, frameInterval: 120, startFrame: 0, loop: false, locked: true,  next: null }
            };
            const entity = (states) => ({
                image: sheet(6), frameWidth: 100, frameHeight: 100, states, initialState: 'idle'
            });
            applyTheme({
                name: 'test-theme',
                layers: [
                    { image: sheet(1), xspeed: 0,   role: 'sky' },
                    { image: sheet(1), xspeed: 0.5 },
                    { image: sheet(1), xspeed: 1.0, role: 'ground' }
                ],
                player: entity(playerStates),
                enemies: { walker: entity(enemyStates), ghost: entity(enemyStates) },
                dayPhases: null
            });
        };
    });
}

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

    test('animData gracza i wrogow pochodzi z aktywnego tematu', async ({ page }) => {
        await gotoGame(page);
        const src = await page.evaluate(() => ({
            player: PLAYER_ANIM_DATA.sheets[0],
            playerFrame: PLAYER_ANIM_DATA.frameWidth,
            walker: ENEMY_TYPES.walker.animData.sheets[0],
            ghostFrame: ENEMY_TYPES.ghost.animData.frameWidth,
            // te same OBIEKTY stanow co w THEME_DEFAULTS - jedno zrodlo prawdy, bez kopii
            sameStates: PLAYER_ANIM_DATA.states === THEME_DEFAULTS.player.states
        }));
        expect(src.player).toContain('character.png');
        expect(src.playerFrame).toBe(150);
        expect(src.walker).toContain('enemy.png');
        expect(src.ghostFrame).toBeCloseTo(2087 / 11, 5);
        expect(src.sameStates).toBe(true);
    });
});

test.describe('ThemeManager: podmiana w locie + fallback', () => {
    test('applyTheme w trakcie gry nie rusza stanu rozgrywki, podmienia grafike', async ({ page }) => {
        await gotoGame(page);
        await startGame(page);
        await runFrames(page, 30);
        await injectTestTheme(page);
        const result = await page.evaluate(() => {
            const before = {
                x: player.x, y: player.y, hp: player.hp,
                state: gameState, animState: player.animator.currentState
            };
            window.__applyTestTheme();
            return {
                before,
                after: {
                    x: player.x, y: player.y, hp: player.hp,
                    state: gameState, animState: player.animator.currentState,
                    frameWidth: player.animator.frameWidth,
                    layerCount: parallaxLayers.length,
                    themeName: currentTheme.name
                }
            };
        });
        expect(result.after.state).toBe('playing');
        expect(result.after.x).toBe(result.before.x);
        expect(result.after.y).toBe(result.before.y);
        expect(result.after.hp).toBe(result.before.hp);
        expect(result.after.animState).toBe(result.before.animState); // stan animacji zachowany
        expect(result.after.frameWidth).toBe(100);                     // nowy sheet
        expect(result.after.layerCount).toBe(3);
        expect(result.after.themeName).toBe('test-theme');
        // gra dziala dalej po podmianie (fizyka + rysowanie nie wywalaja sie na nowym sheecie)
        await runFrames(page, 30);
        expect(await page.evaluate(() => gameState)).toBe('playing');
    });

    test('zywi wrogowie dokanczaja stara grafike, nowe spawny biora nowa', async ({ page }) => {
        await gotoGame(page);
        await startGame(page);
        await injectTestTheme(page);
        const res = await page.evaluate(() => {
            spawnEnemy();
            const oldEnemy = enemies[enemies.length - 1];
            const oldSheet = oldEnemy.animator.currentSheet;
            window.__applyTestTheme();
            spawnEnemy();
            const newEnemy = enemies[enemies.length - 1];
            return {
                oldKept: oldEnemy.animator.currentSheet === oldSheet,
                // placeholder z createPlaceholderSheet to canvas, nie Image
                newIsPlaceholder: newEnemy.animator.currentSheet instanceof HTMLCanvasElement
            };
        });
        expect(res.oldKept).toBe(true);
        expect(res.newIsPlaceholder).toBe(true);
    });

    test('walkerFast bez wlasnego wpisu dziedziczy grafike walkera', async ({ page }) => {
        await gotoGame(page);
        await injectTestTheme(page);
        const same = await page.evaluate(() => {
            window.__applyTestTheme(); // temat testowy nie definiuje walkerFast
            return ENEMY_TYPES.walkerFast.animData.sheets[0] === ENEMY_TYPES.walker.animData.sheets[0];
        });
        expect(same).toBe(true);
    });

    test('setTheme z nieistniejaca nazwa: fallback do classic, zwraca false', async ({ page }) => {
        await gotoGame(page);
        const ok = await page.evaluate(() => setTheme('nie-ma-takiego-tematu'));
        expect(ok).toBe(false);
        const state = await page.evaluate(() => ({
            name: currentThemeName,
            layers: parallaxLayers.length,
            playerSheet: PLAYER_ANIM_DATA.sheets[0]
        }));
        expect(state.name).toBe('classic');
        expect(state.layers).toBe(7);
        expect(state.playerSheet).toContain('character.png');
    });

    test('setTheme("classic") aplikuje THEME_DEFAULTS bez fetch', async ({ page }) => {
        await gotoGame(page);
        await injectTestTheme(page);
        await page.evaluate(() => window.__applyTestTheme());
        const ok = await page.evaluate(() => setTheme('classic'));
        expect(ok).toBe(true);
        expect(await page.evaluate(() => currentThemeName)).toBe('classic');
        expect(await page.evaluate(() => parallaxLayers.length)).toBe(7);
    });
});
