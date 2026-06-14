/** @implements {UIComponent} */
globalThis.UIButton = class UIButton {
  constructor(btn = {}) {
    this.colorNormal = btn.colorNormal ?? c_white;
    this.colorHover = btn.colorHover ?? c_ltgray;
    this.colorPress = btn.colorPress ?? c_gray;
    this.colorDisabled = btn.colorDisabled ?? c_dkgray;
    this.alpha = btn.alpha ?? 1;
    this.alphaDisabled = btn.alphaDisabled ?? 0.5;
    this.disabled = btn.disabled ?? false;
    this.getDisabled = btn.getDisabled ?? null; // optional live () => bool; overrides `disabled`
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
    // Animated state — eased toward the target each frame so hover/press feel
    // smooth instead of snapping. Seeded on first update to avoid a fade-in.
    this._color = undefined;
    this._border = undefined;
    this._shadow = undefined;
    this._shadowBase = undefined;
  }

  // Live disabled state: a getDisabled() predicate (evaluated each frame) wins over the
  // static `disabled` flag, so a caller can gate a button on changing state (e.g. an
  // empty inventory) without poking the field every frame.
  _disabled() {
    return this.getDisabled !== null ? this.getDisabled() : this.disabled;
  }

  onUpdate(element, block) {
    const panel = element.getComponent(UIPanel);

    if (this._disabled()) {
      if (this.hold) {
        this.onUp();
        this.hold = false;
      }
      if (this.enter) {
        this.onLeave();
        this.enter = false;
      }
      if (panel) {
        this._color = this.colorDisabled;
        panel.color = this.colorDisabled;
        panel.alpha = this.alphaDisabled;
      }
      return block;
    }

    const pressed = mouse_check_button_pressed(mb_left);
    const released = mouse_check_button_released(mb_left);
    const mx = device_mouse_x_to_gui(0);
    const my = device_mouse_y_to_gui(0);
    const enterPrev = this.enter;
    this.enter = !block && element.positionMeeting(mx, my);

    if (this.enter) {
      if (!enterPrev) this.onEnter();
      if (pressed) {
        this.hold = true;
        this.onDown();
      }
    } else if (enterPrev) {
      this.onLeave();
    }

    if (released) {
      if (this.hold) {
        this.onUp();
        if (this.enter) this.onClick();
      }
      this.hold = false;
    }

    if (panel) {
      // Frame-rate independent easing toward the current state's target values, via
      // Tween.approach* (Time.raw wall-clock by default — UI must ignore Time.scale so
      // menus don't slow / freeze when the sim is time-dilated or paused). Each value
      // is seeded to its target on the first frame so there's no fade-in from black.
      panel.alpha = this.alpha;

      const targetColor = this.hold
        ? this.colorPress
        : this.enter
          ? this.colorHover
          : this.colorNormal;
      this._color =
        this._color === undefined
          ? targetColor
          : Tween.approachColor(this._color, targetColor, this.animSpeed);
      panel.color = this._color;

      if (
        this.borderColorNormal !== undefined &&
        this.borderColorHover !== undefined
      ) {
        const targetBorder =
          this.enter || this.hold
            ? this.borderColorHover
            : this.borderColorNormal;
        this._border =
          this._border === undefined
            ? targetBorder
            : Tween.approachColor(this._border, targetBorder, this.animSpeed);
        panel.borderColor = this._border;
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

  onDestroy(element) {
    if (this.hold) this.onUp();
    if (this.enter) this.onLeave();
  }

  // UINav: confirm fires the click (unless disabled). Presence of this method also
  // marks the element focusable for keyboard/gamepad navigation.
  navActivate(element) {
    if (!this._disabled()) this.onClick();
  }
};
