// TODO: InputBinding -> InputButton and InputAxis

enum INPUT_TYPE {
    KEYBOARD,
    MOUSE,
    GAMEPAD,
}

function InputBinding(_type, _button, _device) constructor {
    self.type = _type;
    self.button = _button;
    self.device = _device ?? 0;
    
    static import = function(_data) {
        return new InputBinding(_data.type, _data.button, _data.device);
    }
    
    static export = function() {
        return {
            type: self.type,
            button: self.button,
            device: self.device,
        };
    }
    
    static down = function() {
        switch (self.type) {
            case INPUT_TYPE.KEYBOARD:
                return keyboard_check(self.button);
            case INPUT_TYPE.MOUSE:
                return mouse_check_button(self.button);
            case INPUT_TYPE.GAMEPAD:
                return gamepad_button_check(self.device, self.button);
            default:
                return false;
        }
    }
    
    static pressed = function() {
        switch (self.type) {
            case INPUT_TYPE.KEYBOARD:
                return keyboard_check_pressed(self.button);
            case INPUT_TYPE.MOUSE:
                return mouse_check_button_pressed(self.button);
            case INPUT_TYPE.GAMEPAD:
                return gamepad_button_check_pressed(self.device, self.button);
            default:
                return false;
        }
    }
    
    static released = function() {
        switch (self.type) {
            case INPUT_TYPE.KEYBOARD:
                return keyboard_check_released(self.button);
            case INPUT_TYPE.MOUSE:
                return mouse_check_button_released(self.button);
            case INPUT_TYPE.GAMEPAD:
                return gamepad_button_check_released(self.device, self.button);
            default:
                return false;
        }
    }
}
