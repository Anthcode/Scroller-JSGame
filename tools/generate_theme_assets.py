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
