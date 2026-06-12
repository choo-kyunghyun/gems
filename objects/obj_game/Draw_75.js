UI.draw();
UINav.draw();
SlotDrag.draw();
Tooltip.draw();
Toast.draw();
Dialogue.draw(); // RPG dialogue box, over the UI
SceneTransition.draw(); // last: the fade cover veils the UI + scene during a swap

if (keyboard_check_pressed(vk_f5)) {
  const date = new Date();
  const dateString = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .replace(/[-.:Z]/g, "");
  screen_save(`screenshots/gems-${dateString}.png`);
}
