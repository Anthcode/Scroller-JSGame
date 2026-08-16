// Walka: skok na glowe (stomp) jako jedyny sposob pokonania wroga - handlePlayerEnemyCollisions
// w game.js. Naziemne typy (walker/walkerFast) wymagaja trafienia "od gory w trakcie opadania";
// latajacy ghost (hover poza zasiegiem stania) zabija sie kazdym kontaktem w skoku - patrz
// komentarz o isHoverKill w game.js i notatka o zmierzonym empirycznie ~41px oknie w PR #20.
const { test, expect } = require('@playwright/test');
const { gotoGame, startGame } = require('./helpers');

test.describe('Stomp - wrogowie naziemni (walker/walkerFast)', () => {
    test('opadanie na wroga od gory zabija go, nie rani gracza, odbija w gore', async ({ page }) => {
        await gotoGame(page);
        await startGame(page);

        const result = await page.evaluate(() => {
            enemies.length = 0;
            const e = new Enemy(player.x, GROUND_LINE_Y, 'walker');
            enemies.push(e);

            player.y = e.y - player.height + 10;
            player.velocityY = 5; // opada
            player.isJumping = true;
            player.prevBottom = player.y + player.height - 10; // klatke temu stopy byly wyzej niz teraz gora wroga
            const hpBefore = player.hp;

            handlePlayerEnemyCollisions();

            return { enemyAlive: e.alive, hp: player.hp, hpBefore, velocityY: player.velocityY, score };
        });

        expect(result.enemyAlive).toBe(false);
        expect(result.hp).toBe(result.hpBefore);
        expect(result.velocityY).toBeLessThan(0);
        expect(result.score).toBeGreaterThan(0);
    });

    test('ladowanie tuz przy gornej krawedzi wroga liczy sie jako stomp, nawet gdy prevBottom juz minal prog o kilka px', async ({ page }) => {
        // Regresja: prevBottom <= enemyTop wymaga zlapania DOKLADNIE klatki przejscia. W realnej
        // (nie w pelni deterministycznej) rozgrywce gracz czesto zaczyna nakladac sie na wroga
        // klatke/kilka pikseli PO tym, jak prevBottom juz zeszlo ponizej gornej krawedzi wroga -
        // mimo ze wizualnie i tak laduje mu na glowie. Bez uzupelniajacego warunku "stopy nadal
        // w gornej polowie ciala wroga" taki (bardzo typowy) skok mylnie liczyl sie jako
        // trafienie z boku (patrz zgloszenie: "naskakuje od gory, wrog nie ginie, tracę zycia").
        await gotoGame(page);
        await startGame(page);

        const result = await page.evaluate(() => {
            enemies.length = 0;
            const e = new Enemy(player.x, 0, 'walker');
            e.y = 500 - e.config.inset.top; // enemyBounds.y (gora, po wcieciu) == 500

            enemies.push(e);

            // Stopy gracza (feetY, po wcieciu) tuz przy gornej krawedzi wroga - w gornej polowie
            // jego ciala (enemyBounds.height 68, wiec polowa to 534) - genuinie ladowanie na glowie.
            const feetY = 510;
            const boundsHeight = 86; // player height(96) - insetTop(6) - insetBottom(4)
            player.y = feetY - boundsHeight - 6; // -insetTop, zeby playerBounds.y wyszlo poprawnie
            player.velocityY = 6; // opada
            player.isJumping = true;
            // "Przespana" klatka przejscia: stopy z poprzedniej klatki byly juz 5px ZA progiem
            // (505 > enemyBounds.y=500) - stary, wylacznie-prevBottom warunek odrzucilby to jako hit.
            player.prevBottom = 505;
            const hpBefore = player.hp;

            handlePlayerEnemyCollisions();

            return { enemyAlive: e.alive, hp: player.hp, hpBefore, velocityY: player.velocityY };
        });

        expect(result.enemyAlive).toBe(false);
        expect(result.hp).toBe(result.hpBefore);
        expect(result.velocityY).toBeLessThan(0);
    });

    test('kontakt z boku (bez skoku) rani gracza, nie zabija wroga', async ({ page }) => {
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
            const hpBefore = player.hp;

            handlePlayerEnemyCollisions();

            return { enemyAlive: e.alive, hpBefore, hpAfter: player.hp };
        });

        expect(result.enemyAlive).toBe(true);
        expect(result.hpAfter).toBe(result.hpBefore - 1);
    });

    test('walkerFast: ta sama logika stomp-vs-bok co walker', async ({ page }) => {
        await gotoGame(page);
        await startGame(page);

        const result = await page.evaluate(() => {
            enemies.length = 0;
            const e = new Enemy(300, GROUND_LINE_Y, 'walkerFast');
            enemies.push(e);

            player.x = e.x - 10;
            player.y = e.y;
            player.velocityY = 0;
            player.isJumping = false;
            const hpBefore = player.hp;

            handlePlayerEnemyCollisions();

            return { enemyAlive: e.alive, hpBefore, hpAfter: player.hp };
        });

        expect(result.enemyAlive).toBe(true);
        expect(result.hpAfter).toBe(result.hpBefore - 1);
    });

    test('wroga jednego typu nie zabija dwoch stompow naraz co do hp - jeden stomp = zgon', async ({ page }) => {
        await gotoGame(page);
        await startGame(page);

        const hpValues = await page.evaluate(() => {
            enemies.length = 0;
            const e = new Enemy(player.x, GROUND_LINE_Y, 'walker');
            enemies.push(e);
            return e.hp; // walker ma 2 hp bazowo
        });
        expect(hpValues).toBe(2);
    });
});

