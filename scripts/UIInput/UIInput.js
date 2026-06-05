/** @implements {UIComponent} */
globalThis.UIInput = class UIInput {
  constructor(input = {}) {
    this.value = input.value ?? "";
    this.placeholder = input.placeholder ?? "";
    this.maxLength = input.maxLength ?? Infinity;
    this.mask = input.mask ?? false;
    this.filter = input.filter ?? null;
    this.readOnly = input.readOnly ?? false;

    this.color = input.color ?? c_white;
    this.colorPlaceholder = input.colorPlaceholder ?? c_gray;
    this.colorCursor = input.colorCursor ?? c_white;
    this.font = input.font ?? -1;
    this.valign = input.valign ?? fa_middle;

    this.onConfirm = input.onConfirm ?? noop;
    this.onCancel = input.onCancel ?? noop;
    this.onChange = input.onChange ?? noop;

    this._focused = false;
    this._cursorPos = 0;
    this._blinkTimer = 0;
    this._cursorVis = true;
  }

  get focused() {
    return this._focused;
  }

  focus() {
    if (this._focused) return this;
    this._focused = true;
    this._cursorPos = this.value.length;
    this._cursorVis = true;
    this._blinkTimer = 0;
    keyboard_string = "";
    return this;
  }

  blur() {
    if (!this._focused) return this;
    this._focused = false;
    return this;
  }

  setValue(value) {
    this.value = String(value).slice(0, this.maxLength);
    this._cursorPos = this.value.length;
    return this;
  }

  clear() {
    return this.setValue("");
  }

  onUpdate(element, block) {
    if (mouse_check_button_pressed(mb_left)) {
      const mx = device_mouse_x_to_gui(0);
      const my = device_mouse_y_to_gui(0);
      if (element.positionMeeting(mx, my)) {
        if (!block) this.focus();
      } else {
        this.blur();
      }
    }

    if (this._focused) {
      if (!this.readOnly) this._processInput();
      this._blinkTimer += Time.delta;
      if (this._blinkTimer >= 0.5) {
        this._blinkTimer -= 0.5;
        this._cursorVis = !this._cursorVis;
      }
    }

    return block;
  }

  _processInput() {
    if (keyboard_check_pressed(vk_backspace)) {
      if (this._cursorPos > 0) {
        this.value =
          this.value.slice(0, this._cursorPos - 1) +
          this.value.slice(this._cursorPos);
        this._cursorPos--;
        this.onChange(this.value);
      }
      keyboard_string = "";
      return;
    }
    if (keyboard_check_pressed(vk_delete)) {
      if (this._cursorPos < this.value.length) {
        this.value =
          this.value.slice(0, this._cursorPos) +
          this.value.slice(this._cursorPos + 1);
        this.onChange(this.value);
      }
      keyboard_string = "";
      return;
    }
    if (keyboard_check_pressed(vk_left)) {
      this._cursorPos = Math.max(0, this._cursorPos - 1);
      keyboard_string = "";
      return;
    }
    if (keyboard_check_pressed(vk_right)) {
      this._cursorPos = Math.min(this.value.length, this._cursorPos + 1);
      keyboard_string = "";
      return;
    }
    if (keyboard_check_pressed(vk_home)) {
      this._cursorPos = 0;
      keyboard_string = "";
      return;
    }
    if (keyboard_check_pressed(vk_end)) {
      this._cursorPos = this.value.length;
      keyboard_string = "";
      return;
    }
    if (keyboard_check_pressed(vk_enter)) {
      this.onConfirm(this.value);
      this.blur();
      keyboard_string = "";
      return;
    }
    if (keyboard_check_pressed(vk_escape)) {
      this.onCancel(this.value);
      this.blur();
      keyboard_string = "";
      return;
    }

    const typed = keyboard_string;
    keyboard_string = "";
    if (typed === "") return;

    for (const char of typed) {
      if (this.value.length >= this.maxLength) break;
      if (this.filter !== null) {
        if (typeof this.filter === "function" && !this.filter(char)) continue;
        if (this.filter instanceof RegExp && !this.filter.test(char)) continue;
      }
      this.value =
        this.value.slice(0, this._cursorPos) +
        char +
        this.value.slice(this._cursorPos);
      this._cursorPos++;
    }
    this.onChange(this.value);
  }

  onDraw(element) {
    const pos = element.getLayoutPosition();
    const font = draw_get_font();
    const halign = draw_get_halign();
    const valign = draw_get_valign();
    const color = draw_get_color();

    if (this.font !== -1) draw_set_font(this.font);
    draw_set_halign(fa_left);
    draw_set_valign(this.valign);

    const x = pos.left + (pos.paddingLeft ?? 4);
    let y;
    switch (this.valign) {
      case fa_middle:
        y = pos.top + pos.height * 0.5;
        break;
      case fa_bottom:
        y = pos.top + pos.height;
        break;
      default:
        y = pos.top + (pos.paddingTop ?? 4);
    }

    if (this.value === "" && !this._focused) {
      draw_set_color(this.colorPlaceholder);
      draw_text(x, y, this.placeholder);
    } else {
      const display = this.mask
        ? string_repeat("*", this.value.length)
        : this.value;
      draw_set_color(this.color);
      draw_text(x, y, display);

      if (this._focused && this._cursorVis) {
        const before = this.mask
          ? string_repeat("*", this._cursorPos)
          : this.value.slice(0, this._cursorPos);
        const cx = x + string_width(before);
        const ch = string_height("M");
        let cy;
        switch (this.valign) {
          case fa_middle:
            cy = y - ch * 0.5;
            break;
          case fa_bottom:
            cy = y - ch;
            break;
          default:
            cy = y;
        }
        draw_set_color(this.colorCursor);
        draw_line(cx, cy, cx, cy + ch);
      }
    }

    draw_set_font(font);
    draw_set_halign(halign);
    draw_set_valign(valign);
    draw_set_color(color);
  }

  onDestroy(element) {
    if (this._focused) {
      this._focused = false;
      keyboard_string = "";
    }
  }
};
