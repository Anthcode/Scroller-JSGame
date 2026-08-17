#!/usr/bin/env python3
"""Pipeline generacji assetow tematu (spec: docs/superpowers/specs/2026-08-17-*.md, §3).

Przebieg: assets-manifest.json -> prompt -> OpenAI Images API -> images/themes/_raw/
-> post-processing (Pillow, bez LLM) -> images/themes/<temat>/ + generation-log.jsonl.

Uruchamianie (z korzenia repo):
  python tools/generate_theme_assets.py --dry-run              # tylko wypisz prompty
  python tools/generate_theme_assets.py                        # generuj brakujace + zbuduj wyjscia
  python tools/generate_theme_assets.py --only dusty_player_run --force
  python tools/generate_theme_assets.py --validate-only        # sprawdz gotowe pliki bez API
Wymaga: pip install pillow openai; klucz w env OPENAI_API_KEY (poza --dry-run/--validate-only).
"""
import argparse
import json
import os
import sys

try:
    from PIL import Image, ImageOps
except ImportError:
    raise SystemExit("Brak zaleznosci Pillow. Zainstaluj: pip install pillow")

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_MANIFEST = os.path.join(REPO_ROOT, "assets-manifest.json")
RAW_DIR = os.path.join(REPO_ROOT, "images", "themes", "_raw")
LOG_PATH = os.path.join(REPO_ROOT, "generation-log.jsonl")


