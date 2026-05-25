globalThis.INPUT_AXIS_MODE = Object.freeze({
  STICK: 0,
  TRIGGER: 1,
});

globalThis.InputAxis = class InputAxis {
  constructor(mode, axis, device = 0) {
    this.mode = mode;
    this.axis = axis;
    this.device = device;
  }

  static import(data) {
    return new InputAxis(data.mode, data.axis, data.device);
  }

  export() {
    return {
      mode: this.mode,
      axis: this.axis,
      device: this.device,
    };
  }

  value() {
    switch (this.mode) {
      case INPUT_AXIS_MODE.STICK:
        return gamepad_axis_value(this.device, this.axis);
      case INPUT_AXIS_MODE.TRIGGER:
        return gamepad_button_value(this.device, this.axis);
      default:
        return 0;
    }
  }
};
