// ==== WROGOWIE ====
// Trzy typy wroga, każdy ze swoim arkuszem/statystykami w ENEMY_TYPES - wspólna klasa
// Enemy tylko czyta konfigurację po `type`. Który typ i kiedy się pojawia decyduje
// pickEnemyType() w game.js (spawner odblokowuje warianty stopniowo z czasem przeżycia).
//
//   walker     - images/enemy/enemy.png, oryginalny naziemny wróg (patrz niżej).
//   walkerFast - ta sama grafika co walker (bez nowego assetu), przeskalowana i
//                zabarwiona na fioletowo w locie (_applyTint) - mniej hp, więcej prędkości.
//   ghost      - images/enemy/ghost.png, nowy latający wróg złożony z fly-enemy.png
//                (tools/compose_fly_enemy_sheet.py). Unosi się nad ziemią z lekkim
//                kołysaniem (sinusoida w update()) na wysokości osiągalnej tylko skokiem -
//                dotknięcie od dołu/boku rani gracza tak samo jak wejście w naziemnego
//                wroga, zabija go wyłącznie stomp w trakcie opadania (patrz game.js).
//
// images/enemy/enemy.png - złożony z oryginalnego assetu tej samej gry (wcześniejszy
// deploy: https://parallax-fx.web.app/, patrz tools/original_game_assets/enemy.png).
// Oryginał miał tylko 2-klatkowy chód, bez animacji trafienia/śmierci - hit i death są
// syntetyzowane (tint, obrót+zanik). fly-enemy.png miał za to naturalną animację lotu
// (falujący "ogon" mgły) - move ducha używa jej wprost, bez syntezy.
const ENEMY_TYPES = {
    walker: {
        animData: {
            sheets: ['images/enemy/enemy.png'],
            frameWidth: 110,
            frameHeight: 110,
            states: {
                idle:  { row: 0, frameCount: 1, frameInterval: 200, startFrame: 0, loop: true,  locked: false, next: null },
                move:  { row: 1, frameCount: 2, frameInterval: 150, startFrame: 0, loop: true,  locked: false, next: null },
                hit:   { row: 2, frameCount: 4, frameInterval: 70,  startFrame: 0, loop: false, locked: true,  next: 'idle' },
                death: { row: 3, frameCount: 6, frameInterval: 120, startFrame: 0, loop: false, locked: true,  next: null }
            },
            initialState: 'idle'
        },
        width: 76, height: 76,
        inset: { x: 4, top: 4, bottom: 4 },
        hp: 2,
        speedBonus: 1.2, // dodatkowa prędkość własna wroga, ponad bazowe tempo świata (worldSpeed)
        scoreValue: 100,
        placeholderColor: '#D2691E'
    },
    walkerFast: {
        // Ta sama grafika/animacje co walker - wariant różni się statystykami, rozmiarem
        // (mniejszy = czytelnie "inny" na pierwszy rzut oka) i fioletowym tintem w draw(),
        // żeby nie wymagać nowego assetu dla samej różnorodności.
        animData: {
            sheets: ['images/enemy/enemy.png'],
            frameWidth: 110,
            frameHeight: 110,
            states: {
                idle:  { row: 0, frameCount: 1, frameInterval: 200, startFrame: 0, loop: true,  locked: false, next: null },
                move:  { row: 1, frameCount: 2, frameInterval: 110, startFrame: 0, loop: true,  locked: false, next: null },
                hit:   { row: 2, frameCount: 4, frameInterval: 70,  startFrame: 0, loop: false, locked: true,  next: 'idle' },
                death: { row: 3, frameCount: 6, frameInterval: 120, startFrame: 0, loop: false, locked: true,  next: null }
            },
            initialState: 'idle'
        },
        width: 56, height: 56,
        inset: { x: 3, top: 3, bottom: 3 },
        hp: 1,
        speedBonus: 3.2,
        scoreValue: 150,
        tint: 'rgba(150,70,230,0.45)',
        placeholderColor: '#D2691E'
    },
    ghost: {
        animData: {
            sheets: ['images/enemy/ghost.png'],
            frameWidth: 120,
            frameHeight: 120,
            states: {
                idle:  { row: 0, frameCount: 1,  frameInterval: 200, startFrame: 0, loop: true,  locked: false, next: null },
                move:  { row: 1, frameCount: 11, frameInterval: 90,  startFrame: 0, loop: true,  locked: false, next: null },
                hit:   { row: 2, frameCount: 4,  frameInterval: 70,  startFrame: 0, loop: false, locked: true,  next: 'idle' },
                death: { row: 3, frameCount: 6,  frameInterval: 110, startFrame: 0, loop: false, locked: true,  next: null }
            },
            initialState: 'idle'
        },
        width: 80, height: 104,
        // Hitbox nieco mniejszy niż cała wizualna sylwetka (marginesy przezroczystości).
        inset: { x: 20, top: 20, bottom: 34 },
        hp: 1,
        speedBonus: 0.6,
        scoreValue: 200,
        // groundClearance - odległość dołu WIZUALNEGO sprite'a od GROUND_LINE_Y w pozycji
        // bazowej (przed kołysaniem). Duch unosi się nad zasięgiem stojącego gracza (zmierzone
        // empirycznie: hitbox stojącego gracza ma górę na y=394, tu duch ma dół hitboxa na
        // y=375, czyli 19px marginesu nawet przy kołysaniu w dół) - więc kontakt z nim wymaga
        // skoku. Nie trzeba trafiać "od góry w trakcie opadania" jak naziemnego wroga - patrz
        // isHoverKill w handlePlayerEnemyCollisions (game.js): dostępne okno na precyzyjny
        // stomp (~41px między zasięgiem stania a szczytem skoku, zmierzone tą samą metodą)
        // jest za wąskie na niezawodne trafienie na dotyku, więc każdy kontakt w skoku
        // wystarcza - i tak dotknąć ducha można wyłącznie skacząc.
        hover: { groundClearance: 75, amplitude: 8, periodMs: 1400 },
        placeholderColor: '#9fd3ff'
    }
};

