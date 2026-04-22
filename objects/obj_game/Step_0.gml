if (keyboard_check_pressed(vk_escape)) {
    self.overlay_visible = !self.overlay_visible;
    self.overlay.children[0].enabled = self.overlay_visible;
}

if (self.overlay_visible) {
    var _wheel = mouse_wheel_down() - mouse_wheel_up();
    if (_wheel != 0) {
        var _pos = flexpanel_node_layout_get_position(self.overlay.flexpanel);
        var _margin = clamp(self.overlay.get_margin(flexpanel_edge.top).value - _wheel * 64, -(_pos.height), 0);
        self.overlay.set_margin(flexpanel_edge.top, _margin);
    }
}

UIManager.update();
