Time.update();
Music.update(); // reap a finished BGM cross-fade (wall clock — runs even while the sim is paused)
UIPointer.poll(); // latch this frame's pointer edges before any widget reads them
UI.update();
SlotDrag.update();
SystemMenu.update(this); // global F1 system overlay; before UINav so it's same-frame nav-reachable
UINav.update();
Dialogue.update(); // typewriter timing + advance input (Enter/Space/A/click-on-box)
// dev-only: F2 returns to lobby without a restart
if (DEV_MODE && keyboard_check_pressed(vk_f2))
  World.levels.switchTo(LEVELS.lobby);
World.levels.update(); // flush a queued level swap through a fade + advance the fade timer
World.levels.step(); // sim tick, pause-gated while the SystemMenu overlay is open
Debug.update(); // F3: human-facing native ImGui overlay over the panel registry
DebugInspector.update(); // click-to-pick entity inspector (overlay open)
Log.flush();
