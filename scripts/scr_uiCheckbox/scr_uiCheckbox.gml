function UICheckbox(_style = {}, _checkbox = {}, _panel = {}, _text = {}, _box_style = {}, _box_panel = {}) : UIPanel(_style, _panel) constructor {
    self.value = _checkbox[$ "value"] ?? false;
    self.on_change = method(self, _checkbox[$ "on_change"] ?? noop);
    
    var _self = self;
    self.trigger = new UITrigger({ width: "100%", height: "100%", position: "absolute" }, {
        on_click: method({ checkbox: _self }, function() {
            self.checkbox.value = !self.checkbox.value;
            self.checkbox.box.alpha = self.checkbox.value ? 1 : 0;
        }),
    });
    self.box_border = new UIPanel(_box_style, _box_panel);
    _box_panel[$ "color"] = _style[$ "color"];
    self.box = new UIPanel(_box_style, _box_panel);
    if (!self.value) self.box.alpha = 0;
    self.text = new UIText({}, _text);

    self.box_border.insert_child(self.box);
    self.insert_child(self.trigger).insert_child(self.box_border).insert_child(self.text);
    self.set_flex_direction(flexpanel_flex_direction.row);
}
