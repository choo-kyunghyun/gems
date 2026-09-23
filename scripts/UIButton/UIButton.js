/**
 * Button: eases its panel color and border on the unscaled clock, greys its label when disabled,
 * and publishes live disabled/selected predicates on `element.state` for sibling readers.
 * @implements {UIComponent}
 */
globalThis.UIButton = class UIButton {
  constructor(btn = {}) {
    this.colorNormal = btn.colorNormal ?? c_white;
    this.colorHover = btn.colorHover ?? c_ltgray;
    this.colorPress = btn.colorPress ?? c_gray;
    this.colorDisabled = btn.colorDisabled ?? c_dkgray;
    this.alpha = btn.alpha ?? 1;
    this.alphaDisabled = btn.alphaDisabled ?? 0.5;
    this.disabled = btn.disabled ?? false;
    this.getDisabled = btn.getDisabled ?? null; // live () => bool, overrides `disabled`
    // live () => bool for a toggle's active state; hover and press still win over it
    this.getSelected = btn.getSelected ?? null;
    this.colorSelected = btn.colorSelected;
    this.borderColorSelected = btn.borderColorSelected;
    // greyed with the panel when disabled, as the panel dim alone leaves text bright
    this.label = btn.label ?? null;
    this.textColorNormal = btn.textColorNormal ?? c_white;
    this.textColorDisabled = btn.textColorDisabled ?? c_gray;
    this.onEnter = btn.onEnter ?? noop;
    this.onLeave = btn.onLeave ?? noop;
    this.onDown = btn.onDown ?? noop;
    this.onUp = btn.onUp ?? noop;
    this.onClick = btn.onClick ?? noop;
    // the border animates only when both are set
    this.borderColorNormal = btn.borderColorNormal;
    this.borderColorHover = btn.borderColorHover;
    this.animSpeed = btn.animSpeed ?? 16; // per-second lerp rate
    // callbacks are live closures, so reassigning a handler after construction keeps working
    this._fsm = new UITrigger({
      onEnter: () => this.onEnter(),
      onLeave: () => this.onLeave(),
      onDown: () => this.onDown(),
      onUp: () => this.onUp(),
      onClick: () => {
        Audio.play({ sound: sndButtonClick }); // before onClick, which may swap the level
        this.onClick();
      },
    });
    // float channels, not a packed int: a packed-int lerp loses a sub-1 per-frame step at
    // unlimited FPS, and merge_color drifts darker. Unseeded until first eased, so there's no
    // fade-in from black.
    this._colorCh = [undefined, 0, 0];
    this._borderCh = [undefined, 0, 0];
  }

  _disabled() {
    return this.getDisabled !== null ? this.getDisabled() : this.disabled;
  }

  _easeColor(ch, target) {
    const tr = color_get_red(target);
    const tg = color_get_green(target);
    const tb = color_get_blue(target);
    if (ch[0] === undefined) {
      ch[0] = tr;
      ch[1] = tg;
      ch[2] = tb;
    } else {
      ch[0] = approach(ch[0], tr, this.animSpeed);
      ch[1] = approach(ch[1], tg, this.animSpeed);
      ch[2] = approach(ch[2], tb, this.animSpeed);
    }
    return make_colour_rgb(round(ch[0]), round(ch[1]), round(ch[2]));
  }

  onUpdate(element, block) {
    const panel = element.getComponent(UIPanel);
    const disabled = this._disabled();
    element.state.disabled = disabled;

    if (this.label !== null) {
      this.label.color = disabled
        ? this.textColorDisabled
        : this.textColorNormal;
    }

    if (disabled) {
      // the trigger doesn't run this frame, so it can't clear its own latched state
      this._fsm.release();
      element.state.hover = false;
      element.state.held = false;
      element.state.clicked = false;
      element.state.selected = false;
      if (panel) {
        // so re-enabling eases out of the disabled color, not from black
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

      // BUG: #15549 — ternaries only, as `selected` is reused (docs/GMRT.md)
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
    }

    return result;
  }

  onDestroy(element) {
    this._fsm.onDestroy(element);
  }

  // nav confirm fires the click; its presence marks the element focusable

  navActivate(element) {
    if (!this._disabled()) this.onClick();
  }
};
