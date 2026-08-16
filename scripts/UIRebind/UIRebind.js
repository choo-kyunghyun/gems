// Key-rebind row: click → "press a key…" capture → next press rebinds the action's first button
// (Esc/click cancels). Mutates the InputAction in place so every consumer picks up the new key.
/**
 * Keyboard only; mouse/gamepad bindings show read-only via label(). GMRT: capture state is an instance
 * field read live (no cached bool — clobber, see CLAUDE.md).
 * @implements {UIComponent}
 */
globalThis.UIRebind = class UIRebind {
  /** s: { actionKey, prompt: string | () => string, onRebind, color, captureColor, font, rad } */
  constructor(s = {}) {
    this.actionKey = s.actionKey ?? "";
    this.promptRef = uiTextRef(s.prompt ?? "Press a key…");
    this.onRebind = s.onRebind ?? noop;
    this.color = s.color ?? c_white;
    this.captureColor = s.captureColor ?? c_aqua;
    this.font = s.font ?? -1;
    this.rad = s.rad ?? 6;

    this._capturing = false; // waiting for the next key
    // internal FSM delegate (UITrigger) — release-inside arms capture mode.
    this._fsm = new UITrigger({
      onClick: () => {
        this._capturing = true;
      },
    });
  }

  onUpdate(element, block) {
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
      // no stale hover/held flags in the bag while armed — the FSM isn't running.
      element.state.hover = false;
      element.state.held = false;
      return true; // swallow input from the rest of the tree while capturing
    }

    return this._fsm.onUpdate(element, block);
  }

  onDraw(element) {
    const pos = element.getLayoutPosition();
    const st = uiDrawSave();

    const fnt = resolveUIFont(this.font);
    if (fnt !== -1) draw_set_font(fnt);
    draw_set_halign(fa_center);
    draw_set_valign(fa_middle);

    const cx = pos.left + pos.width * 0.5;
    const cy = pos.top + pos.height * 0.5;

    if (this._capturing) {
      // 2px accent outline — "armed, waiting for a key".
      drawUIOutline(
        pos.left,
        pos.top,
        pos.left + pos.width,
        pos.top + pos.height,
        this.rad,
        this.captureColor,
        2,
      );
      draw_set_color(this.captureColor);
      draw_text(cx, cy, this.promptRef());
    } else {
      draw_set_color(this.color);
      draw_text(cx, cy, this._label());
    }

    uiDrawRestore(st);
  }

  /**
   * current binding as text, read live so a rebind updates the label with no wiring.
   * binding → text mapping lives on InputAction/InputButton (shared with the key-hint bar).
   */
  _label() {
    const action = Input.get(this.actionKey);
    return action ? action.label() : "—";
  }

  /**
   * first keycode with a live pressed-edge this frame (0 = none). Only runs while capturing,
   * so scanning the whole range is negligible.
   */
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
