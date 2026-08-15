// ==== STAN GRY, WYNIK, TRUDNOŚĆ, SPAWNER, KOLIZJE, HUD ====
// Endless runner: wrogowie nadpływają z prawej razem ze światem (patrz enemy.js - poza
// zasięgiem homingu, wróg zawsze płynie w lewo z tempem świata), giną od skoku na głowę
// (stomp - jedyny sposób walki), wynik rośnie z dystansem i zabójstwami, a trudność
// narasta z czasem przeżycia wg jednej czytelnej funkcji (getDifficulty niżej).

let gameState = 'menu'; // 'menu' | 'playing' | 'gameover'

let score = 0;
let combo = 0;
let elapsedMs = 0;
let worldSpeed = 4; // aktualne tempo świata (px/klatkę @60fps) - czyta je Layers.update()

const MENU_WORLD_SPEED = 4; // tempo tła poza rozgrywką (menu/game over), żeby nie było statyczne

const BEST_SCORE_KEY = 'parallaxfx.bestScore';
let bestScore = Number(safeStorageGet(BEST_SCORE_KEY, 0)) || 0;

// Krzywa trudności jako jedna czytelna funkcja czasu (ms od startu rozgrywki), żeby nie
// rozrzucać magicznych liczb po spawnerze/wrogu/tle. Pełna trudność po 2 minutach przeżycia.
function getDifficulty(elapsed) {
    const ramp = Math.min(1, elapsed / 120000);
    return {
        worldSpeed: 4 + 4 * ramp,        // 4 -> 8 px/klatkę @60fps
        spawnMin:   1600 - 700 * ramp,   // 1600 -> 900 ms
        spawnMax:   3200 - 1600 * ramp,  // 3200 -> 1600 ms
        enemyBonus: 1.5 * ramp           // dodatkowa prędkość wroga ponad tempo świata
    };
}

// ==== WROGOWIE / SPAWNER ====
const enemies = [];
let enemySpawnTimer = 0;
let enemySpawnInterval = 1800;

function randomSpawnInterval(difficulty) {
    return difficulty.spawnMin + Math.random() * (difficulty.spawnMax - difficulty.spawnMin);
}

function spawnEnemy() {
    const spawnX = canvas.width + 50 + Math.random() * 250;
    enemies.push(new Enemy(spawnX, GROUND_LINE_Y - 76));
}

function updateEnemySpawner(deltaTime, difficulty) {
    enemySpawnTimer += deltaTime;

    if (enemySpawnTimer >= enemySpawnInterval) {
        enemySpawnTimer = 0;
        enemySpawnInterval = randomSpawnInterval(difficulty);
        spawnEnemy();
    }
}

// ==== KOLIZJE + STOMP ====
// Proste wykrywanie kolizji AABB (prostokąt-prostokąt)
function checkCollision(a, b) {
    return a.x < b.x + b.width &&
           a.x + a.width > b.x &&
           a.y < b.y + b.height &&
           a.y + a.height > b.y;
}

const STOMP_SCORE_BASE = 100;
const STOMP_BOUNCE_VELOCITY = -9; // słabsze niż pełny skok (-12), pozwala łańcuchować stompy

function handlePlayerEnemyCollisions() {
    if (!player.alive || gameState !== 'playing') return;

    const playerBounds = player.getBounds();

    for (const enemy of enemies) {
        if (!enemy.alive) continue;

        const enemyBounds = enemy.getBounds();
        if (!checkCollision(playerBounds, enemyBounds)) continue;

        // Stomp: gracz opada (velocityY > 0) i w tej klatce przeciął stopami górę wroga
        // "od góry" (stopy klatkę temu były wyżej niż głowa wroga jest teraz) - a nie
        // po prostu w niego wszedł z boku. prevBottom jest odporniejsze na tunelowanie
        // niż próg odległości, bo świat i wróg mogą poruszać się kilka-kilkanaście px/klatkę.
        const isStomp = player.velocityY > 0 && player.prevBottom <= enemyBounds.y;

        if (isStomp) {
            enemy.takeHit(enemy.hp); // jeden stomp = zgon, niezależnie od aktualnego hp wroga
            player.velocityY = STOMP_BOUNCE_VELOCITY;
            player.isJumping = true;

            combo++;
            score += STOMP_SCORE_BASE * combo;
        } else {
            player.takeHit(1);
            break; // trafienie z boku/od dołu - jedno wystarczy na klatkę
        }
    }
}

