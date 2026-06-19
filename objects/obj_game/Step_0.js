Time.update();
UIPointer.poll(); // latch this frame's pointer edges before any widget reads them
UI.update();
SlotDrag.update();
SystemMenu.update(this); // global F1 system overlay; before UINav so it's same-frame nav-reachable
UINav.update();
Dialogue.update(); // typewriter timing + advance input (Enter/Space/A/click-on-box)
// Dev-only: F2 returns to the scene-catalogue lobby (the dev launcher + boot scene) from inside a
// genre scene, so the RPG and the other showcases stay reachable for testing without a restart.
if (DEV_MODE && keyboard_check_pressed(vk_f2))
  this.scenes.request(SCENES.lobby);
this.scenes.update(); // flush a queued scene swap through a fade + advance the fade timer
this.scenes.step(); // sim tick, pause-gated while the SystemMenu overlay is open
Debug.update(); // refresh the agent-facing debug.txt snapshot (periodic)
DebugImGui.update(); // F3: human-facing native ImGui overlay over the same registry
DebugInspector.update(this); // click-to-pick entity inspector (overlay open)
Log.flush();
