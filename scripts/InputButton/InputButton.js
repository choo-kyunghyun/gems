globalThis.INPUT_SOURCE = Object.freeze({
  KEYBOARD: 0,
  MOUSE: 1,
  GAMEPAD: 2,
});

/** One physical button binding: a keyboard key, mouse button, or gamepad button. */
globalThis.InputButton = class InputButton {
  /**
   * @param {number} source - An INPUT_SOURCE value.
   * @param {number} button - The key/button constant for that source.
   * @param {number} [device=0] - Gamepad device index (gamepad source only).
   */
  constructor(source, button, device = 0) {
    this.source = source;
    this.button = button;
    this.device = device;
  }

  /** @param {{source:number,button:number,device:number}} data @returns {InputButton} */
  static import(data) {
    return new InputButton(data.source, data.button, data.device);
  }

  /** @returns {{source:number,button:number,device:number}} Serializable binding. */
  export() {
    return {
      source: this.source,
      button: this.button,
      device: this.device,
    };
  }

  /** @returns {boolean} Held this frame. */
  down() {
    switch (this.source) {
      case INPUT_SOURCE.KEYBOARD:
        return keyboard_check(this.button);
      case INPUT_SOURCE.MOUSE:
        return mouse_check_button(this.button);
      case INPUT_SOURCE.GAMEPAD:
        return gamepad_button_check(this.device, this.button);
      default:
        return false;
    }
  }

  /** @returns {boolean} Pressed edge this frame. */
  pressed() {
    switch (this.source) {
      case INPUT_SOURCE.KEYBOARD:
        return keyboard_check_pressed(this.button);
      case INPUT_SOURCE.MOUSE:
        return mouse_check_button_pressed(this.button);
      case INPUT_SOURCE.GAMEPAD:
        return gamepad_button_check_pressed(this.device, this.button);
      default:
        return false;
    }
  }

  /** @returns {boolean} Released edge this frame. */
  released() {
    switch (this.source) {
      case INPUT_SOURCE.KEYBOARD:
        return keyboard_check_released(this.button);
      case INPUT_SOURCE.MOUSE:
        return mouse_check_button_released(this.button);
      case INPUT_SOURCE.GAMEPAD:
        return gamepad_button_check_released(this.device, this.button);
      default:
        return false;
    }
  }
};
