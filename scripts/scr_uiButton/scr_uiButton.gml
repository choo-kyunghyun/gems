function UIButton(_style = {}, _button = {}) : UIElement(_style) constructor {
    self.enter = false;
    self.hold = false;
    
    self.on_enter = method(self, _button[$ "on_enter"] ?? noop);
    self.on_leave = method(self, _button[$ "on_leave"] ?? noop);
    self.on_down = method(self, _button[$ "on_down"] ?? noop);
    self.on_up = method(self, _button[$ "on_up"] ?? noop);
    self.on_click = method(self, _button[$ "on_click"] ?? noop);
    
    static on_destroy = function() {
        if (self.enter) self.on_leave();
    }
    
    static on_update = function() {
        var _pressed = mouse_check_button_pressed(mb_left);
        var _released = mouse_check_button_released(mb_left);
        var _enter_prev = self.enter;
        var _mx = device_mouse_x_to_gui(0);
        var _my = device_mouse_y_to_gui(0);
        self.enter = self.position_meeting(_mx, _my);
        
        if (self.enter) {
            if (!_enter_prev) self.on_enter();
            if (_pressed) {
                self.hold = true;
                self.on_down();
            }
        } else if (_enter_prev) {
            self.on_leave();
        }
        
        if (_released) {
            if (self.hold) {
                self.on_up();
                if (self.enter) self.on_click();
            }
            self.hold = false;
        }
    }
}
