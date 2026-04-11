function UITrigger(_style = {}, _trigger = {}) : UIElement(_style) constructor {
    self.on_enter = method(self, _trigger[$ "on_enter"] ?? noop);
    self.on_hover = method(self, _trigger[$ "on_hover"] ?? noop);
    self.on_down = method(self, _trigger[$ "on_down"] ?? noop);
    self.on_leave = method(self, _trigger[$ "on_leave"] ?? noop);
    self.on_up = method(self, _trigger[$ "on_up"] ?? noop);
    self.on_click = method(self, _trigger[$ "on_click"] ?? noop);
    self.enter = false;
    self.hold = false;
    
    static on_destroy = function() {
        if (self.enter) self.on_leave();
    }
    
    static on_update = function() {
        var _pressed = mouse_check_button_pressed(mb_left);
        var _released = mouse_check_button_released(mb_left);
        var _mx = device_mouse_x_to_gui(0);
        var _my = device_mouse_y_to_gui(0);
        var _enter_prev = self.enter;
        self.enter = self.position_meeting(_mx, _my);
        
        if (self.enter) {
            if (!_enter_prev) self.on_enter();
            self.on_hover();
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
