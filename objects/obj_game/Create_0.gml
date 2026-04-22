#region Release

    #macro RELEASE_MODE false
    
    gml_release_mode(RELEASE_MODE);
    audio_throw_on_error(!RELEASE_MODE);

#endregion

#region Properties

self.persistent = true;

#endregion

#region Window

    var _w = display_get_width() / 2;
    var _h = display_get_height() / 2;
    window_set_size(_w, _h);
    surface_resize(application_surface, _w, _h);
    window_center();

#endregion

#region FPS

    game_set_speed(display_get_frequency(), gamespeed_fps);

#endregion

#region Draw

    draw_set_circle_precision(64);
    draw_enable_svg_aa(true);
    draw_set_svg_aa_level(1);

#endregion

#region UI

    I18n.load("i18n/ko-KR/manifest.json");
    draw_set_font(I18n.get_font("normal"));
    display_set_gui_maximise();

    self.show_fps = false;

#endregion

#region Input

    enum INPUT_ACTIONS {
        UP,
        DOWN,
        LEFT,
        RIGHT,
    }
    
    Input.register(INPUT_ACTIONS.UP, new InputAction().bind_button(INPUT_SOURCE.KEYBOARD, ord("W")));
    Input.register(INPUT_ACTIONS.DOWN, new InputAction().bind_button(INPUT_SOURCE.KEYBOARD, ord("S")));
    Input.register(INPUT_ACTIONS.LEFT, new InputAction().bind_button(INPUT_SOURCE.KEYBOARD, ord("A")));
    Input.register(INPUT_ACTIONS.RIGHT, new InputAction().bind_button(INPUT_SOURCE.KEYBOARD, ord("D")));

#endregion

#region Demo

    self.level = noone;

#endregion

#region Setting

    self.settings_path = "user_settings.json";
    self.settings_default = {
        language: "ko-KR",
        mouse_sens: 0.5,
        raw_input: false,
        ui_scale: 1.0,
        show_fps: false,
        vol_master: 1.0,
        fullscreen: false,
        fps_limit: 60,
        resolution_w: 0,
        resolution_h: 0,
    };

    self.settings = {};
    struct_merge(self.settings_default, self.settings);

    self.settings_is_modified = function(_key) {
        return (self.settings[$ _key] ?? self.settings_default[$ _key]) != self.settings_default[$ _key];
    }

    self.settings_export = function() {
        return struct_export(self.settings, self.settings_path);
    }

    self.settings_import = function() {
        var _loaded = struct_import(self.settings_path);
        if (is_struct(_loaded)) struct_merge(_loaded, self.settings);
        self.show_fps = self.settings[$ "show_fps"] ?? self.show_fps;
        return self;
    }

    self.settings_reset = function() {
        self.settings = {};
        struct_merge(self.settings_default, self.settings);
        self.show_fps = self.settings[$ "show_fps"] ?? false;
        return self;
    }

    self.settings_import();

#endregion

#region Screenshot

    self.screenshot_counter = 0;

#endregion

#region Entity

    self.entities = {};
    self.entities[$ "slime"] = { hit: 100 };

#endregion

room_goto_next();
