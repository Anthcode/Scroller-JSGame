# Unittesty czystych funkcji pipeline'u generacji - bez sieci, bez API.
# Uruchamianie: python -m unittest discover -s tools -p "test_*.py"
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(__file__))
from generate_theme_assets import load_manifest, build_prompt, select_entries
from PIL import Image
from generate_theme_assets import (
    slice_grid, trim_and_center, compose_player_sheet, compose_enemy_sheet,
    make_tileable, process_background, validate_sheet, validate_ground,
    PLAYER_ROW_ORDER, ENEMY_ROW_ORDER,
)

MANIFEST_FIXTURE = {
    "themes": {
        "dusty-daylight": {
            "style_skeleton": "flat vector illustration, clean bold outlines",
            "world": "sun-bleached desert canyon",
            "palette": ["#E8A33D", "#C96F2B"],
            "character": "agile ninja runner",
            "enemy_walker": "round spiky ball creature",
            "enemy_ghost": "translucent dusty spirit"
        }
    },
    "assets": [
        {"id": "dusty_player_run", "theme": "dusty-daylight", "kind": "spritesheet",
         "entity": "player", "action": "run", "frame_count": 8, "grid": [4, 2],
         "frame_size": 256, "api_size": "1024x1024", "background": "transparent",
         "style_notes": "dynamic running cycle"},
        {"id": "dusty_bg_sky", "theme": "dusty-daylight", "kind": "background",
         "api_size": "1536x1024", "background": "opaque", "output_file": "bg_sky.png",
         "style_notes": "clear gradient desert sky"}
    ]
}

class BuildPromptTest(unittest.TestCase):
    def setUp(self):
        self.theme = MANIFEST_FIXTURE["themes"]["dusty-daylight"]

    def test_spritesheet_prompt_zawiera_szkielet_siatke_palete_i_opis_encji(self):
        entry = MANIFEST_FIXTURE["assets"][0]
        prompt = build_prompt(entry, self.theme)
        self.assertIn("flat vector illustration", prompt)
        self.assertIn("agile ninja runner", prompt)       # entity=player -> opis postaci
        self.assertIn("8 frames", prompt)
        self.assertIn("4 columns", prompt)
        self.assertIn("2 rows", prompt)
        self.assertIn("#E8A33D", prompt)
        self.assertIn("transparent background", prompt)
        self.assertIn("dynamic running cycle", prompt)

    def test_background_prompt_zawiera_swiat_i_tiling(self):
        entry = MANIFEST_FIXTURE["assets"][1]
        prompt = build_prompt(entry, self.theme)
        self.assertIn("sun-bleached desert canyon", prompt)
        self.assertIn("seamless", prompt)
        self.assertNotIn("frames", prompt)

class ManifestTest(unittest.TestCase):
    def test_load_manifest_czyta_plik(self):
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as f:
            json.dump(MANIFEST_FIXTURE, f)
            path = f.name
        try:
            m = load_manifest(path)
            self.assertEqual(len(m["assets"]), 2)
        finally:
            os.unlink(path)

    def test_select_entries_filtruje_po_only(self):
        sel = select_entries(MANIFEST_FIXTURE, ["dusty_bg_sky"])
        self.assertEqual([e["id"] for e in sel], ["dusty_bg_sky"])
        self.assertEqual(len(select_entries(MANIFEST_FIXTURE, None)), 2)

def kolorowa_klatka(color, size=(100, 100), box=(20, 30, 70, 80)):
    """Przezroczysta klatka z kolorowym prostokatem - synteza 'postaci' z marginesem."""
    img = Image.new("RGBA", size, (0, 0, 0, 0))
    blok = Image.new("RGBA", (box[2] - box[0], box[3] - box[1]), color)
    img.paste(blok, (box[0], box[1]))
    return img

class SliceTrimTest(unittest.TestCase):
    def test_slice_grid_tnie_rowno_row_major(self):
        grid = Image.new("RGBA", (200, 100))
        grid.paste(kolorowa_klatka((255, 0, 0, 255), (100, 100)), (0, 0))
        grid.paste(kolorowa_klatka((0, 255, 0, 255), (100, 100)), (100, 0))
        frames = slice_grid(grid, 2, 1)
        self.assertEqual(len(frames), 2)
        self.assertEqual(frames[0].size, (100, 100))
        self.assertEqual(frames[0].getpixel((45, 55))[:3], (255, 0, 0))
        self.assertEqual(frames[1].getpixel((45, 55))[:3], (0, 255, 0))

    def test_trim_and_center_normalizuje_wypelnienie(self):
        frame = kolorowa_klatka((0, 0, 255, 255))
        out = trim_and_center(frame, 128, fill_ratio=0.75)
        self.assertEqual(out.size, (128, 128))
        bbox = out.getbbox()
        w = bbox[2] - bbox[0]; h = bbox[3] - bbox[1]
        self.assertAlmostEqual(max(w, h), int(128 * 0.75), delta=2)  # skala znormalizowana
        cx = (bbox[0] + bbox[2]) / 2
        self.assertAlmostEqual(cx, 64, delta=2)                       # wysrodkowana