// ==== START / RESTART ====
// Jedna funkcja obsługuje zarówno start z menu, jak i restart po game over - w obu
// przypadkach trzeba sprowadzić WSZYSTKO do stanu startowego, więc różnicowanie nie miałoby
// sensu. Pełna lista resetowanych rzeczy: gracz (pozycja/hp/prędkości/animator - przez
// Player.reset()), wrogowie, timery spawnera, wynik/combo/czas, tempo świata, stan gry.
function startGame() {
    player.reset();

    enemies.length = 0; // enemies jest const - czyścimy zawartość, nie podmieniamy referencji
    enemySpawnTimer = 0;
    enemySpawnInterval = randomSpawnInterval(getDifficulty(0));

    score = 0;
    combo = 0;
    elapsedMs = 0;
    worldSpeed = getDifficulty(0).worldSpeed;

    gameState = 'playing';
}

function enterGameOver() {
    gameState = 'gameover';
    if (score > bestScore) {
        bestScore = score;
        safeStorageSet(BEST_SCORE_KEY, String(Math.floor(bestScore)));
    }
}

// ==== GŁÓWNA AKTUALIZACJA ROZGRYWKI (wywoływana ze script.js:anime()) ====
function updateGame(deltaTime) {
    if (gameState === 'playing') {
        elapsedMs += deltaTime;
        const difficulty = getDifficulty(elapsedMs);
        worldSpeed = difficulty.worldSpeed;

        updateEnemySpawner(deltaTime, difficulty);
        enemies.forEach(enemy => enemy.update(deltaTime, difficulty.worldSpeed, difficulty.enemyBonus));
        player.update(deltaTime, { left: 0, right: canvas.width, top: 0, bottom: canvas.height });

        // Seria stompów (combo) kończy się, gdy gracz wraca na ziemię - sprawdzane PRZED
        // kolizjami tej klatki, żeby świeżo odbity stomp od razu zbudował nowe combo.
        if (!player.isJumping && player.velocityY === 0) combo = 0;

        handlePlayerEnemyCollisions();

        // Sprzątamy wrogów, którzy dokończyli animację śmierci albo wypłynęli poza lewą
        // krawędź ekranu - obie ścieżki są teraz osiągalne (wcześniej wrogowie namierzali
        // gracza i nigdy nie schodziły z ekranu, więc tablica rosła w nieskończoność).
        for (let i = enemies.length - 1; i >= 0; i--) {
            const enemy = enemies[i];
            if ((!enemy.alive && enemy.animator.finished) || enemy.x + enemy.width < -100) {
                enemies.splice(i, 1);
            }
        }

        score += difficulty.worldSpeed * timeScale * 0.1; // punkty za przebyty dystans

        // Utrata wszystkich hp -> odtwarzamy animację śmierci, a game over dopiero po jej zakończeniu
        if (!player.alive && player.animator.finished) {
            enterGameOver();
        }
    } else {
        // menu / gameover - tło żyje dalej (patrz script.js), encje tylko się rysują;
        // animator gracza dokańcza swoją animację (np. death), reszta stoi w miejscu.
        worldSpeed = MENU_WORLD_SPEED;
        player.animator.update(deltaTime);
    }
}

