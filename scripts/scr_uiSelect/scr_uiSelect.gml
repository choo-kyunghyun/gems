function UISelect(_style = {}, _select = {}, _trigger = {}, _panel = {}, _text = {}) : UITrigger(_style, _trigger) constructor {
    self.items = _select[$ "items"] ?? [];
    self.index = clamp(_select[$ "index"] ?? 0, 0, max(0, array_length(self.items) - 1));
    self.on_change = method(self, _select[$ "on_change"] ?? noop);
    self.on_click = method(self, function() { 
        if (array_length(self.items) <= 0) return; 
            self.index = (self.index + 1) mod array_length(self.items);
            self.on_change(); 
        }
    );

    self.panel = new UIPanel({ width: "100%", height: "100%", position: "absolute" }, _panel);
    self.insert_child(self.panel);
    
    self.text = new UIText({}, _text);
    self.text.text_ref = method(self, function() { return self.get_name(); });
    self.insert_child(self.text);
    
    static insert_item = function(_name, _value, _index = array_length(self.items)) {
        array_insert(self.items, _index, { name: _name, value: _value });
        self.on_change();
        return self;
    }
    
    static get_name = function() {
        if (array_length(self.items) <= 0) return "";
        var _it = self.items[self.index];
        if (is_struct(_it)) return _it[$ "name"] ?? string(_it[$ "value"] ?? "");
        return string(_it);
    }
    
    static get_value = function() {
        if (array_length(self.items) <= 0) return undefined;
        var _it = self.items[self.index];
        if (is_struct(_it)) return _it[$ "value"] ?? _it[$ "name"];
        return _it;
    }

    static set_index = function(_index) {
        self.index = clamp(_index, 0, max(0, array_length(self.items) - 1));
        self.on_change();
        return self;
    }
}
