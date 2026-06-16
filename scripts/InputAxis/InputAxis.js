/** @enum {number} How an InputAxis reads its analog value. */
globalThis.INPUT_AXIS_MODE = Object.freeze({
  STICK: 0, // gamepad_axis_value
  TRIGGER: 1, // gamepad_button_value
});

// Analog binding. Consumed once gamepad axes are wired through the future InputPreset
// module + obj_game; today no action binds an axis, so value() is unexercised (see Input).
globalThis.InputAxis = class InputAxis {
  /**
   * @param {number} mode - An INPUT_AXIS_MODE value.
   * @param {number} axis - The axis/button constant to read.
   * @param {number} [device=0] - Gamepad device index.
   */
  constructor(mode, axis, device = 0) {
    this.mode = mode;
    this.axis = axis;
    this.device = device;
  }

  /** @param {{mode:number,axis:number,device:number}} data @returns {InputAxis} */
  static import(data) {
    return new InputAxis(data.mode, data.axis, data.device);
  }

  /** @returns {{mode:number,axis:number,device:number}} Serializable binding. */
  export() {
    return {
      mode: this.mode,
      axis: this.axis,
      device: this.device,
    };
  }

  /** @returns {number} Current analog value in [-1, 1] (0 for an unknown mode). */
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
