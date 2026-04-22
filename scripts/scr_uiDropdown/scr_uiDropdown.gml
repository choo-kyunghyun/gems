function UIDropdown(_style = {}, _dropdown = {}, _button = {}, _list_panel = {}, _item_panel = {}, _item_text = {}) : UIElement(_style) constructor {
    self.items = _dropdown[$ "items"] ?? [];
    self.index = clamp(_dropdown[$ "index"] ?? 0, 0, max(0, array_length(self.items) - 1));
    self.open = _dropdown[$ "open"] ?? false;
    self.on_change = method(self, _dropdown[$ "on_change"] ?? noop);
    
    // Persist styles used by rebuild_list (avoid relying on constructor locals)
    self.list_panel_style = _list_panel;
    self.item_panel_style = _item_panel;
    self.item_text_style = _item_text;

    // Button area (uses UISelect-style display, but separate component)
    self.button = new UISelect({ width: "100%" }, {
        items: self.items,
        index: self.index,
        on_change: function() {
            // Note: UISelect binds callbacks to itself, so `self` here is the UISelect instance.
            self.owner.index = self.index;
            self.owner.on_change();
        },
    }, _button[$ "panel"] ?? {}, _button[$ "text"] ?? {}, _button[$ "trigger"] ?? {
        on_click: function() { self.owner.set_open(!self.owner.open); },
    });
    self.button.owner = self;
    self.insert_child(self.button);

    // List container
    self.list_panel = new UIPanel({ width: "100%", position: "absolute", top: "100%", padding: 6, gap: 6, flexDirection: "column" }, self.list_panel_style);
    self.list_panel.enabled = self.open;
    self.insert_child(self.list_panel);

    static rebuild_list = function() {
        // Clear old
        for (var _i = array_length(self.list_panel.children) - 1; _i >= 0; _i--) {
            self.list_panel.children[_i].destroy();
        }
        // Rebuild items
        for (var _i = 0; _i < array_length(self.items); _i++) {
            var _row = new UITrigger({ width: "100%", padding: 8, justifyContent: "center" }, {
                on_enter: function() { self.panel.alpha = 1; },
                on_leave: function() { self.panel.alpha = 0; },
                on_click: function() {
                    self.owner.set_index(self.idx);
                    self.owner.set_open(false);
                }
            });
            _row.owner = self;
            _row.idx = _i;
            _row[$ "panel"] = new UIPanel({ width: "100%", height: "100%", position: "absolute" }, self.item_panel_style);
            _row.panel.alpha = 0;

            _row[$ "text"] = new UIText({}, self.item_text_style);
            _row.text.text_ref = method(_row, function() {
                var _it = self.owner.items[self.idx];
                if (is_struct(_it)) return string(_it[$ "label"] ?? _it[$ "value"] ?? "");
                return string(_it);
            });

            _row.insert_child(_row.panel);
            _row.insert_child(_row.text);
            self.list_panel.insert_child(_row);
        }
        return self;
    }

    static set_open = function(_open) {
        self.open = _open;
        self.list_panel.enabled = self.open;
        return self;
    }

    static set_items = function(_items, _index = 0) {
        self.items = _items;
        self.index = clamp(_index, 0, max(0, array_length(self.items) - 1));
        self.button.set_items(self.items, self.index);
        self.rebuild_list();
        self.on_change();
        return self;
    }

    static set_index = function(_index) {
        self.index = clamp(_index, 0, max(0, array_length(self.items) - 1));
        self.button.set_index(self.index);
        self.on_change();
        return self;
    }

    static get_value = function() {
        return self.button.get_value();
    }

    self.rebuild_list();
}
