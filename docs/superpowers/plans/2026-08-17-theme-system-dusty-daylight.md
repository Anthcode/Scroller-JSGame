# Theme System + dusty-daylight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** System tematów (ThemeManager) podmieniający grafikę gracza/wrogów/parallaxu bez restartu gry + deterministyczny pipeline generacji assetów (OpenAI Images API) + pierwszy nowy temat `dusty-daylight` (flat-illustration).

**Architecture:** `theme.js` wchodzi do globalnego łańcucha `<script>` jako drugi plik; obecne assety stają się bundlowanym tematem `classic` (`THEME_DEFAULTS`), z którego `world.js`/`player.js`/`enemy.js` czytają konfigurację grafiki przy parsowaniu. `setTheme(name)` fetchuje `images/themes/<name>/theme.json`, preładowuje wszystkie obrazy i atomowo podmienia warstwy + animData; błąd = fallback do `classic`. Pipeline to jeden skrypt Pythona sterowany `assets-manifest.json`, bez LLM w post-processingu.

**Tech Stack:** czysty JS + Canvas (bez modułów, globalny scope), Playwright e2e (`npm test`, port 8123), Python 3 + Pillow + openai (tylko `tools/`).

**Spec:** `docs/superpowers/specs/2026-08-17-theme-system-dusty-daylight-design.md`

## Global Constraints

- Brak modułów/bundlera: każdy nowy plik JS to zwykły `<script>` w `game-demo.html`; kolejność po zmianie: `core.js → theme.js → feel.js → animatorController.js → world.js → player.js → enemy.js → ghost.js → game.js → script.js`.
- Geometria rozgrywki NIE zależy od tematu: `width/height` encji, insety hitboxów, `GROUND_LINE_Y` — bez zmian (spec §2.3). Testy combat/demo/enemy-variety muszą przechodzić bez modyfikacji.
- Komentarze w kodzie gry po polsku, styl jak w istniejących plikach (komentarze wyjaśniają "dlaczego", odwołują się do plików/PR-ów).
- Testy JS: `npm test` (pełna suita), pojedynczy plik: `npx playwright test tests/theme.spec.js`. Testy Pythona: `python -m unittest discover -s tools -p "test_*.py"`.
- Testy fizyki sterują symulacją przez `runFrames()` z `tests/helpers.js` (wymusza `timeScale=1`, `hitStopMs=0`), nawigacja zawsze do `game-demo.html`, nigdy `index.html`.
- Model obrazkowy przekazywany parametrem `--model` (domyślnie `gpt-image-2`), klucz z env `OPENAI_API_KEY`. Skrypt generacji nigdy nie woła API bez jawnego uruchomienia (idempotencja per `id`, `--dry-run` bez sieci).
- Żywi wrogowie przy podmianie tematu dokańczają życie ze starą grafiką; nowe spawny biorą nową (spec §2.5).
- Commity: każde zadanie kończy się commitem; stopka `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

## Mapa plików

| Plik | Odpowiedzialność |
|---|---|
| Create: `theme.js` | THEME_DEFAULTS (classic), kontrakty stanów, walidacja configu, buildAnimData/rebuildAnimator, applyTheme, setTheme (fetch+preload+fallback) |
| Modify: `world.js` | `Layers.role`, `buildParallaxLayers()` + globale `parallaxLayers/skyLayer/midLayers/groundLayer`, usunięcie `back1..back11`/`layer1..layer11`, `DAY_PHASES` jako `let` |
| Modify: `script.js` | pętla rysowania po nowych globalach warstw, init `?theme=` z URL |
| Modify: `player.js` | `PLAYER_ANIM_DATA` budowane z `currentTheme.player` |
| Modify: `enemy.js` | `ENEMY_TYPES[*].animData` budowane z `currentTheme.enemies` |
| Modify: `game-demo.html` | `<script src="theme.js">`, dropdown tematu w panelu pogody |
| Modify: `tests/parallax.spec.js` | migracja `layer1/layer6` → `groundLayer/midLayers[0]` |
| Create: `tests/theme.spec.js` | testy ThemeManagera (classic, walidacja, swap w locie, fallback, spawny) |
| Create: `tests/theme-dusty.spec.js` | test realnej ścieżki fetch dla dusty-daylight (Etap 4) |
| Create: `assets-manifest.json` | deklaratywny opis assetów do wygenerowania |
| Create: `tools/generate_theme_assets.py` | prompty + API + post-processing + walidacja + log |
| Create: `tools/test_generate_theme_assets.py` | unittesty czystych funkcji pipeline'u (bez API) |
| Create: `images/themes/dusty-daylight/theme.json` + PNG | temat dusty-daylight (Etap 3/4) |
| Modify: `.gitignore` | `images/themes/_raw/` |
| Create: `generation-log.jsonl` | log audytowy generacji (commitowany) |

---

## ETAP 1 — ThemeManager + temat classic (gra wygląda identycznie)

### Task 1: `theme.js` — THEME_DEFAULTS, kontrakty, walidacja

**Files:**
- Create: `theme.js`
- Modify: `game-demo.html:326-334` (blok `<script>`)
- Test: `tests/theme.spec.js`

**Interfaces:**
- Consumes: nic (czysty dodatek; `AnimatorController` dopiero w Task 3/4).
- Produces (czytane przez Taski 2–4 i 9):
  - `THEME_DEFAULTS` — obiekt tematu classic: `{ name, layers: [{src, xspeed, role?}], player: {sheet, frameWidth, frameHeight, states, initialState}, enemies: {walker, walkerFast, ghost}, dayPhases: null }`
  - `let currentTheme` (= THEME_DEFAULTS), `let currentThemeName` (= 'classic')
  - `validateThemeConfig(cfg)` — throws `Error` z opisem, zwraca `undefined` gdy OK
  - `buildAnimData(cfg)` → `{ sheets: [Image|string], frameWidth, frameHeight, states, initialState }`
  - `PLAYER_STATE_CONTRACT`, `ENEMY_STATE_CONTRACT` — tablice nazw wymaganych stanów

- [ ] **Step 1: Napisz failujące testy** — utwórz `tests/theme.spec.js`:

```js
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
});
```

- [ ] **Step 2: Uruchom test — ma failować**

Run: `npx playwright test tests/theme.spec.js`
Expected: FAIL — `currentThemeName is not defined` (theme.js nie istnieje).

- [ ] **Step 3: Utwórz `theme.js`**

Uwaga na wartości: `states` gracza to DOKŁADNA kopia dzisiejszego `PLAYER_ANIM_DATA.states` (`player.js:15-22`), a wrogów — `ENEMY_TYPES.*.animData.states` (`enemy.js:26-31,49-54,77-85`). `frameWidth` ghosta to wyrażenie `2087 / 11` (JS, nie JSON — dlatego classic żyje w kodzie).

```js
// ==== THEME MANAGER ====
// Zrodlo prawdy dla GRAFIKI gry (sheety gracza/wrogow, warstwy paralaksy, opcjonalna
// paleta dnia). Geometria rozgrywki (width/height encji, insety hitboxow, GROUND_LINE_Y)
// celowo NIE nalezy do tematu - podmiana skorki nigdy nie zmienia fizyki/kolizji
// (spec: docs/superpowers/specs/2026-08-17-theme-system-dusty-daylight-design.md, §2.3).
//
// Laduje sie po core.js, przed world.js/player.js/enemy.js - te pliki czytaja
// currentTheme przy parsowaniu (classic), a setTheme() podmienia grafike w runtime.

// Kontrakt stanow animacji - silnik wola te stany po nazwie (player.js/enemy.js/game.js),
// wiec temat bez ktoregos z nich wywalilby sie dopiero w trakcie gry. Walidacja od razu.
const PLAYER_STATE_CONTRACT = ['idle', 'move-left', 'move-right', 'jump', 'hit', 'death'];
const ENEMY_STATE_CONTRACT = ['idle', 'move', 'hit', 'death'];

// Temat "classic" = dzisiejsze assety, bundlowany w kodzie (nie fetchowany), zeby pierwsza
// klatka renderowala sie bez czekania na siec i zeby fallback zawsze mial na co spasc.
// layers: kolejnosc = kolejnosc rysowania (sky pierwszy, potem daleka -> bliska, ground
// ostatni po czasteczkach pogody - patrz anime() w script.js).
const THEME_DEFAULTS = {
    name: 'classic',
    layers: [
        { src: 'images/_11_background.png',       xspeed: 0,    role: 'sky' },
        { src: 'images/_06_hill2.png',            xspeed: 0.2 },
        { src: 'images/_05_hill1.png',            xspeed: 0.3 },
        { src: 'images/_04_bushes.png',           xspeed: 0.46 },
        { src: 'images/_03_distant_trees.png',    xspeed: 0.6 },
        { src: 'images/_02_trees and bushes.png', xspeed: 0.8 },
        { src: 'images/_01_ground.png',           xspeed: 1.0,  role: 'ground' }
    ],
    player: {
        sheet: 'images/player/character.png',
        frameWidth: 150,
        frameHeight: 150,
        states: {
            idle:         { row: 0, frameCount: 10, frameInterval: 50, startFrame: 0, loop: true,  locked: false, next: null },
            'move-left':  { row: 1, frameCount: 10, frameInterval: 50, startFrame: 0, loop: true,  locked: false, next: null },
            'move-right': { row: 2, frameCount: 10, frameInterval: 50, startFrame: 0, loop: true,  locked: false, next: null },
            jump:         { row: 3, frameCount: 10, frameInterval: 50, startFrame: 0, loop: true,  locked: false, next: null },
            hit:          { row: 4, frameCount: 6,  frameInterval: 60, startFrame: 0, loop: false, locked: true,  next: 'idle' },
            death:        { row: 5, frameCount: 10, frameInterval: 90, startFrame: 0, loop: false, locked: true,  next: null }
        },
        initialState: 'idle'
    },
    enemies: {
        walker: {
            sheet: 'images/enemy/enemy.png',
            frameWidth: 110,
            frameHeight: 110,
            states: {
                idle:  { row: 0, frameCount: 1, frameInterval: 200, startFrame: 0, loop: true,  locked: false, next: null },
                move:  { row: 1, frameCount: 2, frameInterval: 150, startFrame: 0, loop: true,  locked: false, next: null },
                hit:   { row: 2, frameCount: 4, frameInterval: 70,  startFrame: 0, loop: false, locked: true,  next: 'idle' },
                death: { row: 3, frameCount: 6, frameInterval: 120, startFrame: 0, loop: false, locked: true,  next: null }
            },
            initialState: 'idle'
        },
        // Wariant "fast" rozni sie od walkera tylko tempem klatek move (110 vs 150ms) -
        // grafika ta sama; tint/rozmiar/statystyki zostaja w ENEMY_TYPES (enemy.js).
        walkerFast: {
            sheet: 'images/enemy/enemy.png',
            frameWidth: 110,
            frameHeight: 110,
            states: {
                idle:  { row: 0, frameCount: 1, frameInterval: 200, startFrame: 0, loop: true,  locked: false, next: null },
                move:  { row: 1, frameCount: 2, frameInterval: 110, startFrame: 0, loop: true,  locked: false, next: null },
                hit:   { row: 2, frameCount: 4, frameInterval: 70,  startFrame: 0, loop: false, locked: true,  next: 'idle' },
                death: { row: 3, frameCount: 6, frameInterval: 120, startFrame: 0, loop: false, locked: true,  next: null }
            },
            initialState: 'idle'
        },
        ghost: {
            sheet: 'images/enemy/ghost.png',
            // Niekwadratowa siatka arkusza - zmierzone pikselowo, patrz komentarz w enemy.js
            // (dlatego classic zyje w JS, nie w JSON: 2087/11 to wyrazenie).
            frameWidth: 2087 / 11,
            frameHeight: 754 / 4,
            states: {
                idle:  { row: 0, frameCount: 1,  frameInterval: 200, startFrame: 0, loop: true,  locked: false, next: null },
                move:  { row: 1, frameCount: 11, frameInterval: 90,  startFrame: 0, loop: true,  locked: false, next: null },
                hit:   { row: 2, frameCount: 4,  frameInterval: 70,  startFrame: 0, loop: false, locked: true,  next: 'idle' },
                death: { row: 3, frameCount: 4,  frameInterval: 110, startFrame: 0, loop: false, locked: true,  next: null }
            },
            initialState: 'idle'
        }
    },
    dayPhases: null // null = paleta domyslna (CLASSIC_DAY_PHASES w world.js)
};

