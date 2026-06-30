// Key-rebind row: click → "press a key…" capture mode → next press rebinds the action's
// first button (Esc/click cancels). Mutates the InputAction in place so every consumer
// picks up the new key. Keyboard only; mouse/gamepad bindings show read-only via label().
// GMRT: capture state is an instance field read live (no cached bool — clobber, see CLAUDE.md).
/** @implements {UIComponent} */
globalThis.UIRebind = class UIRebind {
  /** @param {Object} [s] { actionKey, prompt: () => string, onRebind, color, captureColor, font, rad } */
  constructor(s = {}) {
    this.actionKey = s.actionKey ?? "";
    this.promptRef = s.prompt ?? (() => "Press a key…");
    this.onRebind = s.onRebind ?? noop;
    this.color = s.color ?? c_white;
    this.captureColor = s.captureColor ?? c_aqua;
    this.font = s.font ?? -1;
    this.rad = s.rad ?? 6;

    this._enter = false; // pointer over the row
    this._hold = false; // press started inside (commit on release)
    this._capturing = false; // waiting for the next key
  }

  /** @param {UIElement} element @param {boolean} block @returns {boolean} whether the pointer is captured */
  onUpdate(element, block) {
    const pos = element.getLayoutPosition();
    if (!(pos.width > 0)) return block; // unlaid-out (NaN) or zero-width

    if (this._capturing) {
      // Esc checked first — the scan below would otherwise pick it up.
      if (keyboard_check_pressed(vk_escape) || UIPointer.pressed) {
        this._capturing = false;
      } else {
        // scan for the live pressed-edge keycode, NOT keyboard_lastkey — on GMRT lastkey
        // lags vk_anykey by a frame, so the first press would rebind the stale key ("rebind twice" bug).
        const code = this._scanKey();
        if (code > 0) {
          this._rebind(code);
          this._capturing = false;
        }
      }
      return true; // swallow input from the rest of the tree while capturing
    }

    const mx = device_mouse_x_to_gui(0);
    const my = device_mouse_y_to_gui(0);
    this._enter = !block && element.positionMeeting(mx, my);

    if (this._enter && UIPointer.pressed) this._hold = true;
    if (UIPointer.released) {
      if (this._hold && this._enter) this._capturing = true;
      this._hold = false;
    }

    return this._hold || this._enter || block;
  }

  /** @param {UIElement} element */
  onDraw(element) {
    const pos = element.getLayoutPosition();
    if (!(pos.width > 0)) return; // unlaid-out (NaN) or zero-width

    const font = draw_get_font();
    const halign = draw_get_halign();
    const valign = draw_get_valign();
    const color = draw_get_color();

    if (this.font !== -1) draw_set_font(this.font);
    draw_set_halign(fa_center);
    draw_set_valign(fa_middle);

    const cx = pos.left + pos.width * 0.5;
    const cy = pos.top + pos.height * 0.5;

    if (this._capturing) {
      // 2px accent outline — "armed, waiting for a key".
      const x1 = pos.left + pos.width;
      const y1 = pos.top + pos.height;
      draw_roundrect_color_ext(
        pos.left,
        pos.top,
        x1,
        y1,
        this.rad,
        this.rad,
        this.captureColor,
        this.captureColor,
        true,
      );
      draw_roundrect_color_ext(
        pos.left + 1,
        pos.top + 1,
        x1 - 1,
        y1 - 1,
        this.rad,
        this.rad,
        this.captureColor,
        this.captureColor,
        true,
      );
      draw_set_color(this.captureColor);
      draw_text(cx, cy, this.promptRef());
    } else {
      draw_set_color(this.color);
      draw_text(cx, cy, this._label());
    }

    draw_set_font(font);
    draw_set_halign(halign);
    draw_set_valign(valign);
    draw_set_color(color);
  }

  // current binding as text, read live so a rebind updates the label with no wiring.
  // binding → text mapping lives on InputAction/InputButton (shared with the key-hint bar).
  _label() {
    const action = Input.get(this.actionKey);
    return action ? action.label() : "—";
  }

  // first keycode with a live pressed-edge this frame (0 = none). Only runs while capturing,
  // so scanning the whole range is negligible.
  _scanKey() {
    let code = 8; // vk_backspace — below this is nokey/anykey/mouse aliases
    while (code <= 255) {
      if (code !== vk_escape && keyboard_check_pressed(code)) return code;
      code++;
    }
    return 0;
  }

  _rebind(code) {
    const action = Input.get(this.actionKey);
    if (!action) return;
    const btn = new InputButton(INPUT_SOURCE.KEYBOARD, code);
    if (action.buttons.length > 0) action.buttons[0] = btn;
    else action.buttons.push(btn);
    this.onRebind(code);
  }
};
