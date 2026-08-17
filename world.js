// ==== TŁO: PARALAKSA, CYKL DNIA/NOCY, POGODA ====
// Przeniesione ze script.js przy refaktorze na pełną pętlę rozgrywki (menu/gra/game over).
// Wszystkie globalne nazwy używane przez panel UI w game-demo.html (gamespeed, windForce,
// daySpeed, changeWeather, setParticleCount) zostają identyczne - inline onclick/onchange
// odwołują się do nich bezpośrednio i cicho przestałyby działać po zmianie nazwy/zakresu.

// DAY/NIGHT CYCLE
let dayTime = 0;
let daySpeed = 1 / (60 * 60);

const STAR_COUNT = 65;
const stars = Array.from({ length: STAR_COUNT }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * (canvas.height * 0.65),
    r: Math.random() * 1.2 + 0.4,
    twinkle: Math.random() * Math.PI * 2
}));

const CLASSIC_DAY_PHASES = [
    { t: 0.000, r: 10,  g: 10,  b: 60,  a: 0.72 },
    { t: 0.125, r: 20,  g: 15,  b: 70,  a: 0.65 },
    { t: 0.250, r: 210, g: 100, b: 60,  a: 0.35 },
    { t: 0.375, r: 255, g: 200, b: 120, a: 0.10 },
    { t: 0.500, r: 135, g: 190, b: 255, a: 0.05 },
    { t: 0.625, r: 255, g: 180, b: 90,  a: 0.12 },
    { t: 0.750, r: 220, g: 80,  b: 40,  a: 0.40 },
    { t: 0.875, r: 40,  g: 20,  b: 80,  a: 0.60 },
    { t: 1.000, r: 10,  g: 10,  b: 60,  a: 0.72 },
];
// let, bo applyTheme (theme.js) podmienia palete na dayPhases tematu (lub przywraca classic).
let DAY_PHASES = CLASSIC_DAY_PHASES;

class Layers {
  constructor(image, xspeed) {
    this.x = 0;
    this.y = 0;

    this.width = canvas.width;
    this.height = canvas.height;
    this.x2 = this.width;
    this.image = image;
    this.xspeed = xspeed;
    this.speed = 0; // przeliczane co klatkę w update() - patrz worldSpeed w game.js
  }
  update() {
    // worldSpeed (tempo bazowe z krzywej trudności) * xspeed (mnożnik paralaksy warstwy)
    // * gamespeed (suwak "Prędkość gry" jako dodatkowy mnożnik debugowy) * timeScale
    // (niezależność od odświeżania ekranu).
    this.speed = worldSpeed * this.xspeed * gamespeed * timeScale;

    this.x -= this.speed;
    this.x2 -= this.speed;

    // Pozycje trzymamy jako float i zaokrąglamy dopiero przy rysowaniu (draw()) - flooring
    // tu, co klatkę, obcinałby resztę ułamkową przy prędkościach poniżej 1px/klatkę
    // (typowe dla wolnych warstw przy timeScale < 1 na wyświetlaczach >60Hz), więc wolne
    // warstwy w praktyce by zamarły. To był też pierwotny błąd - podwójne odejmowanie
    // prędkości w Math.floor(this.x - this.speed) niżej niż samo przypisanie.
    if (this.x <= -this.width) this.x = this.x2 + this.width;
    if (this.x2 <= -this.width) this.x2 = this.x + this.width;
  }
  draw() {
    const x = Math.floor(this.x);
    const x2 = Math.floor(this.x2);
    ctx.drawImage(this.image, x, this.y, this.width, this.height);
    ctx.drawImage(this.image, x2, this.y, this.width, this.height);
  }
}

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

function getDayColor(t) {
    let lo = DAY_PHASES[0], hi = DAY_PHASES[DAY_PHASES.length - 1];
    for (let i = 0; i < DAY_PHASES.length - 1; i++) {
        if (t >= DAY_PHASES[i].t && t <= DAY_PHASES[i + 1].t) {
            lo = DAY_PHASES[i]; hi = DAY_PHASES[i + 1]; break;
        }
    }
    const f = (t - lo.t) / (hi.t - lo.t || 1);
    return {
        r: Math.round(lo.r + (hi.r - lo.r) * f),
        g: Math.round(lo.g + (hi.g - lo.g) * f),
        b: Math.round(lo.b + (hi.b - lo.b) * f),
        a: lo.a + (hi.a - lo.a) * f
    };
}

