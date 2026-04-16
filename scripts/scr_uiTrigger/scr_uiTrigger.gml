function UITrigger(_style = {}, _trigger = {}) : UIElement(_style) constructor {
    self.on_enter = method(self, _trigger[$ "on_enter"] ?? noop);
    self.on_hover = method(self, _trigger[$ "on_hover"] ?? noop);
    self.on_down = method(self, _trigger[$ "on_down"] ?? noop);
    self.on_leave = method(self, _trigger[$ "on_leave"] ?? noop);
    self.on_up = method(self, _trigger[$ "on_up"] ?? noop);
    self.on_click = method(self, _trigger[$ "on_click"] ?? noop);
    self.hovering = false;
    self.pressing = false;
    self.pointer_enabled = true;
    self.pointer_capture = _trigger[$ "pointer_capture"] ?? true;
    
    static on_destroy = function() {
        if (self.hovering) self.on_leave();
    }

    static on_update = function() {
        var _pointer = self.pointer;

        if (_pointer.entered) {
            self.hovering = true;
            self.on_enter();
        }

        if (_pointer.hovered) {
            self.on_hover();
        }

        if (_pointer.left) {
            if (self.hovering) self.on_leave();
            self.hovering = false;
        }

        if (_pointer.pressed) {
            self.pressing = true;
            self.on_down();
        }

        if (_pointer.released) {
            if (self.pressing) self.on_up();
            self.pressing = false;
        }

        if (_pointer.clicked) {
            self.on_click();
        }
    }
}
