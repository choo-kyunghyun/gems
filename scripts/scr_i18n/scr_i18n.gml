new i18n();

function i18n() constructor {
    static text = {};
    static fonts = {};
    static images = {};
    static sounds = {};
    
    static load = function(_fname) {
        i18n.cleanup();
        var _path = filename_path(_fname);
        var _manifest = struct_import(_fname);
        
        if (is_array(_manifest[$ "text"])) {
            for (var _i = 0; _i < array_length(_manifest.text); _i++) {
                var _mask = _manifest.text[_i];
                var _text_path = filename_path(_path + _mask);
                var _files = file_find(_path + _mask);
                for (var _j = 0; _j < array_length(_files); _j++) {
                    var _text_fname = _text_path + _files[_j];
                    var _struct = struct_import(_text_fname);
                    struct_foreach(_struct, function(_name, _value) {
                        i18n.text[$ _name] = _value;
                    });
                }
            }
        }
        
        if (is_struct(_manifest[$ "fonts"])) {
            var _names = struct_get_names(_manifest.fonts);
            for (var _i = 0; _i < array_length(_names); _i++) {
                var _name = _names[_i];
                var _data = _manifest.fonts[$ _name];
                
                var _font_fname = _path + _data[$ "path"];
                var _size = _data[$ "size"] ?? 16;
                var _bold = _data[$ "bold"] ?? false;
                var _italic = _data[$ "italic"] ?? false;
                var _first = _data[$ "first"] ?? 32;
                var _last = _data[$ "last"] ?? 128;
                
                var _font = font_add(_font_fname, _size, _bold, _italic, _first, _last);
                i18n.fonts[$ _name] = _font;
                
                if (_data[$ "sdf"]) {
                    font_enable_sdf(_font, _data.sdf);
                    font_sdf_spread(_font, _data[$ "sdf_spread"] ?? 8);
                    if (_data[$ "effects"]) font_enable_effects(_font, true, _data.effects);
                }
            }
        }
        
        if (is_struct(_manifest[$ "images"])) {
            var _names = struct_get_names(_manifest.images);
            for (var _i = 0; _i < array_length(_names); _i++) {
                var _name = _names[_i];
                var _data = _manifest.images[$ _name];
                
                var _image_fname = _path + _data[$ "path"];
                var _imgnum = _data[$ "imgnum"] ?? 1;
                var _xorig = _data[$ "xorig"] ?? 0;
                var _yorig = _data[$ "yorig"] ?? 0;
                
                var _sprite = sprite_add(_image_fname, _imgnum, false, false, _xorig, _yorig);
                i18n.images[$ _name] = _sprite;
            }
        }
        
        if (is_struct(_manifest[$ "sounds"])) {
            var _names = struct_get_names(_manifest.sounds);
            for (var _i = 0; _i < array_length(_names); _i++) {
                var _name = _names[_i];
                var _data = _manifest.sounds[$ _name];
                
                var _stream = audio_create_stream(_path + _data[$ "path"]);
                i18n.sounds[$ _name] = _stream;
                
                audio_sound_gain(_stream, _data[$ "gain"] ?? 1);
                audio_sound_pitch(_stream, _data[$ "pitch"] ?? 1);
            }
        }
    }
    
    static cleanup = function() {
        i18n.text = {};
        
        struct_foreach(i18n.fonts, function(_name, _value) {
            font_delete(_value);
        });
        i18n.fonts = {};
        
        struct_foreach(i18n.images, function(_name, _value) {
            sprite_delete(_value);
        });
        i18n.images = {};
        
        struct_foreach(i18n.sounds, function(_name, _value) {
            audio_destroy_stream(_value);
        });
        i18n.sounds = {};
    }
    
    static get_text = function(_key) {
        return i18n.text[$ _key] ?? _key;
    }
    
    static get_text_ext = function(_key, _params = []) {
        return string_ext(i18n.get_text(_key), _params);
    }
    
    // TODO: Consider TextRef constructor for changeable params and freeze() method
    static get_text_ref = function(_key, _params = []) {
        var _resolve = is_callable(_params)
        ? method({ params: _params }, function() { return self.params(); })
        : method({ params: is_array(_params) ? _params : [ _params ] }, function() { return self.params; });

        return method({ key: _key, resolve: _resolve }, function() {
            return i18n.get_text_ext(self.key, self.resolve());
        });
    }
    
    static get_font = function(_key) {
        return i18n.fonts[$ _key] ?? draw_get_font();
    }
    
    static get_image = function(_key) {
        return i18n.images[$ _key] ?? -1;
    }
    
    static get_sound = function(_key) {
        return i18n.sounds[$ _key] ?? -1;
    }
}
