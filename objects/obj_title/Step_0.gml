// Close settings with Escape
if (keyboard_check_pressed(vk_escape)) {
    if (self.settings_open) self.hide_settings();
}

// Animate settings transition (fade + slight slide)
var _target = self.settings_open ? 1 : 0;
var _k = clamp(Time.raw * (self.settings_speed ?? 8), 0, 1);
self.settings_t = lerp(self.settings_t ?? 0, _target, _k);

var _t = self.settings_t;
var _alpha = _t * 0.85;
if (self.ui_settings_backdrop != undefined) self.ui_settings_backdrop.alpha = _alpha;

if (self.ui_settings_card != undefined) {
    // Slide from slightly below while appearing
    var _y = lerp(24, 0, _t);
    self.ui_settings_card.set_margin(flexpanel_edge.top, _y, flexpanel_unit.point);
}

// Scroll active settings page when hovering its viewport (fullscreen options)
if (self.settings_open && self.settings_pages != undefined) {
    var _mx = device_mouse_x_to_gui(0);
    var _my = device_mouse_y_to_gui(0);
    var _wheel = mouse_wheel_down() - mouse_wheel_up();
    if (_wheel != 0) {
        var _active = self.settings_pages[self.settings_active];
        if (is_struct(_active) && _active.viewport.position_meeting(_mx, _my)) {
            var _vp_pos = flexpanel_node_layout_get_position(_active.viewport.flexpanel, false);
            var _content_pos = flexpanel_node_layout_get_position(_active.content.flexpanel, false);
            var _max_scroll = max(0, _content_pos.height - _vp_pos.height);
            _active.scroll = clamp((_active.scroll ?? 0) + _wheel * (_active.scroll_speed ?? 56), 0, _max_scroll);
            _active.content.set_margin(flexpanel_edge.top, -_active.scroll, flexpanel_unit.point);
        }
    }
}

// Disable settings layer after closing
if (!_target && _t < 0.02 && self.ui_settings_root != undefined) {
    self.ui_settings_root.enabled = false;
}
