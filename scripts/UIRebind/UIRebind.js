/**
 * @implements {UIComponent}
 * Key-rebinding row: shows the current keyboard binding of an Input action and, when
 * clicked, enters a "press a key…" capture mode — the next key press rebinds the
 * action's first button (Esc or a mouse click cancels). Bridges the existing
 * Input / InputAction (`bindButton`), mutating the action in place so every consumer
 * (`Input.get(key).down()/pressed()`) picks up the new key immediately.
 *
 * Keyboard only (the common case); a mouse/gamepad binding is shown read-only as
 * "Mouse N" / "Pad N". The element carries a UIPanel for its background (built by
 * gemsRebind); this component draws the label + a capture-state accent outline and
 * owns the click/capture logic.
 *
 * GMRT notes: capture state lives in an instance field read live each frame (no
 * cached primitive bool — see the clobber note in CLAUDE.md); the NaN-width guard
 * gates the roundrect outline draw; each mouse edge query is called once per frame
 * per code path (the capturing branch returns early), matching UISelect.
 */
globalThis.UIRebind = class UIRebind {
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

  onUpdate(element, block) {
    const pos = element.getLayoutPosition();
    if (!(pos.width > 0)) return block; // unlaid-out (NaN) or zero-width

    if (this._capturing) {
      // Esc or any mouse click cancels; any other key press rebinds. Escape is
      // checked first since the scan below would otherwise pick it up.
      if (
        keyboard_check_pressed(vk_escape) ||
        mouse_check_button_pressed(mb_left)
      ) {
        this._capturing = false;
      } else {
        // Scan for the keycode whose pressed-edge is live THIS frame, rather than
        // reading keyboard_lastkey — on GMRT lastkey lags vk_anykey by a frame, so
        // the first press would rebind to the stale previous key (the "rebind twice"
        // bug). The scan stays in sync with the actual edge.
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

    if (this._enter && mouse_check_button_pressed(mb_left)) this._hold = true;
    if (mouse_check_button_released(mb_left)) {
      if (this._hold && this._enter) this._capturing = true;
      this._hold = false;
    }

    return this._hold || this._enter || block;
  }

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
      // A 2px accent outline so the row reads as "armed, waiting for a key".
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

  // Current binding as a display string (reads the action live, so a rebind updates
  // the label without any extra wiring).
  _label() {
    const action = Input.get(this.actionKey);
    if (!action || action.buttons.length === 0) return "—";
    const b = action.buttons[0];
    if (b.source === INPUT_SOURCE.KEYBOARD) return this._keyName(b.button);
    if (b.source === INPUT_SOURCE.MOUSE) return "Mouse " + b.button;
    if (b.source === INPUT_SOURCE.GAMEPAD) return "Pad " + b.button;
    return "—";
  }

  // The keycode in its pressed-edge this frame (0 = none). Skips vk_nokey (0) and
  // vk_anykey (1); Esc is handled as cancel before this runs. Only called while
  // capturing, so scanning the whole range each frame is negligible.
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

  _keyName(code) {
    if (code === 0) return "—";
    if (code === vk_space) return "Space";
    if (code === vk_enter) return "Enter";
    if (code === vk_escape) return "Esc";
    if (code === vk_shift) return "Shift";
    if (code === vk_control) return "Ctrl";
    if (code === vk_alt) return "Alt";
    if (code === vk_tab) return "Tab";
    if (code === vk_backspace) return "Bksp";
    if (code === vk_left) return "Left";
    if (code === vk_right) return "Right";
    if (code === vk_up) return "Up";
    if (code === vk_down) return "Down";
    if (code >= vk_f1 && code <= vk_f12) return "F" + (code - vk_f1 + 1);
    // Letters (A–Z) and digits (0–9) map straight to their character.
    if ((code >= 48 && code <= 57) || (code >= 65 && code <= 90))
      return chr(code);
    return string(code);
  }
};
