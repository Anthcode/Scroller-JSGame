// ==== WRÓG ====
// images/enemy/enemy.png - złożony z oryginalnego assetu tej samej gry
// (wcześniejszy deploy: https://parallax-fx.web.app/, patrz
// tools/original_game_assets/enemy.png). Skrypt składający:
// tools/compose_enemy_sheet.py. Oryginał miał tylko 2-klatkowy chód, bez
// animacji trafienia/śmierci - hit i death są tu syntetyzowane (tint,
// obrót+zanik). 110x110px/klatkę, układ wierszy jak w `states` poniżej.
const ENEMY_ANIM_DATA = {
    sheets: [
        'images/enemy/enemy.png',
    ],
    frameWidth: 110,
    frameHeight: 110,
    states: {
        idle:  { row: 0, frameCount: 1, frameInterval: 200, startFrame: 0, loop: true,  locked: false, next: null },
        move:  { row: 1, frameCount: 2, frameInterval: 150, startFrame: 0, loop: true,  locked: false, next: null },
        hit:   { row: 2, frameCount: 4, frameInterval: 70,  startFrame: 0, loop: false, locked: true,  next: 'idle' },
        death: { row: 3, frameCount: 6, frameInterval: 120, startFrame: 0, loop: false, locked: true,  next: null }
    },
    initialState: 'idle'
};

class Enemy {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 76;
        this.height = 76;
        this.speed = 1.2; // dodatkowa prędkość własna wroga, ponad bazowe tempo świata (worldSpeed)

        this.hp = 2;
        this.alive = true;

        // Wróg w tym endless runnerze zawsze płynie w lewo razem ze światem (patrz update()) -
        // direction istnieje tylko dla draw(), który odbija sprite'a w poziomie zależnie
        // od kierunku ruchu (utrwalone w PR #17: natywna klatka arkusza = ruch w lewo).
        this.direction = -1;

        const sheets = ENEMY_ANIM_DATA.sheets.length > 0
            ? ENEMY_ANIM_DATA.sheets
            : [createPlaceholderSheet({
                frameWidth: ENEMY_ANIM_DATA.frameWidth,
                frameHeight: ENEMY_ANIM_DATA.frameHeight,
                rows: 4,
                cols: 6,
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

    // worldSpeed - bazowe tempo świata z krzywej trudności (game.js), to samo, które widzi
    // tło (Layers), więc wróg płynie z tym samym tempem co ziemia. enemySpeedBonus - dodatkowe
    // wzmocnienie tempa wroga z tej samej krzywej (rośnie z czasem przeżycia).
    update(deltaTime, worldSpeed, enemySpeedBonus = 0) {
        const controlsLocked = !this.alive || this.animator.states[this.animator.currentState].locked;

        if (!controlsLocked) {
            this.x -= (worldSpeed + this.speed + enemySpeedBonus) * timeScale;
            this.animator.play('move');
        }

        this.animator.update(deltaTime);
    }

    draw(ctx) {
        const frame = this.animator.getCurrentFrame();
        if (!frame.sheet) return;

        // Zamiast osobnych animacji "w lewo"/"w prawo" odbijamy tę samą klatkę w poziomie.
        // Domyślna klatka w arkuszu ma wyglądać jak ruch w lewo, więc odbijamy przy ruchu w prawo.
        ctx.save();

        if (this.direction === 1) {
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

    // Wcięty hitbox, symetrycznie - klatki mają tylko ~3-4px przezroczystego marginesu,
    // więc niewielkie, jednolite wcięcie wystarcza, żeby kolizje pasowały do sylwetki.
    getBounds() {
        const inset = 4;
        return {
            x: this.x + inset,
            y: this.y + inset,
            width: this.width - inset * 2,
            height: this.height - inset * 2
        };
    }
}
