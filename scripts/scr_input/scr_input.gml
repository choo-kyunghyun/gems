new Input();

function Input() constructor {
    static sensitivity = 2.5;
    // static deadzone = 0;
    static actions = {};
    
    static cleanup = function() {
        Input.actions = {};
    }
    
    static import = function(_data) {
        Input.cleanup();
        Input.sensitivity = _data.sensitivity;
        // Input.deadzone = _data.deadzone;
        var _names = struct_get_names(_data.actions);
        for (var _i = 0; _i < array_length(_names); _i++) {
            var _name = _names[_i];
            Input.actions[$ _name] = InputAction.import(_data.actions[$ _name]);
        }
        return true;
    }
    
    static export = function() {
        var _actions = {};
        var _names = struct_get_names(Input.actions);
        for (var _i = 0; _i < array_length(_names); _i++) {
            var _name = _names[_i];
            _actions[$ _name] = Input.actions[_name].export();
        }
        
        return {
            sensitivity: Input.sensitivity,
            // deadzone: Input.deadzone,
            actions: _actions,
        };
    }
    
    static get = function(_name) {
        return Input.actions[$ _name];
    }
    
    static register = function(_name, _action) {
        Input.actions[$ _name] = _action;
        return Input;
    }
    
    static unregister = function(_name) {
        struct_remove(Input.actions, _name);
    }
}
