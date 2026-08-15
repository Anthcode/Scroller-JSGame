# Parallax FX

Endless runner w czystym JavaScript + HTML5 Canvas — wrogowie nadpływają z prawej razem ze światem, giną od skoku na głowę, wynik i trudność rosną z czasem przeżycia. Do tego warstwy paralaksy, dynamiczna pogoda, cykl dnia i nocy oraz data-driven system animacji sprite'ów.

### Live demo
https://anthcode.github.io/Scroller-JSGame/

Starsza wersja (Firebase, bez systemu gracza/wrogów): https://parallax-fx.web.app/

![obraz](https://github.com/Anthcode/parallax/assets/108927171/e457fe91-4ac7-4387-a57c-d21ce24aa79c)

![obraz](https://github.com/Anthcode/Scroller-JSGame/assets/108927171/25a70ce4-9cca-47d2-bf49-f44e58ff143b)

## Funkcje

- **Endless runner** — menu → rozgrywka → game over → restart bez przeładowania strony (`gameState` w `game.js`). Wynik za dystans i za zabójstwa (z mnożnikiem combo za serię stompów bez dotknięcia ziemi), rekord zapisywany w `localStorage`.
- **Trudność rośnie z czasem** — tempo świata, częstotliwość spawnu wrogów i ich prędkość podążają za jedną czytelną krzywą (`getDifficulty()`, `game.js`), pełna trudność po 2 minutach przeżycia.
- **Walka: skok na głowę (stomp)** — jedyny sposób pokonania wroga. Lądowanie na wrogu od góry (podczas opadania) zabija go i odbija gracza; kontakt z boku/od dołu zadaje graczowi obrażenia. Hitboxy gracza i wroga są wcięte względem przezroczystego marginesu sprite'ów, żeby kolizje odpowiadały temu, co widać na ekranie.
- **Niezależność od odświeżania ekranu** — cały ruch (świat, gracz, wrogowie, cząsteczki) skalowany mnożnikiem `timeScale` względem 60 kl./s, więc tempo gry jest takie samo na wyświetlaczu 60Hz i 120Hz.
- **Paralaksa** — wielowarstwowe, nieskończenie przewijające się tło (`Layers`, `world.js`).
- **Pogoda** — deszcz, śnieg, liście, sterowana siłą wiatru i intensywnością cząsteczek (`Particle`, `world.js`).
- **Cykl dnia i nocy** — płynne przejścia kolorów nieba, słońce/księżyc, gwiazdy.
- **System animacji sprite'ów** — generyczny `AnimatorController` (`animatorController.js`), oparty o dane: arkusz + stany + klatki, niezależny od konkretnej postaci.
- **Gracz** (`player.js`) — ruch lewo/prawo, skok z grawitacją, HP, nietykalność po trafieniu, animacje idle/run/jump/hit/death.
- **Wróg** (`enemy.js`) — płynie w lewo razem ze światem, odbicie sprite'a w locie (bez osobnych animacji kierunkowych), HP, hit/death (teraz faktycznie osiągalne przez stomp).
- **Sterowanie**:
  - Klawiatura: `A`/`D` lub strzałki lewo/prawo — ruch, `W`/`Spacja`/strzałka w górę — skok; poza rozgrywką `Spacja`/`Enter` startuje/restartuje grę.
  - Dotyk: przytrzymaj i przeciągnij palcem po canvasie (niewidoczny joystick) — bez żadnych przycisków na ekranie; poza rozgrywką dotknięcie startuje/restartuje grę.
  - `1`/`2`/`3`/`0` — deszcz/śnieg/liście/słońce, `T` — pauza cyklu dnia/nocy.
- Panel pogody/statystyk domyślnie schowany pod przyciskiem ⚙️ w rogu ekranu.
- Canvas responsywny — skaluje się do szerokości/wysokości viewportu (działa na telefonach).

## Sterowanie (skrót)

| Akcja | Klawiatura | Dotyk |
|---|---|---|
| Start / restart gry | `Spacja`, `Enter` | dotknij ekranu |
| Ruch lewo/prawo | `A`/`D`, `←`/`→` | przeciągnij palcem lewo/prawo |
| Skok / stomp | `W`, `Spacja`, `↑` | przeciągnij palcem w górę |
| Pogoda | `1` deszcz, `2` śnieg, `3` liście, `0` słońce | przyciski w panelu ⚙️ |
| Pauza dnia/nocy | `T` | — |

## Struktura projektu

```
index.html               układ strony, panele UI, wirtualny joystick dotykowy
style.css                responsywny canvas, tło strony
core.js                  canvas/ctx, stałe wspólne, timeScale, bezpieczny localStorage
animatorController.js    generyczny system animacji sprite'ów (Animator Controller)
world.js                 warstwy paralaksy, cykl dnia/nocy, pogoda/cząsteczki
player.js                klasa Player - ruch, skok, HP, animacje, reset()
enemy.js                 klasa Enemy - ruch ze światem, HP, animacje
game.js                  stan gry (menu/playing/gameover), wynik, trudność, spawner, kolizje/stomp, HUD
script.js                bootstrap: instancja gracza, pętla gry, sterowanie pogodą/dniem
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
