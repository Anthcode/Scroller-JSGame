// ==== GAME FEEL: HIT-STOP, SCREEN SHAKE, IMPACT PARTICLES, FLOATING TEXT, AUDIO ====
// Warstwa czysto kosmetyczna/odczuwalna, doczepiona do istniejącej rozgrywki (stomp w
// game.js, skok/trafienie w player.js) bez zmiany jej reguł. Musi się załadować zaraz po
// core.js (potrzebuje tylko ctx/canvas/timeScale), bo jest konsumowana przez player.js,
// game.js i script.js, które ładują się później.

// ==== HIT-STOP ====
// Krótkie zamrożenie FIZYKI (nie rysowania) po mocnym uderzeniu - klasyczny "juice" z gier
// akcji. Bramkowane w updateGame() (game.js), nie tutaj - ten plik tylko trzyma stan.
let hitStopMs = 0;

function triggerHitStop(ms) {
    // Math.max, nie sumowanie - dwa stompy w tej samej klatce nie mają kumulować pauzy
    // w nieskończoność (np. przy wielu wrogach naraz).
    hitStopMs = Math.max(hitStopMs, ms);
}

// ==== SCREEN SHAKE ====
let shakeTrauma = 0; // 0..1
const SHAKE_MAX_OFFSET_PX = 14;
const SHAKE_DECAY_PER_MS = 0.0035; // tempo wykładniczego zaniku, dobrane tak by trauma=1 gasła w ~1s

function addShakeTrauma(amount) {
    shakeTrauma = Math.min(1, shakeTrauma + amount);
}

function decayShakeTrauma(deltaTime) {
    if (shakeTrauma <= 0) return;
    shakeTrauma = Math.max(0, shakeTrauma - SHAKE_DECAY_PER_MS * deltaTime);
}

// Zwraca losowy wektor przesunięcia kamery, skalowany trauma^2 (mocniej odczuwalny próg
// przy dużej traumie, subtelny przy małej) - wywoływane raz na klatkę w anime() (script.js).
function getShakeOffset() {
    if (shakeTrauma <= 0) return { x: 0, y: 0 };
    const magnitude = shakeTrauma * shakeTrauma * SHAKE_MAX_OFFSET_PX;
    return {
        x: (Math.random() * 2 - 1) * magnitude,
        y: (Math.random() * 2 - 1) * magnitude
    };
}

// ==== IMPACT PARTICLES ====
// Świadomie ODRĘBNE od klasy Particle w world.js - tamta służy pogodzie i nigdy nie
// "umiera" (tylko się resetuje w nieskończoność), tu potrzebujemy jednorazowego rozbłysku
// z prawdziwym czasem życia, który znika po wygaśnięciu.
let impactParticles = [];

