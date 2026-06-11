// GemsUI kit showcase — a non-gameplay scene that exercises every widget in the
// kit so the look-and-feel can be eyeballed in one place. Organised into tab pages
// (gemsTabs): Widgets, Inputs & Values, Containers. Each page that overflows the
// display/2 (~540px) GUI clamp is wrapped in a gemsScroll, so tabs + scroll compose
// to keep every section reachable. Pure UI — no world/renderer; obj_game already
// ticks and draws the UI globally, so there's no step()/draw().

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

    // ── Tab: Widgets (buttons + toggles), scrolled ──
    const widgets = gemsScroll({ height: 250 });
    widgets.scrollBody.insertChild(this._buttonsSection());
    widgets.scrollBody.insertChild(this._togglesSection());

    // ── Tab: Inputs & Values (text fields + value controls), scrolled ──
    const values = gemsScroll({ height: 250 });
    values.scrollBody.insertChild(this._fieldsSection());
    values.scrollBody.insertChild(this._controlsSection());

    // ── Tab: Containers (nine-slice skin + scroll list), two columns ──
    const containers = this._twoCol(this._skinSection(), this._scrollSection());

    this.ui.insertChild(
      gemsTabs(
        [
          { label: I18n.textRef("UIKIT_TAB_WIDGETS"), content: widgets },
          { label: I18n.textRef("UIKIT_TAB_VALUES"), content: values },
          { label: I18n.textRef("UIKIT_TAB_CONTAINERS"), content: containers },
        ],
        { height: 250 },
      ),
    );

    this.ui.insertChild(
      gemsButton(I18n.textRef("UIKIT_BACK"), () => openScene(SCENES.lobby), {
        tooltip: I18n.textRef("UIKIT_TIP_BACK"),
      }),
    );
  }

  // Two equal columns (flexGrow:1, flexBasis:0 share the width evenly).
  _twoCol(leftChild, rightChild) {
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
    left.insertChild(leftChild);
    right.insertChild(rightChild);
    cols.insertChild(left);
    cols.insertChild(right);
    return cols;
  }

  _buttonsSection() {
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
    bar.insertChild(
      gemsButton(
        I18n.textRef("UIKIT_BTN_DIALOG"),
        () =>
          gemsModal({
            title: I18n.text("UIKIT_DIALOG_TITLE"),
            body: I18n.text("UIKIT_DIALOG_BODY"),
            buttons: [
              { label: I18n.text("UIKIT_DIALOG_CANCEL") },
              {
                label: I18n.text("UIKIT_DIALOG_OK"),
                primary: true,
                onClick: () => this.clicks++,
              },
            ],
          }),
        { width: 150, tooltip: I18n.textRef("UIKIT_TIP_DIALOG") },
      ),
    );
    buttons.insertChild(bar);
    buttons.insertChild(
      gemsLabel(() => I18n.text("UIKIT_CLICKS") + " " + this.clicks, {
        color: GemsTheme.textMuted,
      }),
    );
    return buttons;
  }

  _togglesSection() {
    const toggles = gemsSection(I18n.textRef("UIKIT_TOGGLES"));
    toggles.insertChild(
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
    toggles.insertChild(
      gemsCheckbox(
        I18n.textRef("UIKIT_CHECK"),
        () => this.checkOn,
        () => (this.checkOn = !this.checkOn),
        { tooltip: I18n.textRef("UIKIT_TIP_CHECK") },
      ),
    );
    toggles.insertChild(
      gemsCheckbox(
        I18n.textRef("UIKIT_SWITCH"),
        () => this.switchOn,
        () => (this.switchOn = !this.switchOn),
        { style: "switch", tooltip: I18n.textRef("UIKIT_TIP_SWITCH") },
      ),
    );
    return toggles;
  }

  _fieldsSection() {
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
    return fields;
  }

  _controlsSection() {
    const controls = gemsSection(I18n.textRef("UIKIT_CONTROLS"));

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
    controls.insertChild(
      gemsRow(
        I18n.textRef("UIKIT_PROGRESS"),
        gemsProgress(() => this.sliderVal / 100, {
          label: () => Math.round(this.sliderVal) + "%",
          tooltip: I18n.textRef("UIKIT_TIP_PROGRESS"),
        }),
      ),
    );
    return controls;
  }

  // The box background is spr_uibox drawn nine-sliced, so its border stays crisp
  // while the body stretches to fill the column.
  _skinSection() {
    const skin = gemsSection(I18n.textRef("UIKIT_SKIN"));
    const box = gemsNineSlice();
    box.insertChild(
      gemsLabel(I18n.textRef("UIKIT_SKIN_BODY"), { color: GemsTheme.text }),
    );
    skin.insertChild(box);
    return skin;
  }

  // A list taller than its 160px window — the scroll keystone, here nested under a
  // tab page.
  _scrollSection() {
    const scrollSec = gemsSection(I18n.textRef("UIKIT_SCROLL"));
    const sc = gemsScroll({ height: 160 });
    for (let i = 1; i <= 12; i++) {
      sc.scrollBody.insertChild(
        gemsButton(I18n.text("UIKIT_SCROLL_ITEM") + " " + i, noop, {
          width: "100%",
        }),
      );
    }
    scrollSec.insertChild(sc);
    return scrollSec;
  }

  destroy() {
    UI.remove(this.ui);
    this.ui.destroy();
  }
}
