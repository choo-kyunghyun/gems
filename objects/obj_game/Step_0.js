Time.update();
SlotDrag.poll();
UI.update();
SlotDrag.update();
SystemMenu.update(this); // global F1 system overlay; before UINav so it's same-frame nav-reachable
UINav.update();
Dialogue.update(); // typewriter timing + advance input (Enter/Space/A/click-on-box)
// Route a queued scene change through a fade: start the transition (it swaps the
// scene at full cover), and hold the pending factory while a fade is already running
// so a second openScene mid-fade can't stack two swaps.
if (this._pendingScene !== null && !SceneTransition.isBusy()) {
  const factory = this._pendingScene;
  this._pendingScene = null;
  SceneTransition.start(() => this._applyScene(factory));
}
SceneTransition.update();
// The SystemMenu overlay pauses ALL sim: while open, scene.step() is skipped (so every
// scene's logic freezes), except for a single-frame advance requested by its Step button.
if (this.scene !== null) {
  if (!SystemMenu.isOpen()) {
    this.scene.step();
  } else if (SystemMenu.consumeStep()) {
    // One frame of sim at the chosen speed, then re-freeze (SystemMenu.update re-zeros
    // Time next frame; world.update() runs off Time.delta, so it must be non-zero here).
    Time.scale = SystemMenu.scale();
    Time.delta = Time.raw * Time.scale;
    this.scene.step();
    Time.delta = 0;
    Time.scale = 0;
  }
}
Log.flush();
