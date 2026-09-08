globalThis.INPUT_SOURCE = Object.freeze({
  KEYBOARD: 0,
  MOUSE: 1,
  GAMEPAD: 2,
});

/**
 * One physical button binding: a keyboard key, mouse button, or gamepad button. Reads through
 * the Input queries, never a device built-in, so a binding sees exactly what the frame's
 * claims leave it (the distribution contract — Input).
 */
globalThis.InputButton = class InputButton {
  constructor(source, button, device = 0) {
    this.source = source;
    this.button = button;
    this.device = device;
  }

  down() {
    switch (this.source) {
      case INPUT_SOURCE.KEYBOARD:
        return Input.keyDown(this.button);
      case INPUT_SOURCE.MOUSE:
        return Input.pointerDown(this.button);
      case INPUT_SOURCE.GAMEPAD:
        return Input.padDown(this.button, this.device);
      default:
        return false;
    }
  }

  pressed() {
    switch (this.source) {
      case INPUT_SOURCE.KEYBOARD:
        return Input.keyPressed(this.button);
      case INPUT_SOURCE.MOUSE:
        return Input.pointerPressed(this.button);
      case INPUT_SOURCE.GAMEPAD:
        return Input.padPressed(this.button, this.device);
      default:
        return false;
    }
  }

  released() {
    switch (this.source) {
      case INPUT_SOURCE.KEYBOARD:
        return Input.keyReleased(this.button);
      case INPUT_SOURCE.MOUSE:
        return Input.pointerReleased(this.button);
      case INPUT_SOURCE.GAMEPAD:
        return Input.padReleased(this.button, this.device);
      default:
        return false;
    }
  }

  // single source of truth for binding→UI text (UIRebind + facetKeyHints), so a remap reads the same everywhere.
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

  // keycode → display string: named keys, F1–F12, letters/digits → char, else raw code.
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
