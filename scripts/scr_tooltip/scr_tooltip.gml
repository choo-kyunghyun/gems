new Tooltip();

function Tooltip() constructor {
    static text = "";
    static text_color = #ffffff;
    static text_alpha = 1;
    static sep = -1;
    static w = 640;
    static font = -1;
    static panel_color = #121212;
    static panel_alpha = 1;
    static panel_rad = 8;
    static padding_x = 12;
    static padding_y = 8;
    static offset_x = 36;
    static offset_y = 36;
    
    static set = function(_str) {
        Tooltip.text = _str;
    }

    static clear = function() {
        Tooltip.text = "";
    }
    
    static draw = function() {
        if (Tooltip.text == "") return;
        
        var _font = draw_get_font();
        var _alpha = draw_get_alpha();
        var _halign = draw_get_halign();
        var _valign = draw_get_valign();
        
        if (Tooltip.font != -1) draw_set_font(Tooltip.font);
        
        var _x = device_mouse_x_to_gui(0) + Tooltip.offset_x;
        var _y = device_mouse_y_to_gui(0) + Tooltip.offset_y;
        var _width = string_width_ext(Tooltip.text, Tooltip.sep, Tooltip.w) + Tooltip.padding_x * 2;
        var _height = string_height_ext(Tooltip.text, Tooltip.sep, Tooltip.w) + Tooltip.padding_y * 2;
        _x = clamp(_x, 0, display_get_gui_width() - _width);
        _y = clamp(_y, 0, display_get_gui_height() - _height);
        
        draw_set_alpha(Tooltip.panel_alpha);
        draw_roundrect_color_ext(_x, _y, _x + _width, _y + _height, Tooltip.panel_rad, Tooltip.panel_rad, Tooltip.panel_color, Tooltip.panel_color, false);
        
        draw_set_halign(fa_left);
        draw_set_valign(fa_top);
        draw_set_alpha(Tooltip.text_alpha);
        draw_text_ext_color(_x + Tooltip.padding_x, _y + Tooltip.padding_y, Tooltip.text, Tooltip.sep, Tooltip.w, Tooltip.text_color, Tooltip.text_color, Tooltip.text_color, Tooltip.text_color, Tooltip.text_alpha);
        
        Tooltip.clear();
        
        if (Tooltip.font != -1) draw_set_font(_font);
        draw_set_alpha(_alpha);
        draw_set_halign(_halign);
        draw_set_valign(_valign);
    }
}
