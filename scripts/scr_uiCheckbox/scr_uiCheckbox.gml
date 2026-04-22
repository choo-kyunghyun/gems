function UICheckbox(_style = {}, _checkbox = {}, _trigger = {}) : UITrigger(_style, _trigger) constructor {
    self.value = _checkbox[$ "value"] ?? false;
    self.on_change = method(self, _checkbox[$ "on_change"] ?? noop);

    self.col0 = _checkbox[$ "col0"] ?? #121212;
    self.col1 = _checkbox[$ "col1"] ?? #1DB954;

    // Visual sizing in points (percent-based sizing breaks easily with flex layouts)
    self.size = _checkbox[$ "size"] ?? 24;
    self.mark_scale = _checkbox[$ "mark_scale"] ?? 0.6;

    self.rad0 = _checkbox[$ "rad0"] ?? max(2, self.size * 0.18);
    self.rad1 = _checkbox[$ "rad1"] ?? max(2, self.size * 0.28);

    // Preserve user click handler, but always toggle first.
    self.user_on_click = method(self, _trigger[$ "on_click"] ?? noop);
    self.on_click = function() {
        self.set_value(!self.value);
        self.user_on_click();
    }

    self.indicator = new UIPanel({
        width: self.size,
        height: self.size,
        alignItems: "center",
        justifyContent: "center",
    }, { color: self.col0, alpha: 0.25, rad: self.rad1 });

    self.mark = new UIPanel({
        width: self.size * self.mark_scale,
        height: self.size * self.mark_scale,
    }, { color: self.col1, alpha: self.value ? 1 : 0, rad: self.rad0 });

    self.indicator.insert_child(self.mark);
    self.insert_child(self.indicator);

    static set_value = function(_value) {
        self.value = _value;
        if (self.mark != undefined) self.mark.alpha = self.value ? 1 : 0;
        self.on_change();
        return self;
    }

    static set_size = function(_size) {
        self.size = _size;
        self.indicator.set_width(self.size, flexpanel_unit.point);
        self.indicator.set_height(self.size, flexpanel_unit.point);
        self.mark.set_width(self.size * self.mark_scale, flexpanel_unit.point);
        self.mark.set_height(self.size * self.mark_scale, flexpanel_unit.point);
        return self;
    }

    static toggle = function() {
        return self.set_value(!self.value);
    }
}
