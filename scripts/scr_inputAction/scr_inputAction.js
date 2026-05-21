global.InputAction = class InputAction {
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

  bind_button(source, button, device = 0) {
    this.buttons.push(new InputButton(source, button, device));
    return this;
  }

  bind_axis(mode, axis, device = 0) {
    this.axes.push(new InputAxis(mode, axis, device));
    return this;
  }

  unbind_button(button) {
    const index = this.buttons.indexOf(button);
    if (index > -1) {
      this.buttons.splice(index, 1);
      return true;
    }
    return false;
  }

  unbind_axis(axis) {
    const index = this.axes.indexOf(axis);
    if (index > -1) {
      this.axes.splice(index, 1);
      return true;
    }
    return false;
  }

  down() {
    return this.buttons.some((button) => button.down());
  }

  pressed() {
    return this.buttons.some((button) => button.pressed());
  }

  released() {
    return this.buttons.some((button) => button.released());
  }

  value() {
    let val = 0;
    for (const axis of this.axes) {
      const v = axis.value();
      if (Math.abs(v) > Math.abs(val)) val = v;
    }
    return val;
  }
};