let currentTheme = THEME_DEFAULTS;
let currentThemeName = 'classic';

// Buduje animData w formacie AnimatorController z wpisu tematu. `image` (preladowany
// Image z resolveThemeImages) ma pierwszenstwo przed `sheet` (sciezka - classic laduje
// leniwie jak dotychczas, przegladarka sciaga PNG w tle).
function buildAnimData(cfg) {
    return {
        sheets: [cfg.image || cfg.sheet],
        frameWidth: cfg.frameWidth,
        frameHeight: cfg.frameHeight,
        states: cfg.states,
        initialState: cfg.initialState || 'idle'
    };
}

function assertEntityStates(label, cfg, contract) {
    if (!cfg) throw new Error(`${label}: brak wpisu`);
    if (!cfg.sheet && !cfg.image && !cfg.src) throw new Error(`${label}: brak sheet`);
    if (!cfg.frameWidth || !cfg.frameHeight) throw new Error(`${label}: brak frameWidth/frameHeight`);
    for (const s of contract) {
        if (!cfg.states || !cfg.states[s]) throw new Error(`${label}: brak wymaganego stanu "${s}"`);
    }
}

// Walidacja konfiguracji tematu PRZED zaladowaniem obrazkow - bledny temat ma zostac
// odrzucony jednym czytelnym bledem (i fallbackiem w setTheme), a nie wysypac gre w
// polowie rysowania. walkerFast jest opcjonalny (fallback: kopia walker w applyTheme).
function validateThemeConfig(cfg) {
    if (!cfg || !Array.isArray(cfg.layers) || cfg.layers.length < 2) {
        throw new Error('layers: wymagana tablica z co najmniej warstwami sky i ground');
    }
    const skyCount = cfg.layers.filter(l => l.role === 'sky').length;
    const groundCount = cfg.layers.filter(l => l.role === 'ground').length;
    if (skyCount !== 1) throw new Error(`layers: wymagana dokladnie jedna warstwa role:"sky" (jest ${skyCount})`);
    if (groundCount !== 1) throw new Error(`layers: wymagana dokladnie jedna warstwa role:"ground" (jest ${groundCount})`);
    for (const l of cfg.layers) {
        if (typeof l.xspeed !== 'number') throw new Error('layers: kazda warstwa wymaga liczbowego xspeed');
        if (!l.file && !l.src && !l.image) throw new Error('layers: kazda warstwa wymaga file/src/image');
    }
    assertEntityStates('player', cfg.player, PLAYER_STATE_CONTRACT);
    if (!cfg.enemies) throw new Error('enemies: brak sekcji');
    assertEntityStates('enemies.walker', cfg.enemies.walker, ENEMY_STATE_CONTRACT);
    assertEntityStates('enemies.ghost', cfg.enemies.ghost, ENEMY_STATE_CONTRACT);
    if (cfg.enemies.walkerFast) assertEntityStates('enemies.walkerFast', cfg.enemies.walkerFast, ENEMY_STATE_CONTRACT);
}
```

- [ ] **Step 4: Dodaj `theme.js` do `game-demo.html`** — w bloku skryptów (linia ~326) po `core.js`:

```html
<script src="core.js"></script>
<script src="theme.js"></script>
<script src="feel.js"></script>
```

Zaktualizuj też komentarz nad blokiem (kolejność ładowania) i analogiczny w nagłówku `CLAUDE.md` NIE ruszaj (CLAUDE.md aktualizowany na końcu Etapu 1, Task 4).

- [ ] **Step 5: Testy nowe + pełna suita**

Run: `npx playwright test tests/theme.spec.js` → Expected: PASS (4 testy).
Run: `npm test` → Expected: PASS (zero regresji — theme.js to czysty dodatek).

- [ ] **Step 6: Commit**

```bash
git add theme.js tests/theme.spec.js game-demo.html
git commit -m "feat(theme): THEME_DEFAULTS (classic) + walidacja konfiguracji tematu"
```

---

### Task 2: Refaktor warstw parallax na tablicę budowaną z tematu

**Files:**
- Modify: `world.js:31-92` (usunięcie `back1..back11` i `layer1..layer11`, dodanie `buildParallaxLayers`), `world.js:19-29` (`DAY_PHASES` → `let`)
- Modify: `script.js:30-62` (pętla rysowania)
- Modify: `tests/parallax.spec.js`
- Test: `tests/theme.spec.js` (nowy test), `tests/parallax.spec.js`

**Interfaces:**
- Consumes: `currentTheme` (Task 1), klasa `Layers` (istniejąca, `world.js:46`).
- Produces (używane przez Task 4 i testy):
  - `buildParallaxLayers(layerDefs)` — `layerDefs`: tablica `{image?|src?, xspeed, role?}`; buduje globale
  - `let parallaxLayers` (tablica `Layers`), `let skyLayer`, `let groundLayer`, `let midLayers` (kolejność JSON = daleka→bliska)
  - `Layers.prototype` bez zmian + pole `role` (string|null)
  - `let DAY_PHASES` (reassignowalne), `const CLASSIC_DAY_PHASES` (dzisiejsza tablica)

- [ ] **Step 1: Dopisz failujący test do `tests/theme.spec.js`** (w istniejącym describe):

```js
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
```

- [ ] **Step 2: Uruchom — FAIL** (`parallaxLayers is not defined`): `npx playwright test tests/theme.spec.js`

- [ ] **Step 3: Refaktor `world.js`**

Usuń linie 31-44 (`back1..back11`) i 83-92 (`layer1..layer11` + komentarz o xspeed=1.0 zostaw przeniesiony). W ich miejsce, PO definicji klasy `Layers` (do klasy nie wprowadzaj zmian poza niczym — `role` doklejane z zewnątrz):

```js
// ==== WARSTWY PARALAKSY Z TEMATU ====
// Zamiast hardkodowanych layer1..layer11 - tablica budowana z definicji aktywnego tematu
// (theme.js). Kolejnosc wpisow = kolejnosc rysowania (daleka -> bliska); role "sky" i
// "ground" wyznaczaja punkty wpiecia overlaya dnia/nocy i czasteczek pogody w anime()
// (script.js). xspeed=1.0 dla gruntu - stala jak pozostale mnozniki (regresja PR #18:
// kiedys byl tu gamespeed, przez co grunt jechal z predkoscia do kwadratu).
let parallaxLayers = [];
let skyLayer = null;
let groundLayer = null;
let midLayers = [];

function buildParallaxLayers(layerDefs) {
    parallaxLayers = layerDefs.map(def => {
        let image = def.image;
        if (!image) {
            // Sciezka (classic) - Image laduje sie w tle jak dotychczasowe back1..back11;
            // fetchowane tematy przychodza tu juz z preladowanym def.image (theme.js).
            image = new Image();
            image.src = def.src || def.file;
        }
        const layer = new Layers(image, def.xspeed);
        layer.role = def.role || null;
        return layer;
    });
    skyLayer = parallaxLayers.find(l => l.role === 'sky');
    groundLayer = parallaxLayers.find(l => l.role === 'ground');
    midLayers = parallaxLayers.filter(l => l.role === null);
}

buildParallaxLayers(currentTheme.layers);
```

Oraz zmiana palety dnia (linie ~19-29): dzisiejszą tablicę przemianuj i dodaj reassignowalny wskaźnik:

```js
const CLASSIC_DAY_PHASES = [
    { t: 0.000, r: 10,  g: 10,  b: 60,  a: 0.72 },
    // ... (dokladnie dzisiejsze 9 wpisow, bez zmian wartosci)
];
// let, bo applyTheme (theme.js) podmienia palete na dayPhases tematu (lub przywraca classic).
let DAY_PHASES = CLASSIC_DAY_PHASES;
```

- [ ] **Step 4: Refaktor pętli w `script.js`** — zastąp cały blok linii 30-62 (od `layer11.update()` do `layer1.draw()` włącznie; blok dnia/nocy w środku zostaje bez zmian, poniższy kod go zawiera):

```js
  // Warstwa nieba (xspeed 0) pierwsza - na nia nakladaja sie overlay dnia/nocy i ciala niebieskie.
  skyLayer.update();
  skyLayer.draw();

  const prevDayTime = dayTime;
  dayTime = (dayTime + daySpeed * gamespeed * timeScale) % 1;
  if (gameState === 'playing') maybeTriggerDuskShake(prevDayTime);
  drawDayNightOverlay();
  drawStars();
  drawSunMoon();

  // Warstwy posrednie w kolejnosci definicji tematu (daleka -> bliska).
  for (const layer of midLayers) {
    layer.update();
    layer.draw();
  }

  // SYSTEM CZASTECZEK - rysowany przed warstwa gruntu (jak dotychczas przed layer1).
  updateParticleSystem(deltaTime);

  groundLayer.update();
  groundLayer.draw();
