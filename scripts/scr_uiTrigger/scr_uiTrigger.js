// global.UITrigger = class UITrigger extends UIElement {}
function uiTrigger(style = {}, trigger = {}) {
  const element = new UIElement(style);
  element.block = trigger.block ?? true;
  element.on_enter = method(this, trigger.on_enter ?? noop);
  element.on_hover = method(this, trigger.on_hover ?? noop);
  element.on_leave = method(this, trigger.on_leave ?? noop);
  element.on_down = method(this, trigger.on_down ?? noop);
  element.on_up = method(this, trigger.on_up ?? noop);
  element.on_click = method(this, trigger.on_click ?? noop);
  element.enter = false;
  element.hold = false;

  element.on_destroy = function () {
    if (this.hold) this.on_up();
    if (this.enter) this.on_leave();
  };

  element.on_update = function (block) {
    const pressed = mouse_check_button_pressed(mb_left);
    const released = mouse_check_button_released(mb_left);
    const mx = device_mouse_x_to_gui(0);
    const my = device_mouse_y_to_gui(0);
    const enter_prev = this.enter;
    this.enter = this.position_meeting(mx, my);

    if (this.enter) {
      if (!enter_prev) this.on_enter();
      this.on_hover();
      if (pressed) {
        this.hold = true;
        this.on_down();
      }
    } else if (enter_prev) {
      this.on_leave();
    }

    if (released) {
      if (this.hold) {
        this.on_up();
        if (this.enter && !block) this.on_click();
      }
      this.hold = false;
    }

    return this.block && (this.hold || this.enter);
  };

  return element;
}
