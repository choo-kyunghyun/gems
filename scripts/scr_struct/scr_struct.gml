function struct_overwrite(_src, _dest) {
    var _names = struct_get_names(_src);
    for (var _i = 0; _i < array_length(_names); _i++) {
        var _name = _names[_i];
        var _val = _src[$ _name];
        if (is_struct(_val)) {
            var _dest_sub = _dest[$ _name];
            if (!is_struct(_dest_sub)) {
                _dest_sub = {};
                _dest[$ _name] = _dest_sub;
            }
            struct_overwrite(_val, _dest_sub);
        } else {
            _dest[$ _name] = variable_clone(_val);
        }
    }
}

function struct_import(_fname) {
    var _buffer = buffer_load(_fname);
    if (_buffer == -1) return undefined;
    var _json = buffer_read(_buffer, buffer_text);
    buffer_delete(_buffer);
    return json_parse(_json);
}

function struct_export(_struct, _fname) {
    var _buffer = buffer_create(0, buffer_grow, 1);
    var _data = json_stringify(_struct);
    if (buffer_write(_buffer, buffer_text, _data) != 0) {
        buffer_delete(_buffer);
        return false;
    }
    buffer_save(_buffer, _fname);
    buffer_delete(_buffer);
    return true;
}