```

(Blok `prevDayTime`/`maybeTriggerDuskShake`/`drawDayNightOverlay` zostaje dokładnie tam gdzie był — między niebem a warstwami pośrednimi.)

- [ ] **Step 5: Migracja `tests/parallax.spec.js`** — trzy podmiany:
  - `layer1.x` → `groundLayer.x` (test game over, linie 23/25),
  - blok linii 41-48:

```js
            groundLayer.update();  // grunt, xspeed 1.0
            midLayers[0].update(); // dalekie wzgorza, xspeed 0.2
            return { ground: groundLayer.speed, farHills: midLayers[0].speed };
        });
        expect(speeds.ground).toBeGreaterThan(speeds.farHills);
        // Regresja PR #18: grunt dostawal kiedys gamespeed jako mnoznik (predkosc do kwadratu)
        // zamiast stalej - przy worldSpeed=4 i xspeed=1.0 ma byc dokladnie 4.
        expect(speeds.ground).toBeCloseTo(4, 5);
```

- [ ] **Step 6: Testy**

Run: `npx playwright test tests/theme.spec.js tests/parallax.spec.js` → PASS.
Run: `npm test` → PASS (całość — weather-ui, combat itd. nie dotykają nazw warstw).

- [ ] **Step 7: Commit**

```bash
git add world.js script.js tests/parallax.spec.js tests/theme.spec.js
git commit -m "refactor(theme): warstwy paralaksy budowane z tematu (parallaxLayers + role sky/ground)"
```

---

### Task 3: `PLAYER_ANIM_DATA` i `ENEMY_TYPES.animData` z tematu

**Files:**
- Modify: `player.js:9-24`
- Modify: `enemy.js:20-106`
- Test: `tests/theme.spec.js` (nowy test) + pełna suita (combat!)

**Interfaces:**
- Consumes: `currentTheme`, `buildAnimData` (Task 1).
- Produces: `PLAYER_ANIM_DATA` i `ENEMY_TYPES[type].animData` — te same nazwy/kształty co dziś (konsumenci: `player.js`, `enemy.js`, `ghost.js`, testy), ale wypełniane z `currentTheme`. Statystyki (`width/height/inset/hp/speedBonus/scoreValue/tint/hover/placeholderColor`) ZOSTAJĄ w `enemy.js` bez zmian.

- [ ] **Step 1: Dopisz failujący test do `tests/theme.spec.js`:**

```js
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
```

- [ ] **Step 2: Uruchom — FAIL** (`sameStates` false — states są dziś zdefiniowane osobno w player.js): `npx playwright test tests/theme.spec.js`

- [ ] **Step 3: `player.js`** — zastąp linie 9-24 (cały literał `PLAYER_ANIM_DATA`):

```js
// ==== GRACZ ====
// Grafika (sheet/klatki/stany) przychodzi z aktywnego tematu (theme.js, THEME_DEFAULTS
// dla classic - tam tez historia zrodel assetu). Ten plik trzyma wylacznie fizyke,
// sterowanie i geometrie hitboxa - identyczne dla kazdego tematu (spec §2.3).
const PLAYER_ANIM_DATA = buildAnimData(currentTheme.player);
```

- [ ] **Step 4: `enemy.js`** — w `ENEMY_TYPES` zastąp trzy literały `animData:` odwołaniami (statystyki i wszystkie komentarze o hitboxach/hover zostają):

```js
const ENEMY_TYPES = {
    walker: {
        animData: buildAnimData(currentTheme.enemies.walker),
        width: 76, height: 76,
        inset: { x: 4, top: 4, bottom: 4 },
        hp: 2,
        speedBonus: 1.2,
        scoreValue: 100,
        placeholderColor: '#D2691E'
    },
    walkerFast: {
        animData: buildAnimData(currentTheme.enemies.walkerFast),
        width: 56, height: 56,
        inset: { x: 3, top: 3, bottom: 3 },
        hp: 1,
        speedBonus: 3.2,
        scoreValue: 150,
        tint: 'rgba(150,70,230,0.45)',
        placeholderColor: '#D2691E'
    },
    ghost: {
        animData: buildAnimData(currentTheme.enemies.ghost),
        width: 80, height: 104,
        inset: { x: 20, top: 20, bottom: 34 },
        hp: 1,
        speedBonus: 0.6,
        scoreValue: 200,
        hover: { groundClearance: 75, amplitude: 8, periodMs: 1400 },
        placeholderColor: '#9fd3ff'
    }
};
```

Komentarz blokowy nad `ENEMY_TYPES` (linie 1-19) zaktualizuj: opisy typów zostają, historia assetów przenosi się do notki "patrz THEME_DEFAULTS w theme.js". Komentarz o niekwadratowej siatce ghosta jest już w theme.js (Task 1).

- [ ] **Step 5: Testy — krytyczny moment regresji**

Run: `npx playwright test tests/theme.spec.js` → PASS.
Run: `npm test` → PASS. Combat/demo/enemy-variety MUSZĄ być zielone bez zmian — jeśli nie, błąd jest w wartościach przepisanych do THEME_DEFAULTS (porównaj diff z oryginałem).

- [ ] **Step 6: Commit**

```bash
git add player.js enemy.js tests/theme.spec.js
git commit -m "refactor(theme): animData gracza i wrogow czytane z aktywnego tematu"
```

---

### Task 4: `applyTheme` + `setTheme` (fetch, preload, fallback), UI i URL

**Files:**
- Modify: `theme.js` (dopisanie sekcji runtime)
- Modify: `script.js` (init z URL na końcu pliku)
- Modify: `game-demo.html` (dropdown w panelu pogody, ~linia 296)
- Modify: `CLAUDE.md` (kolejność skryptów + wzmianka o theme system)
- Test: `tests/theme.spec.js` (testy swap/fallback/spawn)

**Interfaces:**
- Consumes: `buildParallaxLayers` (Task 2), `PLAYER_ANIM_DATA`/`ENEMY_TYPES` (Task 3), `AnimatorController`, `createPlaceholderSheet`, globale `player`/`demoPlayer`/`ghostAnimator`/`DAY_PHASES`/`CLASSIC_DAY_PHASES` (runtime).
- Produces:
  - `applyTheme(theme)` — synchroniczna, atomowa aplikacja ROZWIĄZANEGO tematu (obrazy już załadowane); używana też wprost przez testy
  - `async setTheme(name)` → `Promise<boolean>` (true = załadowany, false = fallback do classic)
  - `rebuildAnimator(entity, animData)`, `loadImage(src)`, `resolveThemeImages(cfg, baseUrl)`
  - dropdown `#themeSelect` w `game-demo.html`, parametr `?theme=<nazwa>` w URL

- [ ] **Step 1: Dopisz failujące testy do `tests/theme.spec.js`.** Na górze pliku dodaj import `startGame, runFrames` z helpers oraz helper wstrzykujący syntetyczny temat:

```js
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
```

I nowe describe:

```js
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
```

- [ ] **Step 2: Uruchom — FAIL** (`applyTheme is not defined`): `npx playwright test tests/theme.spec.js`

- [ ] **Step 3: Dopisz sekcję runtime do `theme.js`** (na końcu pliku):

```js
// ==== PODMIANA TEMATU W RUNTIME ====

// Odbudowuje animator encji na nowym animData, zachowujac biezacy stan animacji (o ile
// istnieje w nowym temacie) - podmiana skorki w trakcie biegu nie moze "teleportowac"
// gracza do idle w polowie skoku.
function rebuildAnimator(entity, animData) {
    const prevState = entity.animator ? entity.animator.currentState : null;
    entity.animator = new AnimatorController(animData);
    if (prevState && animData.states[prevState]) {
        entity.animator.play(prevState, { force: true });
    }
}

// Synchroniczna, atomowa aplikacja ROZWIAZANEGO tematu (wszystkie obrazy juz zaladowane -
// patrz resolveThemeImages). Wolana wylacznie w runtime (setTheme/testy), gdy player/
// demoPlayer/ghostAnimator juz istnieja - stan poczatkowy (classic) kazdy plik buduje
// sam z currentTheme przy parsowaniu.
function applyTheme(theme) {
    buildParallaxLayers(theme.layers);

    Object.assign(PLAYER_ANIM_DATA, buildAnimData(theme.player));
    rebuildAnimator(player, PLAYER_ANIM_DATA);
    rebuildAnimator(demoPlayer, PLAYER_ANIM_DATA);
    // Duch rekordu (ghost.js) dzieli animData gracza; null przed pierwszym startGame().
    if (ghostAnimator) {
        ghostAnimator = new AnimatorController(PLAYER_ANIM_DATA);
    }

    // walkerFast bez wlasnego wpisu = grafika walkera (tint/rozmiar robia reszte, enemy.js).
    const enemyCfgs = theme.enemies.walkerFast
        ? theme.enemies
        : { ...theme.enemies, walkerFast: theme.enemies.walker };
    for (const type of ['walker', 'walkerFast', 'ghost']) {
        ENEMY_TYPES[type].animData = buildAnimData(enemyCfgs[type]);
    }
    // Zywi wrogowie celowo NIE dostaja nowego animatora - dokanczaja zycie ze stara
    // grafika, nowe spawny (new Enemy -> ENEMY_TYPES) biora nowa (spec §2.5).

    DAY_PHASES = theme.dayPhases || CLASSIC_DAY_PHASES;
    currentTheme = theme;
}

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`nie wczytano obrazka: ${src}`));
        img.src = src;
    });
}

// Zamienia wpisy z nazwami plikow (theme.json trzyma sciezki wzgledem katalogu tematu)
// na wpisy z preladowanymi obiektami Image - dopiero komplet pozwala na atomowa podmiane
// bez stanu "w polowie zaladowane" (spec §2.5).
async function resolveThemeImages(cfg, baseUrl) {
    const layers = await Promise.all(cfg.layers.map(async l => ({
        image: await loadImage(baseUrl + l.file),
        xspeed: l.xspeed,
        role: l.role || null
    })));
    const resolveEntity = async (e) => ({
        image: await loadImage(baseUrl + e.sheet),
        frameWidth: e.frameWidth,
        frameHeight: e.frameHeight,
        states: e.states,
        initialState: e.initialState || 'idle'
    });
    const player = await resolveEntity(cfg.player);
    const enemies = {};
    for (const [type, entityCfg] of Object.entries(cfg.enemies)) {
        enemies[type] = await resolveEntity(entityCfg);
    }
    return { name: cfg.name, layers, player, enemies, dayPhases: cfg.dayPhases || null };
}

// Ladowanie tematu po nazwie: classic bez sieci (bundlowany), reszta przez fetch
// theme.json + preload obrazow. KAZDY blad (404, zly JSON, brak stanu, brak obrazka)
// konczy sie fallbackiem do classic i false - gra nigdy nie zostaje bez grafiki.
async function setTheme(name) {
    if (name === 'classic') {
        applyTheme(THEME_DEFAULTS);
        currentThemeName = 'classic';
        return true;
    }
    try {
        const res = await fetch(`images/themes/${name}/theme.json`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const cfg = await res.json();
        validateThemeConfig(cfg);
        const theme = await resolveThemeImages(cfg, `images/themes/${name}/`);
        applyTheme(theme);
        currentThemeName = name;
        return true;
    } catch (err) {
        console.warn(`ThemeManager: temat "${name}" odrzucony (${err.message}) - fallback do classic`);
        applyTheme(THEME_DEFAULTS);
        currentThemeName = 'classic';
        return false;
    }
}
```

