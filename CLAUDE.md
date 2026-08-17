# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Parallax FX — an endless-runner built with plain JavaScript and HTML5 Canvas, no build step, no framework, no bundler. `package.json`/`node_modules` exist solely for the Playwright e2e test suite, not for running the game itself. The README (`README.md`) is written in Polish and is the canonical, detailed reference — consult it for feature-level behavior (combat/stomp rules, difficulty curve, weather, day/night cycle, controls) rather than re-deriving it from code.

## Commands

```
npm install
npx playwright install --with-deps chromium   # one-time browser download
npm test                                        # runs full e2e suite; starts/stops its own HTTP server on :8123
npm run test:ui                                 # interactive Playwright UI runner
npm run test:headed                             # headed browser run
```

Run a single test file: `npx playwright test tests/combat.spec.js`
Run a single test by name: `npx playwright test -g "test name substring"`

To run the game manually in a browser (not required for tests, which manage their own server):
```
python3 -m http.server 8000
```
then open `http://localhost:8000/index.html` (start screen) or `http://localhost:8000/game-demo.html` (engine fullscreen, with the stats/weather panel visible).

There is no lint or type-check command configured.

## Architecture

**No modules, all global scope.** Every gameplay `<script>` is loaded unbundled, in a fixed order, directly into `game-demo.html`, and each file reads/writes plain global variables and functions rather than exporting anything:

```
core.js → theme.js → feel.js → animatorController.js → world.js → player.js → enemy.js → ghost.js → game.js → script.js
```

This load order is load-bearing: `core.js` must load first (defines `canvas`, `ctx`, `GROUND_LINE_Y`, `timeScale`, `safeStorageGet/Set`, the seeded RNG) since every other file reads from it; `theme.js` loads right after (defines `currentTheme`/`THEME_DEFAULTS` and `buildAnimData`) since `world.js`/`player.js`/`enemy.js` read from it while building their parallax layers and animation data at parse time; `game.js` (game state machine, scoring, difficulty, spawner, collisions) and `script.js` (bootstrap + the `requestAnimationFrame` loop) must load last since they consume everything above.

**Theme system**: `theme.js` owns all graphics (parallax layers, player/enemy spritesheets, optional day-phase palette) behind a `currentTheme` object — game geometry (hitbox insets, `GROUND_LINE_Y`, physics) is theme-independent and never changes on a theme swap. The bundled `classic` theme (`THEME_DEFAULTS`) loads synchronously with no network request; any other theme is swapped in live via `setTheme(name)` (fetches `images/themes/<name>/theme.json`, validates it, preloads every image, then atomically swaps — any failure falls back to `classic`) or via a `?theme=<name>` URL parameter read once at startup in `script.js`. Enemies already on screen when a swap happens keep their old sprite until they die; only newly spawned enemies pick up the new theme's graphics.

**Two-document structure**: `index.html` is a purely visual start screen (pixel-art frame image, PLAY button, HP hearts, high-score readout) that embeds `game-demo.html` in an `<iframe>` for its built-in menu/demo loop. The iframe's document is where the actual engine and its globals (`gameState`, `player`, `enemies`, etc.) live — `index.html`'s own script only polls into the iframe (e.g. `getLives()`) and forwards clicks/fullscreen state. Because of this, all game logic and all tests target `game-demo.html` directly, never `index.html`.

**Time scaling**: all motion (world, player, enemies, particles) is scaled by `timeScale` (`core.js`), computed from real frame `deltaTime` normalized to 60fps, so the game runs at the same speed on 60Hz and 120Hz+ displays. Timers measured directly in ms (hit-stop, invulnerability, animation frame timers, weather crossfade) are NOT scaled by `timeScale` but are separately clamped via `clampDeltaTime`/`MAX_DELTA_MS` to avoid huge jumps after a backgrounded tab.

**Seeded RNG**: `core.js` sets up a `mulberry32` PRNG (`rng`) seeded from `?seed=` in the URL (or randomly if absent, shown to the player on game-over so a run can be reproduced). This seeded RNG is used *only* by the enemy spawner (`randomSpawnInterval`/`pickEnemyType`/`spawnEnemy` in `game.js`, `hoverPhase` in `enemy.js`) — weather/star decoration intentionally still uses `Math.random()` since it doesn't affect reproducibility.

**Combat**: the only way to defeat an enemy is a head-stomp — landing on an enemy from above while falling kills it and bounces the player; side/bottom contact damages the player instead. Hitboxes are inset relative to each sprite's transparent margin so collisions match what's visually on screen. Enemy types (`ENEMY_TYPES` in `enemy.js`) unlock progressively with survival time: `walker` (ground, 2 HP), `walkerFast` (same art, smaller/faster/1 HP, purple tint via an offscreen buffer), `ghost` (flying, in its own `ghost.js`, always dies on touch since exact "from above" isn't required).

**Animation**: `animatorController.js` is a generic, data-driven sprite animator (sheet + states + frames) with no character-specific logic — `player.js`/`enemy.js`/`ghost.js` each configure it with their own state/frame data.

**Sprite assets are generated, not hand-edited directly**: `images/player/character.png`, `images/enemy/enemy.png`, `images/enemy/ghost.png` are composed from originals in `tools/original_game_assets/` by the `tools/compose_*_sheet.py` scripts (`pip install Pillow` required). Other generators in `tools/` are explicitly-labeled fallbacks (procedural pixel-art, AI-generated) — don't run them without a specific reason, since they will overwrite the current in-use art.

## Testing approach

The game keeps all state in plain global variables (no modules), so tests drive it directly via `page.evaluate()` against `window.*` (`gameState`, `player`, `enemies`, `startGame()`, `updateGame()`, etc.) rather than only clicking through the UI — see `tests/helpers.js`. Physics-sensitive tests (`tests/combat.spec.js`, `tests/demo.spec.js`, etc.) drive simulation with a fixed deltaTime step via `runFrames()` (which forces `timeScale = 1` and `hitStopMs = 0` per call) instead of relying on real, noisy `requestAnimationFrame` timing — this is how stomp/demo-loop geometry was tuned and verified (see PR history #20/#21). Tests always navigate to `game-demo.html` directly, never `index.html`, since that's where the engine's globals actually exist.

CI (`.github/workflows/ci.yml`) runs the full suite via `npm test` on every push/PR to `main`.
