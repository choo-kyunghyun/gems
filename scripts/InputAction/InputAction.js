globalThis.InputAction = class InputAction {
  constructor() {
    this.buttons = [];
    this.axes = [];
    // Live-context list (string[]) or null = live in every context. When set, the query
    // methods mute the action while InputContext.active() isn't in this list — the
    // context-aware counterpart to captured(). See InputContext.
    this.contexts = null;
  }

  // Declare the InputContext names this action is live in (e.g. ["play", "window"]).
  // Returns this for chaining; kept as a plain array (indexOf-tested, never a Set).
  inContext(list) {
    this.contexts = list;
    return this;
  }

  // True when this action is muted by the active InputContext (false for an untagged
  // action — those are live everywhere). captured() is checked separately by the queries.
  _blocked() {
    return this.contexts !== null && !InputContext.allows(this.contexts);
  }

  static import(data) {
    const action = new InputAction();
    const buttons = data.buttons ?? [];
    const axes = data.axes ?? [];

    for (const button of buttons) {
      action.buttons.push(InputButton.import(button));
    }

    for (const axis of axes) {
      action.axes.push(InputAxis.import(axis));
    }

    return action;
  }

  export() {
    return {
      buttons: this.buttons.map((button) => button.export()),
      axes: this.axes.map((axis) => axis.export()),
    };
  }

  bindButton(source, button, device = 0) {
    this.buttons.push(new InputButton(source, button, device));
    return this;
  }

  bindAxis(mode, axis, device = 0) {
    this.axes.push(new InputAxis(mode, axis, device));
    return this;
  }

  unbindButton(button) {
    const index = this.buttons.indexOf(button);
    if (index > -1) {
      this.buttons.splice(index, 1);
      return true;
    }
    return false;
  }

  unbindAxis(axis) {
    const index = this.axes.indexOf(axis);
    if (index > -1) {
      this.axes.splice(index, 1);
      return true;
    }
    return false;
  }

  // True while a focused text field owns the keyboard. Gameplay input is muted so typing
  // (e.g. the RPG inventory search) doesn't also drive hotkeys/movement — pressing "i"
  // while typing "Hi" must not toggle the inventory. UIInput.active is a plain static
  // field (GMRT doesn't fire static getters), set on focus / cleared on blur — the same
  // signal that suspends UINav.
  static captured() {
    return UIInput.active !== null;
  }

  // While the debug overlay is open, mute the matching gameplay source per button:
  // MOUSE always (a pick-click or slider-drag mustn't drive the game — covers the
  // world click that is_mouse_over_debug_overlay() wouldn't), KEYBOARD only while
  // the overlay is actually capturing it (typing in a dbg_text_input), so WASD
  // still roams while inspecting. Gamepad is left alone. No-op when the overlay is
  // closed (so the is_keyboard_used_debug_overlay() native call is skipped).
  static _debugMuted(button) {
    if (!DebugImGui._open) return false;
    if (button.source === INPUT_SOURCE.MOUSE) return true;
    if (button.source === INPUT_SOURCE.KEYBOARD)
      return is_keyboard_used_debug_overlay();
    return false;
  }

  down() {
    if (InputAction.captured() || this._blocked()) return false;
    return this.buttons.some(
      (button) => !InputAction._debugMuted(button) && button.down(),
    );
  }

  pressed() {
    if (InputAction.captured() || this._blocked()) return false;
    return this.buttons.some(
      (button) => !InputAction._debugMuted(button) && button.pressed(),
    );
  }

  released() {
    if (InputAction.captured() || this._blocked()) return false;
    return this.buttons.some(
      (button) => !InputAction._debugMuted(button) && button.released(),
    );
  }

  value() {
    if (InputAction.captured() || this._blocked()) return 0;
    let val = 0;
    for (const axis of this.axes) {
      const v = axis.value();
      if (Math.abs(v) > Math.abs(val)) val = v;
    }
    return val;
  }
};
