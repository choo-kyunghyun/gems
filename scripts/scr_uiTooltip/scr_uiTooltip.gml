function UITooltip(_style = {}, _tooltip = {}) : UITrigger(_style, { pointer_capture: false }) constructor {
    self.text_ref = _tooltip[$ "text_ref"] ?? function() { return ""; };
    self.delay = _tooltip[$ "delay"] ?? 0.2;
    self.elapsed = 0;
    
    self.on_hover = method(self, function() {
        var _time = Time;
        var _tooltip = Tooltip;
        self.elapsed += _time.raw;
        if (self.elapsed >= self.delay) _tooltip.set(self.text_ref());
    });
    self.on_leave = method(self, function() { self.elapsed = 0; });
}
