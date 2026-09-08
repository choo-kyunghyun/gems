/** @enum {number} How an InputAxis reads its analog value. */
globalThis.INPUT_AXIS_MODE = Object.freeze({
  STICK: 0, // gamepad_axis_value
  TRIGGER: 1, // gamepad_button_value
});

/**
 * One analog binding of an InputAction (gamepad stick axis or trigger). value() returns the RAW
 * axis — a caller thresholds it itself (PlayerSystem's STICK_DEADZONE) — through the Input pad
 * queries, so it reads 0 while menu navigation holds the pad (the distribution contract — Input).
 */
globalThis.InputAxis = class InputAxis {
  constructor(mode, axis, device = 0) {
    this.mode = mode;
    this.axis = axis;
    this.device = device;
  }

  value() {
    switch (this.mode) {
      case INPUT_AXIS_MODE.STICK:
        return Input.padAxis(this.axis, this.device);
      case INPUT_AXIS_MODE.TRIGGER:
        return Input.padValue(this.axis, this.device);
      default:
        return 0;
    }
  }
};
