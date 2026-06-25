// Clickable button behavior over a UIElement (usually paired with a UIPanel + UIText). Runs a
// hover/press state machine firing onEnter/Leave/Down/Up/Click, and eases the panel's
// color/border/shadow between states on Time.raw (UI ignores Time.scale). Supports live
// disabled + selected predicates and greys an attached label when disabled.
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
    this.getDisabled = btn.getDisabled ?? null; // optional live () => bool; overrides `disabled`
    // Optional "selected/active" state — a live () => bool. While selected (and not
    // hovered/pressed) the panel/border ease toward colorSelected/borderColorSelected
    // instead of the normal colors, so a toggle button can show it's the active choice
    // (the category-bar / build-palette use this). Both colorSelected and the predicate
    // must be set for it to apply; hover/press still win on top.
    this.getSelected = btn.getSelected ?? null;
    this.colorSelected = btn.colorSelected;
    this.borderColorSelected = btn.borderColorSelected;
    // Optional label UIText to grey out alongside the panel when disabled. The button
    // drives its color so a disabled button reads disabled (panel dim alone left the
    // text fully bright). Both colors must be set for it to apply.
    this.label = btn.label ?? null;
    this.textColorNormal = btn.textColorNormal ?? c_white;
    this.textColorDisabled = btn.textColorDisabled ?? c_gray;
    this.onEnter = btn.onEnter ?? noop;
    this.onLeave = btn.onLeave ?? noop;
    this.onDown = btn.onDown ?? noop;
    this.onUp = btn.onUp ?? noop;
    this.onClick = btn.onClick ?? noop;
    // Optional border colors → the panel's outline glows toward `borderColorHover`
    // while the cursor is over the button. Both must be set to animate.
    this.borderColorNormal = btn.borderColorNormal;
    this.borderColorHover = btn.borderColorHover;
    // Per-second lerp rate for the hover/press easing (higher = snappier).
    this.animSpeed = btn.animSpeed ?? 16;
    this.enter = false;
    this.hold = false;
    // Animated state — eased toward the target each frame so hover/press feel smooth instead of
    // snapping. Fill + border are eased as FLOAT [r,g,b] channels (rounded to the panel int each
    // frame by _easeColor), not a packed int: a packed-int lerp loses a sub-1 per-frame step, so
    // at unlimited FPS the tween would freeze (and GMRT's merge_color also drifts darker). ch[0]
    // === undefined until first seeded → no fade-in. `_shadow` is already a plain float ease.
    this._colorCh = [undefined, 0, 0];
    this._borderCh = [undefined, 0, 0];
    this._shadow = undefined;
    this._shadowBase = undefined;
  }

  // Live disabled state: a getDisabled() predicate (evaluated each frame) wins over the
  // static `disabled` flag, so a caller can gate a button on changing state (e.g. an
  // empty inventory) without poking the field every frame.
  /** @returns {boolean} */
  _disabled() {
    return this.getDisabled !== null ? this.getDisabled() : this.disabled;
  }

  // Ease a float [r,g,b] channel state `ch` (mutated in place) toward a target color int and
  // return the rounded color int. Float accumulation, NOT a packed-int lerp: a sub-1 per-frame
  // step would round to a standstill at unlimited FPS (the tween freezes), and merge_color drifts
  // darker. Seeds straight to the target on the first call so there's no fade-in.
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

    // Tint the label to match the enabled/disabled state (the panel dim alone left the
    // text bright). Driven every frame off the live disabled state.
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
        // Snap the eased channels to the disabled color (so re-enabling eases out of it).
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
      // Frame-rate independent easing toward the current state's target values, via
      // Tween.approach* (Time.raw wall-clock by default — UI must ignore Time.scale so
      // menus don't slow / freeze when the sim is time-dilated or paused). Each value
      // is seeded to its target on the first frame so there's no fade-in from black.
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

      // Lift the shadow on hover, sink it on press — only if the panel casts one.
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

  /** Release any held/hovered state on teardown so onUp/onLeave still fire. @param {UIElement} element */
  onDestroy(element) {
    if (this.hold) this.onUp();
    if (this.enter) this.onLeave();
  }

  // UINav: confirm fires the click (unless disabled). Presence of this method also
  // marks the element focusable for keyboard/gamepad navigation.
  /** @param {UIElement} element */
  navActivate(element) {
    if (!this._disabled()) this.onClick();
  }
};
