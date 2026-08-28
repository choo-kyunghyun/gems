/**
 * The app's pause overlay: a side sheet filling the RIGHT half of the screen (edge to edge, sliding
 * in from the right) over a dimmed, still-visible scene.
 * Pause is global: the Game object skips scene.update() while isOpen(), and the overlay forces
 * Time.scale=0 each frame (the overlay itself runs on Time.raw).
 * UIModal blocks the underlying UI. Open triggers: F1 anywhere, gamepad Start during gameplay; Esc
 * during gameplay is context-aware (scene.handleEscape() gets first refusal). A scene opts into
 * gameplay pause/nav via this.gameplay.
 */
globalThis.GameOverlay = {
  _modal: null, // open UIModal handle, or null
  _root: null, // the open overlay's UIElement root (for a synchronous reopen on a theme swap)
  _game: null, // the Game object, re-latched each update() — owner of the scene pointer + backdrop
  _scale: 1, // Time.scale to restore on resume
  // Boot-injected extra tabs { label, short, build } appended after the built-ins — the seam that
  // keeps this overlay free of scene/save concerns (SaveGame/sceneColony). Wired once at boot via
  // addTab().
  _extraTabs: [],
  // Boot-wired quit-target scene factory (the app's lobby) — null hides the Quit button, so the
  // menu names no specific scene.
  quitTo: null,
  // Boot-wired filename the Settings tab's Save passes to Settings.save — null hides the button,
  // so the kit names no app file.
  settingsFile: null,
  // Boot-wired rebindable keymap the Settings tab lists — `{ action, label }` rows in display
  // order (PlayerSystem.keymap) — null hides the section, so the kit names no action.
  keymap: null,

  /**
   * Register an extra tab. `short` is the abbreviation the vertical strip draws (`label` is its
   * tooltip); `build` is called each open (so it reads live state).
   */
  addTab(label, short, build) {
    GameOverlay._extraTabs.push({ label, short, build });
  },

  // per-frame pause/open driver (Step_0, before UINav.update). owns UINav.suspended for gameplay
  // scenes. a scene opts in via this.gameplay = true in create() (field initializers don't run — GMRT).
  /** game: the Game controller (its `background` re-themes) */
  update(game) {
    GameOverlay._game = game;
    const scene = game.scene;

    if (GameOverlay._modal !== null) {
      // open: F1 / Start toggle closed (Esc-close handled by the UIModal)
      if (keyboard_check_pressed(vk_f1) || GameOverlay._startPressed()) {
        GameOverlay.close();
      }
      UINav.suspended = false; // overlay must stay nav-reachable over any scene
      Time.scale = 0; // freeze Time.delta consumers behind the overlay
      Time.delta = 0;
      return;
    }

    // closed. F1 opens anywhere (even a non-gameplay scene)
    if (keyboard_check_pressed(vk_f1)) {
      GameOverlay.open();
      return;
    }

    // gameplay-only below. read scene.gameplay LIVE — never cache into a local bool (the &&-clobber
    // quirk, #15549).
    if (scene === null || scene.gameplay !== true) return;

    // gamepad Start opens the pause menu directly
    if (GameOverlay._startPressed()) {
      GameOverlay.open();
      return;
    }

    // Esc during gameplay: scene.handleEscape() gets first refusal (close window / exit build);
    // opens the menu only if unconsumed (so F1/Start stay the always-on pause). UI.keyPressed,
    // not the raw edge — this runs after UI.update, so a widget's own Esc (a field blur) is spent.
    if (UI.keyPressed(vk_escape)) {
      if (scene.handleEscape !== undefined && scene.handleEscape()) {
        UINav.suspended = true; // consumed; menu stays closed
      } else {
        GameOverlay.open();
      }
      return;
    }

    // gamepad B = back: same handleEscape hook as Esc but never opens the menu. B is also UINav's
    // cancel, so in a window it disengages focus AND closes it.
    if (gamepad_is_connected(0) && gamepad_button_check_pressed(0, gp_face2)) {
      if (scene.handleEscape !== undefined && scene.handleEscape()) {
        UINav.suspended = true; // consumed
        return;
      }
    }

    // gameplay owns the gamepad unless a window is open: suspend menu nav during free-roam/build (left
    // stick moves the player), un-suspend when a window is open so the controller can navigate it.
    UINav.suspended = !InputContext.is("window");
  },

  _startPressed() {
    return gamepad_is_connected(0) && gamepad_button_check_pressed(0, gp_start);
  },

  isOpen() {
    // METHOD not a getter — house style, not a runtime dodge.
    return GameOverlay._modal !== null;
  },

  /** Open + pause (idempotent). tabIndex: 0 System, 1 Settings, 2 About. */
  open(tabIndex = 0) {
    if (GameOverlay._modal !== null) return;
    GameOverlay._scale = Time.scale; // remember live speed to restore on resume
    Time.scale = 0;
    Time.delta = 0;

    // percentages throughout (not a snapshot of display_get_gui_*()) so the sheet reflows on a
    // live uiScale resize. The root is the dim backdrop; the sheet is its right-aligned child.
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
      slide: 0, // no vertical rise —
      slideX: 48, // — the sheet enters from the right edge
      onClose: () => {
        GameOverlay._modal = null;
        Time.scale = GameOverlay._scale; // resume at the chosen speed
      },
    });
    root.addComponent(modal);

    // the sheet: the right half, full height, square (it meets three screen edges). Opaque — it
    // fronts the scene's own UI (lobby / kit), whose text would ghost through a translucent card.
    const card = facetCard({
      width: "50%",
      padding: FacetTheme.pad,
      gap: FacetTheme.gapSm,
      rad: 0,
      alpha: 1,
    });
    card.addComponent(new UITrigger({})); // swallow clicks so they're not a backdrop dismiss

    // title row: name left, "Paused" badge right
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

    // icon-less activity bar: each tab draws its abbreviation, the full label is its tooltip
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
    // Boot-injected tabs (Save/Load) after the built-ins; built fresh each open so they read live state
    for (let i = 0; i < GameOverlay._extraTabs.length; i++)
      tabDefs.push({
        label: GameOverlay._extraTabs[i].label,
        short: GameOverlay._extraTabs[i].short,
        content: GameOverlay._extraTabs[i].build(),
      });
    const tabsRoot = facetTabs(tabDefs, { grow: true, vertical: true });
    card.insertChild(tabsRoot);

    // footer: a universal Close (Esc / backdrop also close)
    const footer = new UIElement({
      width: "100%",
      height: 44,
      flexShrink: 0,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-end",
    });
    footer.insertChild(
      facetButton(I18n.textRef("SETTINGS_CLOSE"), () => GameOverlay.close(), {
        primary: true,
        width: 160,
      }),
    );
    card.insertChild(footer);

    root.insertChild(card);
    UI.insert(root); // top of the stack → blocks lower roots, draws last
    GameOverlay._modal = modal;
    GameOverlay._root = root;
    UINav.suspended = false;
    if (tabIndex > 0) tabsRoot.tabs.select(tabIndex); // e.g. Credits → About (index 2)
  },

  /** UIModal animates out, then restores Time.scale via onClose. */
  close() {
    if (GameOverlay._modal !== null) GameOverlay._modal.close();
  },

  /** force-close + restore time scale on a scene swap. */
  reset() {
    if (GameOverlay._modal !== null) {
      GameOverlay._modal.close();
      Time.scale = GameOverlay._scale;
    }
    GameOverlay._modal = null;
    GameOverlay._root = null;
  },

  // Rebuild the overlay in place (after a live theme swap) so it bakes the new palette. Removes the
  // current root SYNCHRONOUSLY — not the animated close(), whose deferred onClose would null the
  // fresh modal + recapture the (frozen) time scale — then reopens on the same tab, staying paused.
  reopen(tabIndex = 0) {
    if (GameOverlay._modal === null) {
      GameOverlay.open(tabIndex);
      return;
    }
    const resume = GameOverlay._scale; // preserve the real resume speed across the rebuild
    UI.remove(GameOverlay._root);
    GameOverlay._root.destroy();
    GameOverlay._modal = null;
    GameOverlay._root = null;
    GameOverlay.open(tabIndex); // re-captures _scale from the now-frozen live scale…
    GameOverlay._scale = resume; // …so restore the pre-open value
  },

  /**
   * Live theme swap from the Settings tab: fade to full cover, then under it swap the palette,
   * re-seed the Core focus-ring + scene backdrop, rebuild the active scene's UI (colors bake at
   * build time) and this overlay, and fade back. No-op when the mode is unchanged.
   */
  _applyTheme(mode) {
    if (mode === FacetTheme.mode) return;
    SceneTransition.start(() => {
      FacetTheme.setMode(mode);
      UINav.color = Color.parse(FacetTheme.accent);
      const game = GameOverlay._game;
      if (game !== null) {
        game.background = Color.parse(FacetTheme.bg); // themed draw_clear backdrop
        game.retheme(); // rebuild active scene UI in place
      }
      UINav.reset(); // focus was on now-destroyed elements
      GameOverlay.reopen(1); // reopen on the Settings tab, recolored
    });
  },

  // tabs

  /** System controls: Resume + Quit to Lobby */
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

  /** Settings form: audio / display / UI scale / language */
  _settingsTab() {
    const scroll = facetScroll({ grow: true });

    const volSection = facetSection(I18n.textRef("SETTINGS_VOL_TITLE"));
    // volumes shown as %. `apply` updates live audio as the slider drags; Save persists.
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
        volSlider("volSfx", (v) => Audio.setDefaultGain(v)),
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
          onText: I18n.textRef("SETTINGS_DISP_FULLSCREEN_ON"),
          offText: I18n.textRef("SETTINGS_DISP_FULLSCREEN_OFF"),
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
        // dropdown not a < > cycler — scales as more presets are added
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
    // V-Sync + AA go through display_reset (Display.applyVideo), which re-imposes the reset window/fps
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
          onText: I18n.textRef("SETTINGS_DISP_FULLSCREEN_ON"),
          offText: I18n.textRef("SETTINGS_DISP_FULLSCREEN_OFF"),
        },
      ),
    );
    // only AA levels the GPU reports it can do
    const aaItems = Display.aaLevels().map((lvl) => ({
      name: lvl === 0 ? I18n.text("SETTINGS_DISP_AA_OFF") : lvl + "x",
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
        // live: resize the GUI layer + reflow all roots (this menu included) as it moves
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
    scroll.scrollBody.insertChild(uiSection);

    // color theme (dark/light) — applies LIVE: _applyTheme fades, swaps the palette, and rebuilds
    // the scene UI + this menu under cover (colors are baked at build, so a rebuild is required)
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
        // language switch reloads I18n + re-adopts the locale font; live-textRef UI updates in place
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

    // key bindings: a rebind row per keymap action, applied live through Input.rebind (the
    // key-hint bar reads the same binding); Save persists them with the rest (InputPreset)
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
        height: 44,
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

    // settings persist only on explicit Save (Settings.set updates live in memory)
    if (GameOverlay.settingsFile !== null) {
      const saveRow = new UIElement({
        width: "100%",
        height: 44,
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

  /** About — static project + engine info (reuses the credits strings) */
  _aboutTab() {
    const scroll = facetScroll({ grow: true });
    const card = facetSection(null); // inside the sheet — no card of its own
    const lines = [
      [I18n.textRef("CREDITS_NAME"), FacetTheme.text],
      [I18n.textRef("CREDITS_TAGLINE"), FacetTheme.textMuted],
      [() => "", "#000000"],
      [I18n.textRef("CREDITS_DEV"), FacetTheme.textMuted],
      [I18n.textRef("CREDITS_ENGINE"), FacetTheme.textMuted],
      [I18n.textRef("CREDITS_LIBS"), FacetTheme.textMuted],
    ];
    for (let i = 0; i < lines.length; i++) {
      const row = new UIElement({ width: "100%", height: 22, flexShrink: 0 });
      row.insertChild(facetLabel(lines[i][0], { color: lines[i][1] }));
      card.insertChild(row);
    }
    scroll.scrollBody.insertChild(card);
    return scroll;
  },
};