class Enemy {
    // groundLineY - wspólna "linia gruntu" (GROUND_LINE_Y), nie pozycja y konkretnej klatki;
    // każdy typ sam liczy swoje y od tej samej linii (naziemny: przy niej, latający: nad nią).
    constructor(x, groundLineY, type = 'walker') {
        const config = ENEMY_TYPES[type];
        if (!config) {
            console.warn(`Enemy: nieznany typ "${type}", używam "walker"`);
            return new Enemy(x, groundLineY, 'walker');
        }

        this.type = type;
        this.config = config;

        this.x = x;
        this.width = config.width;
        this.height = config.height;

        if (config.hover) {
            this.baseY = groundLineY - config.hover.groundClearance - this.height;
            this.hoverPhase = rng() * Math.PI * 2; // przesunięcie fazy - wrogowie nie kołyszą się w unisono
            this.elapsedMs = 0;
        } else {
            this.baseY = groundLineY - this.height;
        }
        this.y = this.baseY;

        this.speed = config.speedBonus;
        this.hp = config.hp;
        this.alive = true;

        // Wróg w tym endless runnerze zawsze płynie w lewo razem ze światem (patrz update()) -
        // direction istnieje tylko dla draw(), który odbija sprite'a w poziomie zależnie
        // od kierunku ruchu (utrwalone w PR #17: natywna klatka arkusza = ruch w lewo).
        this.direction = -1;

        const sheets = config.animData.sheets.length > 0
            ? config.animData.sheets
            : [createPlaceholderSheet({
                frameWidth: config.animData.frameWidth,
                frameHeight: config.animData.frameHeight,
                rows: 4,
                cols: 6,
                color: config.placeholderColor
            })];

        this.animator = new AnimatorController({ ...config.animData, sheets });
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

            if (this.config.hover) {
                this.elapsedMs += deltaTime;
                const t = (this.elapsedMs / this.config.hover.periodMs) * Math.PI * 2 + this.hoverPhase;
                this.y = this.baseY + Math.sin(t) * this.config.hover.amplitude;
            }

            this.animator.play('move');
        }