- [ ] **Step 4: Init z URL — koniec `script.js`** (po `requestAnimationFrame(anime);`):

```js
// ?theme=X w URL laduje temat na starcie (po zaladowaniu wszystkich skryptow - applyTheme
// dotyka player/demoPlayer, ktore powstaja wyzej w tym pliku i w game.js).
(function initThemeFromUrl() {
    const themeParam = new URLSearchParams(location.search).get('theme');
    if (themeParam && themeParam !== 'classic') setTheme(themeParam);
})();
```

- [ ] **Step 5: Dropdown w `game-demo.html`** — w panelu pogody, po control-group "Szybkość dnia" (~linia 301):

```html
  <div class="control-group">
    <label>Temat:</label>
    <select id="themeSelect" onchange="setTheme(this.value)">
      <option value="classic">classic</option>
    </select>
  </div>
```

(Opcja `dusty-daylight` dochodzi w Task 9, gdy temat istnieje.)

- [ ] **Step 6: Testy**

Run: `npx playwright test tests/theme.spec.js` → PASS (wszystkie z Tasków 1-4).
Run: `npm test` → PASS.

- [ ] **Step 7: Aktualizacja `CLAUDE.md`** — w sekcji Architecture: nowa kolejność ładowania (z `theme.js`), akapit (2-3 zdania) o theme systemie: temat classic w `THEME_DEFAULTS`, `setTheme()`/`?theme=`, geometria niezależna od tematu.

- [ ] **Step 8: Commit**

```bash
git add theme.js script.js game-demo.html tests/theme.spec.js CLAUDE.md
git commit -m "feat(theme): setTheme/applyTheme - podmiana tematu w locie z fallbackiem do classic"
```

---

## ETAP 2 — Manifest + skrypt generacji

### Task 5: `assets-manifest.json` + budowa promptów + `--dry-run`

**Files:**
- Create: `assets-manifest.json`
- Create: `tools/generate_theme_assets.py`
- Create: `tools/test_generate_theme_assets.py`
- Modify: `.gitignore` (dopisz linię `images/themes/_raw/`)

**Interfaces:**
- Consumes: nic z JS; Python 3 + stdlib (Pillow/openai dopiero w Taskach 6-7).
- Produces:
  - `assets-manifest.json` — patrz schemat niżej; Task 9 (theme.json) musi być zgodny z `frame_count`/`frame_size` stąd
  - `load_manifest(path) -> dict`, `build_prompt(entry, theme_cfg) -> str`, `select_entries(manifest, only_ids) -> list`
  - CLI: `python tools/generate_theme_assets.py --dry-run [--only ID] [--manifest PATH]`

- [ ] **Step 1: Napisz failujący test** — `tools/test_generate_theme_assets.py`:

```python
# Unittesty czystych funkcji pipeline'u generacji - bez sieci, bez API.
# Uruchamianie: python -m unittest discover -s tools -p "test_*.py"
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(__file__))
from generate_theme_assets import load_manifest, build_prompt, select_entries

MANIFEST_FIXTURE = {
    "themes": {
        "dusty-daylight": {
            "style_skeleton": "flat vector illustration, clean bold outlines",
            "world": "sun-bleached desert canyon",
            "palette": ["#E8A33D", "#C96F2B"],
            "character": "agile ninja runner",
            "enemy_walker": "round spiky ball creature",
            "enemy_ghost": "translucent dusty spirit"
        }
    },
    "assets": [
        {"id": "dusty_player_run", "theme": "dusty-daylight", "kind": "spritesheet",
         "entity": "player", "action": "run", "frame_count": 8, "grid": [4, 2],
         "frame_size": 256, "api_size": "1024x1024", "background": "transparent",
         "style_notes": "dynamic running cycle"},
        {"id": "dusty_bg_sky", "theme": "dusty-daylight", "kind": "background",
         "api_size": "1536x1024", "background": "opaque", "output_file": "bg_sky.png",
         "style_notes": "clear gradient desert sky"}
    ]
}

class BuildPromptTest(unittest.TestCase):
    def setUp(self):
        self.theme = MANIFEST_FIXTURE["themes"]["dusty-daylight"]

    def test_spritesheet_prompt_zawiera_szkielet_siatke_palete_i_opis_encji(self):
        entry = MANIFEST_FIXTURE["assets"][0]
        prompt = build_prompt(entry, self.theme)
        self.assertIn("flat vector illustration", prompt)
        self.assertIn("agile ninja runner", prompt)       # entity=player -> opis postaci
        self.assertIn("8 frames", prompt)
        self.assertIn("4 columns", prompt)
        self.assertIn("2 rows", prompt)
        self.assertIn("#E8A33D", prompt)
        self.assertIn("transparent background", prompt)
        self.assertIn("dynamic running cycle", prompt)

    def test_background_prompt_zawiera_swiat_i_tiling(self):
        entry = MANIFEST_FIXTURE["assets"][1]
        prompt = build_prompt(entry, self.theme)
        self.assertIn("sun-bleached desert canyon", prompt)
        self.assertIn("seamless", prompt)
        self.assertNotIn("frames", prompt)

class ManifestTest(unittest.TestCase):
    def test_load_manifest_czyta_plik(self):
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as f:
            json.dump(MANIFEST_FIXTURE, f)
            path = f.name
        try:
            m = load_manifest(path)
            self.assertEqual(len(m["assets"]), 2)
        finally:
            os.unlink(path)

    def test_select_entries_filtruje_po_only(self):
        sel = select_entries(MANIFEST_FIXTURE, ["dusty_bg_sky"])
        self.assertEqual([e["id"] for e in sel], ["dusty_bg_sky"])
        self.assertEqual(len(select_entries(MANIFEST_FIXTURE, None)), 2)

if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Uruchom — FAIL** (brak modułu): `python -m unittest discover -s tools -p "test_*.py"`

- [ ] **Step 3: Utwórz `assets-manifest.json`** (kompletna zawartość — 15 wpisów):

```json
{
  "themes": {
    "dusty-daylight": {
      "style_skeleton": "flat vector illustration, clean bold outlines, subtle gradients, cel shading, 2D side-view mobile game asset, consistent top-left lighting, no text, no watermark, no border",
      "world": "sun-bleached desert canyon in warm golden daylight, dusty orange rock formations, sparse dry scrub",
      "palette": ["#E8A33D", "#C96F2B", "#7A4A21", "#F5E6C8", "#4E7E9E"],
      "character": "agile ninja runner in dark indigo outfit with flowing headband",
      "enemy_walker": "round spiky ball creature with angry cartoon face, sandy yellow body",
      "enemy_ghost": "translucent dusty desert spirit with trailing wispy tail"
    }
  },
  "assets": [
    { "id": "dusty_player_idle",  "theme": "dusty-daylight", "kind": "spritesheet", "entity": "player", "action": "idle",  "frame_count": 6, "grid": [3, 2], "frame_size": 256, "api_size": "1024x1024", "background": "transparent", "style_notes": "standing ready pose, subtle breathing bounce between frames" },
    { "id": "dusty_player_run",   "theme": "dusty-daylight", "kind": "spritesheet", "entity": "player", "action": "run",   "frame_count": 8, "grid": [4, 2], "frame_size": 256, "api_size": "1024x1024", "background": "transparent", "style_notes": "dynamic running cycle, legs in different phases of stride" },
    { "id": "dusty_player_jump",  "theme": "dusty-daylight", "kind": "spritesheet", "entity": "player", "action": "jump",  "frame_count": 6, "grid": [3, 2], "frame_size": 256, "api_size": "1024x1024", "background": "transparent", "style_notes": "jump arc: crouch, launch, apex, falling, landing" },
    { "id": "dusty_player_hit",   "theme": "dusty-daylight", "kind": "spritesheet", "entity": "player", "action": "hit",   "frame_count": 4, "grid": [2, 2], "frame_size": 256, "api_size": "1024x1024", "background": "transparent", "style_notes": "recoiling from a hit, flinching backwards" },
    { "id": "dusty_player_death", "theme": "dusty-daylight", "kind": "spritesheet", "entity": "player", "action": "death", "frame_count": 8, "grid": [4, 2], "frame_size": 256, "api_size": "1024x1024", "background": "transparent", "style_notes": "collapsing to the ground, progressive fall" },
    { "id": "dusty_walker_move",  "theme": "dusty-daylight", "kind": "spritesheet", "entity": "walker", "action": "move",  "frame_count": 6, "grid": [3, 2], "frame_size": 160, "api_size": "1024x1024", "background": "transparent", "style_notes": "rolling forward, spikes rotating between frames" },
    { "id": "dusty_walker_hit",   "theme": "dusty-daylight", "kind": "spritesheet", "entity": "walker", "action": "hit",   "frame_count": 4, "grid": [2, 2], "frame_size": 160, "api_size": "1024x1024", "background": "transparent", "style_notes": "squashed and recoiling, pained expression" },
    { "id": "dusty_walker_death", "theme": "dusty-daylight", "kind": "spritesheet", "entity": "walker", "action": "death", "frame_count": 6, "grid": [3, 2], "frame_size": 160, "api_size": "1024x1024", "background": "transparent", "style_notes": "deflating and crumbling to dust, progressive disintegration" },
    { "id": "dusty_ghost_move",   "theme": "dusty-daylight", "kind": "spritesheet", "entity": "ghost",  "action": "move",  "frame_count": 6, "grid": [3, 2], "frame_size": 160, "api_size": "1024x1024", "background": "transparent", "style_notes": "floating undulation, tail waving between frames" },
    { "id": "dusty_ghost_hit",    "theme": "dusty-daylight", "kind": "spritesheet", "entity": "ghost",  "action": "hit",   "frame_count": 4, "grid": [2, 2], "frame_size": 160, "api_size": "1024x1024", "background": "transparent", "style_notes": "dispersing slightly, startled expression" },
    { "id": "dusty_ghost_death",  "theme": "dusty-daylight", "kind": "spritesheet", "entity": "ghost",  "action": "death", "frame_count": 4, "grid": [2, 2], "frame_size": 160, "api_size": "1024x1024", "background": "transparent", "style_notes": "fading out and dissolving into dust motes" },
    { "id": "dusty_bg_sky",        "theme": "dusty-daylight", "kind": "background", "api_size": "1536x1024", "background": "opaque",      "output_file": "bg_sky.png",        "style_notes": "clear gradient desert sky, warm haze near horizon, few soft distant clouds, no ground" },
    { "id": "dusty_bg_far_canyon", "theme": "dusty-daylight", "kind": "background", "api_size": "1536x1024", "background": "transparent", "output_file": "bg_far_canyon.png", "style_notes": "distant canyon mesa silhouettes in lower half, hazy atmospheric perspective, empty transparent sky above" },
    { "id": "dusty_bg_mid_mesas",  "theme": "dusty-daylight", "kind": "background", "api_size": "1536x1024", "background": "transparent", "output_file": "bg_mid_mesas.png",  "style_notes": "mid-distance rock formations and mesas in lower half, sharper than background, empty transparent sky above" },
    { "id": "dusty_bg_near_scrub", "theme": "dusty-daylight", "kind": "background", "api_size": "1536x1024", "background": "transparent", "output_file": "bg_near_scrub.png", "style_notes": "near-ground dry bushes, cacti and rocks along the bottom third, empty transparent area above" },
    { "id": "dusty_bg_ground",     "theme": "dusty-daylight", "kind": "background", "api_size": "1536x1024", "background": "transparent", "output_file": "bg_ground.png",     "ground_top_px": 116, "style_notes": "flat walkable desert ground strip along the bottom edge, top surface of the ground at about 1/5 of image height from the bottom, cracked dry earth texture, empty transparent area above" }
  ]
}
```

- [ ] **Step 4: Utwórz `tools/generate_theme_assets.py`** — na razie manifest + prompty + CLI z `--dry-run`:

```python
#!/usr/bin/env python3
"""Pipeline generacji assetow tematu (spec: docs/superpowers/specs/2026-08-17-*.md, §3).

Przebieg: assets-manifest.json -> prompt -> OpenAI Images API -> images/themes/_raw/
-> post-processing (Pillow, bez LLM) -> images/themes/<temat>/ + generation-log.jsonl.

Uruchamianie (z korzenia repo):
  python tools/generate_theme_assets.py --dry-run              # tylko wypisz prompty
  python tools/generate_theme_assets.py                        # generuj brakujace + zbuduj wyjscia
  python tools/generate_theme_assets.py --only dusty_player_run --force
  python tools/generate_theme_assets.py --validate-only        # sprawdz gotowe pliki bez API
Wymaga: pip install pillow openai; klucz w env OPENAI_API_KEY (poza --dry-run/--validate-only).
"""
import argparse
import json
import os
import sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_MANIFEST = os.path.join(REPO_ROOT, "assets-manifest.json")
RAW_DIR = os.path.join(REPO_ROOT, "images", "themes", "_raw")
LOG_PATH = os.path.join(REPO_ROOT, "generation-log.jsonl")