def load_manifest(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def select_entries(manifest, only_ids):
    entries = manifest["assets"]
    if only_ids:
        wanted = set(only_ids)
        entries = [e for e in entries if e["id"] in wanted]
        missing = wanted - {e["id"] for e in entries}
        if missing:
            raise SystemExit(f"Nieznane id w --only: {sorted(missing)}")
    return entries


def build_prompt(entry, theme_cfg):
    """Sklada finalny prompt z jednolitego szkieletu tematu + pol wpisu.

    Ten sam szkielet w kazdym prompcie tematu = spojnosc stylu miedzy assetami
    (spec §3.2). Spritesheet = jeden obraz z siatka klatek (spec §3.3 pkt 2).
    """
    palette = ", ".join(theme_cfg["palette"])
    if entry["kind"] == "spritesheet":
        subject = {
            "player": theme_cfg["character"],
            "walker": theme_cfg["enemy_walker"],
            "ghost": theme_cfg["enemy_ghost"],
        }[entry["entity"]]
        cols, rows = entry["grid"]
        background = ("transparent background"
                      if entry["background"] == "transparent" else "plain background")
        return (
            f"{theme_cfg['style_skeleton']}. "
            f"Sprite sheet: {subject}, {entry['action']} animation, "
            f"{entry['frame_count']} frames arranged in a strict uniform grid of "
            f"{cols} columns and {rows} rows, every frame the exact same character "
            f"at the same scale, centered in its grid cell. {entry['style_notes']}. "
            f"Color palette: {palette}. {background}."
        )
    # background (warstwa paralaksy)
    return (
        f"{theme_cfg['style_skeleton']}. "
        f"Game background parallax layer: {theme_cfg['world']}. {entry['style_notes']}. "
        f"seamless horizontally tileable, left and right edges match perfectly. "
        f"Color palette: {palette}."
    )


PLAYER_ROW_ORDER = ["idle", "move-left", "move-right", "jump", "hit", "death"]
ENEMY_ROW_ORDER = ["idle", "move", "hit", "death"]


def slice_grid(img, cols, rows):
    """Tnie obraz-siatke na rowne komorki, row-major (jak czyta je czlowiek)."""
    w, h = img.size
    cw, ch = w // cols, h // rows
    return [img.crop((c * cw, r * ch, (c + 1) * cw, (r + 1) * ch))
            for r in range(rows) for c in range(cols)]


def trim_and_center(frame, frame_size, fill_ratio=0.78):
    """Trim przezroczystego marginesu + normalizacja skali i wysrodkowanie.

    Kontrakt kompozycyjny (spec §2.3): postac wypelnia ~fill_ratio klatki, wiec insety
    hitboxow silnika (strojone na classic) pasuja bez zmian. Normalizuje tez rozne
    'przyblizenia' miedzy klatkami z generacji (model nie trzyma skali idealnie).
    """
    frame = frame.convert("RGBA")
    bbox = frame.getbbox()
    if bbox is None:
        raise ValueError("pusta klatka (same przezroczyste piksele)")
    content = frame.crop(bbox)
    target = int(frame_size * fill_ratio)
    scale = target / max(content.size)
    content = content.resize((max(1, round(content.size[0] * scale)),
                              max(1, round(content.size[1] * scale))), Image.LANCZOS)
    out = Image.new("RGBA", (frame_size, frame_size), (0, 0, 0, 0))
    out.paste(content, ((frame_size - content.size[0]) // 2,
                        (frame_size - content.size[1]) // 2))
    return out


def _compose_rows(rows, frame_size):
    max_cols = max(len(frames) for _, frames in rows)
    sheet = Image.new("RGBA", (frame_size * max_cols, frame_size * len(rows)), (0, 0, 0, 0))
    for r, (_, frames) in enumerate(rows):
        for c, frame in enumerate(frames):
            sheet.paste(frame, (c * frame_size, r * frame_size))
    return sheet


def compose_player_sheet(frames_by_action, frame_size):
    """Sklada sheet gracza w ukladzie silnika (PLAYER_ROW_ORDER; theme.json Task 9).

    move-left to programowe lustro run - tak samo jak w classic
    (tools/compose_player_sheet.py), model nie musi generowac biegu w obie strony.
    """
    run = frames_by_action["run"]
    rows = [
        ("idle", frames_by_action["idle"]),
        ("move-left", [ImageOps.mirror(f) for f in run]),
        ("move-right", run),
        ("jump", frames_by_action["jump"]),
        ("hit", frames_by_action["hit"]),
        ("death", frames_by_action["death"]),
    ]
    return _compose_rows(rows, frame_size)


def compose_enemy_sheet(frames_by_action, frame_size):
    """Sheet wroga (ENEMY_ROW_ORDER): idle = pierwsza klatka move (jak stary walker,
    ktory w idle po prostu stal na pierwszej klatce chodu)."""
    rows = [
        ("idle", [frames_by_action["move"][0]]),
        ("move", frames_by_action["move"]),
        ("hit", frames_by_action["hit"]),
        ("death", frames_by_action["death"]),
    ]
    return _compose_rows(rows, frame_size)


def make_tileable(img, blend_px=64):
    """Zszywa pozioma petle: crossfade prawej krawedzi w lewa (Layers tile'uja w poziomie,
    surowa generacja nigdy nie jest seamless - spec §3.3 pkt 4). Po blendzie piksel x=0
    zaczyna sie dokladnie trescia z x=w-blend_px, wiec styk prawy->lewy jest ciagly."""
    w, h = img.size
    left = img.crop((0, 0, blend_px, h))
    right = img.crop((w - blend_px, 0, w, h))
    mask = Image.new("L", (blend_px, h))
    for x in range(blend_px):
        mask.paste(int(255 * (1 - x / blend_px)), (x, 0, x + 1, h))
    blended = Image.composite(right, left, mask)  # maska 255 -> piksel z right
    out = img.copy()
    out.paste(blended, (0, 0))
    # odcinamy zuzyty pas z prawej i rozciagamy z powrotem do pelnej szerokosci
    return out.crop((0, 0, w - blend_px, h)).resize((w, h), Image.LANCZOS)


def process_background(img, out_size=(800, 600), blend_px=64):
    """1536x1024 -> skala do wysokosci 600 (900x600) -> srodkowy kadr 800 -> tiling.
    Wyjscie = dokladny rozmiar canvasu (Layers rysuja w canvas.width/height 1:1,
    core.js), zeby uniknac rozciagania w runtime."""
    img = img.convert("RGBA")
    scale = out_size[1] / img.size[1]
    img = img.resize((round(img.size[0] * scale), out_size[1]), Image.LANCZOS)
    left = (img.size[0] - out_size[0]) // 2
    img = img.crop((left, 0, left + out_size[0], out_size[1]))
    return make_tileable(img, blend_px)


def validate_sheet(sheet, frame_size, rows_spec):
    """rows_spec: [(nazwa_akcji, frame_count), ...] w kolejnosci wierszy sheetu.
    Kazda zadeklarowana klatka musi miec >1% nieprzezroczystych pikseli (spec §3.3 pkt 5)."""
    for r, (action, count) in enumerate(rows_spec):
        for c in range(count):
            frame = sheet.crop((c * frame_size, r * frame_size,
                                (c + 1) * frame_size, (r + 1) * frame_size))
            alpha = frame.getchannel("A")
            opaque = sum(1 for a in alpha.getdata() if a > 16)
            if opaque < frame_size * frame_size * 0.01:
                raise ValueError(f"pusta klatka: wiersz '{action}', kolumna {c}")


def validate_ground(img, ground_top_px=116):
    """Pas gruntu (dolne ground_top_px pikseli) musi byc niemal w pelni kryjacy -
    GROUND_LINE_Y (core.js) zaklada powierzchnie na tej wysokosci."""
    w, h = img.size
    band = img.crop((0, h - ground_top_px, w, h)).getchannel("A")
    data = band.getdata()
    coverage = sum(1 for a in data if a > 200) / len(data)
    if coverage < 0.9:
        raise ValueError(f"pas gruntu ma krycie {coverage:.0%} < 90% - powierzchnia "
                         f"biegu nie pokryje GROUND_LINE_Y")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--manifest", default=DEFAULT_MANIFEST)
    ap.add_argument("--only", action="append", help="tylko wpis(y) o tym id")
    ap.add_argument("--force", action="store_true", help="regeneruj mimo istniejacego raw")
    ap.add_argument("--model", default="gpt-image-2")
    ap.add_argument("--dry-run", action="store_true", help="wypisz prompty, bez API i plikow")
    ap.add_argument("--validate-only", action="store_true", help="tylko walidacja gotowych plikow")
    args = ap.parse_args(argv)

    manifest = load_manifest(args.manifest)
    entries = select_entries(manifest, args.only)

    if args.dry_run:
        for entry in entries:
            theme_cfg = manifest["themes"][entry["theme"]]
            print(f"=== {entry['id']} ({entry['kind']}, {entry['api_size']}) ===")
            print(build_prompt(entry, theme_cfg))
            print()
        return 0

    raise SystemExit("Generacja/walidacja dochodzi w Taskach 6-7 tego planu.")


if __name__ == "__main__":
    sys.exit(main())