        this.animator.update(deltaTime);
    }

    draw(ctx) {
        const frame = this.animator.getCurrentFrame();
        if (!frame.sheet) return;

        // Warianty z tintem (walkerFast) rysują klatkę najpierw na małym, przezroczystym
        // buforze offscreen i dopiero stamtąd na głównym canvasie - inaczej 'source-atop'
        // barwiłby cały prostokąt, bo główny canvas ma już nieprzezroczyste tło pod spodem
        // (warstwy paralaksy) i nie da się nim odróżnić "piksel wroga" od "piksel tła".
        const source = this.config.tint ? this._tintedFrame(frame) : frame.sheet;
        const sx = this.config.tint ? 0 : frame.sx;
        const sy = this.config.tint ? 0 : frame.sy;
        const sWidth = this.config.tint ? this.width : frame.sWidth;
        const sHeight = this.config.tint ? this.height : frame.sHeight;

        // Zamiast osobnych animacji "w lewo"/"w prawo" odbijamy tę samą klatkę w poziomie.
        // Domyślna klatka w arkuszu ma wyglądać jak ruch w lewo, więc odbijamy przy ruchu w prawo.
        ctx.save();

        // Noc (WorldDirector, world.js): wrogowie poza kołem światła gracza są przygaszeni -
        // ustawione WEWNĄTRZ ctx.save()/restore(), więc nie trzeba osobno resetować globalAlpha.
        ctx.globalAlpha = getNightDimAlpha(this.x + this.width / 2, this.y + this.height / 2);

        if (this.direction === 1) {
            ctx.translate(this.x + this.width, this.y);
            ctx.scale(-1, 1);
            ctx.drawImage(source, sx, sy, sWidth, sHeight, 0, 0, this.width, this.height);
        } else {
            ctx.drawImage(source, sx, sy, sWidth, sHeight, this.x, this.y, this.width, this.height);
        }

        ctx.restore();
    }

    // Rysuje aktualną klatkę na prywatnym, przezroczystym buforze offscreen (utworzonym raz,
    // per instancja) i barwi TYLKO jej nieprzezroczyste piksele przez 'source-atop' - dzięki
    // izolacji od reszty sceny nie trzeba osobnego, zabarwionego assetu dla wariantu walkerFast.
    _tintedFrame(frame) {
        if (!this._tintCanvas) {
            this._tintCanvas = document.createElement('canvas');
            this._tintCanvas.width = this.width;
            this._tintCanvas.height = this.height;
            this._tintCtx = this._tintCanvas.getContext('2d');
        }

        const tctx = this._tintCtx;
        tctx.clearRect(0, 0, this.width, this.height);
        tctx.drawImage(
            frame.sheet,
            frame.sx, frame.sy, frame.sWidth, frame.sHeight,
            0, 0, this.width, this.height
        );
        tctx.globalCompositeOperation = 'source-atop';
        tctx.fillStyle = this.config.tint;
        tctx.fillRect(0, 0, this.width, this.height);
        tctx.globalCompositeOperation = 'source-over';

        return this._tintCanvas;
    }

    // Wcięty hitbox, per typ (patrz ENEMY_TYPES) - klatki mają różny margines przezroczystości,
    // więc każdy typ dostaje własne, dopasowane wcięcie zamiast jednej stałej dla wszystkich.
    getBounds() {
        const { x: insetX, top, bottom } = this.config.inset;
        return {
            x: this.x + insetX,
            y: this.y + top,
            width: this.width - insetX * 2,
            height: this.height - top - bottom
        };
    }
}
