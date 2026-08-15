# Parallax FX

Side-scroller w czystym JavaScript + HTML5 Canvas — warstwy paralaksy, dynamiczna pogoda, cykl dnia i nocy oraz data-driven system animacji sprite'ów z grywalnym bohaterem i wrogiem.

### Live demo
https://anthcode.github.io/Scroller-JSGame/

Starsza wersja (Firebase, bez systemu gracza/wrogów): https://parallax-fx.web.app/

![obraz](https://github.com/Anthcode/parallax/assets/108927171/e457fe91-4ac7-4387-a57c-d21ce24aa79c)

![obraz](https://github.com/Anthcode/Scroller-JSGame/assets/108927171/25a70ce4-9cca-47d2-bf49-f44e58ff143b)

## Funkcje

- **Paralaksa** — wielowarstwowe, nieskończenie przewijające się tło (`Layers`, `script.js`).
- **Pogoda** — deszcz, śnieg, liście, sterowana siłą wiatru i intensywnością cząsteczek (`Particle`, `script.js`).
- **Cykl dnia i nocy** — płynne przejścia kolorów nieba, słońce/księżyc, gwiazdy.
- **System animacji sprite'ów** — generyczny `AnimatorController` (`animatorController.js`), oparty o dane: arkusz + stany + klatki, niezależny od konkretnej postaci.
- **Gracz** (`player.js`) — ruch lewo/prawo, skok z grawitacją, HP, nietykalność po trafieniu, animacje idle/run/jump/hit/death.
- **Wróg** (`enemy.js`) — patrol, odbicie sprite'a w locie (bez osobnych animacji kierunkowych), kolizje z graczem, HP, hit/death.
- **Sterowanie**:
  - Klawiatura: `A`/`D` lub strzałki lewo/prawo — ruch, `W`/`Spacja`/strzałka w górę — skok.
  - Dotyk: przytrzymaj i przeciągnij palcem po canvasie (niewidoczny joystick) — bez żadnych przycisków na ekranie.
  - `1`/`2`/`3`/`0` — deszcz/śnieg/liście/słońce, `T` — pauza cyklu dnia/nocy.
- Panel pogody/statystyk domyślnie schowany pod przyciskiem ⚙️ w rogu ekranu.
- Canvas responsywny — skaluje się do szerokości/wysokości viewportu (działa na telefonach).

## Sterowanie (skrót)

| Akcja | Klawiatura | Dotyk |
|---|---|---|
| Ruch lewo/prawo | `A`/`D`, `←`/`→` | przeciągnij palcem lewo/prawo |
| Skok | `W`, `Spacja`, `↑` | przeciągnij palcem w górę |
| Pogoda | `1` deszcz, `2` śnieg, `3` liście, `0` słońce | przyciski w panelu ⚙️ |
| Pauza dnia/nocy | `T` | — |

## Struktura projektu

```
index.html               układ strony, panele UI, wirtualny joystick dotykowy
style.css                responsywny canvas, tło strony
script.js                pętla gry, warstwy paralaksy, pogoda, cykl dnia/nocy, kolizje
animatorController.js    generyczny system animacji sprite'ów (Animator Controller)
player.js                klasa Player - ruch, skok, HP, animacje
enemy.js                 klasa Enemy - patrol, flip sprite'a, HP, animacje
images/                  tła warstw paralaksy, spritesheety gracza i wroga
tools/                   skrypty składające spritesheety z assetów źródłowych (patrz niżej)
```

## Assety graficzne

Sprite'y gracza i wroga (`images/player/character.png`, `images/enemy/enemy.png`) są złożone z oryginalnych, ręcznie rysowanych assetów tej samej gry (odzyskanych z wcześniejszego deployu na Firebase) — źródła w `tools/original_game_assets/`, skrypty składające w:

- `tools/compose_player_sheet.py` — idle/run/jump/die z oryginalnych arkuszy, `move-left` jako lustrzane odbicie biegu.
- `tools/compose_enemy_sheet.py` — 2-klatkowy chód wroga, hit/death syntetyzowane (tint, obrót+zanik).

Uruchomienie: `pip install Pillow && python3 tools/compose_player_sheet.py` (analogicznie dla wroga).

Alternatywne/zapasowe generatory (proceduralny pixel-art, AI-generowany ninja) też są w `tools/`, oznaczone jako fallback — nie uruchamiaj ich bez potrzeby, bo nadpiszą obecną grafikę.

## Uruchomienie lokalnie

To statyczna strona bez buildu - wystarczy dowolny serwer HTTP:

```
python3 -m http.server 8000
```

i otwórz `http://localhost:8000/index.html`.
