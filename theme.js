// ==== THEME MANAGER ====
// Zrodlo prawdy dla GRAFIKI gry (sheety gracza/wrogow, warstwy paralaksy, opcjonalna
// paleta dnia). Geometria rozgrywki (width/height encji, insety hitboxow, GROUND_LINE_Y)
// celowo NIE nalezy do tematu - podmiana skorki nigdy nie zmienia fizyki/kolizji
// (spec: docs/superpowers/specs/2026-08-17-theme-system-dusty-daylight-design.md, §2.3).
//
// Laduje sie po core.js, przed world.js/player.js/enemy.js - te pliki czytaja
// currentTheme przy parsowaniu (classic), a setTheme() podmienia grafike w runtime.

// Kontrakt stanow animacji - silnik wola te stany po nazwie (player.js/enemy.js/game.js),
// wiec temat bez ktorego z nich wywalilby sie dopiero w trakcie gry. Walidacja od razu.
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
