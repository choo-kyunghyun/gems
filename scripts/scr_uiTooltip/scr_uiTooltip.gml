function UITooltip(_style = {}, _tooltip = {}) : UIElement(_style) constructor {
    self.textRef = _tooltip[$ "textRef"] ?? function() { return ""; };
    self.delay = _tooltip[$ "delay"] ?? 0.2;
    self.elapsed = 0;
    
    static on_update = function() {
        var _mx = device_mouse_x_to_gui(0);
        var _my = device_mouse_y_to_gui(0);
        if (self.position_meeting(_mx, _my)) {
            self.elapsed += Time.raw;
            if (self.elapsed >= self.delay) Tooltip.set(self.textRef());
        } else {
            self.elapsed = 0;
        }
    }
}
