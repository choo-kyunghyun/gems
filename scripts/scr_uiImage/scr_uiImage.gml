enum OBJECT_FIT {
    FILL,
    CONTAIN,
    COVER,
    NONE,
    SCALE_DOWN,
}

function UIImage(_style = {}, _image = {}) : UIElement(_style) constructor {
    self.sprite = _image[$ "sprite"];
    self.subimg = _image[$ "subimg"] ?? 0;
    self.xscale = _image[$ "xscale"] ?? 1;
    self.yscale = _image[$ "yscale"] ?? 1;
    self.rot = _image[$ "rot"] ?? 0;
    self.colour = _image[$ "colour"] ?? _image[$ "color"] ?? c_white;
    self.alpha = _image[$ "alpha"] ?? 1;
    self.speed = _image[$ "speed"] ?? (sprite_exists(self.sprite) ? sprite_get_speed(self.sprite) : 0);
    self.fit = _image[$ "fit"] ?? OBJECT_FIT.FILL;
    
    static on_update = function() {
        if (!sprite_exists(self.sprite)) return;
        if (self.speed != 0) {
            self.subimg += Time.raw * self.speed;
            self.subimg %= sprite_get_number(self.sprite);
        }
    }
    
    static on_draw = function() {
        if (!sprite_exists(self.sprite)) return;
        var _pos = flexpanel_node_layout_get_position(self.flexpanel, false);
        var _x = _pos.left;
        var _y = _pos.top;
        var _w = _pos.width;
        var _h = _pos.height;
        var _width = sprite_get_width(self.sprite);
        var _height = sprite_get_height(self.sprite);
        
        switch (self.fit) {
            case OBJECT_FIT.FILL:
                draw_sprite_stretched_ext(self.sprite, self.subimg, _x, _y, _w, _h, self.colour, self.alpha);
                break;
            case OBJECT_FIT.CONTAIN:
            case OBJECT_FIT.SCALE_DOWN:
                var _scale = min(_w / _width, _h / _height);
                if (self.fit == OBJECT_FIT.SCALE_DOWN) _scale = min(_scale, self.xscale);
                _w = _width * _scale;
                _h = _height * _scale;
                _x += (_pos.width - _w) / 2;
                _y += (_pos.height - _h) / 2;
                draw_sprite_stretched_ext(self.sprite, self.subimg, _x, _y, _w, _h, self.colour, self.alpha);
                break;
            case OBJECT_FIT.COVER:
                var _scale = max(_w / _width, _h / _height);
                var _part_w = _w / _scale;
                var _part_h = _h / _scale;
                var _part_x = (_width - _part_w) / 2;
                var _part_y = (_height - _part_h) / 2;
                draw_sprite_general(self.sprite, self.subimg, _part_x, _part_y, _part_w, _part_h, _x, _y, _scale, _scale, self.rot, self.colour, self.colour, self.colour, self.colour, self.alpha);
                break;
            case OBJECT_FIT.NONE:
                _x += (_w - sprite_get_width(self.sprite) * self.xscale) / 2;
                _y += (_h - sprite_get_height(self.sprite) * self.yscale) / 2;
                draw_sprite_ext(self.sprite, self.subimg, _x, _y, self.xscale, self.yscale, self.rot, self.colour, self.alpha);
                break;
        }
    }
}
