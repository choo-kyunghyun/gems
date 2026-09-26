/**
 * Key-rebind row. A nav confirm or a click arms capture, which holds the nav focus: the next key
 * pressed becomes the binding, while a nav cancel, a click or the focus moving away disarms it.
 *
 * Keyboard only; mouse/gamepad bindings show read-only. BUG: capture state is an instance field
 * read live, never a cached bool (docs/GMRT.md #15549).
 * @implements {UIComponent}
 */
globalThis.UIRebind = class UIRebind {
  constructor(s = {}) {
    this.actionKey = s.actionKey ?? "";
    this.promptRef = UIDraw.textRef(s.prompt ?? "Press a key…");
    this.onRebind = s.onRebind ?? noop;
    this.color = s.color ?? c_white;
    this.captureColor = s.captureColor ?? c_aqua;
    this.font = s.font ?? -1;
    this.rad = s.rad ?? 6;

    this.focusable = true;
    this._capturing = false;
    // release-inside arms capture mode
    this._fsm = new UITrigger({
      onClick: () => {
        this._capturing = true;
      },
    });
  }

  onUpdate(element, block) {
    if (this._capturing && UINav.focused !== element) this._capturing = false;
    if (this._capturing) {
      if (Input.pointer.left.pressed) {
        this._capturing = false;
      } else {
        // BUG: scan for the live pressed edge, not keyboard_lastkey, which lags vk_anykey by a
        // frame and would rebind the stale key
        const code = this._scanKey();
        if (code > 0) {
          this._rebind(code);
          Input.consumeKey(code); // spent here: the action it now binds must not fire on the same press
          this._capturing = false;
        }
      }
      // no stale hover/held flags while armed — the FSM isn't running
      element.state.hover = false;
      element.state.held = false;
      return true; // swallow input from the rest of the tree while capturing
    }

    const result = this._fsm.onUpdate(element, block);
    if (this._capturing) UINav.focus(element); // a click armed it
    return result;
  }

  /** A confirm arms capture; while armed, the row takes every nav event and a cancel disarms it. */
  onNav(element, ev) {
    if (!this._capturing) {
      if (ev.kind !== "confirm") return false;
      this._capturing = true;
      return true;
    }
    if (ev.kind === "cancel") this._capturing = false;
    return true;
  }

  onDraw(element) {
    const pos = element.getLayoutPosition();
    const st = UIDraw.save();

    const fnt = UIDraw.font(this.font);
    if (fnt !== -1) draw_set_font(fnt);
    draw_set_halign(fa_center);
    draw_set_valign(fa_middle);

    const cx = pos.left + pos.width * 0.5;
    const cy = pos.top + pos.height * 0.5;

    if (this._capturing) {
      UIDraw.outline(
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

    UIDraw.restore(st);
  }

  /**
   * The current binding as text, read live so a rebind updates the label with no wiring.
   */
  _label() {
    const action = Input.get(this.actionKey);
    return action ? action.label() : "—";
  }

  /**
   * The first keycode with a live pressed edge this frame (0 = none), Escape aside: that one is
   * the nav's cancel. Only runs while capturing, so scanning the whole range is negligible.
   */
  _scanKey() {
    let code = 8; // vk_backspace — below this is nokey/anykey/mouse aliases
    while (code <= 255) {
      if (code !== vk_escape && Input.keyPressed(code)) return code;
      code++;
    }
    return 0;
  }

  _rebind(code) {
    Input.rebind(this.actionKey, code);
    this.onRebind(code);
  }
};
