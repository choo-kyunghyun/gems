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

  // Human-readable label for this binding (e.g. "W", "Shift", "LMB", "Pad 32"). The single
  // source of truth for turning a binding into UI text — used by both the rebind row (UIRebind)
  // and the live key-hint bar (gemsKeyHints), so a remap shows the same string everywhere.
  /** @returns {string} */
  label() {
    switch (this.source) {
      case INPUT_SOURCE.KEYBOARD:
        return InputButton.keyName(this.button);
      case INPUT_SOURCE.MOUSE:
        if (this.button === mb_left) return "LMB";
        if (this.button === mb_right) return "RMB";
        if (this.button === mb_middle) return "MMB";
        return "Mouse " + this.button;
      case INPUT_SOURCE.GAMEPAD:
        return "Pad " + this.button;
      default:
        return "—";
    }
  }

  // Keyboard keycode → display string. The named keys, then F1–F12, then letters/digits map
  // straight to their character; anything else falls back to the raw code.
  /** @param {number} code @returns {string} */
  static keyName(code) {
    if (code === 0) return "—";
    if (code === vk_space) return "Space";
    if (code === vk_enter) return "Enter";
    if (code === vk_escape) return "Esc";
    if (code === vk_shift) return "Shift";
    if (code === vk_control) return "Ctrl";
    if (code === vk_alt) return "Alt";
    if (code === vk_tab) return "Tab";
    if (code === vk_backspace) return "Bksp";
    if (code === vk_left) return "Left";
    if (code === vk_right) return "Right";
    if (code === vk_up) return "Up";
    if (code === vk_down) return "Down";
    if (code >= vk_f1 && code <= vk_f12) return "F" + (code - vk_f1 + 1);
    if ((code >= 48 && code <= 57) || (code >= 65 && code <= 90))
      return chr(code);
    return string(code);
  }
};
