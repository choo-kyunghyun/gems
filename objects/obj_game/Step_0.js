Time.update();
SlotDrag.poll();
UI.update();
SlotDrag.update();
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
if (this.scene !== null) this.scene.step();
Log.flush();
