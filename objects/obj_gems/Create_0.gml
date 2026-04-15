// Inherit the parent event
event_inherited();

#region Release

    #macro RELEASE_MODE false

    gml_release_mode(RELEASE_MODE);
    audio_throw_on_error(!RELEASE_MODE);
    // show_debug_overlay(!RELEASE_MODE);

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

    i18n.load("i18n/ko-KR/manifest.json");
    draw_set_font(i18n.get_font("regular"));
    // TODO: Settings, copyright, and time should be global overlay interface
    self.overlay = new UIElement();
    display_set_gui_maximise();

#endregion

#region Input

    enum INPUT_ACTIONS {
        UP,
        DOWN,
        LEFT,
        RIGHT,
    }
    
    Input.register(INPUT_ACTIONS.UP, new InputAction().bind(INPUT_TYPE.KEYBOARD, ord("W")));
    Input.register(INPUT_ACTIONS.DOWN, new InputAction().bind(INPUT_TYPE.KEYBOARD, ord("S")));
    Input.register(INPUT_ACTIONS.LEFT, new InputAction().bind(INPUT_TYPE.KEYBOARD, ord("A")));
    Input.register(INPUT_ACTIONS.RIGHT, new InputAction().bind(INPUT_TYPE.KEYBOARD, ord("D")));

#endregion

#region Demo

    self.level = noone;

#endregion

#region Setting

    

#endregion

#region Entity

    self.entities = {};
    self.entities[$ "slime"] = { hit: 100 };

#endregion

room_goto_next(); // rm_lobby
