UI.draw();
// Tooltip.draw();

if (keyboard_check_pressed(vk_f5)) {
    const date = new Date();
    const dateString = new Date(date.getTime() - (date.getTimezoneOffset() * 60000))
                 .toISOString()
                 .replace(/[-.:Z]/g, "");
    const fname = `screenshots/gems-${dateString}.png`;
    screen_save(fname);
}
