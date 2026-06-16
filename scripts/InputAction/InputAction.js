/**
 * A named action: button bindings (OR-combined) plus analog axis bindings, gated by
 * InputContext. The query methods (down/pressed/released/value) are the gameplay-facing
 * API; they go falsy while a text field owns the keyboard (captured) or the active
 * InputContext doesn't list this action (_blocked).
 */
globalThis.InputAction = class InputAction {
  constructor() {
    this.buttons = [];
    this.axes = [];
    // null = live in every context; a string[] gates the action to those InputContexts.
    this.contexts = null;
  }

  /**
   * Restrict this action to the given InputContext names.
   * @param {string[]} list - Context names this action is live in (indexOf-tested array, never a Set).
   * @returns {InputAction} this, for chaining.
   */
  inContext(list) {
    this.contexts = list;
    return this;
  }

  /** @returns {boolean} True when the active InputContext mutes this action. */
  _blocked() {
    return this.contexts !== null && !InputContext.allows(this.contexts);
  }

  /**
   * @param {{buttons?:{source:number,button:number,device:number}[],axes?:{mode:number,axis:number,device:number}[]}} data
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

  /** @returns {{buttons:object[],axes:object[]}} Serializable action. */
  export() {
    return {
      buttons: this.buttons.map((button) => button.export()),
      axes: this.axes.map((axis) => axis.export()),
    };
  }

  /**
   * @param {number} source - An INPUT_SOURCE value.
   * @param {number} button - The key/button constant.
   * @param {number} [device=0] - Gamepad device index.
   * @returns {InputAction} this, for chaining.
   */
  bindButton(source, button, device = 0) {
    this.buttons.push(new InputButton(source, button, device));
    return this;
  }

  /**
   * @param {number} mode - An INPUT_AXIS_MODE value.
   * @param {number} axis - The axis/button constant.
   * @param {number} [device=0] - Gamepad device index.
   * @returns {InputAction} this, for chaining.
   */
  bindAxis(mode, axis, device = 0) {
    this.axes.push(new InputAxis(mode, axis, device));
    return this;
  }

  /** @param {InputButton} button @returns {boolean} True if it was bound and removed. */
  unbindButton(button) {
    const index = this.buttons.indexOf(button);
    if (index > -1) {
      this.buttons.splice(index, 1);
      return true;
    }
    return false;
  }

  /** @param {InputAxis} axis @returns {boolean} True if it was bound and removed. */
  unbindAxis(axis) {
    const index = this.axes.indexOf(axis);
    if (index > -1) {
      this.axes.splice(index, 1);
      return true;
    }
    return false;
  }

  // Gameplay input is muted while a focused text field owns the keyboard, so typing
  // doesn't also drive hotkeys/movement. UIInput.active is a plain static field (GMRT
  // doesn't fire static getters) — the same signal that suspends UINav.
  /** @returns {boolean} */
  static captured() {
    return UIInput.active !== null;
  }

  // While the debug overlay is open, mute the matching gameplay source: MOUSE always (a
  // pick/drag mustn't drive the game), KEYBOARD only while the overlay captures it (typing
  // a dbg_text_input) so WASD still roams. Gamepad untouched.
  /** @param {InputButton} button @returns {boolean} */
  static _debugMuted(button) {
    if (!DebugImGui._open) return false;
    if (button.source === INPUT_SOURCE.MOUSE) return true;
    if (button.source === INPUT_SOURCE.KEYBOARD)
      return is_keyboard_used_debug_overlay();
    return false;
  }

  /** @returns {boolean} Any bound button held this frame. */
  down() {
    if (InputAction.captured() || this._blocked()) return false;
    return this.buttons.some(
      (button) => !InputAction._debugMuted(button) && button.down(),
    );
  }

  /** @returns {boolean} Any bound button pressed-edge this frame. */
  pressed() {
    if (InputAction.captured() || this._blocked()) return false;
    return this.buttons.some(
      (button) => !InputAction._debugMuted(button) && button.pressed(),
    );
  }

  /** @returns {boolean} Any bound button released-edge this frame. */
  released() {
    if (InputAction.captured() || this._blocked()) return false;
    return this.buttons.some(
      (button) => !InputAction._debugMuted(button) && button.released(),
    );
  }

  /** @returns {number} The bound axis with the largest magnitude in [-1, 1]. */
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
