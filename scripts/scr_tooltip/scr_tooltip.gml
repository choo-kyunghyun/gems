new Tooltip();

function Tooltip() constructor {
    static text = {
        str: "",
        col: c_white,
        alpha: 1,
        sep: 12,
        w: 640,
        font: -1,
    };
    
    static panel = {
        col: #09090b,
        alpha: 1,
    };
    
    static padding = {
        x: 12,
        y: 8,
    };
    
    static offset = {
        x: 36,
        y: 36,
    };
    
    static set = function(_str) {
        self.text.str = _str;
    }
    
    static draw = function() {
        if (self.text.str == "") return;
        
        var _font = draw_get_font();
        var _colour = draw_get_colour();
        var _alpha = draw_get_alpha();
        var _halign = draw_get_halign();
        var _valign = draw_get_valign();
        
        if (self.text.font != -1) draw_set_font(self.text.font);
        
        var _x = device_mouse_x_to_gui(0) + self.offset.x;
        var _y = device_mouse_y_to_gui(0) + self.offset.y;
        var _width = string_width_ext(self.text.str, self.text.sep, self.text.w) + self.padding.x * 2;
        var _height = string_height_ext(self.text.str, self.text.sep, self.text.w) + self.padding.y * 2;
        
        var _offscreen_x = display_get_gui_width() - (_x + _width);
        var _offscreen_y = display_get_gui_height() - (_y + _height);
        if (_offscreen_x < 0) _x += _offscreen_x;
        if (_offscreen_y < 0) _y += _offscreen_y;
        
        draw_set_alpha(self.panel.alpha);
        draw_roundrect_colour(_x, _y, _x + _width, _y + _height, self.panel.col, self.panel.col, false);
        
        draw_set_halign(fa_left);
        draw_set_valign(fa_top);
        draw_text_ext_colour(_x + self.padding.x, _y + self.padding.y, self.text.str, self.text.sep, self.text.w, self.text.col, self.text.col, self.text.col, self.text.col, self.text.alpha);
        
        self.text.str = "";
        
        draw_set_font(_font);
        draw_set_colour(_colour);
        draw_set_alpha(_alpha);
        draw_set_halign(_halign);
        draw_set_valign(_valign);
    }
}
