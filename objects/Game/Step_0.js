Time.update();
Input.poll(); // THE frame poll: latch every device once + clear last frame's claims, before any consumer reads (Input)
Music.update(); // reap a finished BGM cross-fade (wall clock — runs even while the sim is paused)
UI.step();
// dev-only: F2 returns to lobby without a restart
if (DEV_MODE && Input.keyPressed(vk_f2)) App.open(sceneLobby);

// after the UI step, so a switch the UI queued lands at full fade cover, between frames
App.step();

// THE sim tick, held while the pause menu is open.
if (!GameOverlay.isOpen()) App.scene.update();

Log.flush();
