// Hover/press state machine over a UIElement — eases panel color/border/shadow on Time.raw
// (not Time.delta — UI must ignore sim time dilation). Supports live disabled + selected predicates.
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
    this.enter = false;
    this.hold = false;
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

    // grey the label when disabled — panel dim alone left text bright.
    if (this.label !== null) {
      this.label.color = disabled
        ? this.textColorDisabled
        : this.textColorNormal;
    }

    if (disabled) {
      if (this.hold) {
        this.onUp();
        this.hold = false;
      }
      if (this.enter) {
        this.onLeave();
        this.enter = false;
      }
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

    const mx = device_mouse_x_to_gui(0);
    const my = device_mouse_y_to_gui(0);
    const enterPrev = this.enter;
    this.enter = !block && element.positionMeeting(mx, my);

    if (this.enter) {
      if (!enterPrev) this.onEnter();
      if (UIPointer.pressed) {
        this.hold = true;
        this.onDown();
      }
    } else if (enterPrev) {
      this.onLeave();
    }

    if (UIPointer.released) {
      if (this.hold) {
        this.onUp();
        if (this.enter) {
          Audio.play("snd_ui_confirm"); // click cue (before onClick, which may swap the scene)
          this.onClick();
        }
      }
      this.hold = false;
    }

    if (panel) {
      panel.alpha = this.alpha;

      const selected = this.getSelected !== null && this.getSelected();
      const targetColor = this.hold
        ? this.colorPress
        : this.enter
          ? this.colorHover
          : selected && this.colorSelected !== undefined
            ? this.colorSelected
            : this.colorNormal;
      panel.color = this._easeColor(this._colorCh, targetColor);

      if (
        this.borderColorNormal !== undefined &&
        this.borderColorHover !== undefined
      ) {
        const targetBorder =
          this.enter || this.hold
            ? this.borderColorHover
            : selected && this.borderColorSelected !== undefined
              ? this.borderColorSelected
              : this.borderColorNormal;
        panel.borderColor = this._easeColor(this._borderCh, targetBorder);
      }

      // lift on hover, sink on press — only when the panel has a shadow.
      if (this._shadowBase === undefined) this._shadowBase = panel.shadow;
      if (this._shadowBase > 0) {
        const targetShadow = this.hold
          ? this._shadowBase * 0.25
          : this.enter
            ? this._shadowBase * 1.4
            : this._shadowBase;
        this._shadow =
          this._shadow === undefined
            ? targetShadow
            : Tween.approach(this._shadow, targetShadow, this.animSpeed);
        panel.shadow = this._shadow;
      }
    }

    return this.hold || this.enter || block;
  }

  /** @param {UIElement} element */
  onDestroy(element) {
    if (this.hold) this.onUp();
    if (this.enter) this.onLeave();
  }

  // UINav: confirm fires the click; presence marks element focusable.
  /** @param {UIElement} element */
  navActivate(element) {
    if (!this._disabled()) this.onClick();
  }
};
