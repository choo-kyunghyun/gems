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

#macro FONT_BOLD I18n.get_font("bold")
#macro FONT_NORMAL I18n.get_font("normal")

function demo_ui_overlay_panel(_name) {
    var _panel = new UIPanel({ width: "100%", padding: 16 }, { color: ASTOLFO_BLACK });
    var _text = new UIText({}, { text_ref: I18n.get_text_ref(_name), color: ASTOLFO_WHITE, font: FONT_BOLD });
    _panel.insert_child(_text);
    return _panel;
}

function demo_ui_overlay() {
    var _root = new UIElement({ width: "100%", height: "100%" });
    var _overlay = new UIElement({ width: "40%", height: "100%", flexDirection: "row" });
    _root.insert_child(_overlay);

    var _aside = new UIPanel({ width: "20%", height: "100%", padding: 16, gap: 16 }, { color: ASTOLFO_BLACK_D });
    var _main = new UIPanel({ width: "80%", height: "100%", padding: 16, gap: 16 }, { color: ASTOLFO_BLACK_D });
    _overlay.insert_child(_aside).insert_child(_main);

    var _close = demo_ui_button_icon(spr_exit, "Close", function() {
        obj_game.overlay.children[0].enabled = false;
    });
    _aside.insert_child(_close);
    
    var _general = demo_ui_overlay_panel("General");
    var _time = new UIText({}, { text_ref: function() { return $"{date_time_string(date_current_datetime())}"; }, font: FONT_NORMAL });
    _general.insert_child(_time);
    _main.insert_child(_general);

    var _ui = demo_ui_overlay_panel("UI");
    _main.insert_child(_ui);

    var _input = demo_ui_overlay_panel("Input");
    _main.insert_child(_input);

    var _graphics = demo_ui_overlay_panel("Graphics");
    _main.insert_child(_graphics);

    var _audio = demo_ui_overlay_panel("Audio");
    _main.insert_child(_audio);

    var _footer = demo_ui_overlay_panel("G.E.M.S.");
    var _version = new UIText({}, { text_ref: function() { return $"{GM_version}"; }, font: FONT_NORMAL });
    var _copy = new UIText({}, { text_ref: function() { return "(c) Choo Kyunghyun"; }, font: FONT_NORMAL });
    _footer.insert_child(_version).insert_child(_copy);
    _main.insert_child(_footer);
    
    return _root;
}

function demo_ui_button(_text = "", _tooltip = "", _action = noop) {
    var _style = { width: "80%", padding: 16, justifyContent: "center", alignItems: "center", alignSelf: "center" };
    var _trigger = {
        on_enter: function() { self.panel.color = ASTOLFO_PINK; window_set_cursor(cr_handpoint); },
        on_leave: function() { self.panel.color = ASTOLFO_PURPLE; window_set_cursor(cr_default); },
        on_down: function() { self.panel.set_width(90, flexpanel_unit.percent); self.panel.set_height(90, flexpanel_unit.percent); },
        on_up: function() { self.panel.set_width(100, flexpanel_unit.percent); self.panel.set_height(100, flexpanel_unit.percent); },
        on_click: _action,
    };
    var _panel = { color: ASTOLFO_PURPLE, rad: 24 };
    var _tip = { text_ref: I18n.get_text_ref(_tooltip) };
    var _txt = { text_ref: I18n.get_text_ref(_text), font: FONT_NORMAL, color: ASTOLFO_WHITE };
    return new UIButton(_style, _trigger, _panel, _tip, _txt);
}

function demo_ui_button_icon(_sprite, _tooltip = "", _action = noop) {
    var _btn = new UITrigger({ aspectRatio: 1, height: "10%", alignItems: "center", justifyContent: "center" }, {
        on_enter: function() { self.panel.alpha = 0.25; },
        on_leave: function() { self.panel.alpha = 0; },
        on_click: _action,
    });
    _btn[$ "panel"] = new UIPanel({ width: "100%", height: "100%", position: "absolute" }, { alpha: 0 });
    _btn[$ "tooltip"] = new UITooltip({ width: "100%", height: "100%", position: "absolute" }, { text_ref: I18n.get_text_ref(_tooltip) });
    _btn[$ "icon"] = new UIImage({ width: "80%", height: "80%", position: "absolute" }, { sprite: _sprite });
    _btn.insert_child(_btn.panel).insert_child(_btn.tooltip).insert_child(_btn.icon);
    return _btn;
}

function demo_ui_input(_placeholder = "", _action = noop) {
    var _style = { padding: 16 };
    var _props = { on_change: _action, caret_color: ASTOLFO_WHITE };
    var _panel = { color: ASTOLFO_BLACK_D };
    var _txt = { font: FONT_NORMAL, color: ASTOLFO_WHITE };
    var _ph = { text_ref: I18n.get_text_ref(_placeholder), font: FONT_NORMAL, color: ASTOLFO_BLACK };
    var _input = new UIInput(_style, _props, _panel, _txt, _ph);
    return _input;
}
