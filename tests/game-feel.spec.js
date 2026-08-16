// Game feel (feel.js): hit-stop/screen shake/impact particles/floating combo text wpięte
// w handlePlayerEnemyCollisions() (stomp) i Player.takeHit() (trafienie gracza). Testy
// wołają handlePlayerEnemyCollisions() bezpośrednio - dokładnie tak jak tests/combat.spec.js -
// więc hit-stop w updateGame() (bramkowany tam, nie tutaj) nie ma na nie wpływu.
const { test, expect } = require('@playwright/test');
const { gotoGame, startGame } = require('./helpers');

test.describe('Game feel - stomp', () => {
    test('stomp wyzwala hit-stop, shake, iskry i floating combo text', async ({ page }) => {
        await gotoGame(page);
        await startGame(page);

        const result = await page.evaluate(() => {
            enemies.length = 0;
            const e = new Enemy(player.x, GROUND_LINE_Y, 'walker');
            enemies.push(e);

            player.y = e.y - player.height + 10;
            player.velocityY = 5;
            player.isJumping = true;
            player.prevBottom = player.y + player.height - 10;

            combo = 0;
            hitStopMs = 0;
            shakeTrauma = 0;
            impactParticles.length = 0;
            floatingTexts.length = 0;
            // WorldDirector (world.js) mnoży wynik zależnie od pogody/pory dnia (dayTime=0 tuż
            // po starcie liczy się jako "noc") - pinujemy neutralne warunki, żeby ten test mierzył
            // samą wartość bazową stompu, nie zbieg okoliczności pogodowych.
            weatherMode = 'none';
            dayTime = 0.5;
            windForce = 1;

            handlePlayerEnemyCollisions();

            return {
                hitStopMs,
                shakeTrauma,
                impactCount: impactParticles.length,
                textCount: floatingTexts.length,
                text: floatingTexts[0] ? floatingTexts[0].text : null
            };
        });

        expect(result.hitStopMs).toBe(65); // combo=1 -> min(90, 60+1*5)
        expect(result.shakeTrauma).toBeGreaterThan(0);
        expect(result.impactCount).toBeGreaterThanOrEqual(8);
        expect(result.textCount).toBe(1);
        expect(result.text).toContain('+100');
    });

    test('trafienie gracza wyzwala mocniejszy hit-stop/shake, bez iskier stompu', async ({ page }) => {
        await gotoGame(page);
        await startGame(page);

        const result = await page.evaluate(() => {
            enemies.length = 0;
            const e = new Enemy(300, GROUND_LINE_Y, 'walker');
            enemies.push(e);

            player.x = e.x - 20;
            player.y = e.y;
            player.velocityY = 0;
            player.isJumping = false;
            player.invulnerable = false;

            hitStopMs = 0;
            shakeTrauma = 0;
            impactParticles.length = 0;

            handlePlayerEnemyCollisions();

            return { hitStopMs, shakeTrauma, impactCount: impactParticles.length };
        });

        expect(result.hitStopMs).toBe(140);
        expect(result.shakeTrauma).toBe(0.5);
        expect(result.impactCount).toBe(0);
    });
});

test.describe('Game feel - systemy pomocnicze', () => {
    test('updateFeelSystems odlicza shakeTrauma do zera', async ({ page }) => {
        await gotoGame(page);

        const result = await page.evaluate(() => {
            shakeTrauma = 1;
            for (let i = 0; i < 2000; i++) updateFeelSystems(16.67);
            return shakeTrauma;
        });

        expect(result).toBe(0);
    });

    test('hitStopMs > 0 zamraża fizykę tej klatki w updateGame(), rysowanie leci dalej', async ({ page }) => {
        await gotoGame(page);
        await startGame(page);

        const result = await page.evaluate(() => {
            window.timeScale = 1;
            hitStopMs = 50;
            const before = elapsedMs;
            updateGame(16.67);
            return { before, after: elapsedMs, hitStopMsAfter: hitStopMs };
        });

        expect(result.after).toBe(result.before);
        expect(result.hitStopMsAfter).toBeLessThan(50);
    });
});
