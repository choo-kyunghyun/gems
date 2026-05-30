globalThis.Input = class Input {
  static sensitivity = 2.5;
  static deadzone = 0;
  static actions = {};

  static destroy() {
    Input.actions = {};
  }

  static import(data) {
    Input.destroy();
    Input.sensitivity = data.sensitivity;
    Input.deadzone = data.deadzone;
    Object.entries(data.actions).forEach(([key, value]) => {
      Input.actions[key] = InputAction.import(value);
    });
  }

  static export() {
    const actions = {};
    for (const key in Input.actions) {
      actions[key] = Input.actions[key].export();
    }

    return {
      sensitivity: Input.sensitivity,
      deadzone: Input.deadzone,
      actions: actions,
    };
  }

  static get(key) {
    return Input.actions[key];
  }

  static register(key, action) {
    Input.actions[key] = action;
    return Input;
  }

  static unregister(key) {
    delete Input.actions[key];
  }
};
