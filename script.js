// ==== TWÓJ ORYGINALNY KOD ====
const canvas = document.querySelector('canvas');
const ctx = canvas.getContext('2d');

canvas.width = 800;
canvas.height = 600;

let gamespeed = 2;
let x = 0;
let x2 = canvas.width;

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

const DAY_PHASES = [
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

const back1 = new Image();
back1.src = 'images/_01_ground.png';
const back2 = new Image();
back2.src = 'images/_02_trees and bushes.png';
const back3 = new Image();
back3.src = 'images/_03_distant_trees.png';
const back4 = new Image();
back4.src = 'images/_04_bushes.png';
const back5 = new Image();
back5.src = 'images/_05_hill1.png';
const back6 = new Image();
back6.src = 'images/_06_hill2.png';
const back11 = new Image();
back11.src = 'images/_11_background.png';

class Layers {
  constructor(image, xspeed) {
    this.x = 0;
    this.y = 0;

    this.width = canvas.width;
    this.height = canvas.height;
    this.x2 = this.width;
    this.image = image;
    this.xspeed = xspeed;
    this.speed = gamespeed * this.xspeed;
  }
  update() {
    this.speed = gamespeed * this.xspeed;

    if (this.x < -this.width) this.x = this.width + this.x2 - this.speed;
    else this.x -= this.speed;

    if (this.x2 < -this.width) this.x2 = this.width + this.x - this.speed;
    else this.x2 -= this.speed;

    this.x = Math.floor(this.x - this.speed);
    this.x2 = Math.floor(this.x2 - this.speed);
  }
  draw() {
    ctx.drawImage(this.image, this.x, this.y, this.width, this.height);
    ctx.drawImage(this.image, this.x2, this.y, this.width, this.height);
  }
}

const layer1 = new Layers(back1, gamespeed);
const layer2 = new Layers(back2, 0.8);
const layer3 = new Layers(back3, 0.6);
const layer4 = new Layers(back4, 0.46);
const layer5 = new Layers(back5, 0.3);
const layer6 = new Layers(back6, 0.2);
const layer11 = new Layers(back11, 0);

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

// ==== NOWY SYSTEM CZĄSTECZEK ====
let particles = [];
let weatherMode = 'none'; // 'rain', 'snow', 'leaves', 'none'
let windForce = 1;
let particleCount = 80;

// Klasa cząsteczki
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
        this.x -= (this.speedX * gamespeed) + (windForce * 0.5);
        this.y += this.speedY * gamespeed;
        
        if (this.type === 'snow') {
            this.x += Math.sin(this.y * 0.01) * 0.5;
            this.rotation += this.rotationSpeed;
        }
        
        if (this.type === 'leaves') {
            this.x += Math.sin(this.y * 0.02) * 1;
            this.rotation += this.rotationSpeed;
            this.speedY += 0.02;
        }
        
        if (this.type === 'rain') {
            this.speedY += 0.1;
            if (this.speedY > 12) this.speedY = 12;
        }

        if (this.y > canvas.height + 50 || this.x < -100 || this.x > canvas.width + 100) {
            this.reset();
        }
    }

    draw() {
        ctx.save();
        ctx.globalAlpha = this.opacity;
        
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

// Funkcje systemu cząsteczek
function initParticleSystem() {
    particles = [];
    for (let i = 0; i < particleCount; i++) {
        particles.push(new Particle(weatherMode));
    }
}

function updateParticleSystem() {
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

// ==== ZAKTUALIZOWANA FUNKCJA ANIME ====
function anime() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  layer11.update();
  layer11.draw();

  dayTime = (dayTime + daySpeed * gamespeed) % 1;
  drawDayNightOverlay();
  drawStars();
  drawSunMoon();

  layer6.update();
  layer6.draw();

  layer5.update();
  layer5.draw();

  layer4.update();
  layer4.draw();

  layer3.update();
  layer3.draw();

  layer2.update();
  layer2.draw();

  // SYSTEM CZĄSTECZEK - rysowany przed pierwszą warstwą
  updateParticleSystem();

  layer1.update();
  layer1.draw();

  requestAnimationFrame(anime);
}

// ==== KONTROLKI KLAWIATURY ====
document.addEventListener('keydown', (e) => {
    switch(e.key) {
        case '1':
            changeWeather('rain');
            break;
        case '2':
            changeWeather('snow');
            break;
        case '3':
            changeWeather('leaves');
            break;
        case '0':
            changeWeather('none');
            break;
        case 't':
        case 'T':
            daySpeed = daySpeed > 0 ? 0 : 1 / (60 * 60);
            break;
    }
});

// ==== INICJALIZACJA ====
window.addEventListener('load', () => {
    setTimeout(() => {
        initParticleSystem();
        console.log("🎮 System cząsteczek zainicjalizowany!");
        console.log("⌨️ Użyj klawiszy: 1-Deszcz, 2-Śnieg, 3-Liście, 0-Słońce");
    }, 1000);
});

// Uruchomienie animacji
anime();
