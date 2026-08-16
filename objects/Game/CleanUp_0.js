// order matters: scenes before UI (scenes removes its roots), Log.flush last
// (Step_0's per-frame flush won't run again, so teardown logs need an explicit flush)
Log.info("game end");

World.levels.destroy();
UI.destroy();
Input.destroy();
I18n.destroy();

Log.flush();
