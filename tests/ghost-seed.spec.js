// Seed spawnera (core.js: rng/seedGameRNG) i ghost rekordu (game.js/ghost.js): ?seed=X w URL
// musi odtwarzać dokładnie ten sam układ wrogów, a nowy rekord musi zapisywać razem ghost+seed
// pod dedykowanymi kluczami w localStorage, tylko gdy realnie bije poprzedni najlepszy wynik.
const { test, expect } = require('@playwright/test');
const { gotoGame, startGame, runFrames } = require('./helpers');

test.describe('Seed w URL - determinizm spawnera', () => {
    test('ten sam ?seed= daje identyczna sekwencje spawnow (typ + pozycja) miedzy sesjami', async ({ page }) => {
        async function collectSpawns(seed) {
            await page.goto(`/game-demo.html?seed=${seed}`);
            await page.waitForFunction(() => typeof gameState !== 'undefined' && gameState === 'menu');
            await page.evaluate(() => {
                window.__spawnLog = [];
                const originalSpawnEnemy = window.spawnEnemy;
                window.spawnEnemy = function () {
                    originalSpawnEnemy();
                    const last = enemies[enemies.length - 1];
                    window.__spawnLog.push({ type: last.type, x: Math.round(last.x) });
                };
                window.startGame();
            });
            await page.waitForFunction(() => gameState === 'playing');
            await runFrames(page, 300, 100); // ~30s symulowanego czasu gry - kilkanascie spawnow
            return page.evaluate(() => window.__spawnLog);
        }

        const seqA = await collectSpawns(123);
        const seqB = await collectSpawns(123);

        expect(seqA.length).toBeGreaterThan(3);
        expect(seqA).toEqual(seqB);
    });
});

test.describe('Ghost rekordu (localStorage)', () => {
    test('nowy rekord zapisuje bufor ghosta i seed', async ({ page }) => {
        await gotoGame(page);
        await startGame(page);

        await page.evaluate(() => { score = 999999; });
        await runFrames(page, 10); // kilka probek nagrywania (co 50ms, wiec >=3 klatki @60fps wystarcza)
        await page.evaluate(() => {
            player.hp = 0;
            player.alive = false;
            player.animator.play('death', { force: true });
        });
        await runFrames(page, 70);
        await page.waitForFunction(() => gameState === 'gameover');

        const stored = await page.evaluate(() => ({
            ghostRaw: localStorage.getItem('parallaxfx.bestRunGhost'),
            seedRaw: localStorage.getItem('parallaxfx.bestRunSeed'),
            currentSeed,
        }));

        expect(stored.ghostRaw).toBeTruthy();
        const parsedGhost = JSON.parse(stored.ghostRaw);
        expect(parsedGhost.samples.length).toBeGreaterThan(0);
        expect(stored.seedRaw).toBe(String(stored.currentSeed));
    });

    test('wynik nizszy od rekordu nie nadpisuje zapisanego ghosta/seeda', async ({ page }) => {
        await gotoGame(page);
        await page.evaluate(() => {
            safeStorageSet('parallaxfx.bestScore', '500');
            safeStorageSet('parallaxfx.bestRunGhost', JSON.stringify({ x0: 1, y0: 2, intervalMs: 50, samples: [1, 2, 3] }));
            safeStorageSet('parallaxfx.bestRunSeed', '999');
        });
        await page.reload();
        await page.waitForFunction(() => typeof gameState !== 'undefined');

        await startGame(page);
        await page.evaluate(() => { score = 10; });
        await page.evaluate(() => {
            player.hp = 0;
            player.alive = false;
            player.animator.play('death', { force: true });
        });
        await runFrames(page, 70);
        await page.waitForFunction(() => gameState === 'gameover');

        const stored = await page.evaluate(() => ({
            ghostRaw: localStorage.getItem('parallaxfx.bestRunGhost'),
            seedRaw: localStorage.getItem('parallaxfx.bestRunSeed'),
        }));

        expect(JSON.parse(stored.ghostRaw).samples).toEqual([1, 2, 3]);
        expect(stored.seedRaw).toBe('999');
    });
});
