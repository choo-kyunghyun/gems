// UI.draw();
// Tooltip.draw();

if (keyboard_check_pressed(vk_f5)) {
    var _datetime = format_iso_datetime(date_current_datetime(), false);
    var _fname = $"screenshots/gems-{_datetime}-{self.screenshot_counter++}.png";
    screen_save(_fname);
}