function drawDayNightOverlay() {
    const c = getDayColor(dayTime);
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0,   `rgba(${c.r},${c.g},${c.b},${c.a})`);
    grad.addColorStop(0.6, `rgba(${c.r},${c.g},${c.b},${c.a * 0.6})`);
    grad.addColorStop(1.0, `rgba(${c.r},${c.g},${c.b},0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawStars() {
    let starOpacity = 0;
    if (dayTime <= 0.20)      starOpacity = 1 - dayTime / 0.20;
    else if (dayTime >= 0.80) starOpacity = (dayTime - 0.80) / 0.20;
    if (starOpacity <= 0) return;
    const now = Date.now() * 0.001;
    ctx.save();
    for (let i = 0; i < stars.length; i++) {
        const s = stars[i];
        const alpha = starOpacity * (0.85 + 0.15 * Math.sin(s.twinkle + now));
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,240,${alpha})`;
        ctx.fill();
    }
    ctx.restore();
}

function drawSunMoon() {
    const isSun = dayTime >= 0.25 && dayTime <= 0.75;
    let arcT;
    if (isSun) {
        arcT = (dayTime - 0.25) / 0.50;
    } else {
        arcT = dayTime >= 0.75 ? (dayTime - 0.75) / 0.50 : (dayTime + 0.25) / 0.50;
    }
    const discX = arcT * canvas.width;
    const discY = 300 - 250 * Math.sin(arcT * Math.PI);
    if (discY >= 300) return;
    const fade = Math.min(1, Math.sin(arcT * Math.PI) * 4);
    ctx.save();
    ctx.globalAlpha = fade;
    if (isSun) {
        const g = ctx.createRadialGradient(discX, discY, 0, discX, discY, 30);
        g.addColorStop(0,   'rgba(255,255,200,1.0)');
        g.addColorStop(0.4, 'rgba(255,220,50,0.95)');
        g.addColorStop(0.7, 'rgba(255,160,20,0.5)');
        g.addColorStop(1.0, 'rgba(255,100,0,0)');
        ctx.beginPath(); ctx.arc(discX, discY, 30, 0, Math.PI * 2);
        ctx.fillStyle = g; ctx.fill();
    } else {
        const g = ctx.createRadialGradient(discX, discY, 0, discX, discY, 18);
        g.addColorStop(0,   'rgba(240,240,255,1.0)');
        g.addColorStop(0.6, 'rgba(200,200,240,0.9)');
        g.addColorStop(1.0, 'rgba(150,150,200,0)');
        ctx.beginPath(); ctx.arc(discX, discY, 18, 0, Math.PI * 2);
        ctx.fillStyle = g; ctx.fill();
        ctx.beginPath(); ctx.arc(discX + 5, discY - 4, 18, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(80,80,120,0.18)'; ctx.fill();
    }
    ctx.restore();
}

// ==== SYSTEM CZĄSTECZEK (POGODA) ====
let particles = [];
let weatherMode = 'none'; // 'rain', 'snow', 'leaves', 'none'
let windForce = 1;
let particleCount = 80;

class Particle {
    constructor(type = 'rain') {
        this.type = type;
        this.reset();
        this.setTypeProperties();
    }

    reset() {
        this.x = Math.random() * (canvas.width + 200) - 100;
        this.y = -20;
        this.opacity = Math.random() * 0.7 + 0.3;
        this.life = 1;
    }

    setTypeProperties() {
        switch(this.type) {
            case 'rain':
                this.speedX = Math.random() * 1 + 0.5;
                this.speedY = Math.random() * 6 + 4;
                this.size = Math.random() * 2 + 1;
                this.color = `rgba(100, 150, 255, ${this.opacity})`;
                break;

            case 'snow':
                this.speedX = Math.random() * 1 - 0.5;
                this.speedY = Math.random() * 2 + 0.5;
                this.size = Math.random() * 4 + 2;
                this.color = `rgba(255, 255, 255, ${this.opacity})`;
                this.rotation = Math.random() * Math.PI * 2;
                this.rotationSpeed = (Math.random() - 0.5) * 0.1;
                break;

            case 'leaves':
                this.speedX = Math.random() * 2 + 1;
                this.speedY = Math.random() * 2 + 1;
                this.size = Math.random() * 5 + 3;
                const hue = Math.random() * 60 + 10;
                this.color = `hsl(${hue}, 80%, ${Math.random() * 30 + 40}%)`;
                this.rotation = Math.random() * Math.PI * 2;
                this.rotationSpeed = (Math.random() - 0.5) * 0.15;
                break;
        }
    }

    update() {
        this.x -= ((this.speedX * gamespeed) + (windForce * 0.5)) * timeScale;
        this.y += this.speedY * gamespeed * timeScale;

        if (this.type === 'snow') {
            this.x += Math.sin(this.y * 0.01) * 0.5 * timeScale;
            this.rotation += this.rotationSpeed * timeScale;
        }

        if (this.type === 'leaves') {
            this.x += Math.sin(this.y * 0.02) * 1 * timeScale;
            this.rotation += this.rotationSpeed * timeScale;
            this.speedY += 0.02 * timeScale;
        }

        if (this.type === 'rain') {
            this.speedY += 0.1 * timeScale;
            if (this.speedY > 12) this.speedY = 12;
        }

        if (this.y > canvas.height + 50 || this.x < -100 || this.x > canvas.width + 100) {
            this.reset();
        }
    }

    draw(fadeMultiplier = 1) {
        ctx.save();
        ctx.globalAlpha = this.opacity * fadeMultiplier;

        if (this.type === 'rain') {
            ctx.strokeStyle = this.color;
            ctx.lineWidth = this.size;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(this.x, this.y);
            ctx.lineTo(this.x + this.speedX * 3, this.y + this.speedY * 3);
            ctx.stroke();

        } else if (this.type === 'snow') {
            ctx.translate(this.x, this.y);
            ctx.rotate(this.rotation);
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(0, 0, this.size, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = `rgba(255, 255, 255, ${this.opacity * 0.5})`;
            ctx.lineWidth = 1;
            ctx.stroke();

        } else if (this.type === 'leaves') {
            ctx.translate(this.x, this.y);
            ctx.rotate(this.rotation);
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.ellipse(0, 0, this.size, this.size * 0.6, 0, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = `rgba(139, 69, 19, ${this.opacity})`;
            ctx.lineWidth = 1;
            ctx.stroke();
        }

        ctx.restore();
    }
}

function initParticleSystem() {
    particles = [];
    for (let i = 0; i < particleCount; i++) {
        particles.push(new Particle(weatherMode));
    }
}

// deltaTime - potrzebny WYŁĄCZNIE do odliczania crossfade'u WorldDirectora (patrz sekcja
// niżej); zwykłe cząsteczki animują się przez update()/timeScale jak dotychczas.
function updateParticleSystem(deltaTime) {
    if (weatherTransition) {
        updateWeatherCrossfade(deltaTime);
        return;
    }

    if (weatherMode === 'none') return;

    particles.forEach(particle => {
        particle.update();
        particle.draw();
    });
}

function changeWeather(newWeatherMode) {
    weatherMode = newWeatherMode;
    particles.forEach(particle => {
        particle.type = weatherMode;
        particle.setTypeProperties();
    });
    console.log(`🌦️ Pogoda zmieniona na: ${weatherMode}`);

    // WorldDirector (sekcja niżej): KAŻDA zmiana pogody - ręczna (klawisz/przycisk debug) czy
    // automatyczna - odsuwa następną zaplanowaną zmianę o pełny interwał, zamiast walczyć z
    // automatem o kontrolę przez osobną flagę "manualOverride". elapsedMs (game.js) może
    // jeszcze nie istnieć przy najwcześniejszych wywołaniach (world.js ładuje się wcześniej),
    // stąd guard - do czasu pełnego załadowania stron testy DOM (weather-ui.spec.js) i tak nie
    // zdążą kliknąć żadnego przycisku.
    if (typeof elapsedMs !== 'undefined') {
        worldDirectorNextChangeAtMs = elapsedMs + WORLD_DIRECTOR_INTERVAL_MS + (Math.random() * 10000 - 5000);
    }
}

function setParticleCount(count) {
    particleCount = count;

    while (particles.length < particleCount) {
        particles.push(new Particle(weatherMode));
    }

    while (particles.length > particleCount) {
        particles.pop();
    }
}

// ==== WORLD DIRECTOR ====
// Automat sterowany elapsedMs (game.js) - co ~25-35s (jitter) przełącza pogodę z crossfade'em
// zamiast natychmiastowej zmiany, i synchronizuje daySpeed tak, żeby pełny cykl dnia/nocy
// trwał dokładnie tyle, co rampa trudności (120s, getDifficulty w game.js). Tyka WYŁĄCZNIE
// gdy gameState==='playing' (wołane z updateGame()) - poza rozgrywką zero zmian względem
// dzisiejszego zachowania (debug klawisze/przyciski działają tak jak zawsze).
const WORLD_DIRECTOR_INTERVAL_MS = 30000;
const WEATHER_CROSSFADE_MS = 1500;
const DAY_CYCLE_MS = 120000;
const WEATHER_MODES = ['none', 'rain', 'snow', 'leaves'];
const NIGHT_LIGHT_RADIUS = 260;

let worldDirectorNextChangeAtMs = null;
let weatherTransition = null; // {fromMode, toMode, elapsedMs, durationMs, incomingParticles}

function resetWorldDirector() {
    dayTime = 0;
    // TARGET_FRAME_MS (core.js) w mianowniku, bo script.js:anime() aktualizuje dayTime jako
    // `dayTime + daySpeed * gamespeed * timeScale`, a timeScale ≈ deltaTime/TARGET_FRAME_MS -
    // efektywne tempo na ms to więc daySpeed/TARGET_FRAME_MS, stąd taki podział dla DAY_CYCLE_MS.
    daySpeed = TARGET_FRAME_MS / DAY_CYCLE_MS;
    weatherTransition = null;
    changeWeather('none'); // ustawia też worldDirectorNextChangeAtMs (elapsedMs=0 na starcie rundy)
}

function pickNextWeatherMode() {
    const pool = WEATHER_MODES.filter(m => m !== weatherMode);
    return pool[Math.floor(Math.random() * pool.length)]; // pogoda jest dekoracyjna - nie musi być seedowana
}

function beginWeatherCrossfade(toMode) {
    if (toMode === weatherMode || weatherTransition) return;
    const incoming = [];
    for (let i = 0; i < particleCount; i++) incoming.push(new Particle(toMode));
    weatherTransition = { fromMode: weatherMode, toMode, elapsedMs: 0, durationMs: WEATHER_CROSSFADE_MS, incomingParticles: incoming };

    // Integracja z game feel (feel.js, etap 1) - tylko przejścia zainicjowane przez sam
    // WorldDirector (nie ręczne changeWeather() z klawiszy/przycisków, które go omijają)
    // dostają subtelny akcent. Świadomie BEZ hit-stopu - zamrażanie fizyki z powodu zmiany
    // pogody byłoby złym game-feelem (hit-stop ma sygnalizować impakt walki, nie ambient).
    if (toMode === 'rain') {
        addShakeTrauma(0.2);
        playThunderRumble();
    }
}

function updateWeatherCrossfade(deltaTime) {
    if (!weatherTransition) return;

    weatherTransition.elapsedMs += deltaTime;
    const progress = Math.min(1, weatherTransition.elapsedMs / weatherTransition.durationMs);

    particles.forEach(p => { p.update(); p.draw(1 - progress); });
    weatherTransition.incomingParticles.forEach(p => { p.update(); p.draw(progress); });

    if (progress >= 1) {
        const toMode = weatherTransition.toMode;
        particles = weatherTransition.incomingParticles;
        weatherTransition = null;
        changeWeather(toMode); // commit - jedno miejsce prawdy dla weatherMode, patrz komentarz tam
    }
}

// Wołane z updateGame() (game.js, gałąź 'playing') - WYŁĄCZNIE decyduje KIEDY zacząć kolejną
// zmianę pogody; samo tickowanie/rysowanie crossfade'u dzieje się w updateParticleSystem()
// (script.js:anime(), każda realna klatka), żeby trwający fade dokańczał się nawet po
// game over, tak jak zwykłe cząsteczki pogody zawsze animują się niezależnie od gameState.
function updateWorldDirector(elapsedMsNow) {
    if (weatherTransition) return;
    if (worldDirectorNextChangeAtMs === null || elapsedMsNow < worldDirectorNextChangeAtMs) return;
    beginWeatherCrossfade(pickNextWeatherMode());
}

// Subtelny akcent (feel.js, etap 1) przy zachodzie słońca - próg t=0.750 to dokładnie
// keyframe "dusk" w DAY_PHASES. duskShakeArmed pilnuje jednego wyzwolenia na cykl dnia
// (nie na klatkę) i ponownie się zbroi, gdy dayTime spadnie poniżej progu (nowy cykl).
let duskShakeArmed = true;

function maybeTriggerDuskShake(prevDayTime) {
    if (dayTime >= 0.750 && prevDayTime < 0.750 && duskShakeArmed) {
        addShakeTrauma(0.08);
        duskShakeArmed = false;
    } else if (dayTime < 0.750) {
        duskShakeArmed = true;
    }
}

function isNightTime() {
    return dayTime <= 0.20 || dayTime >= 0.80;
}

function getWeatherSpeedMultiplier() {
    return weatherMode === 'snow' ? 0.85 : 1;
}

function getWeatherSpawnDensityMultiplier() {
    return weatherMode === 'snow' ? 0.7 : 1; // mniejszy spawnMin/Max = gęstszy spawn
}

function getScoreMultiplier() {
    const night = isNightTime();
    const strongWind = windForce >= 2;
    if (night && strongWind) return 1.8;
    if (night || strongWind) return 1.2;
    return 1;
}

// worldX/worldY - środek encji, w tych samych współrzędnych co canvas. Poza nocą zawsze 1
// (brak przygaszenia). typeof player - world.js ładuje się przed player.js/game.js, ale ta
// funkcja jest wołana dopiero w runtime (draw wrogów, enemy.js), gdy player już istnieje -
// guard tylko na wszelki wypadek (np. wywołanie zanim script.js utworzy gracza).
function getNightDimAlpha(worldX, worldY) {
    if (!isNightTime() || typeof player === 'undefined') return 1;
    const px = player.x + player.width / 2;
    const py = player.y + player.height / 2;
    const dist = Math.hypot(worldX - px, worldY - py);
    const t = Math.min(1, Math.max(0, (dist - NIGHT_LIGHT_RADIUS * 0.4) / (NIGHT_LIGHT_RADIUS * 0.6)));
    return 1 - t * 0.7; // nigdy nie schodzi poniżej 0.3 - wróg ma zostać słabo widoczny, nie znikać
}

// Radialna "dziura światła" wokół gracza - w przeciwieństwie do drawDayNightOverlay() (gradient
// pionowy na całą scenę) ta winieta faktycznie reaguje na pozycję gracza, więc noc staje się
// realnym utrudnieniem (widoczność), nie tylko kolorystyką tła.
function drawNightVignette(ctx) {
    if (!isNightTime() || typeof player === 'undefined') return;

    const px = player.x + player.width / 2;
    const py = player.y + player.height / 2;
    const nightStrength = dayTime <= 0.20 ? (1 - dayTime / 0.20) : (dayTime - 0.80) / 0.20;

    ctx.save();
    const grad = ctx.createRadialGradient(px, py, NIGHT_LIGHT_RADIUS * 0.3, px, py, NIGHT_LIGHT_RADIUS * 1.3);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, `rgba(0,0,0,${0.55 * nightStrength})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
}
