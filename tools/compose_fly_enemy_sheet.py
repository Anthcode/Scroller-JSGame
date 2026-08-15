"""
Składa images/enemy/ghost.png z oryginalnego assetu fly-enemy.png (11 klatek,
z https://parallax-fx.web.app/) w spritesheet zgodny z GHOST_ANIM_DATA (enemy.js).

fly-enemy.png ma naturalną animację falującego "ogona" mgły pod duchem (widoczne
w danych pikseli - klatka 10 niemal wraca do klatki 0, więc to płynna pętla) -
w przeciwieństwie do enemy.png (2 statyczne klatki chodu) nie trzeba było niczego
syntetyzować dla ruchu. hit/death są syntetyzowane tak samo jak w
compose_enemy_sheet.py (tint na trafienie), ale death to zanikanie+"rozdmuchanie"
zamiast obrotu - pasuje lepiej do ducha niż spin śmierci naziemnego wroga.

Układ (kolumny, wiersze, FRAME x FRAME na klatkę):
  0 idle    1 klatka   <- pierwsza klatka fly-enemy.png
  1 move   11 klatek   <- wszystkie klatki fly-enemy.png (naturalna animacja lotu)
  2 hit     4 klatki   <- klatka fly-enemy.png z naprzemiennym czerwonym tintem
  3 death   6 klatek   <- klatka fly-enemy.png, progresywne powiększenie + zanik

Użycie: pip install Pillow && python3 tools/compose_fly_enemy_sheet.py
Nadpisuje images/enemy/ghost.png.
"""
import os
from PIL import Image

_HERE = os.path.join(os.path.dirname(__file__), "original_game_assets")
OUT = os.path.join(os.path.dirname(__file__), "..", "images", "enemy", "ghost.png")

FRAME = 120
COLS = 11
ROWS = 4

# Granice klatek źródłowych zmierzone z kanału alfa (kolumny non-transparentne,
# oddzielone wąskimi przerwami) - fly-enemy.png nie ma stałej szerokości komórki.
SOURCE_FRAME_BOUNDS = [
    (1, 85), (90, 175), (179, 264), (268, 353), (357, 443),
    (446, 532), (536, 621), (625, 710), (714, 799), (803, 888), (892, 976),
]


def load_frames():
    img = Image.open(os.path.join(_HERE, "fly-enemy.png")).convert("RGBA")
    return [img.crop((x0, 0, x1 + 1, img.height)) for x0, x1 in SOURCE_FRAME_BOUNDS]


def fit_into_cell(char_img, target=FRAME - 10, scale_mult=1.0):
    cw, ch = char_img.size
    scale = min(target / cw, target / ch) * scale_mult
    new_w = max(1, round(cw * scale))
    new_h = max(1, round(ch * scale))
    resized = char_img.resize((new_w, new_h), Image.LANCZOS)
    cell = Image.new("RGBA", (FRAME, FRAME), (0, 0, 0, 0))
    px = (FRAME - new_w) // 2
    py = FRAME - 4 - new_h
    cell.paste(resized, (px, py), resized)
    return cell


def tint_red(img, strength=0.5):
    overlay = Image.new("RGBA", img.size, (255, 60, 60, int(255 * strength)))
    tinted = Image.alpha_composite(img, overlay)
    tr, tg, tb, _ = tinted.split()
    _, _, _, a = img.split()
    return Image.merge("RGBA", (tr, tg, tb, a))


def main():
    raw_frames = load_frames()
    cells = [fit_into_cell(f) for f in raw_frames]

    idle_frames = [cells[0]]
    move_frames = cells  # 11 klatek - naturalna animacja z assetu, bez syntezowania

    hit_frames = [tint_red(cells[0]) if i % 2 == 0 else cells[0] for i in range(4)]

    # Death: duch "rozwiewa się" - rośnie i znika, bez obrotu (w przeciwieństwie do
    # naziemnego wroga - to bardziej pasuje do ducha niż spin).
    death_frames = []
    for i in range(6):
        scale_mult = 1.0 + i * 0.12
        alpha = 255 - round(i * (255 / 5))
        frame = fit_into_cell(raw_frames[0], scale_mult=scale_mult)
        if alpha < 255:
            r, g, b, a = frame.split()
            a = a.point(lambda v: v * max(alpha, 0) // 255)
            frame = Image.merge("RGBA", (r, g, b, a))
        death_frames.append(frame)

    rows = [idle_frames, move_frames, hit_frames, death_frames]
    names = ["idle", "move", "hit", "death"]

    sheet = Image.new("RGBA", (FRAME * COLS, FRAME * ROWS), (0, 0, 0, 0))
    counts = {}
    for row_idx, frames in enumerate(rows):
        counts[names[row_idx]] = len(frames)
        for col_idx, frame in enumerate(frames):
            sheet.paste(frame, (col_idx * FRAME, row_idx * FRAME), frame)

    sheet.save(OUT)
    print("counts:", counts)
    print("saved:", OUT, sheet.size)


if __name__ == "__main__":
    main()
