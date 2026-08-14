// ==== ANIMATOR CONTROLLER ====
// Generyczny, data-driven system animacji sprite'ów.
// Wzorowany na koncepcji "Animator Controller" z tutoriala Franks Laboratory:
// jeden obiekt danych (animData) opisuje wszystkie stany animacji, a klasa
// AnimatorController zajmuje się przełączaniem klatek i stanów w czasie.

class AnimatorController {
    /**
     * @param {Object} animData
     * @param {(string|HTMLImageElement)[]} animData.sheets - warianty spritesheeta
     *        (np. różne kolory/skiny tej samej postaci); może to być tablica
     *        ścieżek do plików albo gotowych obiektów Image/Canvas.
     * @param {number} animData.frameWidth - szerokość pojedynczej klatki w px.
     * @param {number} animData.frameHeight - wysokość pojedynczej klatki w px.
     * @param {Object.<string, Object>} animData.states - mapa: nazwa stanu -> opis animacji.
     *        Każdy stan: { row, frameCount, frameInterval, startFrame, loop, locked, next }
     *          - row: numer wiersza w arkuszu, z którego brane są klatki
     *          - frameCount: liczba klatek w animacji
     *          - frameInterval: czas (ms) pomiędzy klatkami
     *          - startFrame: klatka, od której animacja startuje (domyślnie 0)
     *          - loop: czy animacja ma się zapętlać po dojściu do ostatniej klatki
     *          - locked: czy animacja blokuje przełączanie na inną, dopóki się nie skończy
     *          - next: nazwa stanu, do którego automatycznie przejść po zakończeniu (jeśli !loop)
     * @param {string} animData.initialState - nazwa stanu, od którego zaczyna animator.
     */
    constructor(animData) {
        this.frameWidth = animData.frameWidth;
        this.frameHeight = animData.frameHeight;
        this.states = animData.states;

        // Wczytujemy warianty spritesheeta - jeśli podano ścieżkę (string), tworzymy Image,
        // jeśli podano już gotowy element (Image/Canvas), używamy go bez zmian.
        this.sheets = animData.sheets.map(sheet => {
            if (typeof sheet === 'string') {
                const img = new Image();
                img.src = sheet;
                return img;
            }
            return sheet;
        });

        this.currentSheet = this.pickSheet();
        this.currentState = animData.initialState;
        this.currentFrame = this.states[this.currentState].startFrame || 0;
        this.frameTimer = 0;
        this.finished = false;
    }

    // Losuje jeden z wariantów spritesheeta (np. inny kolor ekwipunku postaci)
    pickSheet() {
        return this.sheets[Math.floor(Math.random() * this.sheets.length)];
    }

    /**
     * Przełącza animację na stan `name`.
     * Jeśli aktualny stan jest `locked` i jeszcze się nie zakończył (`finished === false`),
     * przełączenie jest ignorowane - chyba że podano `force: true`.
     */
    play(name, { force = false } = {}) {
        const nextState = this.states[name];
        if (!nextState) {
            console.warn(`AnimatorController: nieznany stan animacji "${name}"`);
            return;
        }
        if (this.currentState === name) return;

        const current = this.states[this.currentState];
        if (!force && current && current.locked && !this.finished) return;

        this.currentState = name;
        this.currentFrame = nextState.startFrame || 0;
        this.frameTimer = 0;
        this.finished = false;
    }

    // Zlicza czas i przesuwa animację o kolejne klatki zgodnie z frameInterval danego stanu
    update(deltaTime) {
        const state = this.states[this.currentState];
        if (!state) return;

        this.frameTimer += deltaTime;

        if (this.frameTimer >= state.frameInterval) {
            this.frameTimer -= state.frameInterval;
            this.currentFrame++;

            if (this.currentFrame >= state.frameCount) {
                if (state.loop) {
                    this.currentFrame = 0;
                } else {
                    // Animacja jednorazowa - zatrzymujemy się na ostatniej klatce
                    this.currentFrame = state.frameCount - 1;
                    this.finished = true;

                    if (state.next) {
                        this.play(state.next, { force: true });
                    }
                }
            }
        }
    }

    // Zwraca dane potrzebne do wycięcia aktualnej klatki z arkusza (do ctx.drawImage)
    getCurrentFrame() {
        const state = this.states[this.currentState];
        return {
            sheet: this.currentSheet,
            sx: this.currentFrame * this.frameWidth,
            sy: state.row * this.frameHeight,
            sWidth: this.frameWidth,
            sHeight: this.frameHeight
        };
    }

    // Resetuje animator do stanu początkowego i losuje nowy wariant spritesheeta
    reset(initialState) {
        this.currentSheet = this.pickSheet();
        this.currentState = initialState || this.currentState;
        this.currentFrame = this.states[this.currentState].startFrame || 0;
        this.frameTimer = 0;
        this.finished = false;
    }
}

// ==== POMOCNICZY PLACEHOLDER SPRITESHEET ====
// Dopóki nie podłączymy prawdziwych arkuszy z LPC Sprite Generatora, generujemy
// prosty arkusz "na sucho" (kolorowe klatki z numerem wiersz:kolumna), żeby cały
// system animacji dało się od razu przetestować wizualnie w przeglądarce.
function createPlaceholderSheet({ frameWidth, frameHeight, rows, cols, color = '#4A90E2' }) {
    const canvas = document.createElement('canvas');
    canvas.width = frameWidth * cols;
    canvas.height = frameHeight * rows;
    const c = canvas.getContext('2d');

    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const px = col * frameWidth;
            const py = row * frameHeight;

            c.fillStyle = color;
            c.fillRect(px + 4, py + 4, frameWidth - 8, frameHeight - 8);
            c.strokeStyle = 'rgba(255, 255, 255, 0.6)';
            c.strokeRect(px + 4, py + 4, frameWidth - 8, frameHeight - 8);

            c.fillStyle = 'white';
            c.font = '10px monospace';
            c.fillText(`${row}:${col}`, px + 6, py + 16);
        }
    }
    return canvas;
}
