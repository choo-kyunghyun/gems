// Shutdown: release everything obj_game owns, then finalize the log. Order matters —
// scenes.destroy() removes the live scene's UI roots, so it must run before UI.destroy().
// Log.flush() runs LAST: Step_0's per-frame flush won't fire again after shutdown, so
// without this any teardown-time log lines (and the "game end" marker) never reach disk.
Log.info("game end");

this.scenes.destroy();
UI.destroy();
Input.destroy();
I18n.destroy();

Log.flush();
