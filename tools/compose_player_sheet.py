"""
Składa images/player/character.png z oryginalnych assetów tej samej gry
(idlesheet.png, runsheet.png, jump.png, die.png - pobrane z wcześniejszego
deployu https://parallax-fx.web.app/, patrz tools/original_game_assets/)
w jeden spritesheet zgodny z PLAYER_ANIM_DATA w player.js.

Źródła to CZYSTE poziome paski klatek o stałej szerokości (w przeciwieństwie
do nierówno rozstawionego obrazu z AI), więc cięcie jest tu prostą
matematyką: cropWidth*i - dokładnie tak, jak robił to oryginalny mainok.js.

Układ wynikowy (10 kolumn, 6 wierszy, FRAME x FRAME na klatkę):
  0 idle        10 klatek  <- idlesheet.png (subtelna animacja, nie statyczna)
  1 move-left   10 klatek  <- runsheet.png, każda klatka odbita poziomo
  2 move-right  10 klatek  <- runsheet.png
  3 jump        10 klatek  <- jump.png
  4 hit          6 klatek  <- kilka klatek idle z naprzemiennym czerwonym tintem
                              (oryginalna gra nie miała osobnej animacji trafienia)
  5 death       10 klatek  <- die.png

Użycie: pip install Pillow && python3 tools/compose_player_sheet.py
Nadpisuje images/player/character.png.
"""
import os
from PIL import Image

_HERE = os.path.join(os.path.dirname(__file__), "original_game_assets")
OUT = os.path.join(os.path.dirname(__file__), "..", "images", "player", "character.png")

FRAME = 150   # rozdzielczość klatki w wynikowym arkuszu (zachowuje szczegóły źródeł)
COLS = 10
ROWS = 6

SOURCES = {
    "idle": dict(file="idlesheet.png", crop_w=116, crop_h=220, count=10),
    "run": dict(file="runsheet.png", crop_w=182, crop_h=229, count=10),
    "jump": dict(file="jump.png", crop_w=181, crop_h=242, count=10),
    "die": dict(file="die.png", crop_w=241, crop_h=249, count=10),
}


def load_frames(key):
    spec = SOURCES[key]
    img = Image.open(os.path.join(_HERE, spec["file"])).convert("RGBA")
    frames = []
    for i in range(spec["count"]):
        x0 = i * spec["crop_w"]
        frame = img.crop((x0, 0, x0 + spec["crop_w"], spec["crop_h"]))
        frames.append(frame)
    return frames


def fit_into_cell(char_img):
    """Skaluje (zachowując proporcje) i centruje/przykleja do dołu w komórce FRAMExFRAME."""
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


def tint_red(img, strength=0.45):
    r, g, b, a = img.split()
    overlay = Image.new("RGBA", img.size, (255, 60, 60, int(255 * strength)))
    tinted = Image.alpha_composite(img, overlay)
    # zachowaj oryginalną alfę (nie „poszerzaj” sylwetki czerwienią poza konturem)
    tr, tg, tb, _ = tinted.split()
    return Image.merge("RGBA", (tr, tg, tb, a))


def main():
    idle_frames = [fit_into_cell(f) for f in load_frames("idle")]
    run_frames = [fit_into_cell(f) for f in load_frames("run")]
    run_left_frames = [f.transpose(Image.FLIP_LEFT_RIGHT) for f in run_frames]
    jump_frames = [fit_into_cell(f) for f in load_frames("jump")]
    die_frames = [fit_into_cell(f) for f in load_frames("die")]

    hit_frames = []
    for i in range(6):
        base = idle_frames[i % len(idle_frames)]
        hit_frames.append(tint_red(base) if i % 2 == 0 else base)

    rows = [idle_frames, run_left_frames, run_frames, jump_frames, hit_frames, die_frames]

    sheet = Image.new("RGBA", (FRAME * COLS, FRAME * ROWS), (0, 0, 0, 0))
    counts = {}
    names = ["idle", "move-left", "move-right", "jump", "hit", "death"]
    for row_idx, frames in enumerate(rows):
        counts[names[row_idx]] = len(frames)
        for col_idx, frame in enumerate(frames):
            sheet.paste(frame, (col_idx * FRAME, row_idx * FRAME), frame)

    sheet.save(OUT)
    print("counts:", counts)
    print("saved:", OUT, sheet.size)


if __name__ == "__main__":
    main()
