"""
Składa images/enemy/enemy.png z oryginalnego assetu enemy.png (2 klatki, z
https://parallax-fx.web.app/) w spritesheet zgodny z ENEMY_ANIM_DATA.

Oryginalna gra nie miała animacji trafienia ani śmierci wroga (wróg po prostu
znikał) - hit i death są tu syntetyzowane (tint na trafienie, obrót+zanik na
śmierć), tak samo jak wcześniej robiłem to proceduralnie.

Układ (kolumny, wiersze, FRAME x FRAME na klatkę):
  0 idle    1 klatka  <- pierwsza klatka enemy.png
  1 move    2 klatki  <- obie klatki enemy.png (oryginalny 2-klatkowy chód)
  2 hit     4 klatki  <- klatka enemy.png z naprzemiennym czerwonym tintem
  3 death   6 klatek  <- klatka enemy.png, progresywny obrót + zanik

Użycie: pip install Pillow && python3 tools/compose_enemy_sheet.py
Nadpisuje images/enemy/enemy.png.
"""
import os
from PIL import Image

_HERE = os.path.join(os.path.dirname(__file__), "original_game_assets")
OUT = os.path.join(os.path.dirname(__file__), "..", "images", "enemy", "enemy.png")

FRAME = 110
COLS = 6
ROWS = 4

CROP_W = 92.5
CROP_H = 93


def load_frames():
    img = Image.open(os.path.join(_HERE, "enemy.png")).convert("RGBA")
    frames = []
    for i in range(2):
        x0 = round(i * CROP_W)
        x1 = round((i + 1) * CROP_W)
        frames.append(img.crop((x0, 0, x1, round(CROP_H))))
    return frames


def fit_into_cell(char_img):
    cw, ch = char_img.size
    margin = 6
    scale = min((FRAME - margin) / cw, (FRAME - margin) / ch)
    new_w = max(1, round(cw * scale))
    new_h = max(1, round(ch * scale))
    resized = char_img.resize((new_w, new_h), Image.LANCZOS)
    cell = Image.new("RGBA", (FRAME, FRAME), (0, 0, 0, 0))
    px = (FRAME - new_w) // 2
    py = FRAME - 3 - new_h
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
    move_frames = cells

    hit_frames = [tint_red(cells[0]) if i % 2 == 0 else cells[0] for i in range(4)]

    death_frames = []
    for i in range(6):
        angle = min(60, i * 12)
        alpha = 255 if i < 5 else 150
        frame = cells[1].rotate(-angle, resample=Image.NEAREST, expand=False,
                                 center=(FRAME // 2, FRAME - 12))
        if alpha < 255:
            r, g, b, a = frame.split()
            a = a.point(lambda v: v * alpha // 255)
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
