// Draw GUI End, not Draw GUI: screen_save() is only permitted in this event.
UI.draw();
UINav.draw();
SlotDrag.draw();
Tooltip.draw();
Toast.draw();
Dialogue.draw(); // colony dialogue box, over the UI
SceneTransition.draw(); // last: the fade cover veils the UI + level during a swap
Screenshot.update(); // after every drawer, so a shot captures the full frame
