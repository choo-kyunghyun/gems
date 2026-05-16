/// Title room UI tree (layout, settings pages, menu). Per-frame and teardown live on obj_title.

function title_init() {
    var _root = new UIElement({ width: "100%", height: "100%" });
    self.ui_root = _root;

    var _bg = new UIPanel({ width: "100%", height: "100%", position: "absolute" }, { color: global.space_color.slate, rad: 0 });
    _root.insert_child(_bg);

    // Starfield-style title layout: left menu, plus a truly screen-centered logo layer.
    var _logo_layer = new UIElement({
        width: "100%",
        height: "100%",
        position: "absolute",
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column",
    });
    _root.insert_child(_logo_layer);

    var _logo = new UIImage(
        { width: "70%", height: 240 },
        { sprite: spr_choo, fit: OBJECT_FIT.CONTAIN, color: global.space_color.white, alpha: 1 }
    );
    _logo_layer.insert_child(_logo);

    var _layout = new UIElement({
        width: "100%",
        height: "100%",
        padding: 48,
        gap: 32,
        alignItems: "center",
        justifyContent: "flex-start",
        flexDirection: "row",
    });
    _root.insert_child(_layout);
    self.ui_main = _layout;

    var _left = new UIElement({
        width: 440,
        height: "100%",
        justifyContent: "center",
        alignItems: "stretch",
        gap: 12,
        flexDirection: "column",
    });
    _layout.insert_child(_left);

    // Menu container (buttons supply their own hover panel)
    var _menu = new UIElement({ width: "100%", gap: 6, flexDirection: "column" });
    _left.insert_child(_menu);
    self.ui_menu = _menu;

    // Settings layer (separate, animated)
    self.settings_open = false;
    self.settings_t = 0;      // 0..1
    self.settings_speed = 8;  // per-second-ish (scaled by Time.raw)

    self.ui_settings_root = new UIElement({ width: "100%", height: "100%", position: "absolute" });
    self.ui_settings_root.enabled = false;
    _root.insert_child(self.ui_settings_root);

    // Fullscreen input-catcher so title UI never receives clicks while settings is open.
    self.ui_settings_blocker = new UITrigger({ width: "100%", height: "100%", position: "absolute" }, {
        on_click: noop,
    });
    self.ui_settings_root.insert_child(self.ui_settings_blocker);

    self.ui_settings_backdrop = new UIPanel({ width: "100%", height: "100%", position: "absolute" }, { color: global.space_color.slate, alpha: 0.92, rad: 0 });
    self.ui_settings_root.insert_child(self.ui_settings_backdrop);

    self.ui_settings_card = new UIPanel(
        { width: "100%", height: "100%", padding: 32, gap: 24, flexDirection: "row" },
        { color: global.space_color.slate, rad: 0, alpha: 0 }
    );
    self.ui_settings_card.clip = true;
    self.ui_settings_root.insert_child(self.ui_settings_card);

    // Settings layout: left category list + right scrollable page.
    self.settings_active = 0;

    self.ui_settings_nav = new UIElement({ width: "22%", height: "100%", gap: 10, flexDirection: "column" });
    self.ui_settings_card.insert_child(self.ui_settings_nav);

    self.ui_settings_pages = new UIElement({ width: "78%", height: "100%", position: "relative" });
    self.ui_settings_card.insert_child(self.ui_settings_pages);

    // Each page is a scrollable container (clip + inner marginTop).
    self.settings_pages = [];

    self._settings_add_page = function(_title) {
        var _page = {};
        _page.title = _title;
        _page.scroll = 0;
        _page.scroll_speed = 56;

        _page.root = new UIElement({ width: "100%", height: "100%", position: "absolute" });
        _page.root.enabled = false;
        self.ui_settings_pages.insert_child(_page.root);

        _page.viewport = new UIPanel({ width: "100%", height: "100%", position: "absolute", padding: 0 }, { color: global.space_color.white, alpha: 0, rad: 0 });
        _page.viewport.clip = true;
        _page.root.insert_child(_page.viewport);

        _page.content = new UIElement({ width: "100%", padding: 4, gap: 16, flexDirection: "column" });
        _page.viewport.insert_child(_page.content);

        // Header (avoid capturing `_title` in closure)
        _page.content.insert_child(new UIText({}, {
            text_ref: method(_page, function() { return self.title; }),
            font: SPACE_FONT_BOLD,
            color: global.space_color.white,
            xscale: 1.1,
            yscale: 1.1,
        }));

        array_push(self.settings_pages, _page);
        return _page;
    }

    self._settings_set_active = function(_idx) {
        self.settings_active = clamp(_idx, 0, array_length(self.settings_pages) - 1);
        for (var _i = 0; _i < array_length(self.settings_pages); _i++) {
            self.settings_pages[_i].root.enabled = (_i == self.settings_active);
        }
    }

    // Helper: get persistent settings struct from obj_game.
    self._settings_ref = function() {
        if (instance_exists(obj_game)) return obj_game.settings;
        return self[$ "_fallback_settings"] ?? (self._fallback_settings = {});
    }

    self._settings_get = function(_key, _default) {
        var _s = self._settings_ref();
        return _s[$ _key] ?? _default;
    }
    self._settings_set = function(_key, _value) {
        var _s = self._settings_ref();
        _s[$ _key] = _value;
        return _value;
    }

    // UI helper: "Restore defaults" for a single key + slider.
    self._settings_reset_button = function(_key, _slider) {
        var _btn = space_ui_button("Restore defaults", "", function() {
            // self = UIButton (because UITrigger binds callbacks to the button)
            if (!instance_exists(obj_game)) return;
            var _d = obj_game.settings_default[$ self.key];
            self.owner._settings_set(self.key, _d);
            self.slider.set_value(_d);
        }, { style: { width: "100%", padding: 10, alignSelf: "stretch" } });
        _btn.owner = self;
        _btn.key = _key;
        _btn.slider = _slider;
        return _btn;
    }

    // Pages (first-level categories)
    var _pg_general  = self._settings_add_page("General");
    var _pg_input    = self._settings_add_page("Input");
    var _pg_ui       = self._settings_add_page("UI");
    var _pg_audio    = self._settings_add_page("Audio");
    var _pg_graphics = self._settings_add_page("Graphics");

    // --- General options
    {
        var _p = space_ui_section_panel(method(self, function() {
            var _name = "Language";
            if (instance_exists(obj_game) && obj_game.settings_is_modified("language")) return _name + " *";
            return _name;
        }));
        var _select = new UISelect({ width: "100%", padding: 12 }, {
            items: [ { label: "Korean", value: "ko-KR" }, { label: "English", value: "en-US" } ],
            index: 0,
            on_change: function() { self.owner._settings_set("language", self.get_value()); },
        }, (function() { var _c = space_unpack_color(global.space_color.alabaster, 1); _c.rad = 4; return _c; })(), { font: SPACE_FONT_NORMAL, color: global.space_color.slate }, {
            on_enter: function() { self.panel.alpha = 1; },
            on_leave: function() { self.panel.alpha = 0.6; },
        });
        _select.panel.alpha = 0.6;
        _select.owner = self;
        _p.insert_child(_select);
        _pg_general.content.insert_child(_p);
    }

    // --- Input options
    {
        var _p = space_ui_section_panel(method(self, function() {
            var _name = "Mouse";
            if (instance_exists(obj_game) && obj_game.settings_is_modified("mouse_sens")) return _name + " *";
            if (instance_exists(obj_game) && obj_game.settings_is_modified("raw_input")) return _name + " *";
            return _name;
        }));
        var _sens_label = new UIText({}, { text_ref: method(self, function() { return $"Sensitivity: {string_format(self._settings_get("mouse_sens", 0.5), 1, 2)}"; }), font: SPACE_FONT_NORMAL, color: global.space_color.white });
        _p.insert_child(_sens_label);

        var _sens = new UISlider({ width: "100%", height: 10 }, {
            min: 0.1, max: 2.0, value: self._settings_get("mouse_sens", 0.5),
            step: 0.05,
            on_change: function() { self.owner._settings_set("mouse_sens", self.value); },
        }, { color: global.space_color.silver, alpha: 0.25, rad: 4 }, { color: global.space_color.accent, alpha: 1, rad: 4 }, { color: global.space_color.white, alpha: 0, rad: 4 });
        _sens.owner = self;
        _p.insert_child(_sens);

        _p.insert_child(self._settings_reset_button("mouse_sens", _sens));

        var _raw = space_ui_checkbox(method(self, function() {
            var _name = "Raw input";
            if (instance_exists(obj_game) && obj_game.settings_is_modified("raw_input")) return _name + " *";
            return _name;
        }), self._settings_get("raw_input", false), function() { self.owner._settings_set("raw_input", self.value); });
        _raw.owner = self;
        _p.insert_child(_raw);
        _pg_input.content.insert_child(_p);
    }

    // --- UI options
    {
        var _p = space_ui_section_panel(method(self, function() {
            var _name = "UI";
            if (instance_exists(obj_game) && obj_game.settings_is_modified("ui_scale")) return _name + " *";
            if (instance_exists(obj_game) && obj_game.settings_is_modified("show_fps")) return _name + " *";
            return _name;
        }));
        var _scale_label = new UIText({}, { text_ref: method(self, function() { return $"UI scale: {string_format(self._settings_get("ui_scale", 1.0), 1, 2)}"; }), font: SPACE_FONT_NORMAL, color: global.space_color.white });
        _p.insert_child(_scale_label);
        var _scale = new UISlider({ width: "100%", height: 10 }, {
            min: 0.75, max: 1.5, value: self._settings_get("ui_scale", 1.0),
            step: 0.05,
            on_change: function() { self.owner._settings_set("ui_scale", self.value); },
        }, { color: global.space_color.silver, alpha: 0.25, rad: 4 }, { color: global.space_color.accent, alpha: 1, rad: 4 }, { color: global.space_color.white, alpha: 0, rad: 4 });
        _scale.owner = self;
        _p.insert_child(_scale);

        _p.insert_child(self._settings_reset_button("ui_scale", _scale));

        var _fps = space_ui_checkbox(method(self, function() {
            var _name = "Show FPS";
            if (instance_exists(obj_game) && obj_game.settings_is_modified("show_fps")) return _name + " *";
            return _name;
        }), self._settings_get("show_fps", false), function() { self.owner._settings_set("show_fps", self.value); if (instance_exists(obj_game)) obj_game.show_fps = self.value; });
        _fps.owner = self;
        _p.insert_child(_fps);
        _pg_ui.content.insert_child(_p);
    }

    // --- Audio options
    {
        var _p = space_ui_section_panel(method(self, function() {
            var _name = "Volume";
            if (instance_exists(obj_game) && obj_game.settings_is_modified("vol_master")) return _name + " *";
            return _name;
        }));
        var _master_label = new UIText({}, { text_ref: method(self, function() { return $"Master: {round(self._settings_get("vol_master", 1.0) * 100)}%"; }), font: SPACE_FONT_NORMAL, color: global.space_color.white });
        _p.insert_child(_master_label);
        var _master = new UISlider({ width: "100%", height: 10 }, {
            min: 0, max: 1, value: self._settings_get("vol_master", 1.0),
            step: 0.05,
            on_change: function() { self.owner._settings_set("vol_master", self.value); },
        }, { color: global.space_color.silver, alpha: 0.25, rad: 4 }, { color: global.space_color.accent, alpha: 1, rad: 4 }, { color: global.space_color.white, alpha: 0, rad: 4 });
        _master.owner = self;
        _p.insert_child(_master);

        _p.insert_child(self._settings_reset_button("vol_master", _master));
        _pg_audio.content.insert_child(_p);
    }

    // --- Graphics options
    {
        var _p = space_ui_section_panel(method(self, function() {
            var _name = "Display";
            if (instance_exists(obj_game) && obj_game.settings_is_modified("fullscreen")) return _name + " *";
            if (instance_exists(obj_game) && obj_game.settings_is_modified("fps_limit")) return _name + " *";
            if (instance_exists(obj_game) && obj_game.settings_is_modified("resolution_w")) return _name + " *";
            if (instance_exists(obj_game) && obj_game.settings_is_modified("resolution_h")) return _name + " *";
            return _name;
        }));
        var _fs = space_ui_checkbox(method(self, function() {
            var _name = "Fullscreen";
            if (instance_exists(obj_game) && obj_game.settings_is_modified("fullscreen")) return _name + " *";
            return _name;
        }), self._settings_get("fullscreen", false), function() { self.owner._settings_set("fullscreen", self.value); window_set_fullscreen(self.value); });
        _fs.owner = self;
        _p.insert_child(_fs);

        // Resolution dropdown
        var _res_label = new UIText({}, { text_ref: function() { return "Resolution"; }, font: SPACE_FONT_NORMAL, color: global.space_color.white });
        _p.insert_child(_res_label);

        var _dw = display_get_width();
        var _dh = display_get_height();
        var _candidates = [
            { w: 1280, h: 720 },
            { w: 1366, h: 768 },
            { w: 1600, h: 900 },
            { w: 1920, h: 1080 },
            { w: 2560, h: 1440 },
        ];

        var _items = [];
        for (var _i = 0; _i < array_length(_candidates); _i++) {
            var _r = _candidates[_i];
            if (_r.w <= _dw && _r.h <= _dh) {
                array_push(_items, { label: $"{_r.w} x {_r.h}", value: _r });
            }
        }

        var _cur_w = window_get_width();
        var _cur_h = window_get_height();
        var _idx0 = 0;
        for (var _i = 0; _i < array_length(_items); _i++) {
            var _v = _items[_i].value;
            if (_v.w == _cur_w && _v.h == _cur_h) { _idx0 = _i; break; }
        }

        self._apply_resolution = function(_w, _h) {
            window_set_size(_w, _h);
            surface_resize(application_surface, _w, _h);
            window_center();
        }

        var _res_dd = space_ui_dropdown(_items, _idx0, function() {
            var _v = self.get_value();
            if (is_struct(_v)) {
                self.owner._settings_set("resolution_w", _v.w);
                self.owner._settings_set("resolution_h", _v.h);
                self.owner._apply_resolution(_v.w, _v.h);
            }
        }, { style: { width: "100%" } });
        _res_dd.owner = self;
        _p.insert_child(_res_dd);

        var _fps_label = new UIText({}, {
            text_ref: method(self, function() {
                var _v = self._settings_get("fps_limit", 60);
                if (_v == 0) return "Framerate: Unlimited";
                return $"Framerate: {_v}";
            }),
            font: SPACE_FONT_NORMAL,
            color: global.space_color.white,
        });
        _p.insert_child(_fps_label);

        var _fps_values = [30, 60, 120, 0]; // 0 = unlimited
        var _fps0 = self._settings_get("fps_limit", 60);
        var _fps_slider = new UISlider({ width: "100%", height: 10 }, {
            min: 0,
            max: 120,
            value: _fps0,
            values: _fps_values,
            on_change: function() { self.owner._settings_set("fps_limit", self.value); },
        }, { color: global.space_color.silver, alpha: 0.25, rad: 4 }, { color: global.space_color.accent, alpha: 1, rad: 4 }, { color: global.space_color.white, alpha: 0, rad: 4 });
        _fps_slider.owner = self;
        _p.insert_child(_fps_slider);
        _pg_graphics.content.insert_child(_p);
    }

    // Nav buttons
    self.settings_nav_buttons = [];
    self._settings_add_nav = function(_label, _idx) {
        var _btn = space_ui_button(_label, "", function() { self.owner._settings_set_active(self.idx); }, {
            style: { width: "100%", padding: 10, justifyContent: "center", alignItems: "center", alignSelf: "stretch" },
            panel: { color: global.space_color.white, alpha: 0.0, rad: 4 },
            text: { text_ref: function() { return ""; }, font: SPACE_FONT_NORMAL, color: global.space_color.white },
        });
        _btn.idx = _idx;
        _btn.label = _label;
        _btn.text.text_ref = method(_btn, function() { return self.label; });
        _btn.owner = self;
        self.ui_settings_nav.insert_child(_btn);
        array_push(self.settings_nav_buttons, _btn);
        return _btn;
    }

    self._settings_add_nav("General", 0);
    self._settings_add_nav("Input", 1);
    self._settings_add_nav("UI", 2);
    self._settings_add_nav("Audio", 3);
    self._settings_add_nav("Graphics", 4);

    // Back button at bottom
    var _back = space_ui_button("Back", "", function() { self.owner.hide_settings(); }, {
        style: { width: "100%", padding: 10, justifyContent: "center", alignItems: "center", alignSelf: "stretch" },
    });
    _back.owner = self;
    self.ui_settings_nav.insert_child(_back);

    self._settings_set_active(0);

    // Public controls
    self.show_settings = function() {
        self.settings_open = true;
        self.ui_settings_root.enabled = true;
    }
    self.hide_settings = function() {
        self.settings_open = false;
    }

    // Menu buttons (after show_settings/hide_settings exist)
    // We override hover behavior to keep buttons visible at rest, but MUST preserve on_click.
    self._title_add_menu_button = function(_label, _action) {
        var _btn = space_ui_button(_label, "", _action, {
            style: { width: "100%", padding: 14, justifyContent: "flex-start", alignItems: "center", alignSelf: "stretch" },
            panel: { color: global.space_color.white, alpha: 0.10, rad: 0 },
            text: { font: SPACE_FONT_NORMAL, color: global.space_color.white },
            trigger: {
                on_enter: function() {
                    self.panel.alpha = 0.22;
                    self.text.color = global.space_color.white;
                    window_set_cursor(cr_handpoint);
                },
                on_leave: function() {
                    self.panel.alpha = 0.10;
                    self.text.color = global.space_color.white;
                    window_set_cursor(cr_default);
                },
                on_down: function() { self.panel.alpha = 0.30; },
                on_up: function() { self.panel.alpha = 0.22; },
                on_click: _action,
            },
        });

        return _btn;
    }

    var _start = self._title_add_menu_button("Start", function() {
        // No gameplay room yet; keep this as a clean hook point.
        // You can replace this with `room_goto(rm_game)` later.
    });
    var _options = self._title_add_menu_button("Options", function() { self.owner.show_settings(); });
    _options.owner = self;
    var _quit = self._title_add_menu_button("Quit", function() { game_end(); });

    _menu.insert_child(_start);
    _menu.insert_child(_options);
    _menu.insert_child(_quit);

    UI.insert(_root);
}
