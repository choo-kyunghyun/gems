enum INPUT_AXIS_MODE {
    STICK,
    TRIGGER,
}

function InputAxis(_mode, _axis, _device = 0) constructor {
    self.mode = _mode;
    self.axis = _axis;
    self.device = _device;
    
    static import = function(_data) {
        return new InputAxis(_data.mode, _data.axis, _data.device);
    }
    
    static export = function() {
        return {
            mode: self.mode,
            axis: self.axis,
            device: self.device,
        };
    }
    
    static value = function() {
        switch (self.mode) {
            case INPUT_AXIS_MODE.STICK:
                return gamepad_axis_value(self.device, self.axis);
            case INPUT_AXIS_MODE.TRIGGER:
                return gamepad_button_value(self.device, self.axis);
            default:
                return 0;
        }
    }
}
