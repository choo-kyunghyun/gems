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

  bindButton(source, button, device = 0) {
    this.buttons.push(new InputButton(source, button, device));
    return this;
  }

  bindAxis(mode, axis, device = 0) {
    this.axes.push(new InputAxis(mode, axis, device));
    return this;
  }

  /** Index of the first keyboard button, -1 when none — the slot a rebind edits (Input._setKey). */
  keyIndex() {
    for (let i = 0; i < this.buttons.length; i++)
      if (this.buttons[i].source === INPUT_SOURCE.KEYBOARD) return i;
    return -1;
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
   * mutes gamepad gameplay when UINav owns the controller (window open); during free-roam GameOverlay keeps UINav.suspended=true.
   */
  static _gamepadMuted() {
    return !UINav.suspended;
  }

  /**
   * avoids caching the bool across .some() callbacks — GMRT can clobber primitive bools in closures.
   */
  static _buttonMuted(button) {
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
