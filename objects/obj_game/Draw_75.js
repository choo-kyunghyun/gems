UI.draw();
Tooltip.draw();

if (this.scene !== SceneTitle) {
  draw_text(8, 8, "[Esc] Close");
}

if (keyboard_check_pressed(vk_f5)) {
  const date = new Date();
  const dateString = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .replace(/[-.:Z]/g, "");
  screen_save(`screenshots/gems-${dateString}.png`);
}
