function UICheckbox(_style = {}, _checkbox = {}, _trigger = {}) : UITrigger(_style, _trigger) constructor {
    self.value = _checkbox[$ "value"] ?? false;
    self.on_change = method(self, _checkbox[$ "on_change"] ?? noop);
    self.on_click = function() {
        self.value = !self.value;
        self.on_change();
    }
}
