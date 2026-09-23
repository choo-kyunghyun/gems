/**
 * The app's pause overlay: a side sheet over the right half of a dimmed, still-visible scene.
 * Pause is global: while it is open the scene does not update and the time scale is forced to 0
 * each frame. F1 opens it anywhere; during gameplay (a scene's `gameplay` flag) gamepad Start
 * does too, and Esc opens it only when the scene's `handleEscape` declines the press.
 */
globalThis.GameOverlay = {
  _modal: null,
  _root: null,
  _game: null, // re-latched each update()
  _scale: 1, // the time scale to restore on resume
  // extra tabs { label, short, build } injected at boot, keeping the overlay free of scene/save
  // concerns
  _extraTabs: [],
  // boot-wired quit-target scene factory; null hides the Quit button
  quitTo: null,
  // boot-wired settings filename for Save; null hides the button
  settingsFile: null,
  // boot-wired rebindable `{ action, label }` rows in display order; null hides the section
  keymap: null,

  /**
   * Register an extra tab. `short` is the abbreviation the strip draws (`label` is its tooltip);
   * `build` runs on each open, so it reads live state.
   */
  addTab(label, short, build) {
    GameOverlay._extraTabs.push({ label, short, build });
  },

  /** Per-frame pause/open driver. */
  update(game) {
    GameOverlay._game = game;
    const scene = game.scene;

    if (GameOverlay._modal !== null) {
      if (Input.keyPressed(vk_f1) || Input.padPressed(gp_start)) {
        GameOverlay.close();
      }
      UINav.suspended = false; // overlay must stay nav-reachable over any scene
      Time.scale = 0;
      Time.delta = 0;
      Time.step = 0;
      return;
    }

    if (Input.keyPressed(vk_f1)) {
      GameOverlay.open();
      return;
    }

    // BUG: scene.gameplay is read live, never cached in a local bool — GMRT #15549 (docs/GMRT.md)
    if (scene === null || scene.gameplay !== true) return;

    if (Input.padPressed(gp_start)) {
      GameOverlay.open();
      return;
    }

    // the scene gets first refusal of Esc; the consumed-aware press lets a widget's own Esc win
    if (Input.keyPressed(vk_escape)) {
      if (scene.handleEscape !== undefined && scene.handleEscape()) {
        Input.consumeKey(vk_escape);
        UINav.suspended = true;
      } else {
        GameOverlay.open();
      }
      return;
    }

    // gamepad B is back: the same escape hook, but it never opens the menu
    if (Input.padPressed(gp_face2)) {
      if (scene.handleEscape !== undefined && scene.handleEscape()) {
        Input.consumePad(gp_face2);
        UINav.suspended = true;
        return;
      }
    }

    // gameplay owns the gamepad unless a window is open
    UINav.suspended = !InputContext.is("window");
  },

  isOpen() {
    return GameOverlay._modal !== null;
  },

  /** Open + pause (idempotent). tabIndex: 0 System, 1 Settings, 2 About. */
  open(tabIndex = 0) {
    if (GameOverlay._modal !== null) return;
    GameOverlay._scale = Time.scale;
    Time.scale = 0;
    Time.delta = 0;
    Time.step = 0;

    // percentages, not a GUI-size snapshot, so the sheet reflows on a live UI-scale change
    const root = new UIElement({
      width: "100%",
      height: "100%",
      flexDirection: "row",
      justifyContent: "flex-end",
    });
    root.addComponent(
      new UIPanel({ color: facetColor("#000000"), alpha: 0.4 }),
    );
    const modal = new UIModal({
      root,
      slide: 0,
      slideX: 48, // enters from the right edge
      onClose: () => {
        GameOverlay._modal = null;
        Time.scale = GameOverlay._scale;
      },
    });
    root.addComponent(modal);

    // square, as it meets three screen edges; opaque, as the scene's own UI text would ghost
    // through a translucent card
    const card = facetCard({
      width: "50%",
      padding: FacetTheme.pad,
      gap: FacetTheme.gapSm,
      rad: 0,
      alpha: 1,
    });
    card.addComponent(new UITrigger({})); // swallow clicks so they're not a backdrop dismiss

    const titleRow = new UIElement({
      width: "100%",
      height: 40,
      flexShrink: 0,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    });
    titleRow.insertChild(
      facetLabel(I18n.textRef("SYS_TITLE"), {
        font: "header",
        color: FacetTheme.text,
      }),
    );
    titleRow.insertChild(
      facetLabel(I18n.textRef("SYS_PAUSED"), { color: FacetTheme.accent }),
    );
    card.insertChild(titleRow);
    card.insertChild(facetDivider());

    const tabDefs = [
      {
        label: I18n.textRef("SYS_TAB_SYSTEM"),
        short: I18n.textRef("SYS_TAB_SYSTEM_ABBR"),
        content: GameOverlay._systemTab(),
      },
      {
        label: I18n.textRef("SYS_TAB_SETTINGS"),
        short: I18n.textRef("SYS_TAB_SETTINGS_ABBR"),
        content: GameOverlay._settingsTab(),
      },
      {
        label: I18n.textRef("SYS_TAB_ABOUT"),
        short: I18n.textRef("SYS_TAB_ABOUT_ABBR"),
        content: GameOverlay._aboutTab(),
      },
    ];
    for (let i = 0; i < GameOverlay._extraTabs.length; i++)
      tabDefs.push({
        label: GameOverlay._extraTabs[i].label,
        short: GameOverlay._extraTabs[i].short,
        content: GameOverlay._extraTabs[i].build(),
      });
    const tabsRoot = facetTabs(tabDefs, { grow: true, vertical: true });
    card.insertChild(tabsRoot);

    const footer = new UIElement({
      width: "100%",
      height: FacetTheme.rowH,
      flexShrink: 0,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-end",
    });
    footer.insertChild(
      facetButton(I18n.textRef("COMMON_CLOSE"), () => GameOverlay.close(), {
        primary: true,
        width: 160,
      }),
    );
    card.insertChild(footer);

    root.insertChild(card);
    UI.insert(root); // top of the stack, so it blocks lower roots
    GameOverlay._modal = modal;
    GameOverlay._root = root;
    UINav.suspended = false;
    if (tabIndex > 0) tabsRoot.tabs.select(tabIndex);
  },

  /** Animates out, restoring the time scale once closed. */
  close() {
    if (GameOverlay._modal !== null) GameOverlay._modal.close();
  },

  /**
   * Drop the open sheet and restore the time scale on a scene swap. Synchronous, not the animated
   * close, whose deferred callback would restore the outgoing scene's scale onto the next scene.
   */
  reset() {
    if (GameOverlay._modal !== null) {
      GameOverlay._modal.remove();
      Time.scale = GameOverlay._scale;
    }
    GameOverlay._modal = null;
    GameOverlay._root = null;
  },

  // Rebuild in place, staying paused, so the overlay bakes a new palette. The removal is
  // synchronous: the animated close's deferred callback would null the fresh modal.
  reopen(tabIndex = 0) {
    if (GameOverlay._modal === null) {
      GameOverlay.open(tabIndex);
      return;
    }
    const resume = GameOverlay._scale;
    GameOverlay._modal.remove();
    GameOverlay._modal = null;
    GameOverlay._root = null;
    GameOverlay.open(tabIndex); // captures the frozen scale
    GameOverlay._scale = resume;
  },

  /**
   * Live theme swap under a full-cover fade: colors bake at build time, so the scene UI and this
   * overlay are rebuilt. No-op when the mode is unchanged.
   */
  _applyTheme(mode) {
    if (mode === FacetTheme.mode) return;
    SceneTransition.start(() => {
      FacetTheme.setMode(mode);
      UINav.color = Color.parse(FacetTheme.accent);
      const game = GameOverlay._game;
      if (game !== null) {
        game.background = Color.parse(FacetTheme.bg);
        game.retheme();
      }
      UINav.reset(); // focus was on now-destroyed elements
      GameOverlay.reopen(1);
    });
  },

  _systemTab() {
    const scroll = facetScroll({ grow: true });

    const controls = facetSection(I18n.textRef("SYS_CONTROLS"));
    const bar = facetGrid();
    bar.insertChild(
      facetButton(I18n.textRef("SYS_RESUME"), () => GameOverlay.close(), {
        width: 200,
        primary: true,
      }),
    );
    if (GameOverlay.quitTo !== null)
      bar.insertChild(
        facetButton(
          I18n.textRef("SYS_QUIT"),
          () => {
            GameOverlay._game.switchTo(GameOverlay.quitTo);
            GameOverlay.close();
          },
          { width: 200 },
        ),
      );
    controls.insertChild(bar);
    scroll.scrollBody.insertChild(controls);

    return scroll;
  },

  _settingsTab() {
    const scroll = facetScroll({ grow: true });

    const volSection = facetSection(I18n.textRef("SETTINGS_VOL_TITLE"));
    // `apply` updates live audio as the slider drags; only Save persists
    const volFmt = (v) => string_format(v * 100, 0, 0) + "%";
    const volSlider = (key, apply) =>
      facetSlider({ key, min: 0, max: 1, format: volFmt, onChange: apply });
    volSection.insertChild(
      facetRow(
        I18n.textRef("SETTINGS_VOL_MASTER"),
        volSlider("volMaster", (v) => Audio.setMasterGain(v)),
        { key: "volMaster" },
      ),
    );
    volSection.insertChild(
      facetRow(
        I18n.textRef("SETTINGS_VOL_MUSIC"),
        volSlider("volMusic", (v) => Music.setGain(v)),
        { key: "volMusic" },
      ),
    );
    volSection.insertChild(
      facetRow(
        I18n.textRef("SETTINGS_VOL_SFX"),
        volSlider("volSfx", (v) => Audio.setSfxGain(v)),
        { key: "volSfx" },
      ),
    );
    scroll.scrollBody.insertChild(volSection);

    const dispSection = facetSection(I18n.textRef("SETTINGS_DISP_TITLE"));
    dispSection.insertChild(
      facetToggle(
        I18n.textRef("SETTINGS_DISP_FULLSCREEN"),
        () => Settings.get("fullscreen"),
        () => {
          Settings.set("fullscreen", !Settings.get("fullscreen"));
          Display.apply();
        },
        {
          key: "fullscreen",
          onText: I18n.textRef("COMMON_ON"),
          offText: I18n.textRef("COMMON_OFF"),
        },
      ),
    );

    const resItems = [
      { name: I18n.text("SETTINGS_DISP_RES_DEFAULT"), value: { w: 0, h: 0 } },
      { name: "1280 x 720", value: { w: 1280, h: 720 } },
      { name: "1366 x 768", value: { w: 1366, h: 768 } },
      { name: "1600 x 900", value: { w: 1600, h: 900 } },
      { name: "1920 x 1080", value: { w: 1920, h: 1080 } },
      { name: "2560 x 1440", value: { w: 2560, h: 1440 } },
    ];
    const curResW = Settings.get("resolutionW");
    const resIdx = Math.max(
      0,
      resItems.findIndex((r) => r.value.w === curResW),
    );
    dispSection.insertChild(
      facetRow(
        I18n.textRef("SETTINGS_DISP_RESOLUTION"),
        // a dropdown, not a cycler, scales as presets are added
        facetDropdown(resItems, {
          index: resIdx,
          onChange: (_i, res) => {
            Settings.set("resolutionW", res.w);
            Settings.set("resolutionH", res.h);
            Display.apply();
          },
        }),
        { key: ["resolutionW", "resolutionH"] },
      ),
    );
    dispSection.insertChild(
      facetRow(
        I18n.textRef("SETTINGS_DISP_FPS"),
        facetSelect(
          [
            { name: "30", value: 30 },
            { name: "60", value: 60 },
            { name: "120", value: 120 },
            { name: I18n.text("SETTINGS_DISP_FPS_UNLIMITED"), value: 0 },
          ],
          { key: "fpsLimit", onChange: () => Display.applyFps() },
        ),
        { key: "fpsLimit" },
      ),
    );
    dispSection.insertChild(
      facetToggle(
        I18n.textRef("SETTINGS_DISP_VSYNC"),
        () => Settings.get("vsync"),
        () => {
          Settings.set("vsync", !Settings.get("vsync"));
          Display.applyVideo();
        },
        {
          key: "vsync",
          onText: I18n.textRef("COMMON_ON"),
          offText: I18n.textRef("COMMON_OFF"),
        },
      ),
    );
    const aaItems = Display.aaLevels().map((lvl) => ({
      name: lvl === 0 ? I18n.text("COMMON_OFF") : lvl + "x",
      value: lvl,
    }));
    dispSection.insertChild(
      facetRow(
        I18n.textRef("SETTINGS_DISP_AA"),
        facetSelect(aaItems, {
          key: "antialias",
          onChange: () => Display.applyVideo(),
        }),
        { key: "antialias" },
      ),
    );
    scroll.scrollBody.insertChild(dispSection);

    const uiSection = facetSection(I18n.textRef("SETTINGS_UI_TITLE"));
    uiSection.insertChild(
      facetRow(
        I18n.textRef("SETTINGS_UI_SCALE"),
        facetSlider({
          key: "uiScale",
          min: 0.5,
          max: 2,
          step: 0.1,
          onChange: (v) => UI.applyScale(v),
        }),
        { key: "uiScale" },
      ),
    );
    // world chroma is read live every frame, so it needs no onChange
    uiSection.insertChild(
      facetRow(
        I18n.textRef("SETTINGS_WORLD_CHROMA"),
        facetSlider({ key: "worldChroma", min: 0, max: 1, step: 0.05 }),
        { key: "worldChroma" },
      ),
    );
    scroll.scrollBody.insertChild(uiSection);

    const themeSection = facetSection(I18n.textRef("SETTINGS_THEME_TITLE"));
    const themeItems = [
      { name: I18n.text("SETTINGS_THEME_DARK"), value: "dark" },
      { name: I18n.text("SETTINGS_THEME_LIGHT"), value: "light" },
    ];
    themeSection.insertChild(
      facetRow(
        I18n.textRef("SETTINGS_THEME_LABEL"),
        facetSelect(themeItems, {
          key: "theme",
          onChange: (_i, value) => GameOverlay._applyTheme(value),
        }),
        { key: "theme" },
      ),
    );
    scroll.scrollBody.insertChild(themeSection);

    const langSection = facetSection(I18n.textRef("SETTINGS_LANG_TITLE"));
    const langItems = [
      { name: I18n.text("LANG_EN_US"), value: "en-US" },
      { name: I18n.text("LANG_KO_KR"), value: "ko-KR" },
    ];
    langSection.insertChild(
      facetRow(
        I18n.textRef("SETTINGS_LANG_LABEL"),
        // live text refs update in place; only the locale font is re-adopted
        facetSelect(langItems, {
          key: "language",
          onChange: (_i, value) => {
            I18n.load("i18n/" + value + "/manifest.json");
            draw_set_font(I18n.font("default"));
          },
        }),
        { key: "language" },
      ),
    );
    scroll.scrollBody.insertChild(langSection);

    // bindings apply live; Save persists them with the rest
    if (GameOverlay.keymap !== null) {
      const keySection = facetSection(I18n.textRef("SETTINGS_KEYS_TITLE"));
      const prompt = I18n.textRef("SETTINGS_KEYS_PROMPT");
      GameOverlay.keymap.forEach((row) => {
        keySection.insertChild(
          facetRow(row.label, facetRebind(row.action, { prompt }), {
            key: () => Input.rebinds[row.action] !== undefined,
          }),
        );
      });
      const resetRow = new UIElement({
        width: "100%",
        height: FacetTheme.rowH,
        flexShrink: 0,
        flexDirection: "row",
        justifyContent: "flex-end",
      });
      resetRow.insertChild(
        facetButton(
          I18n.textRef("SETTINGS_KEYS_RESET"),
          () => Input.restoreAll(),
          { width: 200 },
        ),
      );
      keySection.insertChild(resetRow);
      scroll.scrollBody.insertChild(keySection);
    }

    // debug passes read their setting live, so a row only flips it and reaches no scene
    if (DEV_MODE) {
      const debugSection = facetSection(I18n.textRef("SETTINGS_DEBUG_TITLE"));
      debugSection.insertChild(
        facetToggle(
          I18n.textRef("SETTINGS_DEBUG_BBOX"),
          () => Settings.get("debugBBox"),
          () => Settings.set("debugBBox", !Settings.get("debugBBox")),
          {
            key: "debugBBox",
            onText: I18n.textRef("COMMON_ON"),
            offText: I18n.textRef("COMMON_OFF"),
          },
        ),
      );
      scroll.scrollBody.insertChild(debugSection);
    }

    // settings persist only on an explicit Save
    if (GameOverlay.settingsFile !== null) {
      const saveRow = new UIElement({
        width: "100%",
        height: FacetTheme.rowH,
        flexShrink: 0,
        flexDirection: "row",
        justifyContent: "flex-end",
      });
      saveRow.insertChild(
        facetButton(
          I18n.textRef("SETTINGS_SAVE"),
          () => {
            Settings.save(GameOverlay.settingsFile);
            InputPreset.save();
          },
          { width: 160 },
        ),
      );
      scroll.scrollBody.insertChild(saveRow);
    }

    return scroll;
  },

  _aboutTab() {
    const scroll = facetScroll({ grow: true });
    const card = facetSection(null); // inside the sheet, so no card of its own

    const lines = [
      [I18n.textRef("CREDITS_NAME"), FacetTheme.text],
      [I18n.textRef("CREDITS_TAGLINE"), FacetTheme.textMuted],
      [() => "", "#000000"],
      [I18n.textRef("CREDITS_DEV"), FacetTheme.textMuted],
      [I18n.textRef("CREDITS_ENGINE"), FacetTheme.textMuted],
      [I18n.textRef("CREDITS_LIBS"), FacetTheme.textMuted],
    ];
    for (let i = 0; i < lines.length; i++) {
      const row = new UIElement({
        width: "100%",
        height: FacetTheme.lineH,
        flexShrink: 0,
      });
      row.insertChild(facetLabel(lines[i][0], { color: lines[i][1] }));
      card.insertChild(row);
    }
    scroll.scrollBody.insertChild(card);
    return scroll;
  },
};
