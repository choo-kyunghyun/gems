Time.update();
SlotDrag.poll();
UI.update();
SlotDrag.update();
if (this._pendingScene !== null) {
  this._applyScene(this._pendingScene);
  this._pendingScene = null;
}
if (this.scene !== null) this.scene.step();
Log.flush();
