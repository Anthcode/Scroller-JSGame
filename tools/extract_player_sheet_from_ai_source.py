"""
Wycina spritesheet gracza (images/player/character.png) z surowego obrazu
wygenerowanego przez model AI (tools/player_ai_source_raw.png, patrz prompt
w README/rozmowie - postać "ninja", układ 1/9/9/6/6/6 klatek na wiersz).

Modele obrazkowe (w tym GPT Image) NIE trzymają jednej sztywnej siatki kolumn
w całym arkuszu - np. wiersz "jump" (6 klatek) miał postacie nierówno
rozstawione w ~2/3 szerokości obrazu, inaczej niż wiersze z 9 klatkami.
Dlatego zamiast liczyć komórki matematycznie, wykrywamy klatki metodą
"connected columns": skanujemy każdy wiersz w poziomie i szukamy spójnych
zakresów kolumn z nie-tłem (z tolerancją na małe przerwy, np. między nogami
biegnącej postaci), po czym każdą postać przycinamy do jej bounding boxa
i wklejamy wyśrodkowaną/przyklejoną do dołu w komórce 64x64.

Użycie: pip install Pillow && python3 tools/extract_player_sheet_from_ai_source.py
Nadpisuje images/player/character.png.
"""
import os
from PIL import Image

_HERE = os.path.dirname(__file__)
SRC = os.path.join(_HERE, "player_ai_source_raw.png")
OUT = os.path.join(_HERE, "..", "images", "player", "character.png")

ROWS = 6
FRAME = 64
BG_THRESHOLD = 222
GAP_MERGE = 18  # przerwy mniejsze niż tyle px łączymy w jedną postać


def is_bg(p):
    r, g, b = p[:3]
    return min(r, g, b) > BG_THRESHOLD


def find_column_spans(row_rgb):
    w, h = row_rgb.size
    px = row_rgb.load()
    has_content = []
    for x in range(w):
        has = any(not is_bg(px[x, y]) for y in range(0, h, 2))
        has_content.append(has)

    raw_ranges = []
    start = None
    for x, has in enumerate(has_content):
        if has and start is None:
            start = x
        if not has and start is not None:
            raw_ranges.append([start, x - 1])
            start = None
    if start is not None:
        raw_ranges.append([start, w - 1])

    # scal sąsiednie zakresy oddzielone małą przerwą (np. między nogami)
    merged = []
    for r in raw_ranges:
        if merged and r[0] - merged[-1][1] <= GAP_MERGE:
            merged[-1][1] = r[1]
        else:
            merged.append(r)
    return merged


def make_alpha(img_rgb):
    w, h = img_rgb.size
    rgba = img_rgb.convert("RGBA")
    px = rgba.load()
    for y in range(h):
        for x in range(w):
            if is_bg(px[x, y]):
                r, g, b, a = px[x, y]
                px[x, y] = (r, g, b, 0)
    return rgba


def tight_bbox(rgba_cell):
    return rgba_cell.split()[-1].getbbox()


def build_frame(char_rgba):
    cw, ch = char_rgba.size
    scale = min(56 / cw, 56 / ch)
    new_w = max(1, round(cw * scale))
    new_h = max(1, round(ch * scale))
    char_resized = char_rgba.resize((new_w, new_h), Image.LANCZOS)
    frame = Image.new("RGBA", (FRAME, FRAME), (0, 0, 0, 0))
    px = (FRAME - new_w) // 2
    py = FRAME - 4 - new_h
    frame.paste(char_resized, (px, py), char_resized)
    return frame


def main():
    src = Image.open(SRC).convert("RGB")
    w, h = src.size
    cell_h = h / ROWS

    expected = [
        ("idle", 0, 1),
        ("move-left", 1, 9),
        ("move-right", 2, 9),
        ("jump", 3, 6),
        ("hit", 4, 6),
        ("death", 5, 6),
    ]

    sheet = Image.new("RGBA", (FRAME * 9, FRAME * ROWS), (0, 0, 0, 0))
    counts = {}

    for out_row, (name, src_row, max_cols) in enumerate(expected):
        y0 = round(src_row * cell_h)
        y1 = round((src_row + 1) * cell_h)
        row_rgb = src.crop((0, y0, w, y1))
        row_rgba = make_alpha(row_rgb)

        spans = find_column_spans(row_rgb)
        spans = spans[:max_cols]  # bierzemy maksymalnie tyle, ile oczekujemy
        counts[name] = len(spans)

        for col, (sx0, sx1) in enumerate(spans):
            cell = row_rgba.crop((sx0, 0, sx1 + 1, row_rgba.height))
            bbox = tight_bbox(cell)
            if bbox is None:
                continue
            char = cell.crop(bbox)
            frame = build_frame(char)
            sheet.paste(frame, (col * FRAME, out_row * FRAME), frame)

    sheet.save(OUT)
    print("counts:", counts)
    print("saved:", OUT, sheet.size)


if __name__ == "__main__":
    main()
