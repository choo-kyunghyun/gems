if (keyboard_check_pressed(vk_escape)) {
    var _overlay_enabled = self.overlay.children[0].enabled;
    self.overlay.children[0].enabled = !_overlay_enabled;
}

UIManager.update();
