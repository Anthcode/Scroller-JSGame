# Theme system + temat „dusty-daylight" — projekt

Data: 2026-08-17
Status: zaakceptowany kierunek (podejście A — lekki ThemeManager + pipeline Python), spec do recenzji

## 1. Cel i zakres

Pionowy przekrój przez cały łańcuch: **system tematów (ThemeManager) w silniku** + **jeden
nowy komplet assetów** (temat `dusty-daylight`, styl flat-illustration) wygenerowany
powtarzalnym pipeline'em opartym o OpenAI Images API (model konfigurowalny, docelowo
`gpt-image-2`).

**W zakresie:**
- `theme.js` — ThemeManager ładujący temat z `images/themes/<nazwa>/theme.json` i
  podmieniający sprite'y gracza, wrogów i warstwy parallax bez restartu gry.
- Opakowanie obecnych assetów jako temat `classic` (domyślny; zero zmian wizualnych).
- Refaktor `world.js`/`script.js`: warstwy parallax budowane z danych tematu (tablica),
  zamiast hardkodowanych `layer1..layer11`.
- `assets-manifest.json` + `tools/generate_theme_assets.py` — deterministyczny pipeline:
  manifest → prompty → API → post-processing (Pillow) → walidacja → pliki tematu + log.
- Wygenerowanie i podpięcie kompletu `dusty-daylight`.
- Testy Playwright dla ThemeManagera (podmiana w trakcie gry, fallback).

**Poza zakresem (świadomie, YAGNI):**
- Landing page z `landingmock.png`.
- Pozostałe 3 tematy (`neon-night`, `ghostly-shift`, `rising-challenge`) — po przekroju
  to wyłącznie nowe wpisy w manifeście + katalogi tematów, bez zmian w kodzie.
- Atlas packing i warianty rozdzielczości @1x/@2x — silnik konsumuje osobne sheety per
  encja przy stałej logicznej rozdzielczości 800×600; atlas nic nie daje.
- Refaktor devicePixelRatio / dalsza responsywność mobile.
- Zmiany mechaniki gry (fizyka, spawner, trudność, kolizje pozostają nietknięte).

## 2. Architektura ThemeManagera

### 2.1 Nowy plik i kolejność ładowania

`theme.js` wchodzi do łańcucha `<script>` w `game-demo.html` **po `core.js`, przed
`world.js`** (world/player/enemy czytają z niego aktywny temat):

```
core.js → theme.js → feel.js → animatorController.js → world.js → player.js → enemy.js → ghost.js → game.js → script.js
```

Zgodnie z konwencją repo: brak modułów, wszystko w globalnym scope
(`currentTheme`, `setTheme(name)`, `THEME_DEFAULTS`).

### 2.2 Format tematu — `images/themes/<nazwa>/theme.json`

Temat = katalog z PNG + jeden JSON opisujący wszystko deklaratywnie:

```json
{
  "name": "dusty-daylight",
  "layers": [
    { "file": "bg_sky.png",        "xspeed": 0,    "role": "sky"    },
    { "file": "bg_far_canyon.png", "xspeed": 0.2                    },
    { "file": "bg_mid_mesas.png",  "xspeed": 0.46                   },
    { "file": "bg_near_scrub.png", "xspeed": 0.8                    },
    { "file": "bg_ground.png",     "xspeed": 1.0,  "role": "ground" }
  ],
  "player": {
    "sheet": "player.png",
    "frameWidth": 256, "frameHeight": 256,
    "states": {
      "idle":       { "row": 0, "frameCount": 6, "frameInterval": 80,  "loop": true },
      "move-left":  { "row": 1, "frameCount": 8, "frameInterval": 60,  "loop": true },
      "move-right": { "row": 2, "frameCount": 8, "frameInterval": 60,  "loop": true },
      "jump":       { "row": 3, "frameCount": 6, "frameInterval": 70,  "loop": true },
      "hit":        { "row": 4, "frameCount": 4, "frameInterval": 60,  "loop": false, "locked": true, "next": "idle" },
      "death":      { "row": 5, "frameCount": 8, "frameInterval": 90,  "loop": false, "locked": true }
    },
    "initialState": "idle"
  },
  "enemies": {
    "walker": { "sheet": "enemy.png", "frameWidth": 220, "frameHeight": 220, "states": { "...": "jak wyżej" } },
    "ghost":  { "sheet": "ghost.png", "frameWidth": 190, "frameHeight": 190, "states": { "...": "..." } }
  },
  "dayPhases": [ { "t": 0.0, "r": 10, "g": 10, "b": 60, "a": 0.72 }, "… (opcjonalne)" ]
}
```

