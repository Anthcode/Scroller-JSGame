// ==== TWÓJ ORYGINALNY KOD ====
const canvas = document.querySelector('canvas');
const ctx = canvas.getContext('2d');

canvas.width = 800;
canvas.height = 600;

let gamespeed = 2;
let x = 0;
let x2 = canvas.width;

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
