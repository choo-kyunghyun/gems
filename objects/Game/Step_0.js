Time.update();
Music.update(); // reap a finished BGM cross-fade (wall clock — runs even while the sim is paused)
UIPointer.poll(); // latch this frame's pointer edges before any widget reads them
UI.update();
SlotDrag.update();
GameOverlay.update(this); // global F1 system overlay; before UINav so it's same-frame nav-reachable
UINav.update();
Dialogue.update(); // typewriter timing + advance input (Enter/Space/A/click-on-box)
// dev-only: F2 returns to lobby without a restart
if (DEV_MODE && keyboard_check_pressed(vk_f2)) this.switchTo(SCENES.lobby);

// flush a queued scene swap: it applies at full fade cover; then advance the fade timer.
if (this._pending !== null && !SceneTransition.isBusy()) {
  const factory = this._pending;
  this._pending = null;
  SceneTransition.start(() => this._apply(factory));
}
SceneTransition.update();

// THE sim tick, held while the GameOverlay sheet is open.
if (!GameOverlay.isOpen()) this.scene.update();

Log.flush();
