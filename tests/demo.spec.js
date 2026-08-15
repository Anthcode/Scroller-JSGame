// Demo na ekranie menu (updateDemo w game.js, PR #21) - biegnacy demoPlayer skacze na
// nadlatujacego demoEnemy i go depcze, w petli. Uzywa wlasnego (zrelaksowanego wobec realnej
// gry) warunku stompa - patrz komentarz w game.js o tym, czemu scisly warunek prawdziwej gry
// (prevBottom <= enemyTop) chybial o pojedyncze piksele nawet przy w pelni deterministycznej
// fizyce.
const { test, expect } = require('@playwright/test');
const { gotoGame, startGame } = require('./helpers');

test.describe('Demo na ekranie menu', () => {
    test('demo dziala niezawodnie w szerokim zakresie dystansu wyzwalajacego skok', async ({ page }) => {
        await gotoGame(page);

        const results = await page.evaluate(() => {
            const DT = 1000 / 60;

            function runTrial(leadPx) {
                resetDemoLoop();
                timeScale = 1;
                let jumped = false, stomped = false;
                for (let i = 0; i < 260; i++) {
                    demoPlayer.keys.left = false;
                    demoPlayer.keys.right = false;
                    demoEnemy.update(DT, MENU_WORLD_SPEED, 0);
                    demoPlayer.update(DT, { left: 0, right: canvas.width, top: 0, bottom: canvas.height });

                    if (!demoPlayer.isJumping && demoEnemy.alive &&
                        demoEnemy.x > demoPlayer.x && demoEnemy.x - demoPlayer.x < leadPx && !jumped) {
                        demoPlayer.jump();
                        jumped = true;
                    }
                    if (demoEnemy.alive) {
                        const pb = demoPlayer.getBounds();
                        const eb = demoEnemy.getBounds();
                        if (checkCollision(pb, eb) && demoPlayer.velocityY > 0) {
                            demoEnemy.takeHit(demoEnemy.hp);
                            stomped = true;
                        }
                    }
                    if (stomped || demoEnemy.x < -100) break;
                }
                return { leadPx, jumped, stomped };
            }

            // Szeroki zamiatany zakres wokol DEMO_JUMP_LEAD_PX - ma dzialac w calym paśmie,
            // nie tylko dla jednej "szczesliwej" wartosci (patrz notatka w PR #21).
            return [170, 185, 200, 215, 230].map(runTrial);
        });

        for (const r of results) {
            expect(r.jumped, `leadPx=${r.leadPx} powinien wywolac skok`).toBe(true);
            expect(r.stomped, `leadPx=${r.leadPx} powinien skonczyc sie stompem`).toBe(true);
        }
    });

    test('demo dziala niezawodnie na prawdziwym takcie przegladarki (kilka petli)', async ({ page }) => {
        await gotoGame(page);

        const observed = await page.evaluate(async () => {
            function frame() { return new Promise(r => requestAnimationFrame(() => r())); }
            let kills = 0, loops = 0, fallbackResets = 0, killedThisLoop = false, lastEnemyRef = demoEnemy;

            for (let i = 0; i < 720; i++) { // ~12s, ~3-4 petle demo (DEMO_LOOP_MS ~3.2s)
                await frame();
                if (!demoEnemy.alive && !killedThisLoop) { killedThisLoop = true; kills++; }
                if (demoEnemy !== lastEnemyRef) {
                    loops++;
                    if (!killedThisLoop) fallbackResets++;
                    killedThisLoop = false;
                    lastEnemyRef = demoEnemy;
                }
            }
            return { kills, loops, fallbackResets, finalHp: demoPlayer.hp };
        });

        expect(observed.loops).toBeGreaterThan(0);
        expect(observed.fallbackResets).toBe(0);
        expect(observed.kills).toBe(observed.loops);
        expect(observed.finalHp).toBe(3); // demo nigdy nie powinno "boleć" demoPlayera
    });

    test('start gry zatrzymuje demo i pokazuje prawdziwego gracza', async ({ page }) => {
        await gotoGame(page);
        await startGame(page);

        const demoXAtT1 = await page.evaluate(() => demoPlayer.x);
        await page.waitForTimeout(300);
        const demoXAtT2 = await page.evaluate(() => demoPlayer.x);
        expect(demoXAtT2).toBe(demoXAtT1); // demo zamrozone, nie aktualizuje sie w stanie 'playing'

        const real = await page.evaluate(() => ({ x: player.x, y: player.y, hp: player.hp }));
        expect(real.hp).toBe(3);
    });
});
