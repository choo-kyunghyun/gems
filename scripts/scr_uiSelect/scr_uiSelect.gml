function UISelect(_style = {}, _select = {}, _panel = {}, _text = {}, _trigger = {}) : UITrigger(_style, _trigger) constructor {
    self.items = _select[$ "items"] ?? [];
    self.index = clamp(_select[$ "index"] ?? 0, 0, max(0, array_length(self.items) - 1));
    self.on_change = method(self, _select[$ "on_change"] ?? noop);

    self.panel = new UIPanel({ width: "100%", height: "100%", position: "absolute" }, _panel);
    self.text = new UIText({}, _text);

    static get_label = function() {
        if (array_length(self.items) <= 0) return "";
        var _it = self.items[self.index];
        if (is_struct(_it)) return _it[$ "label"] ?? string(_it[$ "value"] ?? "");
        return string(_it);
    }

    self.text.text_ref = method(self, function() { return self.get_label(); });
    self.insert_child(self.panel);
    self.insert_child(self.text);

    // Default click cycles through items
    if (_trigger[$ "on_click"] == undefined) {
        self.on_click = method(self, function() {
            if (array_length(self.items) <= 0) return;
            self.index = (self.index + 1) mod array_length(self.items);
            self.on_change();
        });
    }

    static set_items = function(_items, _index = 0) {
        self.items = _items;
        self.index = clamp(_index, 0, max(0, array_length(self.items) - 1));
        self.on_change();
        return self;
    }

    static set_index = function(_index) {
        self.index = clamp(_index, 0, max(0, array_length(self.items) - 1));
        self.on_change();
        return self;
    }

    static get_value = function() {
        if (array_length(self.items) <= 0) return undefined;
        var _it = self.items[self.index];
        if (is_struct(_it)) return _it[$ "value"] ?? _it[$ "label"];
        return _it;
    }
}
