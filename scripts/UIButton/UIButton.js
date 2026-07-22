// Themed button behavior over the shared UITrigger FSM (the internal `_fsm` delegate runs the
// hover/press/commit logic and writes element.state) — this component adds the theming: eases
// panel color/border/shadow on Time.raw (the clock split),
// greys the label, and supports live disabled + selected predicates (written to
// element.state.disabled/selected for any sibling reader).
/** @implements {UIComponent} */
globalThis.UIButton = class UIButton {
  /** @param {Object} [btn] see field defaults below for the accepted options */
  constructor(btn = {}) {
    this.colorNormal = btn.colorNormal ?? c_white;
    this.colorHover = btn.colorHover ?? c_ltgray;
    this.colorPress = btn.colorPress ?? c_gray;
    this.colorDisabled = btn.colorDisabled ?? c_dkgray;
    this.alpha = btn.alpha ?? 1;
    this.alphaDisabled = btn.alphaDisabled ?? 0.5;
    this.disabled = btn.disabled ?? false;
    this.getDisabled = btn.getDisabled ?? null; // live () => bool, overrides `disabled`
    // live () => bool for a toggle's "active" state — hover/press still win on top.
    // both colorSelected and the predicate must be set for it to apply.
    this.getSelected = btn.getSelected ?? null;
    this.colorSelected = btn.colorSelected;
    this.borderColorSelected = btn.borderColorSelected;
    // label UIText to grey alongside the panel when disabled; panel dim alone left text bright.
    this.label = btn.label ?? null;
    this.textColorNormal = btn.textColorNormal ?? c_white;
    this.textColorDisabled = btn.textColorDisabled ?? c_gray;
    this.onEnter = btn.onEnter ?? noop;
    this.onLeave = btn.onLeave ?? noop;
    this.onDown = btn.onDown ?? noop;
    this.onUp = btn.onUp ?? noop;
    this.onClick = btn.onClick ?? noop;
    // border glow — both must be set to animate.
    this.borderColorNormal = btn.borderColorNormal;
    this.borderColorHover = btn.borderColorHover;
    this.animSpeed = btn.animSpeed ?? 16; // per-second lerp rate (higher = snappier)
    // internal FSM delegate; callbacks are live arrow closures so reassigning
    // this.onClick etc. after construction keeps working.
    this._fsm = new UITrigger({
      onEnter: () => this.onEnter(),
      onLeave: () => this.onLeave(),
      onDown: () => this.onDown(),
      onUp: () => this.onUp(),
      onClick: () => {
        Audio.playSfx({ sound: snd_button_click }); // click cue (before onClick, may swap level)
        this.onClick();
      },
    });
    // ease float r/g/b channels, not a packed int — a packed-int lerp loses a sub-1 per-frame
    // step at unlimited FPS (tween freezes), and GMRT's merge_color drifts darker. ch[0]
    // undefined until first seeded so there's no fade-in from black.
    this._colorCh = [undefined, 0, 0];
    this._borderCh = [undefined, 0, 0];
    this._shadow = undefined;
    this._shadowBase = undefined;
  }

  // live predicate wins over static flag — callers can gate on changing state without polling.
  /** @returns {boolean} */
  _disabled() {
    return this.getDisabled !== null ? this.getDisabled() : this.disabled;
  }

  // float channel ease — see constructor note on why not a packed-int lerp.
  /** @param {number[]} ch @param {number} target @returns {number} */
  _easeColor(ch, target) {
    const tr = color_get_red(target);
    const tg = color_get_green(target);
    const tb = color_get_blue(target);
    if (ch[0] === undefined) {
      ch[0] = tr;
      ch[1] = tg;
      ch[2] = tb;
    } else {
      ch[0] = Tween.approach(ch[0], tr, this.animSpeed);
      ch[1] = Tween.approach(ch[1], tg, this.animSpeed);
      ch[2] = Tween.approach(ch[2], tb, this.animSpeed);
    }
    return make_colour_rgb(round(ch[0]), round(ch[1]), round(ch[2]));
  }

  /** @param {UIElement} element @param {boolean} block @returns {boolean} whether the pointer is captured */
  onUpdate(element, block) {
    const panel = element.getComponent(UIPanel);
    const disabled = this._disabled();
    element.state.disabled = disabled;

    // grey the label when disabled — panel dim alone left text bright.
    if (this.label !== null) {
      this.label.color = disabled
        ? this.textColorDisabled
        : this.textColorNormal;
    }

    if (disabled) {
      // force-release any latched hover/press (fires onUp/onLeave) and clear the bag —
      // the FSM doesn't run this frame, so it can't clear its own state.
      this._fsm.release();
      element.state.hover = false;
      element.state.held = false;
      element.state.clicked = false;
      element.state.selected = false;
      if (panel) {
        // snap channels so re-enable eases out of the disabled color, not from black.
        this._colorCh[0] = color_get_red(this.colorDisabled);
        this._colorCh[1] = color_get_green(this.colorDisabled);
        this._colorCh[2] = color_get_blue(this.colorDisabled);
        panel.color = this.colorDisabled;
        panel.alpha = this.alphaDisabled;
      }
      return block;
    }

    const selected = this.getSelected !== null && this.getSelected();
    element.state.selected = selected;

    const result = this._fsm.onUpdate(element, block);
    const hover = this._fsm.enter;
    const held = this._fsm.hold;

    if (panel) {
      panel.alpha = this.alpha;

      // ternaries only — `selected` must not be reused as a `&&`/`||` left operand (#15549).
      const targetColor = held
        ? this.colorPress
        : hover
          ? this.colorHover
          : selected
            ? this.colorSelected !== undefined
              ? this.colorSelected
              : this.colorNormal
            : this.colorNormal;
      panel.color = this._easeColor(this._colorCh, targetColor);

      if (
        this.borderColorNormal !== undefined &&
        this.borderColorHover !== undefined
      ) {
        const targetBorder =
          hover || held
            ? this.borderColorHover
            : selected
              ? this.borderColorSelected !== undefined
                ? this.borderColorSelected
                : this.borderColorNormal
              : this.borderColorNormal;
        panel.borderColor = this._easeColor(this._borderCh, targetBorder);
      }

      // lift on hover, sink on press — only when the panel has a shadow.
      if (this._shadowBase === undefined) this._shadowBase = panel.shadow;
      if (this._shadowBase > 0) {
        const targetShadow = held
          ? this._shadowBase * 0.25
          : hover
            ? this._shadowBase * 1.4
            : this._shadowBase;
        this._shadow =
          this._shadow === undefined
            ? targetShadow
            : Tween.approach(this._shadow, targetShadow, this.animSpeed);
        panel.shadow = this._shadow;
      }
    }

    return result;
  }

  /** @param {UIElement} element */
  onDestroy(element) {
    this._fsm.onDestroy(element);
  }

  // UINav: confirm fires the click; presence marks element focusable.
  /** @param {UIElement} element */
  navActivate(element) {
    if (!this._disabled()) this.onClick();
  }
};
