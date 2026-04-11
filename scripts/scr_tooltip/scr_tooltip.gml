new Tooltip();

function Tooltip() constructor {
    static text = "";
    static text_colour = #ffffff;
    static text_alpha = 1;
    static sep = -1;
    static w = 640;
    static font = -1;
    static panel_colour = #121212;
    static panel_alpha = 1;
    static padding_x = 12;
    static padding_y = 8;
    static offset_x = 36;
    static offset_y = 36;
    
    static set = function(_str) {
        Tooltip.text = _str;
    }
    
    static draw = function() {
        if (Tooltip.text == "") return;
        
        var _font = draw_get_font();
        var _colour = draw_get_colour();
        var _alpha = draw_get_alpha();
        var _halign = draw_get_halign();
        var _valign = draw_get_valign();
        
        if (Tooltip.font != -1) draw_set_font(Tooltip.font);
        
        var _x = device_mouse_x_to_gui(0) + Tooltip.offset_x;
        var _y = device_mouse_y_to_gui(0) + Tooltip.offset_y;
        var _width = string_width_ext(Tooltip.text, Tooltip.sep, Tooltip.w) + Tooltip.padding_x * 2;
        var _height = string_height_ext(Tooltip.text, Tooltip.sep, Tooltip.w) + Tooltip.padding_y * 2;
        
        var _offscreen_x = display_get_gui_width() - (_x + _width);
        var _offscreen_y = display_get_gui_height() - (_y + _height);
        if (_offscreen_x < 0) _x += _offscreen_x;
        if (_offscreen_y < 0) _y += _offscreen_y;
        
        draw_set_alpha(Tooltip.panel_alpha);
        draw_roundrect_colour(_x, _y, _x + _width, _y + _height, Tooltip.panel_colour, Tooltip.panel_colour, false);
        
        draw_set_halign(fa_left);
        draw_set_valign(fa_top);
        draw_text_ext_colour(_x + Tooltip.padding_x, _y + Tooltip.padding_y, Tooltip.text, Tooltip.sep, Tooltip.w, Tooltip.text_colour, Tooltip.text_colour, Tooltip.text_colour, Tooltip.text_colour, Tooltip.text_alpha);
        
        Tooltip.text = "";
        
        if (Tooltip.font != -1) draw_set_font(_font);
        draw_set_colour(_colour);
        draw_set_alpha(_alpha);
        draw_set_halign(_halign);
        draw_set_valign(_valign);
    }
}
