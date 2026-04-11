function UITooltip(_style = {}, _tooltip = {}) : UITrigger(_style, {}) constructor {
    self.text_ref = _tooltip[$ "text_ref"] ?? function() { return ""; };
    self.delay = _tooltip[$ "delay"] ?? 0.2;
    self.elapsed = 0;
    
    self.on_hover = method(self, function() {
        self.elapsed += Time.raw;
        if (self.elapsed >= self.delay) Tooltip.set(self.text_ref());
    });
    self.on_leave = method(self, function() { self.elapsed = 0; });
}
