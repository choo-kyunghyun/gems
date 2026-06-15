Time.update();
SlotDrag.poll();
UI.update();
SlotDrag.update();
SystemMenu.update(this); // global F1 system overlay; before UINav so it's same-frame nav-reachable
UINav.update();
Dialogue.update(); // typewriter timing + advance input (Enter/Space/A/click-on-box)
this.scenes.update(); // flush a queued scene swap through a fade + advance the fade timer
this.scenes.step(); // sim tick, pause-gated while the SystemMenu overlay is open
Debug.update(); // refresh the agent-facing debug.txt snapshot (periodic)
Log.flush();
