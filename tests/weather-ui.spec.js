// Panel pogody/statystyk (index.html) - inline onclick/onchange odwoluja sie do globalnych
// nazw (changeWeather, setParticleCount, gamespeed...) wprost, wiec test klika/ustawia
// realne kontrolki DOM zamiast wolac funkcje bezposrednio - to jedyny sposob, zeby zlapac
// ewentualne rozjechanie sie panelu z kodem (np. przy przyszlym refaktorze nazw).
const { test, expect } = require('@playwright/test');
const { gotoGame } = require('./helpers');

test.describe('Panel pogody/statystyk', () => {
    test('przycisk deszczu ustawia weatherMode', async ({ page }) => {
        await gotoGame(page);
        await page.click('#uiToggleBtn');
        await page.click('.rain-btn');
        expect(await page.evaluate(() => weatherMode)).toBe('rain');
    });

    test('suwak predkosci gry ustawia gamespeed', async ({ page }) => {
        await gotoGame(page);
        await page.click('#uiToggleBtn');
        await page.fill('#speedSlider', '3');
        await page.dispatchEvent('#speedSlider', 'change');
        expect(await page.evaluate(() => gamespeed)).toBe(3);
    });

    test('przycisk slonca wraca do weatherMode none', async ({ page }) => {
        await gotoGame(page);
        await page.click('#uiToggleBtn');
        await page.click('.rain-btn');
        await page.click('.sun-btn');
        expect(await page.evaluate(() => weatherMode)).toBe('none');
    });
});
