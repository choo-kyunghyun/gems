function UICheckbox(_style = {}, _checkbox = {}, _trigger = {}) : UITrigger(_style, _trigger) constructor {
    self.value = _checkbox[$ "value"] ?? false;
    self.on_change = method(self, _checkbox[$ "on_change"] ?? noop);
    self.col0 = _checkbox[$ "col0"] ?? #121212;
    self.col1 = _checkbox[$ "col1"] ?? #1DB954;
    self.rad0 = _checkbox[$ "rad0"] ?? 24;
    self.rad1 = _checkbox[$ "rad1"] ?? 32;
    self.on_click = function() {
        self.value = !self.value;
        self.indicator.children[0].color = self.value ? self.col1 : self.col0;
        self.on_change();
    }
    self.indicator = new UIPanel({ width: "20%", height: "80%", aspectRatio: 1, alignItems: "center", justifyContent: "center" }, { color: self.col1, rad: self.rad1 });
    self.indicator.insert_child(new UIPanel({ height: "80%", aspectRatio: 1 }, { color: self.value ? self.col1 : self.col0, rad: self.rad0 }));
    self.insert_child(self.indicator);
}