test.describe('Stomp - latajacy ghost', () => {
    test('stanie pod duchem (bez skoku) nigdy nie rani gracza', async ({ page }) => {
        await gotoGame(page);
        await startGame(page);

        const result = await page.evaluate(async () => {
            function frame() { return new Promise(r => requestAnimationFrame(() => r())); }
            enemies.length = 0;
            const g = new Enemy(player.x, GROUND_LINE_Y, 'ghost');
            const origUpdate = g.update.bind(g);
            g.update = function (dt, ws, bonus) { origUpdate(dt, 0, 0); this.x = player.x; };
            enemies.push(g);

            const hpBefore = player.hp;
            for (let i = 0; i < 90; i++) await frame(); // ~1.5s, pelny cykl kolysania
            return { hpBefore, hpAfter: player.hp, ghostAlive: g.alive };
        });

        expect(result.hpAfter).toBe(result.hpBefore);
        expect(result.ghostAlive).toBe(true);
    });

    test('skok w ducha zawsze go zabija, niezaleznie od fazy kolysania', async ({ page }) => {
        await gotoGame(page);
        await startGame(page);

        const phases = [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2, Math.PI / 4];
        const results = [];
        for (const phase of phases) {
            const r = await page.evaluate(async (phase) => {
                function frame() { return new Promise(res => requestAnimationFrame(() => res())); }
                player.reset();
                enemies.length = 0;
                const g = new Enemy(player.x, GROUND_LINE_Y, 'ghost');
                g.hoverPhase = phase;
                const origUpdate = g.update.bind(g);
                g.update = function (dt, ws, bonus) { origUpdate(dt, 0, 0); this.x = player.x; };
                enemies.push(g);

                player.jump();
                for (let i = 0; i < 45; i++) { await frame(); if (!g.alive) break; }
                return { killed: !g.alive, hp: player.hp, bounced: player.velocityY < 0 };
            }, phase);
            results.push(r);
        }

        for (const r of results) {
            expect(r.killed).toBe(true);
            expect(r.hp).toBe(3);
            expect(r.bounced).toBe(true);
        }
    });
});