def load_manifest(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def select_entries(manifest, only_ids):
    entries = manifest["assets"]
    if only_ids:
        wanted = set(only_ids)
        entries = [e for e in entries if e["id"] in wanted]
        missing = wanted - {e["id"] for e in entries}
        if missing:
            raise SystemExit(f"Nieznane id w --only: {sorted(missing)}")
    return entries


def build_prompt(entry, theme_cfg):
    """Sklada finalny prompt z jednolitego szkieletu tematu + pol wpisu.

    Ten sam szkielet w kazdym prompcie tematu = spojnosc stylu miedzy assetami
    (spec §3.2). Spritesheet = jeden obraz z siatka klatek (spec §3.3 pkt 2).
    """
    palette = ", ".join(theme_cfg["palette"])
    if entry["kind"] == "spritesheet":
        subject = {
            "player": theme_cfg["character"],
            "walker": theme_cfg["enemy_walker"],
            "ghost": theme_cfg["enemy_ghost"],
        }[entry["entity"]]
        cols, rows = entry["grid"]
        background = ("transparent background"
                      if entry["background"] == "transparent" else "plain background")
        return (
            f"{theme_cfg['style_skeleton']}. "
            f"Sprite sheet: {subject}, {entry['action']} animation, "
            f"{entry['frame_count']} frames arranged in a strict uniform grid of "
            f"{cols} columns and {rows} rows, every frame the exact same character "
            f"at the same scale, centered in its grid cell. {entry['style_notes']}. "
            f"Color palette: {palette}. {background}."
        )
    # background (warstwa paralaksy)
    return (
        f"{theme_cfg['style_skeleton']}. "
        f"Game background parallax layer: {theme_cfg['world']}. {entry['style_notes']}. "
        f"Seamless horizontally tileable, left and right edges match perfectly. "
        f"Color palette: {palette}."
    )


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--manifest", default=DEFAULT_MANIFEST)
    ap.add_argument("--only", action="append", help="tylko wpis(y) o tym id")
    ap.add_argument("--force", action="store_true", help="regeneruj mimo istniejacego raw")
    ap.add_argument("--model", default="gpt-image-2")
    ap.add_argument("--dry-run", action="store_true", help="wypisz prompty, bez API i plikow")
    ap.add_argument("--validate-only", action="store_true", help="tylko walidacja gotowych plikow")
    args = ap.parse_args(argv)

    manifest = load_manifest(args.manifest)
    entries = select_entries(manifest, args.only)

    if args.dry_run:
        for entry in entries:
            theme_cfg = manifest["themes"][entry["theme"]]
            print(f"=== {entry['id']} ({entry['kind']}, {entry['api_size']}) ===")
            print(build_prompt(entry, theme_cfg))
            print()
        return 0

    raise SystemExit("Generacja/walidacja dochodzi w Taskach 6-7 tego planu.")


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 5: `.gitignore`** — dopisz linię `images/themes/_raw/`.

- [ ] **Step 6: Testy + dry-run**

Run: `python -m unittest discover -s tools -p "test_*.py"` → OK (4 testy).
Run: `python tools/generate_theme_assets.py --dry-run` → wypisuje 16 promptów, przejrzyj sanity (paleta, siatki, brak "frames" w tłach).

- [ ] **Step 7: Commit**

```bash
git add assets-manifest.json tools/generate_theme_assets.py tools/test_generate_theme_assets.py .gitignore
git commit -m "feat(pipeline): manifest assetow + generator promptow z --dry-run"
```

---

### Task 6: Post-processing (Pillow): cięcie, trim, składanie sheetów, tiling, walidacja

**Files:**
- Modify: `tools/generate_theme_assets.py`
- Modify: `tools/test_generate_theme_assets.py`

**Interfaces:**
- Consumes: Pillow (`PIL.Image`, `PIL.ImageOps`); stałe/układy z manifestu (Task 5).
- Produces (używane przez Task 7 przy budowie wyjść):
  - `slice_grid(img, cols, rows) -> list[Image]` (row-major)
  - `trim_and_center(frame, frame_size, fill_ratio=0.78) -> Image` (RGBA, kwadrat `frame_size`)
  - `compose_player_sheet(frames_by_action, frame_size) -> Image` — wiersze: idle, move-left (lustro run), move-right (=run), jump, hit, death
  - `compose_enemy_sheet(frames_by_action, frame_size) -> Image` — wiersze: idle (=move[0]), move, hit, death
  - `make_tileable(img, blend_px=64) -> Image` (rozmiar zachowany, krawędzie się zszywają)
  - `process_background(img, out_size=(800, 600), blend_px=64) -> Image`
  - `validate_sheet(sheet, frame_size, rows_spec)` / `validate_ground(img, ground_top_px=116)` — raise `ValueError` przy błędzie
  - `PLAYER_ROW_ORDER = ['idle', 'move-left', 'move-right', 'jump', 'hit', 'death']`, `ENEMY_ROW_ORDER = ['idle', 'move', 'hit', 'death']`

- [ ] **Step 1: Dopisz failujące testy do `tools/test_generate_theme_assets.py`:**

```python
from PIL import Image
from generate_theme_assets import (
    slice_grid, trim_and_center, compose_player_sheet, compose_enemy_sheet,
    make_tileable, process_background, validate_sheet, validate_ground,
    PLAYER_ROW_ORDER, ENEMY_ROW_ORDER,
)

def kolorowa_klatka(color, size=(100, 100), box=(20, 30, 70, 80)):
    """Przezroczysta klatka z kolorowym prostokatem - synteza 'postaci' z marginesem."""
    img = Image.new("RGBA", size, (0, 0, 0, 0))
    blok = Image.new("RGBA", (box[2] - box[0], box[3] - box[1]), color)
    img.paste(blok, (box[0], box[1]))
    return img

class SliceTrimTest(unittest.TestCase):
    def test_slice_grid_tnie_rowno_row_major(self):
        grid = Image.new("RGBA", (200, 100))
        grid.paste(kolorowa_klatka((255, 0, 0, 255), (100, 100)), (0, 0))
        grid.paste(kolorowa_klatka((0, 255, 0, 255), (100, 100)), (100, 0))
        frames = slice_grid(grid, 2, 1)
        self.assertEqual(len(frames), 2)
        self.assertEqual(frames[0].size, (100, 100))
        self.assertEqual(frames[0].getpixel((45, 55))[:3], (255, 0, 0))
        self.assertEqual(frames[1].getpixel((45, 55))[:3], (0, 255, 0))

    def test_trim_and_center_normalizuje_wypelnienie(self):
        frame = kolorowa_klatka((0, 0, 255, 255))
        out = trim_and_center(frame, 128, fill_ratio=0.75)
        self.assertEqual(out.size, (128, 128))
        bbox = out.getbbox()
        w = bbox[2] - bbox[0]; h = bbox[3] - bbox[1]
        self.assertAlmostEqual(max(w, h), int(128 * 0.75), delta=2)  # skala znormalizowana
        cx = (bbox[0] + bbox[2]) / 2
        self.assertAlmostEqual(cx, 64, delta=2)                       # wysrodkowana

class ComposeTest(unittest.TestCase):
    def test_compose_player_sheet_uklad_wierszy_i_lustro(self):
        run = [kolorowa_klatka((0, 255, 0, 255), box=(10, 30, 40, 80)) for _ in range(8)]
        frames = {"idle": [kolorowa_klatka((255, 0, 0, 255))] * 6, "run": run,
                  "jump": [kolorowa_klatka((0, 0, 255, 255))] * 6,
                  "hit": [kolorowa_klatka((255, 255, 0, 255))] * 4,
                  "death": [kolorowa_klatka((255, 0, 255, 255))] * 8}
        sheet = compose_player_sheet(frames, 128)
        self.assertEqual(sheet.size, (128 * 8, 128 * 6))  # max 8 klatek x 6 wierszy
        # wiersz 1 = move-left (lustro run), wiersz 2 = move-right (run bez zmian):
        left_row = sheet.crop((0, 128, 128, 256))
        right_row = sheet.crop((0, 256, 128, 384))
        lb, rb = left_row.getbbox(), right_row.getbbox()
        # asymetryczny blok (10..40 z lewej) po lustrze laduje po prawej stronie klatki
        self.assertNotEqual(lb[0], rb[0])

    def test_compose_enemy_sheet_idle_z_pierwszej_klatki_move(self):
        frames = {"move": [kolorowa_klatka((0, 255, 0, 255))] * 6,
                  "hit": [kolorowa_klatka((255, 255, 0, 255))] * 4,
                  "death": [kolorowa_klatka((255, 0, 255, 255))] * 6}
        sheet = compose_enemy_sheet(frames, 128)
        self.assertEqual(sheet.size, (128 * 6, 128 * 4))
        idle = sheet.crop((0, 0, 128, 128))
        move0 = sheet.crop((0, 128, 128, 256))
        self.assertEqual(list(idle.getdata()), list(move0.getdata()))

class BackgroundTest(unittest.TestCase):
    def test_make_tileable_zszywa_krawedzie(self):
        # lewa polowa czerwona, prawa niebieska - najgorszy przypadek szwu
        img = Image.new("RGBA", (400, 100), (255, 0, 0, 255))
        img.paste(Image.new("RGBA", (200, 100), (0, 0, 255, 255)), (200, 0))
        out = make_tileable(img, blend_px=64)
        self.assertEqual(out.size, (400, 100))
        left = out.getpixel((0, 50)); right = out.getpixel((399, 50))
        roznica = sum(abs(a - b) for a, b in zip(left[:3], right[:3]))
        self.assertLess(roznica, 90)  # krawedzie zbiezne (bez blendu byloby ~510)

    def test_process_background_kadruje_do_800x600(self):
        img = Image.new("RGBA", (1536, 1024), (200, 150, 100, 255))
        out = process_background(img)
        self.assertEqual(out.size, (800, 600))

class ValidateTest(unittest.TestCase):
    def test_validate_sheet_wykrywa_pusta_klatke(self):
        rows_spec = [("move", 2)]
        sheet = Image.new("RGBA", (128 * 2, 128), (0, 0, 0, 0))
        sheet.paste(kolorowa_klatka((0, 255, 0, 255), (128, 128)), (0, 0))  # klatka 1 pusta
        with self.assertRaises(ValueError):
            validate_sheet(sheet, 128, rows_spec)

    def test_validate_ground_wymaga_krycia_w_pasie_gruntu(self):
        ok = Image.new("RGBA", (800, 600), (0, 0, 0, 0))
        ok.paste(Image.new("RGBA", (800, 116), (150, 100, 50, 255)), (0, 600 - 116))
        validate_ground(ok, 116)  # nie rzuca
        with self.assertRaises(ValueError):
            validate_ground(Image.new("RGBA", (800, 600), (0, 0, 0, 0)), 116)

```

- [ ] **Step 2: Uruchom — FAIL** (ImportError): `python -m unittest discover -s tools -p "test_*.py"`

- [ ] **Step 3: Implementacja w `tools/generate_theme_assets.py`** (import `from PIL import Image, ImageOps` na górze, w try/except z komunikatem `pip install pillow`):

```python
PLAYER_ROW_ORDER = ["idle", "move-left", "move-right", "jump", "hit", "death"]
ENEMY_ROW_ORDER = ["idle", "move", "hit", "death"]


def slice_grid(img, cols, rows):
    """Tnie obraz-siatke na rowne komorki, row-major (jak czyta je czlowiek)."""
    w, h = img.size
    cw, ch = w // cols, h // rows
    return [img.crop((c * cw, r * ch, (c + 1) * cw, (r + 1) * ch))
            for r in range(rows) for c in range(cols)]


def trim_and_center(frame, frame_size, fill_ratio=0.78):
    """Trim przezroczystego marginesu + normalizacja skali i wysrodkowanie.

    Kontrakt kompozycyjny (spec §2.3): postac wypelnia ~fill_ratio klatki, wiec insety
    hitboxow silnika (strojone na classic) pasuja bez zmian. Normalizuje tez rozne
    'przyblizenia' miedzy klatkami z generacji (model nie trzyma skali idealnie).
    """
    frame = frame.convert("RGBA")
    bbox = frame.getbbox()
    if bbox is None:
        raise ValueError("pusta klatka (same przezroczyste piksele)")
    content = frame.crop(bbox)
    target = int(frame_size * fill_ratio)
    scale = target / max(content.size)
    content = content.resize((max(1, round(content.size[0] * scale)),
                              max(1, round(content.size[1] * scale))), Image.LANCZOS)
    out = Image.new("RGBA", (frame_size, frame_size), (0, 0, 0, 0))
    out.paste(content, ((frame_size - content.size[0]) // 2,
                        (frame_size - content.size[1]) // 2))
    return out


def _compose_rows(rows, frame_size):
    max_cols = max(len(frames) for _, frames in rows)
    sheet = Image.new("RGBA", (frame_size * max_cols, frame_size * len(rows)), (0, 0, 0, 0))
    for r, (_, frames) in enumerate(rows):
        for c, frame in enumerate(frames):
            sheet.paste(frame, (c * frame_size, r * frame_size))
    return sheet


def compose_player_sheet(frames_by_action, frame_size):
    """Sklada sheet gracza w ukladzie silnika (PLAYER_ROW_ORDER; theme.json Task 9).

    move-left to programowe lustro run - tak samo jak w classic
    (tools/compose_player_sheet.py), model nie musi generowac biegu w obie strony.
    """
    run = frames_by_action["run"]
    rows = [
        ("idle", frames_by_action["idle"]),
        ("move-left", [ImageOps.mirror(f) for f in run]),
        ("move-right", run),
        ("jump", frames_by_action["jump"]),
        ("hit", frames_by_action["hit"]),
        ("death", frames_by_action["death"]),
    ]
    return _compose_rows(rows, frame_size)


def compose_enemy_sheet(frames_by_action, frame_size):
    """Sheet wroga (ENEMY_ROW_ORDER): idle = pierwsza klatka move (jak stary walker,
    ktory w idle po prostu stal na pierwszej klatce chodu)."""
    rows = [
        ("idle", [frames_by_action["move"][0]]),
        ("move", frames_by_action["move"]),
        ("hit", frames_by_action["hit"]),
        ("death", frames_by_action["death"]),
    ]
    return _compose_rows(rows, frame_size)


def make_tileable(img, blend_px=64):
    """Zszywa pozioma petle: crossfade prawej krawedzi w lewa (Layers tile'uja w poziomie,
    surowa generacja nigdy nie jest seamless - spec §3.3 pkt 4). Po blendzie piksel x=0
    zaczyna sie dokladnie trescia z x=w-blend_px, wiec styk prawy->lewy jest ciagly."""
    w, h = img.size
    left = img.crop((0, 0, blend_px, h))
    right = img.crop((w - blend_px, 0, w, h))
    mask = Image.new("L", (blend_px, h))
    for x in range(blend_px):
        mask.paste(int(255 * (1 - x / blend_px)), (x, 0, x + 1, h))
    blended = Image.composite(right, left, mask)  # maska 255 -> piksel z right
    out = img.copy()
    out.paste(blended, (0, 0))
    # odcinamy zuzyty pas z prawej i rozciagamy z powrotem do pelnej szerokosci
    return out.crop((0, 0, w - blend_px, h)).resize((w, h), Image.LANCZOS)


def process_background(img, out_size=(800, 600), blend_px=64):
    """1536x1024 -> skala do wysokosci 600 (900x600) -> srodkowy kadr 800 -> tiling.
    Wyjscie = dokladny rozmiar canvasu (Layers rysuja w canvas.width/height 1:1,
    core.js), zeby uniknac rozciagania w runtime."""
    img = img.convert("RGBA")
    scale = out_size[1] / img.size[1]
    img = img.resize((round(img.size[0] * scale), out_size[1]), Image.LANCZOS)
    left = (img.size[0] - out_size[0]) // 2
    img = img.crop((left, 0, left + out_size[0], out_size[1]))
    return make_tileable(img, blend_px)


def validate_sheet(sheet, frame_size, rows_spec):
    """rows_spec: [(nazwa_akcji, frame_count), ...] w kolejnosci wierszy sheetu.
    Kazda zadeklarowana klatka musi miec >1% nieprzezroczystych pikseli (spec §3.3 pkt 5)."""
    for r, (action, count) in enumerate(rows_spec):
        for c in range(count):
            frame = sheet.crop((c * frame_size, r * frame_size,
                                (c + 1) * frame_size, (r + 1) * frame_size))
            alpha = frame.getchannel("A")
            opaque = sum(1 for a in alpha.getdata() if a > 16)
            if opaque < frame_size * frame_size * 0.01:
                raise ValueError(f"pusta klatka: wiersz '{action}', kolumna {c}")


def validate_ground(img, ground_top_px=116):
    """Pas gruntu (dolne ground_top_px pikseli) musi byc niemal w pelni kryjacy -
    GROUND_LINE_Y (core.js) zaklada powierzchnie na tej wysokosci."""
    w, h = img.size
    band = img.crop((0, h - ground_top_px, w, h)).getchannel("A")
    data = band.getdata()
    coverage = sum(1 for a in data if a > 200) / len(data)
    if coverage < 0.9:
        raise ValueError(f"pas gruntu ma krycie {coverage:.0%} < 90% - powierzchnia "
                         f"biegu nie pokryje GROUND_LINE_Y")
```

- [ ] **Step 4: Testy**

Run: `python -m unittest discover -s tools -p "test_*.py"` → OK (wszystkie).

- [ ] **Step 5: Commit**

```bash
git add tools/generate_theme_assets.py tools/test_generate_theme_assets.py
git commit -m "feat(pipeline): post-processing Pillow - trim/compose/tiling/walidacja"
```

---

### Task 7: Integracja z API, log, idempotencja, budowa wyjść

**Files:**
- Modify: `tools/generate_theme_assets.py` (sekcja API + `main`)
- Modify: `tools/test_generate_theme_assets.py`

**Interfaces:**
- Consumes: `build_prompt`, funkcje post-processingu (Taski 5-6); pakiet `openai` (import leniwy — tylko gdy realna generacja).
- Produces:
  - `generate_entry(client, entry, theme_cfg, model, raw_dir, log_path, force=False) -> str` (ścieżka raw PNG; client wstrzykiwany = testowalne bez sieci)
  - `build_theme_outputs(manifest, theme_name, raw_dir, out_dir)` — składa `player.png`/`enemy.png`/`ghost.png`/`bg_*.png` z rawów + walidacje
  - `append_log(log_path, record)` — dopisuje JSONL: `{id, model, prompt, api_size, response_id, sha256, created_at}`
  - kompletne CLI: `--dry-run | --validate-only | [--only ID]... [--force] [--model M]`

- [ ] **Step 1: Failujące testy** (dopisz do `tools/test_generate_theme_assets.py`):

```python
import io

class FakeImagesClient:
    """Podstawka za OpenAI client - zwraca 1-kolorowy PNG zakodowany w b64."""
    def __init__(self):
        self.calls = []
        class _Images:
            def __init__(self, outer): self.outer = outer
            def generate(self, **kwargs):
                self.outer.calls.append(kwargs)
                import base64
                w, h = map(int, kwargs["size"].split("x"))
                buf = io.BytesIO()
                Image.new("RGBA", (w, h), (10, 200, 30, 255)).save(buf, "PNG")
                class _Resp: pass
                resp = _Resp()
                datum = _Resp()
                datum.b64_json = base64.b64encode(buf.getvalue()).decode()
                resp.data = [datum]
                resp.created = 1750000000
                return resp
        self.images = _Images(self)

class GenerateEntryTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.log = os.path.join(self.tmp, "log.jsonl")
        self.entry = MANIFEST_FIXTURE["assets"][0]
        self.theme = MANIFEST_FIXTURE["themes"]["dusty-daylight"]

    def test_generuje_raw_loguje_i_jest_idempotentny(self):
        from generate_theme_assets import generate_entry
        client = FakeImagesClient()
        path = generate_entry(client, self.entry, self.theme, "gpt-image-2", self.tmp, self.log)
        self.assertTrue(os.path.exists(path))
        self.assertEqual(len(client.calls), 1)
        self.assertEqual(client.calls[0]["model"], "gpt-image-2")
        self.assertEqual(client.calls[0]["background"], "transparent")
        with open(self.log, encoding="utf-8") as f:
            rec = json.loads(f.readline())
        self.assertEqual(rec["id"], "dusty_player_run")
        self.assertIn("sha256", rec)
        # drugi raz: raw istnieje -> zero wywolan API
        generate_entry(client, self.entry, self.theme, "gpt-image-2", self.tmp, self.log)
        self.assertEqual(len(client.calls), 1)
        # force -> nowa generacja
        generate_entry(client, self.entry, self.theme, "gpt-image-2", self.tmp, self.log, force=True)
        self.assertEqual(len(client.calls), 2)
```

- [ ] **Step 2: Uruchom — FAIL**: `python -m unittest discover -s tools -p "test_*.py"`

- [ ] **Step 3: Implementacja** (dopisz do `tools/generate_theme_assets.py`):

```python
import base64
import datetime
import hashlib
import time


def append_log(log_path, record):
    with open(log_path, "a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")


def generate_entry(client, entry, theme_cfg, model, raw_dir, log_path, force=False):
    """Jedna generacja: prompt -> API -> raw PNG + wpis w logu. Idempotentna per id
    (istniejacy raw = pomin, --force wymusza) - iteracje jakosci robi sie per wpis
    (--only ID --force), nie regeneracja calosci (spec §3.3)."""
    os.makedirs(raw_dir, exist_ok=True)
    raw_path = os.path.join(raw_dir, f"{entry['id']}.png")
    if os.path.exists(raw_path) and not force:
        print(f"  [skip] {entry['id']} (raw istnieje, uzyj --force)")
        return raw_path

    prompt = build_prompt(entry, theme_cfg)
    kwargs = {"model": model, "prompt": prompt, "size": entry["api_size"], "n": 1}
    if entry.get("background") == "transparent":
        kwargs["background"] = "transparent"

    last_err = None
    for attempt in range(3):
        try:
            resp = client.images.generate(**kwargs)
            break
        except Exception as err:  # retry z backoffem na chwilowe bledy API
            last_err = err
            wait = 2 ** attempt * 5
            print(f"  [retry {attempt + 1}/3] {entry['id']}: {err} (czekam {wait}s)")
            time.sleep(wait)
    else:
        raise SystemExit(f"Generacja {entry['id']} nieudana po 3 probach: {last_err}")

    png = base64.b64decode(resp.data[0].b64_json)
    with open(raw_path, "wb") as f:
        f.write(png)
    append_log(log_path, {
        "id": entry["id"],
        "model": model,
        "prompt": prompt,
        "api_size": entry["api_size"],
        "response_id": getattr(resp, "id", None) or getattr(resp, "created", None),
        "sha256": hashlib.sha256(png).hexdigest(),
        "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    })
    print(f"  [ok] {entry['id']} -> {os.path.relpath(raw_path, REPO_ROOT)}")
    return raw_path


def _sheet_frames(raw_dir, entries, entity):
    """Kroi rawy spritesheetow encji na znormalizowane klatki per akcja."""
    frames_by_action = {}
    frame_size = None
    for e in entries:
        if e["kind"] != "spritesheet" or e["entity"] != entity:
            continue
        frame_size = e["frame_size"]
        raw = Image.open(os.path.join(raw_dir, f"{e['id']}.png"))
        cols, rows = e["grid"]
        cells = slice_grid(raw, cols, rows)[: e["frame_count"]]
        frames_by_action[e["action"]] = [trim_and_center(c, frame_size) for c in cells]
    return frames_by_action, frame_size


def build_theme_outputs(manifest, theme_name, raw_dir, out_dir):
    """Sklada finalne pliki tematu z rawow + walidacje (spec §3.3 pkt 4-6)."""
    os.makedirs(out_dir, exist_ok=True)
    entries = [e for e in manifest["assets"] if e["theme"] == theme_name]

    player_frames, fs = _sheet_frames(raw_dir, entries, "player")
    sheet = compose_player_sheet(player_frames, fs)
    validate_sheet(sheet, fs, [("idle", len(player_frames["idle"])),
                               ("move-left", len(player_frames["run"])),
                               ("move-right", len(player_frames["run"])),
                               ("jump", len(player_frames["jump"])),
                               ("hit", len(player_frames["hit"])),
                               ("death", len(player_frames["death"]))])
    sheet.save(os.path.join(out_dir, "player.png"))

    for entity, filename in (("walker", "enemy.png"), ("ghost", "ghost.png")):
        frames, fs = _sheet_frames(raw_dir, entries, entity)
        sheet = compose_enemy_sheet(frames, fs)
        validate_sheet(sheet, fs, [("idle", 1), ("move", len(frames["move"])),
                                   ("hit", len(frames["hit"])),
                                   ("death", len(frames["death"]))])
        sheet.save(os.path.join(out_dir, filename))

    for e in entries:
        if e["kind"] != "background":
            continue
        raw = Image.open(os.path.join(raw_dir, f"{e['id']}.png"))
        out = process_background(raw)
        if "ground_top_px" in e:
            validate_ground(out, e["ground_top_px"])
        out.save(os.path.join(out_dir, e["output_file"]))
    print(f"Wyjscia tematu '{theme_name}' zapisane do {os.path.relpath(out_dir, REPO_ROOT)}")
```

W `main()` zastąp końcowe `raise SystemExit(...)`:

```python
    theme_names = sorted({e["theme"] for e in entries})

    if args.validate_only:
        for name in theme_names:
            out_dir = os.path.join(REPO_ROOT, "images", "themes", name)
            build_theme_outputs(manifest, name, RAW_DIR, out_dir)
        return 0

    # Realna generacja - klucz i klient tworzone dopiero tutaj (testy wstrzykuja Fake).
    if not os.environ.get("OPENAI_API_KEY"):
        raise SystemExit("Brak OPENAI_API_KEY w srodowisku (albo uzyj --dry-run).")
    from openai import OpenAI
    client = OpenAI()
    for entry in entries:
        generate_entry(client, entry, manifest["themes"][entry["theme"]],
                       args.model, RAW_DIR, LOG_PATH, force=args.force)
    for name in theme_names:
        out_dir = os.path.join(REPO_ROOT, "images", "themes", name)
        build_theme_outputs(manifest, name, RAW_DIR, out_dir)
    return 0
```

(Uwaga: `--validate-only` odbudowuje wyjścia z istniejących rawów i przepuszcza je przez te same walidacje — to zamierzone "sprawdź bez API".)

- [ ] **Step 4: Testy**

Run: `python -m unittest discover -s tools -p "test_*.py"` → OK.
Run: `python tools/generate_theme_assets.py --dry-run` → nadal działa (regresja CLI).

- [ ] **Step 5: Commit**

```bash
git add tools/generate_theme_assets.py tools/test_generate_theme_assets.py
git commit -m "feat(pipeline): generacja przez Images API + log JSONL + skladanie wyjsc tematu"
```

---

## ETAP 3 — Generacja dusty-daylight (human-in-the-loop)

### Task 8: Uruchomienie generacji i iteracja jakości

**Files:**
- Create (wynikowe): `images/themes/dusty-daylight/{player,enemy,ghost}.png`, `bg_*.png`; `generation-log.jsonl`

**Interfaces:**
- Consumes: kompletny skrypt (Task 7), `OPENAI_API_KEY` użytkownika.
- Produces: finalne PNG tematu — Task 9 zależy od ich istnienia i od zgodności z `frame_count`/`frame_size` manifestu.

**To zadanie wymaga udziału użytkownika (klucz API, ocena wizualna). Nie commituj półproduktów bez akceptacji jakości.**

- [ ] **Step 1: Przegląd promptów**: `python tools/generate_theme_assets.py --dry-run` — sanity-check przed wydaniem pieniędzy.
- [ ] **Step 2: Generacja.** Jeśli `OPENAI_API_KEY` jest w env — uruchom: `python tools/generate_theme_assets.py --model gpt-image-2`. Jeśli nie, poproś użytkownika, żeby ustawił klucz i odpalił to samo polecenie (w Claude Code: `! $env:OPENAI_API_KEY="..."; python tools/generate_theme_assets.py --model gpt-image-2`). Koszt: 16 obrazów.
- [ ] **Step 3: Ocena wizualna z użytkownikiem.** Otwórz wygenerowane pliki (Read na PNG), oceń: spójność stylu/palety między assetami, czy klatki w sheetach to ta sama postać, czy tła nie mają widocznego szwu. Pokaż użytkownikowi wnioski i listę wpisów do poprawki.
- [ ] **Step 4: Iteracja słabych wpisów**: `python tools/generate_theme_assets.py --only <id> --force` (w razie potrzeby dopieść `style_notes` w manifeście i zacommitować zmianę manifestu). Powtarzaj do akceptacji użytkownika.
- [ ] **Step 5: Walidacja końcowa**: `python tools/generate_theme_assets.py --validate-only` → bez błędów.
- [ ] **Step 6: Commit** (po akceptacji jakości przez użytkownika):

```bash
git add images/themes/dusty-daylight generation-log.jsonl assets-manifest.json
git commit -m "feat(assets): wygenerowany komplet dusty-daylight (gpt-image-2)"
```

---

## ETAP 4 — Podpięcie tematu dusty-daylight

### Task 9: `theme.json`, dropdown, test realnej ścieżki fetch

**Files:**
- Create: `images/themes/dusty-daylight/theme.json`
- Modify: `game-demo.html` (opcja w `#themeSelect`)
- Create: `tests/theme-dusty.spec.js`
- Modify: `README.md` (krótka sekcja "Tematy graficzne": `?theme=`, dropdown, lista tematów — README jest po polsku i jest kanonicznym opisem feature'ów)

**Interfaces:**
- Consumes: pliki PNG z Task 8, `setTheme` (Task 4). `frameWidth/frameHeight` i `frameCount` w theme.json MUSZĄ odpowiadać manifestowi (Task 5): player 256/8-kolumnowy, walker/ghost 160.
- Produces: działający temat `dusty-daylight` wybieralny z UI i URL.

- [ ] **Step 1: Napisz failujący test** — `tests/theme-dusty.spec.js`:

```js
// Realna sciezka ladowania tematu z dysku (fetch theme.json + preload PNG) - w
// odroznieniu od tests/theme.spec.js, ktory testuje mechanike na syntetycznych tematach.
const { test, expect } = require('@playwright/test');
const { gotoGame, startGame, runFrames } = require('./helpers');

test.describe('Temat dusty-daylight', () => {
    test('setTheme laduje temat z images/themes/dusty-daylight', async ({ page }) => {
        await gotoGame(page);
        const ok = await page.evaluate(() => setTheme('dusty-daylight'));
        expect(ok).toBe(true);
        const state = await page.evaluate(() => ({
            name: currentThemeName,
            layerCount: parallaxLayers.length,
            layerSpeeds: parallaxLayers.map(l => l.xspeed),
            playerSheet: PLAYER_ANIM_DATA.sheets[0].src,
            playerFrame: PLAYER_ANIM_DATA.frameWidth,
            walkerFrame: ENEMY_TYPES.walker.animData.frameWidth
        }));
        expect(state.name).toBe('dusty-daylight');
        expect(state.layerCount).toBe(5);
        expect(state.layerSpeeds).toEqual([0, 0.2, 0.46, 0.8, 1.0]);
        expect(state.playerSheet).toContain('themes/dusty-daylight/player.png');
        expect(state.playerFrame).toBe(256);
        expect(state.walkerFrame).toBe(160);
    });

    test('rozgrywka dziala na dusty-daylight (fizyka + spawny bez bledow)', async ({ page }) => {
        await gotoGame(page);
        await page.evaluate(() => setTheme('dusty-daylight'));
        await startGame(page);
        await page.evaluate(() => spawnEnemy());
        await runFrames(page, 120);
        expect(await page.evaluate(() => gameState)).toBe('playing');
        expect(await page.evaluate(() => player.alive)).toBe(true);
    });

    test('?theme=dusty-daylight w URL laduje temat na starcie', async ({ page }) => {
        await page.goto('/game-demo.html?theme=dusty-daylight');
        await page.waitForFunction(() => typeof gameState !== 'undefined' && gameState === 'menu');
        await page.waitForFunction(() => currentThemeName === 'dusty-daylight');
        expect(await page.evaluate(() => parallaxLayers.length)).toBe(5);
    });

    test('powrot do classic przywraca komplet 7 warstw', async ({ page }) => {
        await gotoGame(page);
        await page.evaluate(() => setTheme('dusty-daylight'));
        await page.evaluate(() => setTheme('classic'));
        expect(await page.evaluate(() => parallaxLayers.length)).toBe(7);
        expect(await page.evaluate(() => PLAYER_ANIM_DATA.sheets[0])).toContain('character.png');
    });
});
```

- [ ] **Step 2: Uruchom — FAIL** (404 na theme.json → `setTheme` zwraca false): `npx playwright test tests/theme-dusty.spec.js`

- [ ] **Step 3: Utwórz `images/themes/dusty-daylight/theme.json`:**

```json
{
  "name": "dusty-daylight",
  "layers": [
    { "file": "bg_sky.png",        "xspeed": 0,    "role": "sky" },
    { "file": "bg_far_canyon.png", "xspeed": 0.2 },
    { "file": "bg_mid_mesas.png",  "xspeed": 0.46 },
    { "file": "bg_near_scrub.png", "xspeed": 0.8 },
    { "file": "bg_ground.png",     "xspeed": 1.0,  "role": "ground" }
  ],
  "player": {
    "sheet": "player.png",
    "frameWidth": 256,
    "frameHeight": 256,
    "states": {
      "idle":       { "row": 0, "frameCount": 6, "frameInterval": 80, "startFrame": 0, "loop": true,  "locked": false, "next": null },
      "move-left":  { "row": 1, "frameCount": 8, "frameInterval": 60, "startFrame": 0, "loop": true,  "locked": false, "next": null },
      "move-right": { "row": 2, "frameCount": 8, "frameInterval": 60, "startFrame": 0, "loop": true,  "locked": false, "next": null },
      "jump":       { "row": 3, "frameCount": 6, "frameInterval": 70, "startFrame": 0, "loop": true,  "locked": false, "next": null },
      "hit":        { "row": 4, "frameCount": 4, "frameInterval": 60, "startFrame": 0, "loop": false, "locked": true,  "next": "idle" },
      "death":      { "row": 5, "frameCount": 8, "frameInterval": 90, "startFrame": 0, "loop": false, "locked": true,  "next": null }
    },
    "initialState": "idle"
  },
  "enemies": {
    "walker": {
      "sheet": "enemy.png",
      "frameWidth": 160,
      "frameHeight": 160,
      "states": {
        "idle":  { "row": 0, "frameCount": 1, "frameInterval": 200, "startFrame": 0, "loop": true,  "locked": false, "next": null },
        "move":  { "row": 1, "frameCount": 6, "frameInterval": 100, "startFrame": 0, "loop": true,  "locked": false, "next": null },
        "hit":   { "row": 2, "frameCount": 4, "frameInterval": 70,  "startFrame": 0, "loop": false, "locked": true,  "next": "idle" },
        "death": { "row": 3, "frameCount": 6, "frameInterval": 110, "startFrame": 0, "loop": false, "locked": true,  "next": null }
      },
      "initialState": "idle"
    },
    "ghost": {
      "sheet": "ghost.png",
      "frameWidth": 160,
      "frameHeight": 160,
      "states": {
        "idle":  { "row": 0, "frameCount": 1, "frameInterval": 200, "startFrame": 0, "loop": true,  "locked": false, "next": null },
        "move":  { "row": 1, "frameCount": 6, "frameInterval": 90,  "startFrame": 0, "loop": true,  "locked": false, "next": null },
        "hit":   { "row": 2, "frameCount": 4, "frameInterval": 70,  "startFrame": 0, "loop": false, "locked": true,  "next": "idle" },
        "death": { "row": 3, "frameCount": 4, "frameInterval": 110, "startFrame": 0, "loop": false, "locked": true,  "next": null }
      },
      "initialState": "idle"
    }
  },
  "dayPhases": [
    { "t": 0.000, "r": 30,  "g": 15,  "b": 50,  "a": 0.68 },
    { "t": 0.125, "r": 60,  "g": 25,  "b": 60,  "a": 0.60 },
    { "t": 0.250, "r": 235, "g": 120, "b": 50,  "a": 0.35 },
    { "t": 0.375, "r": 255, "g": 210, "b": 130, "a": 0.10 },
    { "t": 0.500, "r": 255, "g": 235, "b": 180, "a": 0.06 },
    { "t": 0.625, "r": 255, "g": 170, "b": 80,  "a": 0.14 },
    { "t": 0.750, "r": 230, "g": 90,  "b": 35,  "a": 0.40 },
    { "t": 0.875, "r": 70,  "g": 30,  "b": 70,  "a": 0.58 },
    { "t": 1.000, "r": 30,  "g": 15,  "b": 50,  "a": 0.68 }
  ]
}
```

(`walkerFast` celowo nieobecny — fallback z Task 4 da mu grafikę walkera + tint silnika. `dayPhases` = cieplejsza, pustynna wersja palety classic — do ewentualnego dostrojenia wizualnego w Step 5. Opcjonalny override `hitboxInset` ze specu §2.3 jest ŚWIADOMIE nieimplementowany: kontrakt kompozycyjny `trim_and_center(fill_ratio=0.78)` ma utrzymać insety classic; dopisujemy go tylko, jeśli QA w Step 5 pokaże rozjazd hitboxów — wtedy jako mutacja `ENEMY_TYPES[type].inset` w `applyTheme` + wpisy w theme.json.)

- [ ] **Step 4: Dropdown** — w `game-demo.html` w `#themeSelect` dodaj `<option value="dusty-daylight">dusty-daylight</option>`.

- [ ] **Step 5: Testy + ocena wizualna**

Run: `npx playwright test tests/theme-dusty.spec.js` → PASS.
Run: `npm test` → PASS (całość, oba tematy).
Odpal grę (`python -m http.server 8000`, `http://localhost:8000/game-demo.html?theme=dusty-daylight`), zrób screenshot, pokaż użytkownikowi: pozycja gruntu vs stopy postaci, czytelność wrogów, paleta dnia. Ewentualne poprawki: `frameInterval` w theme.json (tempo animacji), `dayPhases`, w ostateczności regeneracja wpisu (`--only --force`).

- [ ] **Step 6: README** — sekcja "Tematy graficzne" (po polsku): czym jest temat, `?theme=dusty-daylight`, dropdown w panelu ⚙️, jak dodać kolejny temat (manifest → generacja → theme.json).

- [ ] **Step 7: Commit**

```bash
git add images/themes/dusty-daylight/theme.json game-demo.html tests/theme-dusty.spec.js README.md
git commit -m "feat(theme): temat dusty-daylight - theme.json, dropdown, testy fetch"
```

---

## Kryteria ukończenia całości

1. `npm test` zielone na obu tematach; testy combat/demo/enemy-variety NIE były modyfikowane.
2. `python -m unittest discover -s tools -p "test_*.py"` zielone.
3. Gra bez parametrów wygląda identycznie jak przed zmianami (classic).
4. `?theme=dusty-daylight` i dropdown przełączają temat w locie, bez restartu i bez zmiany fizyki.
5. `generation-log.jsonl` pozwala odtworzyć prompt każdego commitowanego assetu.
