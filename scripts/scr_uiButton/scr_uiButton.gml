function UIButton(_style = {}, _trigger = {}, _panel = {}, _tooltip = {}, _text = {}) : UITrigger(_style, _trigger) constructor {
    self.panel = new UIPanel({ width: "100%", height: "100%", position: "absolute" }, _panel);
    self.tooltip = new UITooltip({ width: "100%", height: "100%", position: "absolute" }, _tooltip);
    self.text = new UIText({}, _text);
    self.insert_child(self.panel);
    self.insert_child(self.tooltip);
    self.insert_child(self.text);
}
