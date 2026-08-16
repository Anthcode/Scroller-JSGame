// Rozne typy wrogow (ENEMY_TYPES w enemy.js) odblokowywane stopniowo z czasem przezycia
// (pickEnemyType w game.js) - patrz PR #20.
const { test, expect } = require('@playwright/test');
const { gotoGame } = require('./helpers');

test.describe('pickEnemyType - harmonogram odblokowania', () => {
    test('przed 15s pojawia sie tylko walker', async ({ page }) => {
        await gotoGame(page);
        const types = await page.evaluate(() => { seedGameRNG(42); return Array.from({ length: 60 }, () => pickEnemyType(0)); });
        expect(new Set(types)).toEqual(new Set(['walker']));
    });

    test('po 15s dochodzi walkerFast, ghost jeszcze nie', async ({ page }) => {
        await gotoGame(page);
        const types = await page.evaluate(() => { seedGameRNG(42); return Array.from({ length: 300 }, () => pickEnemyType(20000)); });
        const uniq = new Set(types);
        expect(uniq.has('walker')).toBe(true);
        expect(uniq.has('walkerFast')).toBe(true);
        expect(uniq.has('ghost')).toBe(false);
    });

    test('po 45s moze pojawic sie ghost', async ({ page }) => {
        await gotoGame(page);
        const types = await page.evaluate(() => { seedGameRNG(42); return Array.from({ length: 400 }, () => pickEnemyType(60000)); });
        expect(new Set(types).has('ghost')).toBe(true);
    });
});

test.describe('Seedowany PRNG (core.js) - determinizm spawnera', () => {
    test('ten sam seed daje identyczna sekwencje typow wrogow', async ({ page }) => {
        await gotoGame(page);
        const seqA = await page.evaluate(() => { seedGameRNG(777); return Array.from({ length: 50 }, () => pickEnemyType(60000)); });
        const seqB = await page.evaluate(() => { seedGameRNG(777); return Array.from({ length: 50 }, () => pickEnemyType(60000)); });
        expect(seqA).toEqual(seqB);
    });

    test('rozne seedy zazwyczaj daja rozne sekwencje', async ({ page }) => {
        await gotoGame(page);
        const seqA = await page.evaluate(() => { seedGameRNG(1); return Array.from({ length: 50 }, () => pickEnemyType(60000)); });
        const seqB = await page.evaluate(() => { seedGameRNG(2); return Array.from({ length: 50 }, () => pickEnemyType(60000)); });
        expect(seqA).not.toEqual(seqB);
    });
});

test.describe('Konfiguracja typow wroga', () => {
    test('kazdy typ ma spojna konfiguracje (hp, rozmiar, wartosc punktowa)', async ({ page }) => {
        await gotoGame(page);
        const stats = await page.evaluate(() => {
            const mk = (type) => {
                const e = new Enemy(400, GROUND_LINE_Y, type);
                return { hp: e.hp, width: e.width, height: e.height, scoreValue: e.config.scoreValue };
            };
            return { walker: mk('walker'), walkerFast: mk('walkerFast'), ghost: mk('ghost') };
        });

        expect(stats.walker.hp).toBe(2);
        expect(stats.walkerFast.hp).toBe(1);
        expect(stats.ghost.hp).toBe(1);

        // walkerFast ma byc mniejszy niz walker (czytelnie "inny" na pierwszy rzut oka)
        expect(stats.walkerFast.width).toBeLessThan(stats.walker.width);

        // trudniejsze warianty warte wiecej punktow niz podstawowy walker
        expect(stats.walkerFast.scoreValue).toBeGreaterThan(stats.walker.scoreValue);
        expect(stats.ghost.scoreValue).toBeGreaterThan(stats.walker.scoreValue);
    });

    test('ghost unosi sie nad zasiegiem stojacego gracza', async ({ page }) => {
        await gotoGame(page);
        const gap = await page.evaluate(() => {
            const g = new Enemy(400, GROUND_LINE_Y, 'ghost');
            const gb = g.getBounds();
            const pb = player.getBounds(); // swiezy gracz stoi na groundY
            return pb.y - (gb.y + gb.height); // dodatnie = bezpieczny odstep (gora gracza ponizej dolu ducha)
        });
        expect(gap).toBeGreaterThan(0);
    });
});
