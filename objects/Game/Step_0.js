Time.update();
Music.update(); // reap a finished BGM cross-fade (wall clock — runs even while the sim is paused)
UIPointer.poll(); // latch this frame's pointer edges before any widget reads them
UI.update();
SlotDrag.update();
SystemMenu.update(this); // global F1 system overlay; before UINav so it's same-frame nav-reachable
UINav.update();
Dialogue.update(); // typewriter timing + advance input (Enter/Space/A/click-on-box)
// dev-only: F2 returns to lobby without a restart
if (DEV_MODE && keyboard_check_pressed(vk_f2)) this.switchTo(SCENES.lobby);

// flush a queued scene swap: a destroying swap applies at full fade cover, a keep-switch (guest
// minigame) or an explicit fade:false applies right here; then advance the fade timer.
if (this._pending !== null && !SceneTransition.isBusy()) {
  const p = this._pending;
  this._pending = null;
  if (p.opts.keep === true || p.opts.fade === false)
    this._apply(p.factory, p.opts);
  else SceneTransition.start(() => this._apply(p.factory, p.opts));
}
SceneTransition.update();

// THE sim tick, pause-gated two ways: the SystemMenu overlay and the Debug "Sim" toggle.
if (SystemMenu.isOpen()) {
  // Menu forces Time.scale = 0; a step must restore a non-zero delta (the sim advances off
  // Time.delta) then re-freeze.
  if (this._takeStep()) {
    Time.scale = SystemMenu.scale();
    Time.delta = Time.raw * Time.scale;
    this.scene.update();
    Time.delta = 0;
    Time.scale = 0;
  }
} else if (this.paused) {
  // Debug pause leaves Time.scale untouched (so it doesn't fight the Time panel's Scale slider)
  // and just gates the sim — a step lets one frame through at live delta.
  if (this._takeStep()) this.scene.update();
} else {
  this._stepRequested = false; // don't carry a stale step into normal play
  this.scene.update();
}

Debug.update(); // F3: human-facing native ImGui overlay over the panel registry
DebugInspector.update(); // click-to-pick entity inspector (overlay open)
Log.flush();