// ==== WEJŚCIE STARTUJĄCE/RESTARTUJĄCE GRĘ ====
document.addEventListener('keydown', (e) => {
    if ((e.key === ' ' || e.key === 'Enter') && gameState !== 'playing') {
        e.preventDefault();
        // Ten sam listener typu keydown w player.js (rejestrowany później, dopiero gdy
        // script.js tworzy `new Player(...)`) sprawdza `gameState === 'playing'` dla Spacji -
        // bez stopImmediatePropagation ten handler zdążyłby przełączyć stan PRZED tamtym
        // sprawdzeniem, więc restart Spacją od razu wywoływał też skok w tej samej klatce.
        e.stopImmediatePropagation();
        startGame();
    }
});

canvas.addEventListener('click', () => {
    if (gameState !== 'playing') startGame();
});

// ==== HUD ====
function formatScore(value) {
    return Math.floor(value).toString();
}

// Parametryczna krzywa serca (skalowalna, bez potrzeby osobnego assetu) - używana do
// rysowania pasków HP zamiast dawnego tekstu "HP: n / m".
function drawHeart(cx, cy, scale, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i <= 32; i++) {
        const t = (i / 32) * Math.PI * 2;
        const hx = 16 * Math.pow(Math.sin(t), 3);
        const hy = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
        const px = cx + hx * scale;
        const py = cy + hy * scale;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

function drawHearts() {
    const scale = 0.7, spacing = 30, margin = 20;
    const totalWidth = (player.maxHp - 1) * spacing;
    const startX = canvas.width - margin - totalWidth - 16 * scale;
    const y = canvas.height - margin - 12 * scale;

    for (let i = 0; i < player.maxHp; i++) {
        const cx = startX + i * spacing;
        const color = i < player.hp ? '#ff4d5e' : 'rgba(255,255,255,0.25)';
        drawHeart(cx, y, scale, color);
    }
}

function drawOverlay(title, hint, badge) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.textAlign = 'center';
    ctx.fillStyle = gameState === 'gameover' ? '#ff5c5c' : 'white';
    ctx.font = 'bold 48px Arial';
    ctx.fillText(title, canvas.width / 2, canvas.height / 2 - 20);

    if (badge) {
        ctx.font = 'bold 20px Arial';
        ctx.fillStyle = '#ffd54a';
        ctx.fillText(badge, canvas.width / 2, canvas.height / 2 + 16);
    }

    ctx.font = '20px Arial';
    ctx.fillStyle = '#ddd';
    ctx.fillText(hint, canvas.width / 2, canvas.height / 2 + (badge ? 50 : 30));
    ctx.restore();
}

// Rysuje HUD (wynik/rekord/combo/serduszka HP) i ewentualny ekran menu/game over.
// Górne rogi canvasu są zajęte przez panel ⚙️ i statystyki (index.html), więc wynik
// idzie na środek góry, a HP w prawy dolny róg (dawniej tekst "HP: n / m").
function drawHud() {
    ctx.save();
    ctx.textAlign = 'center';

    ctx.font = 'bold 32px Arial';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.strokeText(formatScore(score), canvas.width / 2, 50);
    ctx.fillStyle = 'white';
    ctx.fillText(formatScore(score), canvas.width / 2, 50);

    ctx.font = 'bold 16px Arial';
    ctx.strokeText(`REKORD: ${formatScore(bestScore)}`, canvas.width / 2, 72);
    ctx.fillStyle = '#ffd54a';
    ctx.fillText(`REKORD: ${formatScore(bestScore)}`, canvas.width / 2, 72);

    if (combo > 1) {
        ctx.font = 'bold 18px Arial';
        ctx.fillStyle = '#4ae24a';
        ctx.fillText(`COMBO x${combo}`, canvas.width / 2, 96);
    }

    drawHearts();

    if (gameState === 'menu') {
        drawOverlay('PARALLAX FX', 'Spacja / dotknij ekranu, aby zagrać', null);
    } else if (gameState === 'gameover') {
        const isNewBest = score > 0 && score >= bestScore;
        drawOverlay('GAME OVER', 'Spacja / dotknij ekranu, aby zagrać ponownie', isNewBest ? 'NOWY REKORD!' : null);
    }

    ctx.restore();
}
