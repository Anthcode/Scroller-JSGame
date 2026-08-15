// ==== GRACZ ====
// images/player/character.png - złożony z oryginalnych assetów tej samej gry
// (wcześniejszy deploy: https://parallax-fx.web.app/ - idlesheet.png,
// runsheet.png, jump.png, die.png). Skrypt składający: tools/compose_player_sheet.py
// (źródła w tools/player_source_assets/). Oryginał nie miał osobnej animacji
// trafienia ani lustrzanego biegu w lewo - hit jest syntetyzowany (tint na
// klatkach idle), a move-left to programowo odbite klatki runsheet.png.
// 150x150px/klatkę, układ wierszy dokładnie taki jak w `states` poniżej.
const PLAYER_ANIM_DATA = {
    sheets: [
        'images/player/character.png',
    ],
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
};

class Player {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 96;
        this.height = 96;
        this.speed = 3;
        this.velocityX = 0;
        this.velocityY = 0;

        // Fizyka skoku - platformowa, gracz porusza się tylko lewo/prawo i skacze
        this.groundY = y;
        this.isJumping = false;
        this.gravity = 0.6;
        this.jumpStrength = -12;

        this.maxHp = 3;
        this.hp = this.maxHp;
        this.alive = true;

        // Krótka nietykalność po trafieniu, żeby jedno zderzenie nie zdejmowało kilku hp naraz
        this.invulnerable = false;
        this.invulnerableTimer = 0;
        this.invulnerableDuration = 1000;

        this.keys = { left: false, right: false };
        this.facing = 'right'; // kierunek animacji biegu, gdy gracz stoi w miejscu

        // Jeśli nie podano jeszcze prawdziwych arkuszy LPC, używamy placeholdera,
        // żeby cały system animacji dało się przetestować od razu.
        const sheets = PLAYER_ANIM_DATA.sheets.length > 0
            ? PLAYER_ANIM_DATA.sheets
            : [createPlaceholderSheet({
                frameWidth: PLAYER_ANIM_DATA.frameWidth,
                frameHeight: PLAYER_ANIM_DATA.frameHeight,
                rows: 6,
                cols: 10,
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
            case 'a': case 'A': case 'ArrowLeft':
                this.keys.left = isDown; break;
            case 'd': case 'D': case 'ArrowRight':
                this.keys.right = isDown; break;
            case 'w': case 'W': case 'ArrowUp': case ' ':
                if (isDown) this.jump();
                break;
        }
    }

    // Skacze, o ile gracz aktualnie stoi na ziemi - jump() jest bezpieczny do
    // wołania wielokrotnie (np. przy auto-repeat klawisza), w powietrzu nic nie robi
    jump() {
        if (this.isJumping) return;
        this.isJumping = true;
        this.velocityY = this.jumpStrength;
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
            if (this.keys.left) this.velocityX = -this.speed;
            if (this.keys.right) this.velocityX = this.speed;
            this.x += this.velocityX;

            if (bounds) {
                this.x = Math.max(bounds.left, Math.min(bounds.right - this.width, this.x));
            }
        }

        // Grawitacja działa niezależnie od tego, czy sterowanie jest zablokowane
        // (np. w trakcie animacji hit gracz nadal powinien opadać na ziemię)
        this.y += this.velocityY;
        this.velocityY += this.gravity;

        if (this.y >= this.groundY) {
            this.y = this.groundY;
            this.velocityY = 0;
            this.isJumping = false;
        }

        if (!controlsLocked) {
            if (this.keys.left) this.facing = 'left';
            else if (this.keys.right) this.facing = 'right';

            // Ninja ma być cały czas w biegu - nawet stojąc w miejscu gra się
            // animację biegu w ostatnio obranym kierunku zamiast idle.
            if (this.isJumping) this.animator.play('jump');
            else if (this.keys.left) this.animator.play('move-left');
            else if (this.keys.right) this.animator.play('move-right');
            else this.animator.play('move-' + this.facing);
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