class ImpactParticle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        const angle = Math.random() * Math.PI * 2;
        const speed = 1.5 + Math.random() * 3;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed - 1; // lekki bias w górę, żeby iskry "wystrzeliwały"
        this.size = 2 + Math.random() * 2;
        this.color = color;
        this.maxLife = 300 + Math.random() * 150; // ms
        this.life = this.maxLife;
    }

    update(deltaTime) {
        this.x += this.vx * timeScale;
        this.y += this.vy * timeScale;
        this.vy += 0.15 * timeScale; // lekka grawitacja
        this.life -= deltaTime;
    }

    draw(ctx) {
        const alpha = Math.max(0, this.life / this.maxLife);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

function spawnImpactBurst(x, y, color, count = 10) {
    for (let i = 0; i < count; i++) {
        impactParticles.push(new ImpactParticle(x, y, color));
    }
}

function updateImpactParticles(deltaTime) {
    for (let i = impactParticles.length - 1; i >= 0; i--) {
        const p = impactParticles[i];
        p.update(deltaTime);
        if (p.life <= 0) impactParticles.splice(i, 1);
    }
}

function drawImpactParticles(ctx) {
    impactParticles.forEach(p => p.draw(ctx));
}

// ==== FLOATING COMBO TEXT ====
let floatingTexts = [];

class FloatingText {
    constructor(x, y, text, scale = 1) {
        this.x = x;
        this.y = y;
        this.text = text;
        this.scale = scale;
        this.maxLife = 700; // ms
        this.life = this.maxLife;
    }

    update(deltaTime) {
        this.y -= 0.04 * deltaTime; // unoszenie w górę, niezależne od timeScale (tekst ma być czytelny w slow-mo hit-stopu)
        this.life -= deltaTime;
    }

    draw(ctx) {
        const progress = 1 - Math.max(0, this.life / this.maxLife);
        const alpha = Math.max(0, this.life / this.maxLife);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.textAlign = 'center';
        ctx.font = `bold ${Math.round(20 * this.scale)}px Arial`;
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.strokeText(this.text, this.x, this.y);
        ctx.fillStyle = '#ffd54a';
        ctx.fillText(this.text, this.x, this.y);
        ctx.restore();
        void progress; // rezerwacja na przyszłe easing bez zmiany sygnatury
    }
}

function spawnComboText(x, y, text, scale = 1) {
    floatingTexts.push(new FloatingText(x, y, text, scale));
}

function updateFloatingTexts(deltaTime) {
    for (let i = floatingTexts.length - 1; i >= 0; i--) {
        const t = floatingTexts[i];
        t.update(deltaTime);
        if (t.life <= 0) floatingTexts.splice(i, 1);
    }
}

function drawFloatingTexts(ctx) {
    floatingTexts.forEach(t => t.draw(ctx));
}

// ==== AGREGATOR FX ====
// Wołane co REALNĄ klatkę z anime() (script.js), niezależnie od hitStopMs/gameState - FX nie
// mogą zamarzać razem z fizyką, inaczej hit-stop zamrażałby też iskry/tekst, które mają
// dziać się "na wierzchu" zatrzymanej klatki.
function updateFeelSystems(deltaTime) {
    decayShakeTrauma(deltaTime);
    updateImpactParticles(deltaTime);
    updateFloatingTexts(deltaTime);
}

// ==== AUDIO PROCEDURALNE ====
// Zero plików audio - wszystko syntezowane przez WebAudio. Leniwie inicjalizowane (dopiero
// przy pierwszym startGame()), bo przeglądarki blokują AudioContext przed pierwszą realną
// interakcją użytkownika (polityka autoplay).
let audioCtx = null;
let noiseBuffer = null;

function ensureAudio() {
    if (audioCtx) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return; // środowisko bez WebAudio (np. niektóre testy headless) - cicho pomijamy
    audioCtx = new AudioContextClass();
    if (audioCtx.state === 'suspended') audioCtx.resume();
}

function playTone(freq, durationMs, type = 'square', gainPeak = 0.2) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(0, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(gainPeak, audioCtx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + durationMs / 1000);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + durationMs / 1000);
    return { osc, gain };
}

function playJumpBlip() {
    if (!audioCtx) return;
    playTone(520, 90, 'square', 0.12);
}

function playStompSound(combo) {
    if (!audioCtx) return;
    const startFreq = 440 * Math.pow(1.12, combo);
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(startFreq, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(startFreq * 0.4, audioCtx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.18, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.14);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.15);
}

function getNoiseBuffer() {
    if (noiseBuffer) return noiseBuffer;
    const length = audioCtx.sampleRate * 0.2;
    noiseBuffer = audioCtx.createBuffer(1, length, audioCtx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    return noiseBuffer;
}

// WorldDirector (world.js): niskoczęstotliwościowy grzmot przy wejściu w deszcz - jedyny
// dźwięk ambientowy w tej warstwie, reszta play*() reaguje na akcje gracza (skok/stomp/trafienie).
function playThunderRumble() {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(60, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(30, audioCtx.currentTime + 0.6);
    gain.gain.setValueAtTime(0.001, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0.25, audioCtx.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.7);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.7);
}

function playHitNoise() {
    if (!audioCtx) return;
    const source = audioCtx.createBufferSource();
    source.buffer = getNoiseBuffer();
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 900;
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);
    source.start();
}
