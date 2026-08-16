// ==== KONFIGURACJA TESTÓW E2E (Playwright) ====
// Gra jest statyczną stroną bez buildu (patrz README) - testy odpalają ją zwykłym serwerem
// HTTP (`python3 -m http.server`, ten sam, którego README poleca do lokalnego uruchomienia)
// i sterują stanem gry bezpośrednio przez globalny scope strony (window.gameState, window.player,
// window.enemies, itd. - patrz tests/helpers.js), bo cała gra żyje w zwykłych zmiennych
// globalnych ładowanych przez <script> w index.html, bez modułów.
const fs = require('fs');
const { defineConfig, devices } = require('@playwright/test');

const PORT = 8123;

// W tym konkretnym środowisku deweloperskim przeglądarki Playwrighta są wstępnie zainstalowane
// pod ścieżką niepasującą dokładnie do rewizji oczekiwanej przez npm-ową wersję @playwright/test
// (stąd jawny executablePath zamiast pobierania). To NIE dotyczy CI (GitHub Actions) ani innych
// maszyn - tam process.env.CI jest ustawione i/lub ta ścieżka po prostu nie istnieje, więc
// Playwright normalnie używa przeglądarki zainstalowanej przez `playwright install`.
const sandboxChromium = '/opt/pw-browsers/chromium';
const useSandboxChromium = !process.env.CI && fs.existsSync(sandboxChromium);

module.exports = defineConfig({
    testDir: './tests',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    workers: process.env.CI ? 2 : undefined,
    reporter: process.env.CI ? [['github'], ['list']] : 'list',
    timeout: 30_000,

    use: {
        baseURL: `http://localhost:${PORT}`,
        trace: 'on-first-retry',
        ...(useSandboxChromium ? { launchOptions: { executablePath: sandboxChromium } } : {}),
    },

    projects: [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    ],

    webServer: {
        command: `python3 -m http.server ${PORT}`,
        url: `http://localhost:${PORT}/index.html`,
        reuseExistingServer: !process.env.CI,
        timeout: 10_000,
    },
});
