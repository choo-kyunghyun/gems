// order matters: the scene before UI (it removes its own roots), Log.flush last
// (Step_0's per-frame flush won't run again, so teardown logs need an explicit flush)
Log.info("game end");

this._destroyScene();
UI.destroy();
Input.destroy();
I18n.destroy();

Log.flush();
