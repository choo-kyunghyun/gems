UI.draw();
UINav.draw();
SlotDrag.draw();
Tooltip.draw();
Toast.draw();

if (keyboard_check_pressed(vk_f5)) {
  const date = new Date();
  const dateString = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .replace(/[-.:Z]/g, "");
  screen_save(`screenshots/gems-${dateString}.png`);
}
