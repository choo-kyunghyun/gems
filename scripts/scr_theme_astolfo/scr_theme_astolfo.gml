#macro ASTOLFO_APRICOT #fdeddd
#macro ASTOLFO_PURPLE #ea8da2
#macro ASTOLFO_PURPLE_D #894b79
#macro ASTOLFO_PINK #f6bbad
#macro ASTOLFO_PINK_D #ac6371
#macro ASTOLFO_BLACK #4d514a
#macro ASTOLFO_BLACK_D #36362e
#macro ASTOLFO_WHITE #fcfbfc
#macro ASTOLFO_WHITE_D #ab9a90
#macro ASTOLFO_RED #c75459
#macro ASTOLFO_RED_D #882f3a
#macro ASTOLFO_GOLD #f9d061
#macro ASTOLFO_GOLD_D #aa642d

function demo_ui_button_icon(_width, _height, _action, _icon, _tooltip) {
    var _style = { width: _width, height: _height };
    var _panel = { alpha: 0 };
    var _trigger = {
        on_enter: function() { window_set_cursor(cr_handpoint); self.parent.icon.color = ASTOLFO_WHITE; },
        on_leave: function() { window_set_cursor(cr_default); self.parent.icon.color = ASTOLFO_WHITE_D; },
        on_click: _action,
    };
    var _img = { sprite: _icon, color: ASTOLFO_WHITE_D };
    var _tip = { text_ref: I18n.get_text_ref(_tooltip) };
    var _btn = new UIButton(_style, _panel, _trigger, _img, _tip, undefined, undefined);
    return _btn;
}

function demo_ui_button_high(_width, _height, _action, _tooltip, _text) {
    var _style = { width: _width, height: _height };
    var _panel = { color: ASTOLFO_PURPLE, rad: _height };
    var _trigger = {
        on_enter: function() { window_set_cursor(cr_handpoint); self.parent.color = ASTOLFO_PINK; },
        on_leave: function() { window_set_cursor(cr_default); self.parent.color = ASTOLFO_PURPLE; },
        on_click: _action,
    };
    var _tip = { text_ref: I18n.get_text_ref(_tooltip) };
    var _txt = { text_ref: I18n.get_text_ref(_text), color: ASTOLFO_WHITE };
    var _button = new UIButton(_style, _panel, _trigger, undefined, _tip, _txt, undefined);
    return _button;
}

function demo_ui_button_low(_width, _height, _action, _icon, _tooltip, _text, _description) {
    var _style = { width: _width, height: _height };
    var _panel = { color: ASTOLFO_BLACK, rad: _height };
    var _trigger = {
        on_enter: function() { window_set_cursor(cr_handpoint); self.parent.icon.color = ASTOLFO_WHITE; },
        on_leave: function() { window_set_cursor(cr_default); self.parent.icon.color = ASTOLFO_WHITE_D; },
        on_click: _action,
    };
    var _img = { sprite: _icon, color: ASTOLFO_WHITE_D };
    var _tip = { text_ref: I18n.get_text_ref(_tooltip) };
    var _txt = { text_ref: I18n.get_text_ref(_text), color: ASTOLFO_WHITE, font: I18n.get_font("regular") };
    var _desc = { text_ref: I18n.get_text_ref(_description), color: ASTOLFO_WHITE_D, font: I18n.get_font("small") };
    var _button = new UIButton(_style, _panel, _trigger, _img, _tip, _txt, _desc);
    return _button;
}

function demo_ui_help(_width, _height, _text) {
    var _help = new UIButton({ width: _width, height: _height }, { alpha: 0 }, undefined, { sprite: spr_choo }, { text_ref: I18n.get_text_ref(_text) }, undefined, undefined);
    return _help;
}

function demo_ui_field(_width, _height, _label, _text) {
    var _box = new UIElement({ width: _width, height: _height, flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center" });
    var _left = new UIText({}, { text_ref: I18n.get_text_ref(_label) });
    var _right = new UIText({}, _text);
    _box.insert_child(_left).insert_child(_right);
    return _box;
}
