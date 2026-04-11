function UIText(_style = {}, _text = {}) : UIElement(_style) constructor {
    self.text_ref = _text[$ "text_ref"] ?? function() { return ""; };
    self.halign = _text[$ "halign"] ?? fa_left;
    // self.valign = _text[$ "valign"] ?? fa_top;
    self.xscale = _text[$ "xscale"] ?? 1;
    self.yscale = _text[$ "yscale"] ?? 1;
    self.angle = _text[$ "angle"] ?? 0;
    self.colour = _text[$ "colour"] ?? _text[$ "color"] ?? c_white;
    self.alpha = _text[$ "alpha"] ?? 1;
    self.sep = _text[$ "sep"] ?? -1;
    self.w = _text[$ "w"] ?? 0;
    self.font = _text[$ "font"] ?? -1;
    self.cache = "";
    
    static on_update = function() {
        var _str = self.text_ref();
        if (self.cache != _str) {
            self.cache = _str;
            
            var _font = draw_get_font();
            if (self.font != -1) draw_set_font(self.font);
            
            var _width = 0;
            var _height = 0;
            
            if (self.w > 0) {
                _width = string_width_ext(self.cache, self.sep, self.w);
                _height = string_height_ext(self.cache, self.sep, self.w);
            } else {
                _width = string_width(self.cache);
                _height = string_height(self.cache);
            }
            
            if (self.get_width().value != _width || self.get_height().value != _height) {
                self.set_width(_width, flexpanel_unit.point);
                self.set_height(_height, flexpanel_unit.point);
            }
            
            if (self.font != -1) draw_set_font(_font);
        }
    }
    
    static on_draw = function() {
        var _pos = flexpanel_node_layout_get_position(self.flexpanel, false);
        var _x = _pos.left;
        var _y = _pos.top;
        
        var _font = draw_get_font();
        if (self.font != -1) draw_set_font(self.font);

        var _halign = draw_get_halign();
        // var _valign = draw_get_valign();
        
        if (self.w > 0) {
            draw_set_halign(self.halign);
            if (self.halign == fa_center) _x += _pos.width / 2;
            else if (self.halign == fa_right) _x += _pos.width;
        }
        
        // draw_set_valign(self.valign);
        // if (self.valign == fa_middle) _y += _pos.height / 2;
        // else if (self.valign == fa_bottom) _y += _pos.height;
        
        if (self.w > 0) {
            draw_text_ext_transformed_colour(_x, _y, self.cache, self.sep, self.w, self.xscale, self.yscale, self.angle, self.colour, self.colour, self.colour, self.colour, self.alpha);
        } else {
            draw_text_transformed_colour(_x, _y, self.cache, self.xscale, self.yscale, self.angle, self.colour, self.colour, self.colour, self.colour, self.alpha);
        }

        draw_set_halign(_halign);
        // draw_set_valign(_valign);
        
        if (self.font != -1) draw_set_font(_font);
    }
}
