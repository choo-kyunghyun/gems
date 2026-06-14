globalThis.InputAction = class InputAction {
  constructor() {
    this.buttons = [];
    this.axes = [];
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

  down() {
    if (InputAction.captured()) return false;
    return this.buttons.some((button) => button.down());
  }

  pressed() {
    if (InputAction.captured()) return false;
    return this.buttons.some((button) => button.pressed());
  }

  released() {
    if (InputAction.captured()) return false;
    return this.buttons.some((button) => button.released());
  }

  value() {
    if (InputAction.captured()) return 0;
    let val = 0;
    for (const axis of this.axes) {
      const v = axis.value();
      if (Math.abs(v) > Math.abs(val)) val = v;
    }
    return val;
  }
};
