// GemsUI widget showcase. pure UI — no entities/renderer/step/draw.
// tab host flex-grows; each page is a gemsScroll({ grow:true }) to reflow at any GUI size.

LevelRegistry.add(() => new _SceneUIKitClass(), {
  label: I18n.textRef("UIKIT_NAME"),
  category: "SCENE_CAT_UI",
});

/** standalone SCREEN class — duck-typed contract, see Level. */
class _SceneUIKitClass {
  label = "UIKit";

  /** @param {(factory:Function) => void} openLevel */
  create(openLevel) {
    // widget state — echoed live via textRefs
    this.typed = "";
    this.clicks = 0;
    this.toggleOn = true;
    this.checkOn = true;
    this.switchOn = false;
    this.sliderVal = 50;
    this.qty = 3;
    this.toastN = 0;
    this.selSlot = -1;
    this.tableSel = null;

    // demo actions the rebind rows retarget
    Input.register(
      "uikit_jump",
      new InputAction().bindButton(INPUT_SOURCE.KEYBOARD, vk_space),
    );
    Input.register(
      "uikit_fire",
      new InputAction().bindButton(INPUT_SOURCE.KEYBOARD, ord("F")),
    );

    // reset QuestLog first to clear any state a gameplay level left; must run before
    // the tracker widget, which reads QuestLog at construction
    this._setupQuests();

    this.ui = gemsRoot();
    UI.insert(this.ui);

    this.ui.insertChild(gemsHeader(I18n.textRef("UIKIT_NAME")));
    this.ui.insertChild(gemsHint(I18n.textRef("UIKIT_HINT")));
    this.ui.insertChild(gemsHint(I18n.textRef("UIKIT_NAV_HINT")));

    // Widgets tab
    const widgets = gemsScroll({ grow: true });
    widgets.scrollBody.insertChild(this._buttonsSection());
    widgets.scrollBody.insertChild(this._togglesSection());
    widgets.scrollBody.insertChild(this._richTextSection());
    widgets.scrollBody.insertChild(this._motionSection());
    widgets.scrollBody.insertChild(this._questSection());

    // Inputs & Values tab
    const values = gemsScroll({ grow: true });
    values.scrollBody.insertChild(this._fieldsSection());
    values.scrollBody.insertChild(this._controlsSection());
    values.scrollBody.insertChild(this._rebindSection());
    values.scrollBody.insertChild(this._vkSection());

    // Containers tab — left column scrolls so accordion sections can't overflow
    const left = gemsScroll({ grow: true });
    left.scrollBody.insertChild(this._skinSection());
    left.scrollBody.insertChild(this._accordionSection());
    const containers = this._twoCol(left, this._scrollSection());

    // Inventory tab
    const inventory = gemsScroll({ grow: true });
    inventory.scrollBody.insertChild(this._inventorySection());

    // Table tab — table self-scrolls, no enclosing gemsScroll needed
    const table = this._tableTab();

    this.ui.insertChild(
      gemsTabs(
        [
          { label: I18n.textRef("UIKIT_TAB_WIDGETS"), content: widgets },
          { label: I18n.textRef("UIKIT_TAB_VALUES"), content: values },
          { label: I18n.textRef("UIKIT_TAB_CONTAINERS"), content: containers },
          { label: I18n.textRef("UIKIT_TAB_INVENTORY"), content: inventory },
          { label: I18n.textRef("UIKIT_TAB_TABLE"), content: table },
        ],
        { grow: true },
      ),
    );

    this.ui.insertChild(
      gemsButton(I18n.textRef("UIKIT_BACK"), () => openLevel(LEVELS.lobby), {
        tooltip: I18n.textRef("UIKIT_TIP_BACK"),
      }),
    );
  }

