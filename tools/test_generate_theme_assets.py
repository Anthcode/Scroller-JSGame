# Unittesty czystych funkcji pipeline'u generacji - bez sieci, bez API.
# Uruchamianie: python -m unittest discover -s tools -p "test_*.py"
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(__file__))
from generate_theme_assets import load_manifest, build_prompt, select_entries

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

if __name__ == "__main__":
    unittest.main()
