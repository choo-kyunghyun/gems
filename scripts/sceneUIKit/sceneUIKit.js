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
    this.toastN = 0;
    this.selSlot = -1;

    // Demo Input actions the rebind rows retarget; held state is echoed live below.
    Input.register(
      "uikit_jump",
      new InputAction().bindButton(INPUT_SOURCE.KEYBOARD, vk_space),
    );
    Input.register(
      "uikit_fire",
      new InputAction().bindButton(INPUT_SOURCE.KEYBOARD, ord("F")),
    );

    this.ui = gemsRoot();
    UI.insert(this.ui);

    this.ui.insertChild(gemsHeader(I18n.textRef("UIKIT_NAME")));
    this.ui.insertChild(gemsHint(I18n.textRef("UIKIT_HINT")));
    this.ui.insertChild(gemsHint(I18n.textRef("UIKIT_NAV_HINT")));

    // ── Tab: Widgets (buttons + toggles), scrolled ──
    const widgets = gemsScroll({ height: 250 });
    widgets.scrollBody.insertChild(this._buttonsSection());
    widgets.scrollBody.insertChild(this._togglesSection());
    widgets.scrollBody.insertChild(this._richTextSection());
    widgets.scrollBody.insertChild(this._motionSection());

    // ── Tab: Inputs & Values (text fields + value controls), scrolled ──
    const values = gemsScroll({ height: 250 });
    values.scrollBody.insertChild(this._fieldsSection());
    values.scrollBody.insertChild(this._controlsSection());
    values.scrollBody.insertChild(this._rebindSection());
    values.scrollBody.insertChild(this._vkSection());

    // ── Tab: Containers (nine-slice skin + accordion | scroll list) ──
    // Left column scrolls so expanding accordion sections can't overflow the host.
    const left = gemsScroll({ height: 250 });
    left.scrollBody.insertChild(this._skinSection());
    left.scrollBody.insertChild(this._accordionSection());
    const containers = this._twoCol(left, this._scrollSection());

    // ── Tab: Inventory (slot grid with selection), scrolled ──
    const inventory = gemsScroll({ height: 250 });
    inventory.scrollBody.insertChild(this._inventorySection());

    this.ui.insertChild(
      gemsTabs(
        [
          { label: I18n.textRef("UIKIT_TAB_WIDGETS"), content: widgets },
          { label: I18n.textRef("UIKIT_TAB_VALUES"), content: values },
          { label: I18n.textRef("UIKIT_TAB_CONTAINERS"), content: containers },
          { label: I18n.textRef("UIKIT_TAB_INVENTORY"), content: inventory },
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
    const toastTypes = ["info", "success", "warn", "error"];
    bar.insertChild(
      gemsButton(
        I18n.textRef("UIKIT_BTN_TOAST"),
        () => {
          const type = toastTypes[this.toastN % toastTypes.length];
          this.toastN++;
          Toast.push(I18n.text("UIKIT_TOAST_MSG") + " #" + this.toastN, {
            type,
          });
        },
        { width: 150, tooltip: I18n.textRef("UIKIT_TIP_TOAST") },
      ),
    );
    bar.insertChild(
      gemsButton(
        I18n.textRef("UIKIT_BTN_SAY"),
        () =>
          Dialogue.start([
            I18n.text("UIKIT_SAY_1"),
            {
              speaker: I18n.text("UIKIT_SAY_SPEAKER"),
              text: I18n.text("UIKIT_SAY_2"),
            },
            {
              speaker: I18n.text("UIKIT_SAY_SPEAKER"),
              text: I18n.text("UIKIT_SAY_3"),
            },
          ]),
        { width: 150, tooltip: I18n.textRef("UIKIT_TIP_SAY") },
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

  // UIRichText: colored spans ([c=name]/[c=#hex]) + inline icons ([spr=…]) in one
  // string. The markup is an i18n value so it localizes; the rarity/keybind colors are
  // passed as a palette. Each line sits in an explicit-height row — UIRichText, like
  // UIText, can't self-size at runtime (flexpanel mutation is a no-op on 0.19), so a
  // fixed-height host keeps stacked lines from overlapping (the gemsModal pattern).
  _richTextSection() {
    const sec = gemsSection(I18n.textRef("UIKIT_RICH"));
    sec.insertChild(
      this._richRow(40, I18n.textRef("UIKIT_RICH_LOOT"), {
        iconSize: 20,
        palette: {
          legendary: "#ff9f43",
          rare: GemsTheme.accent,
          dmg: "#ff5555",
        },
      }),
    );
    sec.insertChild(
      this._richRow(24, I18n.textRef("UIKIT_RICH_HELP"), {
        color: GemsTheme.textMuted,
        palette: { key: "#ffd86b" },
      }),
    );
    return sec;
  }

  // Tween demo: the same 0→1→0 ping-pong clock fed through different easing curves,
  // so the bars pace differently (linear = constant, others ease) — the visible proof
  // of the Tween curve library. Every gemsButton above also eases its hover color via
  // Tween.approachColor, so the helper is exercised live across the whole scene.
  _motionSection() {
    const sec = gemsSection(I18n.textRef("UIKIT_MOTION"));
    // Wall-clock ping-pong in [0,1] over ~3.6s — no scene state needed.
    const clock = () => {
      const t = (current_time % 3600) / 1800; // 0..2
      return t < 1 ? t : 2 - t; // fold to 0..1..0
    };
    sec.insertChild(
      gemsRow(
        I18n.textRef("UIKIT_MOTION_LINEAR"),
        gemsProgress(() => Tween.linear(clock())),
      ),
    );
    sec.insertChild(
      gemsRow(
        I18n.textRef("UIKIT_MOTION_OUT"),
        gemsProgress(() => Tween.easeOutCubic(clock())),
      ),
    );
    sec.insertChild(
      gemsRow(
        I18n.textRef("UIKIT_MOTION_INOUT"),
        gemsProgress(() => Tween.easeInOutQuad(clock())),
      ),
    );
    return sec;
  }

  _richRow(height, markup, opts) {
    const row = new UIElement({ width: "100%", height });
    row.insertChild(gemsRichText(markup, opts));
    return row;
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

  // VirtualKeyboard: a field plus a button that opens the on-screen keyboard bound to
  // it. The keyboard's keys are gemsButtons, so it's fully gamepad/keyboard navigable
  // (UINav) — type with the dpad, Done commits into the field.
  _vkSection() {
    const sec = gemsSection(I18n.textRef("UIKIT_VK"));
    const field = gemsInput({
      placeholder: I18n.text("UIKIT_VK_FIELD"),
      maxLength: 24,
    });
    const input = field.getComponent(UIInput);
    sec.insertChild(gemsRow(I18n.textRef("UIKIT_VK_FIELD"), field));
    sec.insertChild(
      gemsButton(
        I18n.textRef("UIKIT_VK_OPEN"),
        () => VirtualKeyboard.open(input),
        { tooltip: I18n.textRef("UIKIT_TIP_VK") },
      ),
    );
    return sec;
  }

  // UIRebind: click a row to arm "press a key…", then the next key rebinds that
  // action. The readout reads Input.get(...).down() live, so after rebinding you can
  // hold the new key and watch the action light up.
  _rebindSection() {
    const sec = gemsSection(I18n.textRef("UIKIT_REBIND"));
    const prompt = I18n.textRef("UIKIT_REBIND_PROMPT");
    sec.insertChild(
      gemsRow(
        I18n.textRef("UIKIT_REBIND_JUMP"),
        gemsRebind("uikit_jump", {
          prompt,
          tooltip: I18n.textRef("UIKIT_TIP_REBIND"),
        }),
      ),
    );
    sec.insertChild(
      gemsRow(
        I18n.textRef("UIKIT_REBIND_FIRE"),
        gemsRebind("uikit_fire", { prompt }),
      ),
    );
    sec.insertChild(
      gemsLabel(
        () => {
          const held = [];
          if (Input.get("uikit_jump").down())
            held.push(I18n.text("UIKIT_REBIND_JUMP"));
          if (Input.get("uikit_fire").down())
            held.push(I18n.text("UIKIT_REBIND_FIRE"));
          return (
            I18n.text("UIKIT_REBIND_HELD") +
            " " +
            (held.length === 0 ? "—" : held.join(", "))
          );
        },
        { color: GemsTheme.accentHi },
      ),
    );
    return sec;
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

  // Two draggable 3×3 grids: drag items within a grid or across to the other
  // (drop on a filled slot swaps; drop on nothing returns to source; a click that
  // doesn't move selects).
  _inventorySection() {
    const sec = gemsSection(I18n.textRef("UIKIT_INV_TITLE"));
    const grids = new UIElement({
      width: "100%",
      flexDirection: "row",
      gap: GemsTheme.gap,
    });
    const elA = gemsSlots(this._bag(0), {
      cols: 3,
      cellSize: 60,
      draggable: true,
      onSelect: (i) => (this.selSlot = i),
      tooltip: I18n.textRef("UIKIT_TIP_INV"),
    });
    const elB = gemsSlots(this._bag(1), {
      cols: 3,
      cellSize: 60,
      draggable: true,
      onSelect: (i) => (this.selSlot = i),
      tooltip: I18n.textRef("UIKIT_TIP_INV"),
    });
    grids.insertChild(elA);
    grids.insertChild(elB);
    sec.insertChild(grids);
    sec.insertChild(
      gemsLabel(
        () =>
          I18n.text("UIKIT_INV_SELECTED") +
          " " +
          (this.selSlot < 0 ? "—" : this.selSlot + 1),
        { color: GemsTheme.accentHi },
      ),
    );
    return sec;
  }

  // 9 slots; alternating filled/empty (offset per bag so the two differ).
  _bag(which) {
    const icon = asset_get_index("spr_tile16");
    const items = [];
    for (let i = 0; i < 9; i++) {
      if ((i + which) % 2 === 0)
        items.push({
          sprite: icon,
          subimg: (i + which * 3) % 16,
          count: (i % 4) + 1,
        });
      else items.push(null);
    }
    return items;
  }

  _accordionSection() {
    const sec = gemsSection(I18n.textRef("UIKIT_ACCORDION"));
    sec.insertChild(
      gemsAccordion([
        {
          title: I18n.textRef("UIKIT_ACC_DISPLAY"),
          open: true,
          content: this._accBody(),
        },
        { title: I18n.textRef("UIKIT_ACC_AUDIO"), content: this._accBody() },
        { title: I18n.textRef("UIKIT_ACC_GAME"), content: this._accBody() },
      ]),
    );
    return sec;
  }

  // A fresh body element per section (the same element can't live in two places).
  _accBody() {
    const body = gemsList();
    body.insertChild(
      gemsLabel(I18n.textRef("UIKIT_ACC_BODY"), {
        color: GemsTheme.textMuted,
      }),
    );
    return body;
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
    Input.unbindAll(["uikit_jump", "uikit_fire"]);
    UI.remove(this.ui);
    this.ui.destroy();
  }
}
