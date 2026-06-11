// GemsUI kit showcase — a non-gameplay scene that exercises every widget in the
// kit so the look-and-feel can be eyeballed in one place. The text fields are the
// focus: gemsInput wraps the rewritten UIInput (drag-select, double-click word
// select, Ctrl+A/C/X/V, key-repeat, scroll-to-caret). Pure UI — no world/renderer;
// obj_game already ticks and draws the UI globally, so there's no step()/draw().
//
// Laid out in two columns because the GUI maximises to display/2 (~540px tall on a
// 1080p monitor) — stacking every section vertically would overflow.

SceneRegistry.add(() => new _SceneUIKitClass(), {
  label: I18n.textRef("UIKIT_NAME"),
  category: "SCENE_CAT_UI",
});

class _SceneUIKitClass extends Scene {
  label = "UIKit";

  create(openScene) {
    // Live state the widgets read/write; echoed back through live textRefs.
    this.typed = "";
    this.clicks = 0;
    this.toggleOn = true;
    this.checkOn = true;
    this.switchOn = false;
    this.sliderVal = 50;
    this.qty = 3;

    this.ui = gemsRoot();
    UI.insert(this.ui);

    this.ui.insertChild(gemsHeader(I18n.textRef("UIKIT_NAME")));
    this.ui.insertChild(gemsHint(I18n.textRef("UIKIT_HINT")));

    // Two equal columns (flexGrow:1, flexBasis:0 share the width evenly).
    const cols = new UIElement({
      width: "100%",
      flexDirection: "row",
      gap: GemsTheme.gap,
    });
    const left = new UIElement({
      flexGrow: 1,
      flexBasis: 0,
      gap: GemsTheme.gap,
    });
    const right = new UIElement({
      flexGrow: 1,
      flexBasis: 0,
      gap: GemsTheme.gap,
    });
    cols.insertChild(left);
    cols.insertChild(right);
    this.ui.insertChild(cols);

    // ── Left: text fields (the UIInput showcase) ──
    const fields = gemsSection(I18n.textRef("UIKIT_FIELDS"));
    fields.insertChild(
      gemsRow(
        I18n.textRef("UIKIT_FIELD_NAME"),
        gemsInput({
          placeholder: I18n.text("UIKIT_FIELD_NAME_PH"),
          maxLength: 24,
          onChange: (v) => (this.typed = v),
        }),
      ),
    );
    fields.insertChild(
      gemsRow(
        I18n.textRef("UIKIT_FIELD_PASS"),
        gemsInput({
          placeholder: I18n.text("UIKIT_FIELD_PASS_PH"),
          mask: true,
          maxLength: 16,
        }),
      ),
    );
    fields.insertChild(
      gemsRow(
        I18n.textRef("UIKIT_FIELD_RO"),
        gemsInput({
          value: I18n.text("UIKIT_FIELD_RO_VAL"),
          readOnly: true,
          tooltip: I18n.textRef("UIKIT_TIP_RO"),
        }),
      ),
    );
    fields.insertChild(
      gemsLabel(
        () =>
          I18n.text("UIKIT_ECHO") +
          " " +
          (this.typed === "" ? "—" : this.typed),
        { color: GemsTheme.accentHi },
      ),
    );
    left.insertChild(fields);

    // ── Left: display readouts (bound live to the slider on the right) ──
    const display = gemsSection(I18n.textRef("UIKIT_DISPLAY"));
    display.insertChild(
      gemsRow(
        I18n.textRef("UIKIT_PROGRESS"),
        gemsProgress(() => this.sliderVal / 100, {
          label: () => Math.round(this.sliderVal) + "%",
          tooltip: I18n.textRef("UIKIT_TIP_PROGRESS"),
        }),
      ),
    );
    left.insertChild(display);

    // ── Left: nine-slice skin (sprite-framed panel) ──
    // The box background is spr_uibox drawn nine-sliced, so its border stays crisp
    // while the body stretches to fill the column.
    const skin = gemsSection(I18n.textRef("UIKIT_SKIN"));
    const box = gemsNineSlice();
    box.insertChild(
      gemsLabel(I18n.textRef("UIKIT_SKIN_BODY"), { color: GemsTheme.text }),
    );
    skin.insertChild(box);
    left.insertChild(skin);

    // ── Right: buttons + controls ──
    const buttons = gemsSection(I18n.textRef("UIKIT_BUTTONS"));
    const bar = gemsGrid();
    bar.insertChild(
      gemsButton(I18n.textRef("UIKIT_BTN_NORMAL"), () => this.clicks++, {
        width: 150,
        tooltip: I18n.textRef("UIKIT_TIP_NORMAL"),
      }),
    );
    bar.insertChild(
      gemsButton(I18n.textRef("UIKIT_BTN_PRIMARY"), () => this.clicks++, {
        width: 150,
        primary: true,
        tooltip: I18n.textRef("UIKIT_TIP_PRIMARY"),
      }),
    );
    buttons.insertChild(bar);
    buttons.insertChild(
      gemsLabel(() => I18n.text("UIKIT_CLICKS") + " " + this.clicks, {
        color: GemsTheme.textMuted,
      }),
    );
    right.insertChild(buttons);

    const controls = gemsSection(I18n.textRef("UIKIT_CONTROLS"));
    controls.insertChild(
      gemsToggle(
        I18n.textRef("UIKIT_TOGGLE"),
        () => this.toggleOn,
        () => (this.toggleOn = !this.toggleOn),
        {
          onText: I18n.textRef("UIKIT_ON"),
          offText: I18n.textRef("UIKIT_OFF"),
          tooltip: I18n.textRef("UIKIT_TIP_TOGGLE"),
        },
      ),
    );
    controls.insertChild(
      gemsCheckbox(
        I18n.textRef("UIKIT_CHECK"),
        () => this.checkOn,
        () => (this.checkOn = !this.checkOn),
        { tooltip: I18n.textRef("UIKIT_TIP_CHECK") },
      ),
    );
    controls.insertChild(
      gemsCheckbox(
        I18n.textRef("UIKIT_SWITCH"),
        () => this.switchOn,
        () => (this.switchOn = !this.switchOn),
        { style: "switch", tooltip: I18n.textRef("UIKIT_TIP_SWITCH") },
      ),
    );

    const slider = new UIElement({ height: 28, width: "100%" });
    slider.addComponent(
      new UISlider({
        min: 0,
        max: 100,
        value: this.sliderVal,
        step: 1,
        onChange: (v) => (this.sliderVal = v),
        track: {
          color: gemsColor(GemsTheme.btnPress),
          border: 1,
          borderColor: gemsColor(GemsTheme.border),
        },
        fill: { color: gemsColor(GemsTheme.accent) },
        thumb: {
          color: gemsColor(GemsTheme.text),
          borderColor: gemsColor(GemsTheme.accentHi),
          shadowAlpha: 0.35,
        },
      }),
    );
    controls.insertChild(
      gemsRow(
        () => I18n.text("UIKIT_SLIDER") + ": " + Math.round(this.sliderVal),
        slider,
      ),
    );

    const options = [
      { name: I18n.text("UIKIT_OPT_A"), value: 0 },
      { name: I18n.text("UIKIT_OPT_B"), value: 1 },
      { name: I18n.text("UIKIT_OPT_C"), value: 2 },
    ];
    controls.insertChild(
      gemsRow(
        I18n.textRef("UIKIT_SELECT"),
        gemsSelectCustom(options, 0, noop, {
          tooltip: I18n.textRef("UIKIT_TIP_SELECT"),
        }),
      ),
    );
    controls.insertChild(
      gemsRow(
        I18n.textRef("UIKIT_STEPPER"),
        gemsStepper(this.qty, (v) => (this.qty = v), {
          min: 0,
          max: 10,
          step: 1,
          tooltip: I18n.textRef("UIKIT_TIP_STEPPER"),
        }),
      ),
    );
    right.insertChild(controls);

    this.ui.insertChild(
      gemsButton(I18n.textRef("UIKIT_BACK"), () => openScene(SCENES.lobby), {
        tooltip: I18n.textRef("UIKIT_TIP_BACK"),
      }),
    );
  }

  destroy() {
    UI.remove(this.ui);
    this.ui.destroy();
  }
}
