// ==== WRÓG ====
// Podobnie jak w player.js - podmień poniższe ścieżki na własne arkusze
// (np. wygenerowane w LPC Sprite Generator, 64x64px na klatkę).
const ENEMY_ANIM_DATA = {
    sheets: [
        // 'images/enemy/enemy.png',
    ],
    frameWidth: 64,
    frameHeight: 64,
    states: {
        idle:  { row: 0, frameCount: 1, frameInterval: 200, startFrame: 0, loop: true,  locked: false, next: null },
        move:  { row: 1, frameCount: 8, frameInterval: 90,  startFrame: 0, loop: true,  locked: false, next: null },
        hit:   { row: 2, frameCount: 4, frameInterval: 70,  startFrame: 0, loop: false, locked: true,  next: 'idle' },
        death: { row: 3, frameCount: 6, frameInterval: 120, startFrame: 0, loop: false, locked: true,  next: null }
    },
    initialState: 'idle'
};

class Enemy {
    constructor(x, y, patrolRange = 150) {
        this.x = x;
        this.y = y;
        this.width = 64;
        this.height = 64;
        this.speed = 1.2;

        this.hp = 2;
        this.alive = true;

        // Patrol między [startX, startX + patrolRange] - wróg odbija się na krańcach
        this.startX = x;
        this.patrolRange = patrolRange;
        this.direction = 1; // 1 = w prawo, -1 = w lewo (sterowanie flipem sprite'a)

        const sheets = ENEMY_ANIM_DATA.sheets.length > 0
            ? ENEMY_ANIM_DATA.sheets
            : [createPlaceholderSheet({
                frameWidth: ENEMY_ANIM_DATA.frameWidth,
                frameHeight: ENEMY_ANIM_DATA.frameHeight,
                rows: 4,
                cols: 8,
                color: '#D2691E'
            })];

        this.animator = new AnimatorController({ ...ENEMY_ANIM_DATA, sheets });
    }

    takeHit(damage = 1) {
        if (!this.alive) return;

        this.hp -= damage;

        if (this.hp <= 0) {
            this.hp = 0;
            this.alive = false;
            this.animator.play('death', { force: true });
        } else {
            this.animator.play('hit', { force: true });
        }
    }

    update(deltaTime) {
        const controlsLocked = !this.alive || this.animator.states[this.animator.currentState].locked;

        if (!controlsLocked) {
            this.x += this.speed * this.direction;

            if (this.x >= this.startX + this.patrolRange) {
                this.direction = -1;
            } else if (this.x <= this.startX) {
                this.direction = 1;
            }

            this.animator.play('move');
        }

        this.animator.update(deltaTime);
    }

    draw(ctx) {
        const frame = this.animator.getCurrentFrame();
        if (!frame.sheet) return;

        // Zamiast osobnych animacji "w lewo"/"w prawo" odbijamy tę samą klatkę w poziomie
        ctx.save();

        if (this.direction === -1) {
            ctx.translate(this.x + this.width, this.y);
            ctx.scale(-1, 1);
            ctx.drawImage(
                frame.sheet,
                frame.sx, frame.sy, frame.sWidth, frame.sHeight,
                0, 0, this.width, this.height
            );
        } else {
            ctx.drawImage(
                frame.sheet,
                frame.sx, frame.sy, frame.sWidth, frame.sHeight,
                this.x, this.y, this.width, this.height
            );
        }

        ctx.restore();
    }

    getBounds() {
        return { x: this.x, y: this.y, width: this.width, height: this.height };
    }
}
