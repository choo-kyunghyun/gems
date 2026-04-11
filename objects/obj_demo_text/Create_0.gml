// Inherit the parent event
event_inherited();

var _make_cell = function(_halign, _w) {
    var _font = i18n.get_font("regular");
    var _panel = new UIPanel({ width: 520, height: 160 }, { colour: ASTOLFO_BLACK, rad: 8 });
    var _txt = new UIText({}, {
        text_ref: _w > 0
            ? function() { return "Quick brown fox\nLazy dog here\nThird line text"; }
            : function() { return "Hello World single line"; },
        halign: _halign,
        w: _w,
        colour: _w > 0 ? ASTOLFO_PINK : ASTOLFO_GOLD,
        font: _font,
    });
    _panel.insert_child(_txt);
    return _panel;
}

var _make_label = function(_str) {
    var _font_sm = i18n.get_font("small");
    return new UIText({}, {
        text_ref: method({ s: _str }, function() { return self.s; }),
        colour: ASTOLFO_WHITE_D,
        font: _font_sm,
    });
}

self.table = new UIElement({ width: "100%", height: "100%", padding: 32 });

var _header = new UIElement({ width: "100%", flexDirection: "row", gap: 16 });
_header.insert_child(_make_label("halign"));
_header.insert_child(_make_label("w=0\u00a0\u00a0single line [gold]\n(element = text size, no effect)"));
_header.insert_child(_make_label("w=300\u00a0multiline [pink]\n(element = fixed size, effect visible)"));
self.table.insert_child(_header);

var _haligns = [[fa_left, "fa_left"], [fa_center, "fa_center"], [fa_right, "fa_right"]];
for (var _i = 0; _i < array_length(_haligns); _i++) {
    var _h = _haligns[_i][0];
    var _n = _haligns[_i][1];
    var _row = new UIElement({ width: "100%", flexDirection: "row", gap: 16 });
    _row.insert_child(_make_label(_n));
    _row.insert_child(_make_cell(_h, 0));
    _row.insert_child(_make_cell(_h, 300));
    self.table.insert_child(_row);
}

self.main.insert_child(self.table);
