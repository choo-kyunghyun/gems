enum INPUT_SOURCE {
    KEYBOARD,
    MOUSE,
    GAMEPAD,
}

function InputButton(_source, _button, _device = 0) constructor {
    self.source = _source;
    self.button = _button;
    self.device = _device;
    
    static import = function(_data) {
        return new InputButton(_data.source, _data.button, _data.device);
    }
    
    static export = function() {
        return {
            source: self.source,
            button: self.button,
            device: self.device,
        };
    }
    
    static down = function() {
        switch (self.source) {
            case INPUT_SOURCE.KEYBOARD:
                return keyboard_check(self.button);
            case INPUT_SOURCE.MOUSE:
                return mouse_check_button(self.button);
            case INPUT_SOURCE.GAMEPAD:
                return gamepad_button_check(self.device, self.button);
            default:
                return false;
        }
    }
    
    static pressed = function() {
        switch (self.source) {
            case INPUT_SOURCE.KEYBOARD:
                return keyboard_check_pressed(self.button);
            case INPUT_SOURCE.MOUSE:
                return mouse_check_button_pressed(self.button);
            case INPUT_SOURCE.GAMEPAD:
                return gamepad_button_check_pressed(self.device, self.button);
            default:
                return false;
        }
    }
    
    static released = function() {
        switch (self.source) {
            case INPUT_SOURCE.KEYBOARD:
                return keyboard_check_released(self.button);
            case INPUT_SOURCE.MOUSE:
                return mouse_check_button_released(self.button);
            case INPUT_SOURCE.GAMEPAD:
                return gamepad_button_check_released(self.device, self.button);
            default:
                return false;
        }
    }
}
