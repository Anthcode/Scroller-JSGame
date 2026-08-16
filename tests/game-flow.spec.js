// Maszyna stanow gry: menu -> playing -> gameover -> restart (game.js).
const { test, expect } = require('@playwright/test');
const { gotoGame, startGame, runFrames } = require('./helpers');

test.describe('Stan gry', () => {
    test('menu jest stanem startowym, demo-symulacja jest gotowa', async ({ page }) => {
        await gotoGame(page);
        const state = await page.evaluate(() => ({
            gameState,
            demoPlayerX: demoPlayer.x,
            hasDemoEnemy: !!demoEnemy,
        }));
        expect(state.gameState).toBe('menu');
        expect(state.demoPlayerX).toBe(100);
        expect(state.hasDemoEnemy).toBe(true);
    });

    test('Spacja startuje gre z menu ze swiezym stanem gracza', async ({ page }) => {
        await gotoGame(page);
        await page.keyboard.press('Space');
        await page.waitForFunction(() => gameState === 'playing');
        // WorldDirector (world.js) potrafi podnosic mnoznik wyniku do x1.8 (noc+wiatr) - pinujemy
        // neutralne warunki, zeby "score < 10" mierzylo swiezosc stanu, nie zbieg pogodowy.
        await page.evaluate(() => { weatherMode = 'none'; dayTime = 0.5; windForce = 1; });

        const state = await page.evaluate(() => ({
            hp: player.hp,
            alive: player.alive,
            enemiesCount: enemies.length,
            score,
        }));
        expect(state.hp).toBe(3);
        expect(state.alive).toBe(true);
        expect(state.enemiesCount).toBe(0);
        // Realna petla gry w tle dolicza punkty za dystans co prawdziwa klatke (score +=
        // worldSpeed*timeScale*0.1) - miedzy startGame() a odczytem stanu mija realny czas
        // (waitForFunction, roundtrip evaluate), wiec kilka punktow narastajacych to
        // oczekiwane, nie blad. Test sprawdza "prawie zero po starcie", nie "zamrozione na 0".
        expect(state.score).toBeLessThan(10);
    });

    // Regresja z PR #19: keydown-listener startGame() (game.js) rejestruje sie PRZED
    // listenerem Spacji-skoku Playera (bindowanym dopiero w script.js), wiec bez
    // stopImmediatePropagation ten sam nacisk Spacji restartujacy gre wywolywal tez skok
    // na pierwszej klatce.
    test('restart Spacja nie wywoluje jednoczesnie skoku', async ({ page }) => {
        await gotoGame(page);
        await startGame(page);

        await page.evaluate(() => {
            player.hp = 0;
            player.alive = false;
            player.animator.play('death', { force: true });
        });
        await runFrames(page, 70); // 900ms animacji smierci przy 90ms/klatke x 10 klatek
        await page.waitForFunction(() => gameState === 'gameover');

        await page.keyboard.press('Space');
        await page.waitForFunction(() => gameState === 'playing');

        const state = await page.evaluate(() => ({
            isJumping: player.isJumping,
            y: player.y,
            groundY: player.groundY,
            velocityY: player.velocityY,
        }));
        expect(state.isJumping).toBe(false);
        expect(state.y).toBe(state.groundY);
        expect(state.velocityY).toBe(0);
    });

    test('restart resetuje hp/wynik/combo/wrogow/timer spawnera', async ({ page }) => {
        await gotoGame(page);
        await startGame(page);

        await page.evaluate(() => {
            score = 12345;
            combo = 7;
            player.hp = 1;
            enemies.push(new Enemy(400, GROUND_LINE_Y, 'walker'));
            enemySpawnTimer = 999;
        });

        await page.evaluate(() => window.startGame());
        await page.evaluate(() => { weatherMode = 'none'; dayTime = 0.5; windForce = 1; });

        const state = await page.evaluate(() => ({
            gameState, score, combo,
            hp: player.hp, alive: player.alive,
            enemiesCount: enemies.length,
            enemySpawnTimer,
        }));
        expect(state.gameState).toBe('playing');
        // Jak w tescie startu z menu - realna petla gry doliczyla juz kilka punktow za dystans
        // w czasie miedzy startGame() a odczytem stanu.
        expect(state.score).toBeLessThan(10);
        expect(state.combo).toBe(0);
        expect(state.hp).toBe(3);
        expect(state.alive).toBe(true);
        expect(state.enemiesCount).toBe(0);
        // Tak samo jak wynik - enemySpawnTimer tyka co realna klatke od zera, wiec do momentu
        // odczytu zdazyl juz troche narosnac (rzedu pojedynczego deltaTime).
        expect(state.enemySpawnTimer).toBeLessThan(100);
    });

    test('gra konczy sie (gameover) po dokonczeniu animacji smierci gracza', async ({ page }) => {
        await gotoGame(page);
        await startGame(page);

        await page.evaluate(() => {
            player.hp = 0;
            player.alive = false;
            player.animator.play('death', { force: true });
        });

        expect(await page.evaluate(() => gameState)).toBe('playing'); // jeszcze trwa animacja
        await runFrames(page, 70);
        expect(await page.evaluate(() => gameState)).toBe('gameover');
    });
});
