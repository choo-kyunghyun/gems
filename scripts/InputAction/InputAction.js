/** OR-combined button/axis bindings gated by InputContext; queries go falsy when captured or blocked. */
globalThis.InputAction = class InputAction {
  constructor() {
    this.buttons = [];
    this.axes = [];
    // null = live in every context; string[] gates to those contexts.
    this.contexts = null;
  }

  /**
   * Restrict to given context names (indexOf-tested array, never a Set — GMRT Set iteration crashes).
   */
  inContext(list) {
    this.contexts = list;
    return this;
  }

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

  // single source of truth for binding→display text; reads live so a remap updates UIRebind + gemsKeyHints automatically.
  /** E.g. "W" / "Shift" / "LMB", or "—" when unbound. */
  label() {
    return this.buttons.length > 0 ? this.buttons[0].label() : "—";
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

  /**
   * mutes gameplay while a text field owns the keyboard — typing can't also trigger hotkeys.
   * UIInput.active is a plain static field, read live each call.
   */
  static captured() {
    return UIInput.active !== null;
  }

  /**
   * debug overlay: MOUSE always muted (pick-click can't fire weapon); KEYBOARD only while overlay owns it so WASD still roams.
   */
  static _debugMuted(button) {
    if (!Debug.isOpen()) return false;
    if (button.source === INPUT_SOURCE.MOUSE) return true;
    if (button.source === INPUT_SOURCE.KEYBOARD)
      return is_keyboard_used_debug_overlay();
    return false;
  }

  /**
   * mutes gamepad gameplay when UINav owns the controller (window open); during free-roam GameOverlay keeps UINav.suspended=true.
   */
  static _gamepadMuted() {
    return !UINav.suspended;
  }

  /**
   * avoids caching the bool across .some() callbacks — GMRT can clobber primitive bools in closures.
   */
  static _buttonMuted(button) {
    if (InputAction._debugMuted(button)) return true;
    return (
      button.source === INPUT_SOURCE.GAMEPAD && InputAction._gamepadMuted()
    );
  }

  down() {
    if (InputAction.captured() || this._blocked()) return false;
    return this.buttons.some(
      (button) => !InputAction._buttonMuted(button) && button.down(),
    );
  }

  pressed() {
    if (InputAction.captured() || this._blocked()) return false;
    return this.buttons.some(
      (button) => !InputAction._buttonMuted(button) && button.pressed(),
    );
  }

  released() {
    if (InputAction.captured() || this._blocked()) return false;
    return this.buttons.some(
      (button) => !InputAction._buttonMuted(button) && button.released(),
    );
  }

  value() {
    if (
      InputAction.captured() ||
      this._blocked() ||
      InputAction._gamepadMuted()
    )
      return 0;
    let val = 0;
    for (const axis of this.axes) {
      const v = axis.value();
      if (Math.abs(v) > Math.abs(val)) val = v;
    }
    return val;
  }
};
