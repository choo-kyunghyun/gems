globalThis.INPUT_SOURCE = Object.freeze({
  KEYBOARD: 0,
  MOUSE: 1,
  GAMEPAD: 2,
});

globalThis.InputButton = class InputButton {
  constructor(source, button, device = 0) {
    this.source = source;
    this.button = button;
    this.device = device;
  }

  static import = function (data) {
    return new InputButton(data.source, data.button, data.device);
  };

  export() {
    return {
      source: this.source,
      button: this.button,
      device: this.device,
    };
  }

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
