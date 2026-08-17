// ==== BOOTSTRAP: INSTANCJE, PĘTLA GRY, WEJŚCIE ====
// canvas/ctx/GROUND_LINE_Y/gamespeed/timeScale - core.js. Tło/pogoda - world.js.
// Stan gry/wynik/trudność/spawner/kolizje/HUD - game.js. Ten plik tylko spina wszystko
// w pętlę rysowania i tworzy gracza (jedyną encję, która nie żyje w game.js).

const player = new Player(100, GROUND_LINE_Y - 96);

let lastTimestamp = null;

function anime(timestamp = 0) {
  // Delta time w ms - pierwsza klatka nie ma poprzedniego timestampu, więc pomijamy update
  const rawDeltaTime = lastTimestamp === null ? 0 : timestamp - lastTimestamp;
  lastTimestamp = timestamp;
  // Clamp (core.js) - bez niego powrót z uśpionej/zminimalizowanej karty po dłuższym czasie
  // dawałby jedną klatkę z ogromnym deltaTime, które trafia WPROST (bez timeScale) do
  // timerów w ms w całej grze (elapsedMs, hitStopMs, animator.frameTimer...).
  const deltaTime = clampDeltaTime(rawDeltaTime);
  updateTimeScale(deltaTime);

  // Game feel (feel.js): odliczane co REALNĄ klatkę, niezależnie od hit-stopu (który
  // zamraża tylko fizykę w updateGame()) - inaczej shake/iskry/tekst zamarłyby razem z nią.
  updateFeelSystems(deltaTime);

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const shakeOffset = getShakeOffset();
  ctx.save();
  ctx.translate(shakeOffset.x, shakeOffset.y);

  // Warstwa nieba (xspeed 0) pierwsza - na nia nakladaja sie overlay dnia/nocy i ciala niebieskie.
  skyLayer.update();
  skyLayer.draw();

  const prevDayTime = dayTime;
  dayTime = (dayTime + daySpeed * gamespeed * timeScale) % 1;
  // Akcent zachodu słońca (feel.js/world.js, etap 1+3) tylko w trakcie realnej rozgrywki -
  // ekran menu/demo nie powinien trząść kamerą z powodu tła, które i tak żyje cały czas.
  if (gameState === 'playing') maybeTriggerDuskShake(prevDayTime);
  drawDayNightOverlay();
  drawStars();
  drawSunMoon();

  // Warstwy posrednie w kolejnosci definicji tematu (daleka -> bliska).
  for (const layer of midLayers) {
    layer.update();
    layer.draw();
  }

  // SYSTEM CZĄSTECZEK - rysowany przed warstwa gruntu (jak dotychczas przed layer1). deltaTime
  // potrzebny WYŁĄCZNIE do odliczania crossfade'u WorldDirectora (world.js), zwykłe cząsteczki
  // nadal używają timeScale.
  updateParticleSystem(deltaTime);

  groundLayer.update();
  groundLayer.draw();

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
    drawGhost(ctx); // duch (ghost.js) pod prawdziwym graczem, żeby nie zasłaniał aktualnego biegu
    player.draw(ctx);
  }

  // Winieta nocna (WorldDirector, world.js) PRZED iskrami - mają zostać jasne/widoczne na
  // przyciemnionej scenie, nie zgasić się razem z nią.
  drawNightVignette(ctx);

  // Iskry uderzenia trzęsą się razem ze światem (wewnątrz translacji shake'u), floating
  // combo text zostaje poza nią - ma być czytelny, nie ma sensu żeby liczby drgały losowo.
  drawImpactParticles(ctx);
  ctx.restore();
  drawFloatingTexts(ctx);

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
