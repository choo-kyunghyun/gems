Time.update();
UI.update();
if (this._pendingScene !== null) {
  this._applyScene(this._pendingScene);
  this._pendingScene = null;
}
if (this.scene !== null) this.scene.step();