  /**
   * flexGrow:1/flexBasis:0 shares width evenly; row grows so scroll children fill the host
   * @param {UIElement} leftChild
   * @param {UIElement} rightChild
   * @returns {UIElement}
   */
  _twoCol(leftChild, rightChild) {
    const cols = new UIElement({
      width: "100%",
      flexGrow: 1,
      flexBasis: 0,
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

  /** @returns {UIElement} */
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

  /** @returns {UIElement} */
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

  /**
   * UIRichText: colored spans + inline icons. markup is i18n so it localizes.
   * fixed-height rows for uniform spacing (UIRichText self-sizes but we override here).
   * @returns {UIElement}
   */
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

  /**
   * same ping-pong clock through different easing curves to show Tween curve differences
   * @returns {UIElement}
   */
  _motionSection() {
    const sec = gemsSection(I18n.textRef("UIKIT_MOTION"));
    // wall-clock ping-pong [0,1] over ~3.6 s
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

  /** fixed progress for a representative mix: one ready, one partial, two untouched */
  _setupQuests() {
    QuestLog.reset().register([
      {
        id: "uikit_q1",
        name: "UIKIT_Q1_NAME",
        objLabel: "UIKIT_Q1_OBJ",
        objectives: [{ kind: "kill", target: "goblin", count: 5 }],
      },
      {
        id: "uikit_q2",
        name: "UIKIT_Q2_NAME",
        objLabel: "UIKIT_Q2_OBJ",
        objectives: [{ kind: "collect", target: "moonherb", count: 3 }],
      },
      {
        id: "uikit_q3",
        name: "UIKIT_Q3_NAME",
        objLabel: "UIKIT_Q3_OBJ",
        objectives: [{ kind: "reach", target: "tower", count: 1 }],
      },
      {
        id: "uikit_q4",
        name: "UIKIT_Q4_NAME",
        objLabel: "UIKIT_Q4_OBJ",
        objectives: [{ kind: "talk", target: "sage", count: 1 }],
      },
    ]);
    QuestLog.accept("uikit_q1");
    QuestLog.accept("uikit_q2");
    QuestLog.accept("uikit_q3");
    QuestLog.accept("uikit_q4");
    QuestLog.report("kill", "goblin", 5); // q1 → ready
    QuestLog.report("collect", "moonherb", 2); // q2 → 2/3
  }

  /**
   * placed directly in the section — widgets tab already scrolls; a second clip surface
   * would lose draw_text's matrix offset (see CLAUDE.md). one enclosing scroll is enough.
   * @returns {UIElement}
   */
  _questSection() {
    const sec = gemsSection(I18n.textRef("UIKIT_QUESTS"));
    sec.insertChild(
      gemsQuestTracker({
        source: QuestLog,
        emptyText: I18n.textRef("UIKIT_QUEST_EMPTY"),
        tooltip: I18n.textRef("UIKIT_TIP_QUESTS"),
      }),
    );
    return sec;
  }

  /**
   * @param {number} height
   * @param {string|Function} markup
   * @param {Object} opts
   * @returns {UIElement}
   */
  _richRow(height, markup, opts) {
    const row = new UIElement({ width: "100%", height });
    row.insertChild(gemsRichText(markup, opts));
    return row;
  }

  /** @returns {UIElement} */
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

  /**
   * VirtualKeyboard: gemsButton keys → UINav navigable with dpad; Done commits to field
   * @returns {UIElement}
   */
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

  /**
   * UIRebind: click to arm, next key rebinds. readout shows live held state.
   * @returns {UIElement}
   */
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

  /** @returns {UIElement} */
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

    // dropdown for longer option lists — popup navigable by mouse/keyboard/gamepad
    const resolutions = [
      { name: "1280 x 720", value: 0 },
      { name: "1366 x 768", value: 1 },
      { name: "1600 x 900", value: 2 },
      { name: "1920 x 1080", value: 3 },
      { name: "2560 x 1440", value: 4 },
      { name: "3840 x 2160", value: 5 },
    ];
    controls.insertChild(
      gemsRow(
        I18n.textRef("UIKIT_DROPDOWN"),
        gemsDropdownCustom(resolutions, 3, noop, {
          tooltip: I18n.textRef("UIKIT_TIP_DROPDOWN"),
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

  /**
   * nine-sliced border stays crisp while the body stretches
   * @returns {UIElement}
   */
  _skinSection() {
    const skin = gemsSection(I18n.textRef("UIKIT_SKIN"));
    const box = gemsNineSlice();
    box.insertChild(
      gemsLabel(I18n.textRef("UIKIT_SKIN_BODY"), { color: GemsTheme.text }),
    );
    skin.insertChild(box);
    return skin;
  }

  /**
   * sortable+filterable table; Type select drives setFilter; confirm enters browse mode
   * @returns {UIElement}
   */
  _tableTab() {
    const gold = gemsColor("warn");
    const cols = [
      { label: "", width: 34, sortable: false, sprite: (r) => r.icon },
      {
        label: I18n.text("UIKIT_TABLE_NAME"),
        flex: 2,
        text: (r) => r.name,
        color: (r) => r.rarity.color,
      },
      { label: I18n.text("UIKIT_TABLE_TYPE"), flex: 1, text: (r) => r.type },
      {
        label: I18n.text("UIKIT_TABLE_RARITY"),
        flex: 1,
        text: (r) => r.rarity.name,
        color: (r) => r.rarity.color,
        sortValue: (r) => r.rarity.rank,
      },
      {
        label: I18n.text("UIKIT_TABLE_QTY"),
        width: 50,
        align: fa_right,
        text: (r) => string(r.qty),
        sortValue: (r) => r.qty,
      },
      {
        label: I18n.text("UIKIT_TABLE_WT"),
        width: 60,
        align: fa_right,
        text: (r) => string_format(r.weight, 0, 1),
        sortValue: (r) => r.weight,
      },
      {
        label: I18n.text("UIKIT_TABLE_VAL"),
        width: 76,
        align: fa_right,
        text: (r) => string(r.value),
        color: () => gold,
        sortValue: (r) => r.value,
      },
    ];

    const table = gemsTable(cols, {
      data: this._items(),
      rows: 4,
      rowH: 24,
      headerH: 28,
      sortBy: 1, // start sorted by Name
      onSelect: (row) => (this.tableSel = row),
      onActivate: (row) =>
        Toast.push(I18n.text("UIKIT_TABLE_USE") + " " + row.name, {
          type: "success",
        }),
      emptyText: I18n.text("UIKIT_TABLE_EMPTY"),
      tooltip: I18n.textRef("UIKIT_TIP_TABLE"),
    });
    const comp = table.getComponent(UITable);

    const types = [
      { name: I18n.text("UIKIT_TABLE_ALL"), value: "" },
      { name: I18n.text("UIKIT_TABLE_WEAPON"), value: "Weapon" },
      { name: I18n.text("UIKIT_TABLE_ARMOR"), value: "Armor" },
      { name: I18n.text("UIKIT_TABLE_POTION"), value: "Potion" },
      { name: I18n.text("UIKIT_TABLE_MATERIAL"), value: "Material" },
    ];

    const tab = gemsList();
    tab.insertChild(gemsHint(I18n.textRef("UIKIT_TABLE_HINT")));
    tab.insertChild(
      gemsRow(
        I18n.textRef("UIKIT_TABLE_FILTER"),
        gemsSelectCustom(types, 0, (_i, v) =>
          comp.setFilter(v === "" ? null : (r) => r.type === v),
        ),
      ),
    );
    tab.insertChild(table);
    tab.insertChild(
      gemsLabel(
        () =>
          I18n.text("UIKIT_TABLE_SELECTED") +
          " " +
          (this.tableSel === null ? "—" : this.tableSel.name),
        { color: GemsTheme.accentHi },
      ),
    );
    return tab;
  }

  /**
   * demo data spread across types/rarities to exercise sort + filter
   * @returns {Object[]}
   */
  _items() {
    const spr = asset_get_index("spr_tile16");
    const R = {
      common: { name: "Common", color: gemsColor("#9aa4b2"), rank: 0 },
      uncommon: { name: "Uncommon", color: gemsColor("#54c98a"), rank: 1 },
      rare: { name: "Rare", color: gemsColor(GemsTheme.accent), rank: 2 },
      epic: { name: "Epic", color: gemsColor("#b072ff"), rank: 3 },
      legend: { name: "Legendary", color: gemsColor("#ff9f43"), rank: 4 },
    };
    const mk = (name, type, rarity, qty, weight, value, sub) => ({
      name,
      type,
      rarity,
      qty,
      weight,
      value,
      icon: { sprite: spr, subimg: sub },
    });
    return [
      mk("Iron Sword", "Weapon", R.common, 1, 3.5, 40, 0),
      mk("Oak Shield", "Armor", R.common, 1, 5.0, 30, 1),
      mk("Health Potion", "Potion", R.common, 8, 0.3, 12, 2),
      mk("Mana Potion", "Potion", R.uncommon, 5, 0.3, 18, 3),
      mk("Steel Axe", "Weapon", R.uncommon, 1, 4.2, 75, 4),
      mk("Iron Ore", "Material", R.common, 24, 1.0, 4, 5),
      mk("Mythril Bar", "Material", R.rare, 6, 1.5, 90, 6),
      mk("Flame Blade", "Weapon", R.rare, 1, 3.8, 220, 7),
      mk("Dragon Scale", "Material", R.epic, 3, 2.0, 340, 8),
      mk("Plate Armor", "Armor", R.rare, 1, 12.0, 180, 9),
      mk("Elixir", "Potion", R.epic, 2, 0.4, 150, 10),
      mk("Shadow Cloak", "Armor", R.epic, 1, 1.8, 410, 11),
      mk("Excalibur", "Weapon", R.legend, 1, 4.0, 1200, 12),
      mk("Phoenix Feather", "Material", R.legend, 1, 0.1, 980, 13),
    ];
  }

  /**
   * two draggable 3×3 grids; cross-grid drag works; drop on empty restores to source
   * @returns {UIElement}
   */
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

  /**
   * alternating filled/empty; offset per bag so the two grids differ
   * @param {number} which
   * @returns {(Object|null)[]}
   */
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

  /** @returns {UIElement} */
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

  /**
   * A fresh body element per section (the same element can't live in two places).
   * @returns {UIElement}
   */
  _accBody() {
    const body = gemsList();
    body.insertChild(
      gemsLabel(I18n.textRef("UIKIT_ACC_BODY"), {
        color: GemsTheme.textMuted,
      }),
    );
    return body;
  }

  /**
   * A list taller than its 160px window — the scroll keystone, here nested under a
   * tab page.
   * @returns {UIElement}
   */
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

  // pure UI — no sim/world view; declared because LevelManager calls them unconditionally
  // (standalone class: these were previously inherited Level stubs)
  step() {}
  draw() {}

  destroy() {
    Input.unbindAll(["uikit_jump", "uikit_fire"]);
    UI.remove(this.ui);
    this.ui.destroy();
  }
}
