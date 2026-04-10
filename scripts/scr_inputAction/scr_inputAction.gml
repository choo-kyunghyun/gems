function InputAction() constructor {
    self.bindings = [];
    
    static import = function(_data) {
        var _action = new InputAction();
        var _names = struct_get_names(_data);
        for (var _i = 0; _i < array_length(_names); _i++) {
            var _binding = InputBinding.import(_data[$ _names[_i]]);
            array_push(_action.bindings, _binding);
        }
        return _action;
    }
    
    static export = function() {
        var _bindings = array_map(self.bindings, function(_binding) {
            return _binding.export();
        });
        return { bindings: _bindings };
    }
    
    static bind = function(_type, _button, _device = 0) {
        array_push(self.bindings, new InputBinding(_type, _button, _device));
        return self;
    }
    
    static get_bind = function(_type, _button, _device = 0) {
        var _binds = [];
        for (var _i = 0; _i < array_length(self.bindings); _i++) {
            var _binding = self.bindings[_i];
            if (_binding.type == _type && _binding.button == _button && _binding.device == _device) {
                array_push(_binds, _binding);
            }
        }
        return _binds;
    }
    
    static unbind = function(_binding) {
        var _index = array_get_index(self.bindings, _binding);
        if (_index == -1) return false;
        array_delete(self.bindings, _index, 1);
        return true;
    }
    
    static down = function() {
        return array_any(self.bindings, function(_binding) {
            return _binding.down();
        });
    }
    
    static pressed = function() {
        return array_any(self.bindings, function(_binding) {
            return _binding.pressed();
        });
    }
    
    static released = function() {
        return array_any(self.bindings, function(_binding) {
            return _binding.released();
        });
    }
}
