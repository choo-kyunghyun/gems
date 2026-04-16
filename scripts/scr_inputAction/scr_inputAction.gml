function InputAction() constructor {
    self.buttons = [];
    self.axes = [];
    
    static import = function(_data) {
        var _action = new InputAction();
        var _buttons = _data[$ "buttons"] ?? [];
        var _axes = _data[$ "axes"] ?? [];
        for (var _i = 0; _i < array_length(_buttons); _i++) {
            array_push(_action.buttons, InputButton.import(_buttons[_i]));
        }
        for (var _i = 0; _i < array_length(_axes); _i++) {
            array_push(_action.axes, InputAxis.import(_axes[_i]));
        }
        return _action;
    }
    
    static export = function() {
        return {
            buttons: array_map(self.buttons, function(_b) { return _b.export(); }),
            axes: array_map(self.axes, function(_a) { return _a.export(); }),
        };
    }
    
    static bind_button = function(_source, _button, _device = 0) {
        array_push(self.buttons, new InputButton(_source, _button, _device));
        return self;
    }
    
    static bind_axis = function(_mode, _axis, _device = 0) {
        array_push(self.axes, new InputAxis(_mode, _axis, _device));
        return self;
    }
    
    static unbind_button = function(_button) {
        var _index = array_get_index(self.buttons, _button);
        if (_index == -1) return false;
        array_delete(self.buttons, _index, 1);
        return true;
    }
    
    static unbind_axis = function(_axis) {
        var _index = array_get_index(self.axes, _axis);
        if (_index == -1) return false;
        array_delete(self.axes, _index, 1);
        return true;
    }
    
    static down = function() {
        return array_any(self.buttons, function(_b) { return _b.down(); });
    }
    
    static pressed = function() {
        return array_any(self.buttons, function(_b) { return _b.pressed(); });
    }
    
    static released = function() {
        return array_any(self.buttons, function(_b) { return _b.released(); });
    }
    
    static value = function() {
        var _val = 0;
        for (var _i = 0; _i < array_length(self.axes); _i++) {
            var _v = self.axes[_i].value();
            if (abs(_v) > abs(_val)) _val = _v;
        }
        return _val;
    }
}