Zasady:
- **Pełne animData per encja** — animator jest już data-driven, więc temat niesie własne
  `frameWidth/frameHeight/states` (liczba klatek NIE musi odtwarzać układu classic).
- `walkerFast` **nie ma własnego wpisu** — jak dziś reużywa sheet `walker` + tint/skala
  (mechanizm offscreen-buffer w `enemy.js` zostaje bez zmian).
- `dayPhases` opcjonalne — brak = paleta domyślna z `world.js`.
- Zestaw stanów jest kontraktem silnika: player wymaga `idle/move-left/move-right/jump/hit/death`,
  walker i ghost swoich obecnych stanów. Walidacja przy ładowaniu tematu; brak stanu =
  temat odrzucony (fallback, patrz 2.5).

### 2.3 Geometria rozgrywki NIEZALEŻNA od tematu

Decyzja projektowa: **wymiary encji (`width/height`), insety hitboxów i `GROUND_LINE_Y`
pozostają stałymi silnika** — identyczne w każdym temacie. Dzięki temu podmiana tematu
nigdy nie zmienia fizyki, kolizji, stompów ani wyników testów combat/demo (strojonych
geometrycznie w PR #20/#21).

Konsekwencja dla pipeline'u: prompty + post-processing wymuszają na grafice kontrakt
kompozycyjny — postać wyśrodkowana, wypełnia ~70–80% klatki (zbliżony margines
przezroczystości jak w classic), a warstwa `ground` ma górną krawędź podłoża ~116px
logicznych od dołu (dopasowanie do `GROUND_LINE_Y = canvas.height - 116`).
`theme.json` dopuszcza opcjonalny override insetów (`hitboxInset`) wyłącznie jako
awaryjne dostrojenie, domyślnie wartości classic.

### 2.4 Refaktor warstw parallax (`world.js` + `script.js`)

Dziś: 7 hardkodowanych globali `layer1..layer11`, rysowanych ręcznie w `anime()` z
wpleceonymi punktami: overlay dnia/nocy + gwiazdy + słońce/księżyc po warstwie nieba,
cząsteczki pogody przed warstwą gruntu.

Po zmianie: globalna tablica `parallaxLayers` (obiekty `Layers` jak dziś) budowana przez
ThemeManager z `theme.json`. Role zachowują punkty wpięcia:

```
draw(sky) → dayNightOverlay/stars/sunMoon → draw(kolejne warstwy w kolejności JSON)
→ updateParticleSystem() → draw(ground)
```

- `role: "sky"` — dokładnie jedna warstwa, `role: "ground"` — dokładnie jedna
  (walidacja). Pozostałe rysowane w kolejności wpisów (daleka → bliska).
- `tests/parallax.spec.js` przechodzi z `layer1/layer6` na `parallaxLayers` (bez aliasów
  wstecznych — testy to jedyny konsument tych nazw poza `script.js`).

### 2.5 Ładowanie, podmiana w locie, fallback

- Wybór tematu: `?theme=<nazwa>` w URL → `setTheme(nazwa)` też dostępne globalnie
  (panel debug w `game-demo.html` dostaje dropdown obok pogody; testy wołają wprost).
- `setTheme()`: `fetch` JSON → preload **wszystkich** obrazów tematu (`Promise` per
  `Image.onload`) → dopiero po komplecie atomowa podmiana (`parallaxLayers`, animData
  gracza i `ENEMY_TYPES`). Brak stanu „w połowie podmienione".
- Gracz: animator odbudowany w miejscu z zachowaniem bieżącego stanu animacji (jeśli
  istnieje w nowym temacie; inaczej `initialState`).
- Żywi wrogowie na ekranie **dokańczają życie ze starą grafiką**; nowe spawny biorą nowy
  temat. Zero ryzyka niespójności klatek w połowie animacji, a rotacja wrogów jest szybka.
- Fallback: błąd fetch/JSON/obrazka/walidacji → log ostrzeżenia + (jeśli to nie on
  zawiódł) powrót do `classic`. `classic` jest zawsze bundlowany i wskazuje na obecne
  pliki `images/…` (bez przenoszenia — `theme.json` classic używa ścieżek względem roota),
  więc niczego nie duplikujemy i historia gita zostaje czytelna.
- Start gry bez parametru = `classic` załadowany synchronicznie z wartości domyślnych
  wpisanych w kod (`THEME_DEFAULTS` — dzisiejsze literały przeniesione 1:1), więc
  pierwsza klatka renderuje się jak dziś, bez czekania na fetch.

## 3. Pipeline generacji assetów

### 3.1 Pliki

- `assets-manifest.json` (root repo) — deklaratywny opis każdego assetu do wygenerowania.
- `tools/generate_theme_assets.py` — jedyny skrypt: prompty + API + post-processing +
  walidacja. Zależności: `openai`, `Pillow` (repo już używa Pillow w tools/).
- `images/themes/_raw/` (gitignore) — surowe odpowiedzi API.
- `generation-log.jsonl` (root, commitowany) — audyt: id wpisu, pełny prompt, model,
  response id, hash pliku, timestamp.

### 3.2 Schemat wpisu manifestu

```json
{
  "id": "dusty_player_run",
  "theme": "dusty-daylight",
  "kind": "spritesheet",            // albo "background"
  "entity": "player", "action": "run",
  "frame_count": 8, "grid": [4, 2],  // układ klatek w JEDNYM generowanym obrazie
  "frame_size": 256,                  // px po post-processingu
  "palette": ["#E8A33D", "#C96F2B", "#7A4A21", "#F5E6C8", "#4E7E9E"],
  "style_notes": "runner character, side view, mid-stride variations",
  "background": "transparent"
}
```

Wspólne dla tematu (w sekcji `themes` manifestu, nie powtarzane per wpis):
`style_skeleton` („flat vector illustration, clean outlines, subtle gradients, mobile
game asset, consistent top-left lighting, no text, no watermark…"), opis świata
(„sun-bleached desert canyon…"), paleta bazowa.

### 3.3 Przebieg per wpis (idempotentny)

1. Pomiń, jeśli wynik istnieje i brak `--force` / `--only <id>`.
2. Zbuduj prompt: `style_skeleton` tematu + pola wpisu. Spritesheety generowane jako
   **jeden obraz z gridem wszystkich klatek** (np. 4×2) — jedna generacja utrzymuje
   spójność postaci między klatkami lepiej niż osobne wywołania.
3. Wywołaj Images API (model z `--model`, domyślnie `gpt-image-2`; klucz z
   `OPENAI_API_KEY`), retry z backoffem, zapis surówki do `_raw/` + wpis do logu.
4. Post-processing (czysty Pillow, bez LLM):
   - spritesheet: cięcie gridu → trim przezroczystego marginesu → wyśrodkowanie każdej
     klatki w jednolitym `frame_size`×`frame_size` (kontrakt ~70–80% wypełnienia) →
     złożenie w sheet formatu silnika (wiersz = stan animacji, zgodnie z docelowym
     `theme.json`);
   - background: downscale (Lanczos) do 800×600 (nigdy upscale — generujemy większe,
     np. 1536×1024) → **uszczelnienie pętli poziomej**: crossfade ~64px prawej krawędzi
     w lewą (warstwy `Layers` tile'ują w poziomie, surowa generacja nie jest seamless);
   - dla `role: "ground"`: asercja, że nieprzezroczyste podłoże zaczyna się ~116px od dołu.
5. Walidacja: liczba klatek zgodna z manifestem, żadna klatka niepusta
   (>1% nieprzezroczystych pikseli), wymiary wynikowe zgodne.
6. Zapis do `images/themes/dusty-daylight/`.

Koszt kontrolowany: komplet dusty-daylight to ~11 generacji (6 akcji gracza w 2–3
obrazach zbiorczych lub per akcja, 2 wrogów, 5 teł); poprawki pojedynczych wpisów przez
`--only <id> --force` zamiast regeneracji całości.

### 3.4 Zawartość kompletu `dusty-daylight`

| Asset | Wpisy manifestu |
|---|---|
| Gracz | idle(6), run(8, odbicie lustrzane dla move-left robi post-processing — jak dziś w classic), jump(6), hit(4), death(8) |
| Wrogowie | walker — kolczasta kula, walk(6) + hit/death wg kontraktu stanów; ghost — fly(6)+death; walkerFast = tint walker (silnik) |
| Tła | sky, far_canyon, mid_mesas, near_scrub, ground (5 warstw; mniej niż 7 w classic — świadomie, JSON na to pozwala) |
| Paleta dnia | `dayPhases` strojone ręcznie pod pustynię (opcjonalny etap 4) |

## 4. Testy

- **`tests/theme.spec.js` (nowy):**
  - start bez parametru → `classic`, `parallaxLayers` zbudowane, gra rysuje jak dziś;
  - `setTheme('dusty-daylight')` w trakcie `playing` → sheet gracza podmieniony,
    `gameState`/pozycje/HP nietknięte, brak błędów konsoli, nowy spawn używa nowego sheetu;
  - `setTheme('nieistniejący')` → fallback do `classic` + warning;
  - prędkości warstw zgodne z `xspeed` z JSON (przeniesiona asercja z parallax.spec.js).
- **`tests/parallax.spec.js`:** migracja `layer1/layer6` → `parallaxLayers[...]`,
  te same asercje regresyjne.
- **Istniejące testy combat/demo/weather:** przechodzą bez modyfikacji — to twarde
  kryterium akceptacji etapu 1 (geometria niezależna od tematu, sekcja 2.3).
- **Pipeline:** walidacje z 3.3 pkt 5 uruchamiane zawsze po generacji; `--validate-only`
  do ponownego sprawdzenia plików w repo bez wołania API.

## 5. Etapy realizacji

1. **ThemeManager + `classic` + refaktor warstw** — gra wygląda identycznie, wszystkie
   testy zielone, nowe testy theme.spec.js. (Sam kod, zero API.)
2. **Manifest + `tools/generate_theme_assets.py`** — kompletny skrypt z walidacją
   i logiem; testowalny na sucho (`--dry-run` wypisuje prompty bez wołania API).
3. **Generacja `dusty-daylight`** — uruchomienie skryptu (klucz użytkownika), ocena
   spójności, iteracja `--only/--force` na słabych wpisach.
4. **Podpięcie tematu** — `theme.json` dusty-daylight z realnymi parametrami klatek,
   strojenie `dayPhases`, ewentualne `hitboxInset`, testy na obu tematach.

Każdy etap = osobny, samodzielnie recenzowalny stan repo (etap 1 ma wartość nawet, gdyby
generacja stanęła).

## 6. Ryzyka

- **Spójność stylu między generacjami** — największe ryzyko. Mitygacja: wspólny
  `style_skeleton` + paleta w każdym prompcie, grid-w-jednym-obrazie dla klatek,
  akceptacja jakości po etapie 3 zanim dotkniemy `theme.json`.
- **Seamless tiling teł** — generatory nie robią pętli poziomej; crossfade krawędzi
  w post-processingu to kompromis (możliwy widoczny „szew" na wyrazistych formach —
  wtedy poprawka promptem: powtarzalny, niski horyzont).
- **Kontrakt kompozycji klatek** (70–80% wypełnienia) — model może go nie utrzymać;
  trim+wyśrodkowanie w post-processingu normalizuje większość odchyleń, reszta przez
  regenerację pojedynczych wpisów.
