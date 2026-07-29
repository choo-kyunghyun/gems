/** @enum {number} How an InputAxis reads its analog value. */
globalThis.INPUT_AXIS_MODE = Object.freeze({
  STICK: 0, // gamepad_axis_value
  TRIGGER: 1, // gamepad_button_value
});

/**
 * One analog binding of an InputAction (gamepad stick axis or trigger). value() returns the RAW
 * axis — a caller thresholds it itself (PlayerSystem's RPG_STICK_DEADZONE).
 */
globalThis.InputAxis = class InputAxis {
  /**
   * @param {number} mode
   * @param {number} axis
   * @param {number} [device=0]
   */
  constructor(mode, axis, device = 0) {
    this.mode = mode;
    this.axis = axis;
    this.device = device;
  }

  /**
   * @param {Object} data
   * @returns {InputAxis}
   */
  static import(data) {
    return new InputAxis(data.mode, data.axis, data.device);
  }

  /**
   * @returns {{mode: number, axis: number, device: number}}
   */
  export() {
    return {
      mode: this.mode,
      axis: this.axis,
      device: this.device,
    };
  }

  /**
   * @returns {number}
   */
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
