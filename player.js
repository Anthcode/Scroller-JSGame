// ==== GRACZ ====
// UWAGA: podmień poniższe ścieżki na własne spritesheety wygenerowane w
// LPC Sprite Generator (https://liberatedpixelcup.github.io/Universal-LPC-Spritesheet-Character-Generator/)
// Zakładany rozmiar pojedynczej klatki to 64x64px. Wartości `row` w stanach
// poniżej dopasuj do faktycznego układu wierszy w wyeksportowanym arkuszu.
//
// Przykład:
// sheets: [
//     'images/player/character.png',
//     'images/player/character_variant2.png',
// ],
const PLAYER_ANIM_DATA = {
    sheets: [
        // 'images/player/character.png',
    ],
    frameWidth: 64,
    frameHeight: 64,
    states: {
        idle:        { row: 0, frameCount: 1, frameInterval: 200, startFrame: 0, loop: true,  locked: false, next: null },
        'move-up':    { row: 1, frameCount: 9, frameInterval: 80,  startFrame: 0, loop: true,  locked: false, next: null },
        'move-left':  { row: 2, frameCount: 9, frameInterval: 80,  startFrame: 0, loop: true,  locked: false, next: null },
        'move-down':  { row: 3, frameCount: 9, frameInterval: 80,  startFrame: 0, loop: true,  locked: false, next: null },
        'move-right': { row: 4, frameCount: 9, frameInterval: 80,  startFrame: 0, loop: true,  locked: false, next: null },
        hit:          { row: 5, frameCount: 6, frameInterval: 60,  startFrame: 0, loop: false, locked: true,  next: 'idle' },
        death:        { row: 6, frameCount: 6, frameInterval: 120, startFrame: 0, loop: false, locked: true,  next: null }
    },
    initialState: 'idle'
};

class Player {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 64;
        this.height = 64;
        this.speed = 3;
        this.velocityX = 0;
        this.velocityY = 0;

        this.maxHp = 3;
        this.hp = this.maxHp;
        this.alive = true;

        // Krótka nietykalność po trafieniu, żeby jedno zderzenie nie zdejmowało kilku hp naraz
        this.invulnerable = false;
        this.invulnerableTimer = 0;
        this.invulnerableDuration = 1000;

        this.keys = { up: false, down: false, left: false, right: false };

        // Jeśli nie podano jeszcze prawdziwych arkuszy LPC, używamy placeholdera,
        // żeby cały system animacji dało się przetestować od razu.
        const sheets = PLAYER_ANIM_DATA.sheets.length > 0
            ? PLAYER_ANIM_DATA.sheets
            : [createPlaceholderSheet({
                frameWidth: PLAYER_ANIM_DATA.frameWidth,
                frameHeight: PLAYER_ANIM_DATA.frameHeight,
                rows: 7,
                cols: 9,
                color: '#4A90E2'
            })];

        this.animator = new AnimatorController({ ...PLAYER_ANIM_DATA, sheets });

        this._bindControls();
    }

    _bindControls() {
        document.addEventListener('keydown', (e) => this._handleKey(e.key, true));
        document.addEventListener('keyup', (e) => this._handleKey(e.key, false));
    }

    _handleKey(key, isDown) {
        switch (key) {
            case 'w': case 'W': case 'ArrowUp':
                this.keys.up = isDown; break;
            case 's': case 'S': case 'ArrowDown':
                this.keys.down = isDown; break;
            case 'a': case 'A': case 'ArrowLeft':
                this.keys.left = isDown; break;
            case 'd': case 'D': case 'ArrowRight':
                this.keys.right = isDown; break;
        }
    }

    // Zadaje graczowi obrażenia i przełącza animację na 'hit' (lub 'death' przy 0 hp)
    takeHit(damage = 1) {
        if (!this.alive || this.invulnerable) return;

        this.hp -= damage;

        if (this.hp <= 0) {
            this.hp = 0;
            this.alive = false;
            this.animator.play('death', { force: true });
        } else {
            this.animator.play('hit', { force: true });
            this.invulnerable = true;
            this.invulnerableTimer = 0;
        }
    }

    update(deltaTime, bounds) {
        if (this.invulnerable) {
            this.invulnerableTimer += deltaTime;
            if (this.invulnerableTimer >= this.invulnerableDuration) {
                this.invulnerable = false;
            }
        }

        // Gdy gracz nie żyje albo trafienie blokuje sterowanie (locked), nie ruszamy postacią
        const controlsLocked = !this.alive || this.animator.states[this.animator.currentState].locked;

        if (!controlsLocked) {
            this.velocityX = 0;
            this.velocityY = 0;

            if (this.keys.up) this.velocityY = -this.speed;
            if (this.keys.down) this.velocityY = this.speed;
            if (this.keys.left) this.velocityX = -this.speed;
            if (this.keys.right) this.velocityX = this.speed;

            this.x += this.velocityX;
            this.y += this.velocityY;

            if (bounds) {
                this.x = Math.max(bounds.left, Math.min(bounds.right - this.width, this.x));
                this.y = Math.max(bounds.top, Math.min(bounds.bottom - this.height, this.y));
            }

            // Wybór animacji ruchu na podstawie ostatnio wciśniętego kierunku
            if (this.keys.up) this.animator.play('move-up');
            else if (this.keys.down) this.animator.play('move-down');
            else if (this.keys.left) this.animator.play('move-left');
            else if (this.keys.right) this.animator.play('move-right');
            else this.animator.play('idle');
        }

        this.animator.update(deltaTime);
    }

    draw(ctx) {
        const frame = this.animator.getCurrentFrame();
        if (!frame.sheet) return;

        // Miganie w trakcie nietykalności - prosty sygnał wizualny dla gracza
        if (this.invulnerable && Math.floor(this.invulnerableTimer / 100) % 2 === 0) {
            ctx.globalAlpha = 0.4;
        }

        ctx.drawImage(
            frame.sheet,
            frame.sx, frame.sy, frame.sWidth, frame.sHeight,
            this.x, this.y, this.width, this.height
        );

        ctx.globalAlpha = 1;
    }

    getBounds() {
        return { x: this.x, y: this.y, width: this.width, height: this.height };
    }
}
