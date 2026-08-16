// ==== GHOST REKORDU: ODTWARZANIE ====
// Lekki obiekt do rysowania sylwetki poprzedniego najlepszego biegu - NIE pełny Player
// (brak fizyki/inputu, tylko interpolowana pozycja + animacja odtworzone z bufora nagranego
// w game.js). Playback dzieli zegar z bieżącą rundą (elapsedMs, game.js), więc synchronizacja
// jest darmowa: próbka `i` w buforze odpowiada chwili `i * intervalMs` OBU biegów.
//
// Ładowany po enemy.js, przed game.js - potrzebuje PLAYER_ANIM_DATA/AnimatorController/
// createPlaceholderSheet (player.js/animatorController.js), a jego funkcje są wołane z
// game.js (updateGame/startGame) i script.js (anime), które ładują się później - tak samo jak
// player.js już dziś czyta `gameState` z game.js mimo wcześniejszego load order (odczyt
// dopiero w runtime, nie przy parsowaniu pliku).

const GHOST_TINT = 'rgba(90,160,255,0.55)';
const GHOST_ALPHA = 0.35;
const GHOST_WIDTH = 96;
const GHOST_HEIGHT = 96;

let ghostAnimator = null;
let ghostTintCanvas = null;
let ghostTintCtx = null;

let ghostCurrentX = 0;
let ghostCurrentY = 0;
let ghostVisible = false;
let ghostDeathPlayed = false;

function initGhostEntity() {
    if (ghostAnimator) return;
    const sheets = PLAYER_ANIM_DATA.sheets.length > 0
        ? PLAYER_ANIM_DATA.sheets
        : [createPlaceholderSheet({
            frameWidth: PLAYER_ANIM_DATA.frameWidth,
            frameHeight: PLAYER_ANIM_DATA.frameHeight,
            rows: 6,
            cols: 10,
            color: '#4A90E2'
        })];
    ghostAnimator = new AnimatorController({ ...PLAYER_ANIM_DATA, sheets });
}

function resetGhostPlayback() {
    ghostVisible = false;
    ghostDeathPlayed = false;
    if (ghostAnimator) ghostAnimator.reset('idle');
}

// Rekonstruuje pozycję/kierunek/stan gracza z zapisu w chwili `elapsedMs` (game.js) przez
// zsumowanie delt próbek 0..index (dekodowanie delta-encoded bufora) - bufory mieszczą co
// najwyżej kilka tysięcy próbek na minutę gry, więc liniowe sumowanie od zera raz na klatkę
// jest wystarczająco tanie i nie wymaga trzymania osobnego, narastającego stanu kursora.
function updateGhostPlayback(deltaTime) {
    if (!playbackGhost || !playbackGhost.samples || playbackGhost.samples.length === 0) {
        ghostVisible = false;
        return;
    }

    const sampleCount = playbackGhost.samples.length / 3;
    const index = Math.min(sampleCount - 1, Math.floor(elapsedMs / playbackGhost.intervalMs));

    if (index < 0) {
        ghostVisible = false;
        return;
    }

    let x = playbackGhost.x0;
    let y = playbackGhost.y0;
    let flags = 0;
    for (let i = 0; i <= index; i++) {
        x += playbackGhost.samples[i * 3];
        y += playbackGhost.samples[i * 3 + 1];
        flags = playbackGhost.samples[i * 3 + 2];
    }

    // Bufor się skończył (odtwarzany bieg był krótszy niż ten) - znikamy zamiast zamierać
    // w ostatniej pozycji, bo to wyglądałoby jak zawieszenie, nie koniec ducha.
    if (index >= sampleCount - 1) {
        ghostVisible = false;
        return;
    }

    ghostCurrentX = x;
    ghostCurrentY = y;
    ghostVisible = true;

    const facingLeft = !!(flags & 1);
    const isJumping = !!(flags & 2);
    const alive = !!(flags & 4);

    if (!alive) {
        if (!ghostDeathPlayed) {
            ghostAnimator.play('death', { force: true });
            ghostDeathPlayed = true;
        }
    } else if (isJumping) {
        ghostAnimator.play('jump');
    } else if (facingLeft) {
        ghostAnimator.play('move-left');
    } else {
        ghostAnimator.play('move-right');
    }

    ghostAnimator.update(deltaTime);
}

// Tint duplikuje lokalnie wzorzec Enemy._tintedFrame (enemy.js) - celowo bez wydzielania
// współdzielonej funkcji, żeby nie dotykać enemy.js (chronionego przez combat.spec.js/
// enemy-variety.spec.js) dla efektu, który dotyczy wyłącznie gracza.
function drawGhost(ctx) {
    if (!ghostVisible || !ghostAnimator) return;

    const frame = ghostAnimator.getCurrentFrame();
    if (!frame.sheet) return;

    if (!ghostTintCanvas) {
        ghostTintCanvas = document.createElement('canvas');
        ghostTintCanvas.width = GHOST_WIDTH;
        ghostTintCanvas.height = GHOST_HEIGHT;
        ghostTintCtx = ghostTintCanvas.getContext('2d');
    }

    ghostTintCtx.clearRect(0, 0, GHOST_WIDTH, GHOST_HEIGHT);
    ghostTintCtx.drawImage(
        frame.sheet,
        frame.sx, frame.sy, frame.sWidth, frame.sHeight,
        0, 0, GHOST_WIDTH, GHOST_HEIGHT
    );
    ghostTintCtx.globalCompositeOperation = 'source-atop';
    ghostTintCtx.fillStyle = GHOST_TINT;
    ghostTintCtx.fillRect(0, 0, GHOST_WIDTH, GHOST_HEIGHT);
    ghostTintCtx.globalCompositeOperation = 'source-over';

    ctx.save();
    ctx.globalAlpha = GHOST_ALPHA;
    ctx.drawImage(ghostTintCanvas, 0, 0, GHOST_WIDTH, GHOST_HEIGHT, ghostCurrentX, ghostCurrentY, GHOST_WIDTH, GHOST_HEIGHT);
    ctx.restore();
}
