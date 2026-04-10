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

function demo_ui_root() {
    var _root = new UIElement({ width: "100%", height: "100%" });
    _root.mark_dirty();
    return _root;
}

function demo_ui_button(_width, _height, _col, _rad, _enter, _leave, _down, _up, _click, _tooltip, _icon, _icon_col, _text, _text_col, _text_fnt, _desc, _desc_col, _desc_fnt) {
    var _panel = new UIPanel({ width: _width, height: _height, flexDirection: "row" }, { colour: _col, rad: _rad });
    
    if (_click != undefined) {
        var _btn = new UIButton({ width: "100%", height: "100%", position: "absolute" }, {
            on_enter: _enter,
            on_leave: _leave,
            on_down: _down,
            on_up: _up,
            on_click: _click,
        });
        _panel.insert_child(_btn);
    }
    
    if (_tooltip != undefined) {
        var _tip = new UITooltip({ width: "100%", height: "100%", position: "absolute" }, { textRef: i18n.get_text_ref(_tooltip) });
        _panel.insert_child(_tip);
    }
    
    if (_icon != undefined) {
        var _style = {};
        if (_width > _height) {
            _style[$ "width"] = _height;
            _style[$ "height"] = _height;
        } else {
            _style[$ "width"] = _width;
            _style[$ "height"] = _width;
        }
        var _image = new UIImage(_style, { sprite: _icon, colour: _icon_col, fit: OBJECT_FIT.CONTAIN });
        _panel.insert_child(_image);
    }
    
    if (_desc != undefined && _text != undefined) {
        var _box = new UIElement({ justifyContent: "center" });
        var _tu = new UIText({}, { textRef: i18n.get_text_ref(_text), colour: _text_col, font: _text_fnt });
        var _td = new UIText({}, { textRef: i18n.get_text_ref(_desc), colour: _desc_col, font: _desc_fnt });
        _box.insert_child(_tu).insert_child(_td);
        _panel.insert_child(_box);
    } else if (_text != undefined) {
        var _box = new UIElement({ width: "100%", height: "100%", justifyContent: "center", alignItems: "center" });
        var _tu = new UIText({}, { textRef: i18n.get_text_ref(_text), colour: _text_col, font: _text_fnt });
        _box.insert_child(_tu);
        _panel.insert_child(_box);
    }
    
    return _panel;
}

function demo_ui_button_play(_action, _text = "", _desc = "", _tooltip = "") {
    static icon = spr_play;
    static text_font = i18n.get_font("regular");
    static desc_font = i18n.get_font("small");
    static enter = function() { self.parent.children[2].colour = ASTOLFO_PINK; }
    static leave = function() { self.parent.children[2].colour = ASTOLFO_PURPLE; }
    return demo_ui_button(360, 120, ASTOLFO_BLACK, 120, enter, leave, noop, noop, _action, _tooltip, icon, ASTOLFO_PURPLE, _text, ASTOLFO_WHITE, text_font, _desc, ASTOLFO_WHITE_D, desc_font);
}

function demo_ui_button_aside(_action, _text = "", _tooltip = "") {
    static enter = function() { self.parent.colour = ASTOLFO_PINK; }
    static leave = function() { self.parent.colour = ASTOLFO_PURPLE; }
    return demo_ui_button("80%", 120, ASTOLFO_PURPLE, 120, enter, leave, noop, noop, _action, _tooltip, undefined, undefined, _text, ASTOLFO_WHITE, draw_get_font(), undefined, undefined, draw_get_font());
}

function demo_ui_button_main() {
    var _icon = new UIImage({ width: "10%", height: "10%", aspectRatio: 1 }, { sprite: spr_exit, colour: ASTOLFO_WHITE_D, fit: OBJECT_FIT.CONTAIN });
    var _btn = new UIButton({ width: "100%", height: "100%", position: "absolute" }, {
        on_enter: function() { self.parent.colour = ASTOLFO_WHITE; },
        on_leave: function() { self.parent.colour = ASTOLFO_WHITE_D; },
        on_down: noop,
        on_up: noop,
        on_click: function() { room_goto(rm_main); },
    });
    var _tooltip = new UITooltip({ width: "100%", height: "100%", position: "absolute" }, { textRef: i18n.get_text_ref("room_goto(rm_main);") });
    _icon.insert_child(_btn);
    _icon.insert_child(_tooltip);
    return _icon;
}