class ComposeTest(unittest.TestCase):
    def test_compose_player_sheet_uklad_wierszy_i_lustro(self):
        run = [kolorowa_klatka((0, 255, 0, 255), box=(10, 30, 40, 80)) for _ in range(8)]
        frames = {"idle": [kolorowa_klatka((255, 0, 0, 255))] * 6, "run": run,
                  "jump": [kolorowa_klatka((0, 0, 255, 255))] * 6,
                  "hit": [kolorowa_klatka((255, 255, 0, 255))] * 4,
                  "death": [kolorowa_klatka((255, 0, 255, 255))] * 8}
        sheet = compose_player_sheet(frames, 128)
        self.assertEqual(sheet.size, (128 * 8, 128 * 6))  # max 8 klatek x 6 wierszy
        # wiersz 1 = move-left (lustro run), wiersz 2 = move-right (run bez zmian):
        left_row = sheet.crop((0, 128, 128, 256))
        right_row = sheet.crop((0, 256, 128, 384))
        lb, rb = left_row.getbbox(), right_row.getbbox()
        # asymetryczny blok (10..40 z lewej) po lustrze laduje po prawej stronie klatki
        self.assertNotEqual(lb[0], rb[0])

    def test_compose_enemy_sheet_idle_z_pierwszej_klatki_move(self):
        frames = {"move": [kolorowa_klatka((0, 255, 0, 255))] * 6,
                  "hit": [kolorowa_klatka((255, 255, 0, 255))] * 4,
                  "death": [kolorowa_klatka((255, 0, 255, 255))] * 6}
        sheet = compose_enemy_sheet(frames, 128)
        self.assertEqual(sheet.size, (128 * 6, 128 * 4))
        idle = sheet.crop((0, 0, 128, 128))
        move0 = sheet.crop((0, 128, 128, 256))
        self.assertEqual(list(idle.getdata()), list(move0.getdata()))

class BackgroundTest(unittest.TestCase):
    def test_make_tileable_zszywa_krawedzie(self):
        # lewa polowa czerwona, prawa niebieska - najgorszy przypadek szwu
        img = Image.new("RGBA", (400, 100), (255, 0, 0, 255))
        img.paste(Image.new("RGBA", (200, 100), (0, 0, 255, 255)), (200, 0))
        out = make_tileable(img, blend_px=64)
        self.assertEqual(out.size, (400, 100))
        left = out.getpixel((0, 50)); right = out.getpixel((399, 50))
        roznica = sum(abs(a - b) for a, b in zip(left[:3], right[:3]))
        self.assertLess(roznica, 90)  # krawedzie zbiezne (bez blendu byloby ~510)

    def test_process_background_kadruje_do_800x600(self):
        img = Image.new("RGBA", (1536, 1024), (200, 150, 100, 255))
        out = process_background(img)
        self.assertEqual(out.size, (800, 600))

class ValidateTest(unittest.TestCase):
    def test_validate_sheet_wykrywa_pusta_klatke(self):
        rows_spec = [("move", 2)]
        sheet = Image.new("RGBA", (128 * 2, 128), (0, 0, 0, 0))
        sheet.paste(kolorowa_klatka((0, 255, 0, 255), (128, 128)), (0, 0))  # klatka 1 pusta
        with self.assertRaises(ValueError):
            validate_sheet(sheet, 128, rows_spec)

    def test_validate_ground_wymaga_krycia_w_pasie_gruntu(self):
        ok = Image.new("RGBA", (800, 600), (0, 0, 0, 0))
        ok.paste(Image.new("RGBA", (800, 116), (150, 100, 50, 255)), (0, 600 - 116))
        validate_ground(ok, 116)  # nie rzuca
        with self.assertRaises(ValueError):
            validate_ground(Image.new("RGBA", (800, 600), (0, 0, 0, 0)), 116)


import io

class FakeImagesClient:
    """Podstawka za OpenAI client - zwraca 1-kolorowy PNG zakodowany w b64."""
    def __init__(self):
        self.calls = []
        class _Images:
            def __init__(self, outer): self.outer = outer
            def generate(self, **kwargs):
                self.outer.calls.append(kwargs)
                import base64
                w, h = map(int, kwargs["size"].split("x"))
                buf = io.BytesIO()
                Image.new("RGBA", (w, h), (10, 200, 30, 255)).save(buf, "PNG")
                class _Resp: pass
                resp = _Resp()
                datum = _Resp()
                datum.b64_json = base64.b64encode(buf.getvalue()).decode()
                resp.data = [datum]
                resp.created = 1750000000
                return resp
        self.images = _Images(self)

class GenerateEntryTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.log = os.path.join(self.tmp, "log.jsonl")
        self.entry = MANIFEST_FIXTURE["assets"][0]
        self.theme = MANIFEST_FIXTURE["themes"]["dusty-daylight"]

    def test_generuje_raw_loguje_i_jest_idempotentny(self):
        from generate_theme_assets import generate_entry
        client = FakeImagesClient()
        path = generate_entry(client, self.entry, self.theme, "gpt-image-2", self.tmp, self.log)
        self.assertTrue(os.path.exists(path))
        self.assertEqual(len(client.calls), 1)
        self.assertEqual(client.calls[0]["model"], "gpt-image-2")
        self.assertEqual(client.calls[0]["background"], "transparent")
        with open(self.log, encoding="utf-8") as f:
            rec = json.loads(f.readline())
        self.assertEqual(rec["id"], "dusty_player_run")
        self.assertIn("sha256", rec)
        # drugi raz: raw istnieje -> zero wywolan API
        generate_entry(client, self.entry, self.theme, "gpt-image-2", self.tmp, self.log)
        self.assertEqual(len(client.calls), 1)
        # force -> nowa generacja
        generate_entry(client, self.entry, self.theme, "gpt-image-2", self.tmp, self.log, force=True)
        self.assertEqual(len(client.calls), 2)


if __name__ == "__main__":
    unittest.main()
