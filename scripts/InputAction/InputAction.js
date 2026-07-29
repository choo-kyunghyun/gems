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
   * @param {string[]} list
   * @returns {InputAction}
   */
  inContext(list) {
    this.contexts = list;
    return this;
  }

  /**
   * @returns {boolean}
   */
  _blocked() {
    return this.contexts !== null && !InputContext.allows(this.contexts);
  }

  /**
   * @param {Object} data
   * @returns {InputAction}
   */
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

  /**
   * @returns {{buttons: Object[], axes: Object[]}}
   */
  export() {
    return {
      buttons: this.buttons.map((button) => button.export()),
      axes: this.axes.map((axis) => axis.export()),
    };
  }

  /**
   * @param {number} source
   * @param {number} button
   * @param {number} [device=0]
   * @returns {InputAction}
   */
  bindButton(source, button, device = 0) {
    this.buttons.push(new InputButton(source, button, device));
    return this;
  }

  /**
   * @param {number} mode
   * @param {number} axis
   * @param {number} [device=0]
   * @returns {InputAction}
   */
  bindAxis(mode, axis, device = 0) {
    this.axes.push(new InputAxis(mode, axis, device));
    return this;
  }

  // single source of truth for binding→display text; reads live so a remap updates UIRebind + gemsKeyHints automatically.
  /** @returns {string} e.g. "W" / "Shift" / "LMB", or "—" when unbound. */
  label() {
    return this.buttons.length > 0 ? this.buttons[0].label() : "—";
  }

  /**
   * @param {InputButton} button
   * @returns {boolean}
   */
  unbindButton(button) {
    const index = this.buttons.indexOf(button);
    if (index > -1) {
      this.buttons.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * @param {InputAxis} axis
   * @returns {boolean}
   */
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
   * @returns {boolean}
   */
  static captured() {
    return UIInput.active !== null;
  }

  /**
   * debug overlay: MOUSE always muted (pick-click can't fire weapon); KEYBOARD only while overlay owns it so WASD still roams.
   * @param {InputButton} button
   * @returns {boolean}
   */
  static _debugMuted(button) {
    if (!Debug.isOpen()) return false;
    if (button.source === INPUT_SOURCE.MOUSE) return true;
    if (button.source === INPUT_SOURCE.KEYBOARD)
      return is_keyboard_used_debug_overlay();
    return false;
  }

  /**
   * mutes gamepad gameplay when UINav owns the controller (window open); during free-roam SystemMenu keeps UINav.suspended=true.
   * @returns {boolean}
   */
  static _gamepadMuted() {
    return !UINav.suspended;
  }

  /**
   * avoids caching the bool across .some() callbacks — GMRT can clobber primitive bools in closures.
   * @param {InputButton} button
   * @returns {boolean}
   */
  static _buttonMuted(button) {
    if (InputAction._debugMuted(button)) return true;
    return (
      button.source === INPUT_SOURCE.GAMEPAD && InputAction._gamepadMuted()
    );
  }

  /**
   * @returns {boolean}
   */
  down() {
    if (InputAction.captured() || this._blocked()) return false;
    return this.buttons.some(
      (button) => !InputAction._buttonMuted(button) && button.down(),
    );
  }

  /**
   * @returns {boolean}
   */
  pressed() {
    if (InputAction.captured() || this._blocked()) return false;
    return this.buttons.some(
      (button) => !InputAction._buttonMuted(button) && button.pressed(),
    );
  }

  /**
   * @returns {boolean}
   */
  released() {
    if (InputAction.captured() || this._blocked()) return false;
    return this.buttons.some(
      (button) => !InputAction._buttonMuted(button) && button.released(),
    );
  }

  /**
   * @returns {number}
   */
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
