// ==== BOOTSTRAP: INSTANCJE, PĘTLA GRY, WEJŚCIE ====
// canvas/ctx/GROUND_LINE_Y/gamespeed/timeScale - core.js. Tło/pogoda - world.js.
// Stan gry/wynik/trudność/spawner/kolizje/HUD - game.js. Ten plik tylko spina wszystko
// w pętlę rysowania i tworzy gracza (jedyną encję, która nie żyje w game.js).

const player = new Player(100, GROUND_LINE_Y - 96);

let lastTimestamp = null;

function anime(timestamp = 0) {
  // Delta time w ms - pierwsza klatka nie ma poprzedniego timestampu, więc pomijamy update
  const deltaTime = lastTimestamp === null ? 0 : timestamp - lastTimestamp;
  lastTimestamp = timestamp;
  updateTimeScale(deltaTime);

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  layer11.update();
  layer11.draw();

  dayTime = (dayTime + daySpeed * gamespeed * timeScale) % 1;
  drawDayNightOverlay();
  drawStars();
  drawSunMoon();

  layer6.update();
  layer6.draw();

  layer5.update();
  layer5.draw();

  layer4.update();
  layer4.draw();

  layer3.update();
  layer3.draw();

  layer2.update();
  layer2.draw();

  // SYSTEM CZĄSTECZEK - rysowany przed pierwszą warstwą
  updateParticleSystem();

  layer1.update();
  layer1.draw();

  // ROZGRYWKA (spawner, wrogowie, gracz, kolizje/stomp, wynik, trudność) - game.js.
  // Tło i pogoda żyją zawsze; sama rozgrywka jest aktywna tylko w stanie 'playing'.
  updateGame(deltaTime);

  // Na ekranie menu zamiast prawdziwego gracza/wrogów (jeszcze nietkniętych) rysujemy
  // zapętloną demo-symulację (demoPlayer/demoEnemy, napędzane przez updateDemo() w game.js).
  if (gameState === 'menu') {
    if (demoEnemy) demoEnemy.draw(ctx);
    demoPlayer.draw(ctx);
  } else {
    enemies.forEach(enemy => enemy.draw(ctx));
    player.draw(ctx);
  }

  drawHud();

  requestAnimationFrame(anime);
}

// ==== KONTROLKI KLAWIATURY (pogoda / cykl dnia) ====
document.addEventListener('keydown', (e) => {
    switch(e.key) {
        case '1':
            changeWeather('rain');
            break;
        case '2':
            changeWeather('snow');
            break;
        case '3':
            changeWeather('leaves');
            break;
        case '0':
            changeWeather('none');
            break;
        case 't':
        case 'T':
            daySpeed = daySpeed > 0 ? 0 : 1 / (60 * 60);
            break;
    }
});

// ==== INICJALIZACJA ====
window.addEventListener('load', () => {
    setTimeout(() => {
        initParticleSystem();
        console.log("🎮 System cząsteczek zainicjalizowany!");
        console.log("⌨️ Użyj klawiszy: 1-Deszcz, 2-Śnieg, 3-Liście, 0-Słońce");
    }, 1000);
});

// Uruchomienie animacji - przez requestAnimationFrame, żeby pierwszy timestamp
// był spójny z kolejnymi (inaczej pierwsze obliczone deltaTime byłoby ogromne)
requestAnimationFrame(anime);
