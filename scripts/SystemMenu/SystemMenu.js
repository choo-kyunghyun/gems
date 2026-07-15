// the app's one menu: a near-fullscreen multi-tabbed overlay (standalone static singleton, not
// UIComponent) that pauses ALL game + behind-UI logic while open. owns the gameplay pause + nav.
// pause is global: obj_game skips scene.step() while isOpen(), and the menu forces Time.scale=0
// each frame (menu itself runs on Time.raw). UIModal blocks the underlying UI.
// open triggers: F1 anywhere, gamepad Start during gameplay; Esc during gameplay is context-aware
// (scene.handleEscape() gets first refusal). a scene opts into gameplay pause/nav via this.gameplay.
globalThis.SystemMenu = class SystemMenu {
  static _modal = null; // open UIModal handle, or null
  static _root = null; // the open overlay's UIElement root (for a synchronous reopen on a theme swap)
  static _game = null; // the obj_game controller (scene lifecycle in game.scenes)
  static _scale = 1; // Time.scale to restore on resume
  // Demo-injected extra tabs { label, build } appended after the built-ins — the seam that keeps
  // this Core menu free of Demo concerns (SaveGame/SceneRpg). Wired once at boot via addTab().
  static _extraTabs = [];

  /** Register an extra tab. @param {string|Function} label textRef or string @param {() => UIElement} build content builder, called each open (so it reads live state) */
  static addTab(label, build) {
    SystemMenu._extraTabs.push({ label, build });
  }

  // per-frame pause/open driver (Step_0, before UINav.update). owns UINav.suspended for gameplay
  // scenes. a scene opts in via this.gameplay = true in create() (field initializers don't run — GMRT).
  /** @param {Object} game the obj_game controller (holds game.scenes) */
  static update(game) {
    SystemMenu._game = game;
    const scene = game !== null ? game.scenes.current : null;

    if (SystemMenu._modal !== null) {
      // open: F1 / Start toggle closed (Esc-close handled by the UIModal)
      if (keyboard_check_pressed(vk_f1) || SystemMenu._startPressed()) {
        SystemMenu.close();
      }
      UINav.suspended = false; // overlay must stay nav-reachable over any scene
      Time.scale = 0; // freeze Time.delta consumers behind the overlay
      Time.delta = 0;
      return;
    }

    // closed. F1 opens anywhere (even a non-gameplay scene)
    if (keyboard_check_pressed(vk_f1)) {
      SystemMenu.open();
      return;
    }

    // gameplay-only below. read scene.gameplay LIVE — never cache into a local bool; GMRT clobbers a
    // cached primitive bool mid-function, which broke Esc entirely. see the clobber GMRT idiom.
    if (scene === null || scene.gameplay !== true) return;

    // gamepad Start opens the pause menu directly
    if (SystemMenu._startPressed()) {
      SystemMenu.open();
      return;
    }

    // Esc during gameplay: scene.handleEscape() gets first refusal (close window / exit build);
    // opens the menu only if unconsumed (so F1/Start stay the always-on pause)
    if (keyboard_check_pressed(vk_escape)) {
      if (scene.handleEscape !== undefined && scene.handleEscape()) {
        UINav.suspended = true; // consumed; menu stays closed
      } else if (game.scenes.back()) {
        // guest minigame was active — Esc returned to the frozen host, not open the menu
      } else {
        SystemMenu.open();
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
      if (game.scenes.back()) return; // B also exits a guest minigame back to the host
    }

    // gameplay owns the gamepad unless a window is open: suspend menu nav during free-roam/build (left
    // stick moves the player), un-suspend when a window is open so the controller can navigate it.
    UINav.suspended = !InputContext.is("window");
  }

  static _startPressed() {
    return gamepad_is_connected(0) && gamepad_button_check_pressed(0, gp_start);
  }

  /** @returns {boolean} */
  static isOpen() {
    // METHOD not `static get` — house style; static getters are safe on 0.20 (2026-07 re-audit).
    return SystemMenu._modal !== null;
  }

  /** @returns {number} Time.scale to restore on resume. */
  static scale() {
    return SystemMenu._scale;
  }

  /** open + pause (idempotent). @param {number} [tabIndex=0] 0 System, 1 Settings, 2 About */
  static open(tabIndex = 0) {
    if (SystemMenu._modal !== null) return;
    SystemMenu._scale = Time.scale; // remember live speed to restore on resume
    Time.scale = 0;
    Time.delta = 0;

    // flex-grow throughout (not a snapshot of display_get_gui_height()) so the menu reflows on a
    // live uiScale resize.
    const margin = 28;

    const root = new UIElement({
      width: "100%",
      height: "100%",
      padding: margin,
      alignItems: "center",
    });
    root.addComponent(
      new UIPanel({ color: gemsColor("#000000"), alpha: 0.72 }),
    );
    const modal = new UIModal({
      root,
      onClose: () => {
        SystemMenu._modal = null;
        Time.scale = SystemMenu._scale; // resume at the chosen speed
      },
    });
    root.addComponent(modal);

    // full-height card, capped on ultra-wide displays
    const inner = new UIElement({
      width: "100%",
      maxWidth: 1040,
      height: "100%",
    });
    const card = new UIElement({
      width: "100%",
      flexGrow: 1,
      padding: GemsTheme.pad,
      gap: GemsTheme.gapSm,
    });
    card.addComponent(new UITrigger({})); // swallow clicks so they're not a backdrop dismiss
    card.addComponent(
      new UIPanel({
        color: gemsColor(GemsTheme.panel),
        color2: gemsColor(GemsTheme.panelLo),
        rad: GemsTheme.radius,
        border: 1,
        borderColor: gemsColor(GemsTheme.border),
        shadow: 12,
        highlight: 1,
      }),
    );

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
      gemsLabel(I18n.textRef("SYS_TITLE"), {
        font: "header",
        color: GemsTheme.text,
      }),
    );
    titleRow.insertChild(
      gemsLabel(I18n.textRef("SYS_PAUSED"), { color: GemsTheme.accent }),
    );
    card.insertChild(titleRow);
    card.insertChild(gemsDivider());

    const tabDefs = [
      {
        label: I18n.textRef("SYS_TAB_SYSTEM"),
        content: SystemMenu._systemTab(),
      },
      {
        label: I18n.textRef("SYS_TAB_SETTINGS"),
        content: SystemMenu._settingsTab(),
      },
      {
        label: I18n.textRef("SYS_TAB_ABOUT"),
        content: SystemMenu._aboutTab(),
      },
    ];
    // Demo-injected tabs (Save/Load) after the built-ins; built fresh each open so they read live state
    for (let i = 0; i < SystemMenu._extraTabs.length; i++)
      tabDefs.push({
        label: SystemMenu._extraTabs[i].label,
        content: SystemMenu._extraTabs[i].build(),
      });
    const tabsRoot = gemsTabs(tabDefs, { grow: true });
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
      gemsButton(I18n.textRef("SETTINGS_CLOSE"), () => SystemMenu.close(), {
        primary: true,
        width: 160,
      }),
    );
    card.insertChild(footer);

    inner.insertChild(card);
    root.insertChild(inner);
    UI.insert(root); // top of the stack → blocks lower roots, draws last
    SystemMenu._modal = modal;
    SystemMenu._root = root;
    UINav.suspended = false;
    if (tabIndex > 0) tabsRoot.tabs.select(tabIndex); // e.g. Credits → About (index 2)
  }

  /** UIModal animates out, then restores Time.scale via onClose. */
  static close() {
    if (SystemMenu._modal !== null) SystemMenu._modal.close();
  }

  /** force-close + restore time scale on a scene swap. */
  static reset() {
    if (SystemMenu._modal !== null) {
      SystemMenu._modal.close();
      Time.scale = SystemMenu._scale;
    }
    SystemMenu._modal = null;
    SystemMenu._root = null;
  }

  // Rebuild the overlay in place (after a live theme swap) so it bakes the new palette. Removes the
  // current root SYNCHRONOUSLY — not the animated close(), whose deferred onClose would null the
  // fresh modal + recapture the (frozen) time scale — then reopens on the same tab, staying paused.
  static reopen(tabIndex = 0) {
    if (SystemMenu._modal === null) {
      SystemMenu.open(tabIndex);
      return;
    }
    const resume = SystemMenu._scale; // preserve the real resume speed across the rebuild
    UI.remove(SystemMenu._root);
    SystemMenu._root.destroy();
    SystemMenu._modal = null;
    SystemMenu._root = null;
    SystemMenu.open(tabIndex); // re-captures _scale from the now-frozen live scale…
    SystemMenu._scale = resume; // …so restore the pre-open value
  }

  // Live theme swap from the Settings tab: fade to full cover, then under it swap the palette,
  // re-seed the Core focus-ring + scene backdrop, rebuild the active scene's UI (colors bake at
  // build time) and this overlay, and fade back. No-op when the mode is unchanged.
  static _applyTheme(mode) {
    if (mode === GemsTheme.mode) return;
    Settings.set("theme", mode);
    SceneTransition.start(() => {
      GemsTheme.setMode(mode);
      UINav.color = Color.parse(GemsTheme.accent);
      const game = SystemMenu._game;
      if (game !== null) {
        game.background = Color.parse(GemsTheme.bg); // themed draw_clear backdrop
        if (game.scenes !== undefined) game.scenes.retheme(); // rebuild active scene UI in place
      }
      UINav.reset(); // focus was on now-destroyed elements
      SystemMenu.reopen(1); // reopen on the Settings tab, recolored
    });
  }

  // tabs

  // System controls: Resume + Quit to Lobby (sim readouts live in the Debug overlay instead)
  static _systemTab() {
    const scroll = gemsScroll({ grow: true });

    const controls = gemsSection(I18n.textRef("SYS_CONTROLS"));
    const bar = gemsGrid();
    bar.insertChild(
      gemsButton(I18n.textRef("SYS_RESUME"), () => SystemMenu.close(), {
        width: 200,
        primary: true,
      }),
    );
    // Step Frame + Restart Scene live in the Debug overlay's "Sim" panel
    bar.insertChild(
      gemsButton(
        I18n.textRef("SYS_QUIT"),
        () => {
          const g = SystemMenu._game;
          if (g !== null) g.scenes.switchTo(SCENES.lobby);
          SystemMenu.close();
        },
        { width: 200 },
      ),
    );
    controls.insertChild(bar);
    scroll.scrollBody.insertChild(controls);

    return scroll;
  }

  // Settings form: audio / display / UI scale / language
  static _settingsTab() {
    const scroll = gemsScroll({ grow: true });

    const volSection = gemsSection(I18n.textRef("SETTINGS_VOL_TITLE"));
    // volumes shown as %. `apply` updates live audio as the slider drags; Save persists.
    const volFmt = (v) => string_format(v * 100, 0, 0) + "%";
    const volSlider = (key, apply) =>
      gemsSlider(key, 0, 1, undefined, { format: volFmt, onChange: apply });
    volSection.insertChild(
      gemsRow(
        I18n.textRef("SETTINGS_VOL_MASTER"),
        volSlider("volMaster", (v) => Audio.setMasterGain(v)),
      ),
    );
    volSection.insertChild(
      gemsRow(
        I18n.textRef("SETTINGS_VOL_MUSIC"),
        volSlider("volMusic", (v) => Audio.setMusicGain(v)),
      ),
    );
    volSection.insertChild(
      gemsRow(
        I18n.textRef("SETTINGS_VOL_SFX"),
        volSlider("volSfx", (v) => Audio.setSfxGain(v)),
      ),
    );
    scroll.scrollBody.insertChild(volSection);

    const dispSection = gemsSection(I18n.textRef("SETTINGS_DISP_TITLE"));
    dispSection.insertChild(
      gemsToggle(
        I18n.textRef("SETTINGS_DISP_FULLSCREEN"),
        () => Settings.get("fullscreen"),
        () => {
          Settings.set("fullscreen", !Settings.get("fullscreen"));
          Display.apply();
        },
        {
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
      gemsRow(
        I18n.textRef("SETTINGS_DISP_RESOLUTION"),
        // dropdown not a < > cycler — scales as more presets are added
        gemsDropdownCustom(resItems, resIdx, (_i, res) => {
          Settings.set("resolutionW", res.w);
          Settings.set("resolutionH", res.h);
          Display.apply();
        }),
      ),
    );
    dispSection.insertChild(
      gemsRow(
        I18n.textRef("SETTINGS_DISP_FPS"),
        gemsSelect(
          "fpsLimit",
          [
            { name: "30", value: 30 },
            { name: "60", value: 60 },
            { name: "120", value: 120 },
            { name: I18n.text("SETTINGS_DISP_FPS_UNLIMITED"), value: 0 },
          ],
          { onChange: () => Display.applyFps() },
        ),
      ),
    );
    // V-Sync + AA go through display_reset (Display.applyVideo), which re-imposes the reset window/fps
    dispSection.insertChild(
      gemsToggle(
        I18n.textRef("SETTINGS_DISP_VSYNC"),
        () => Settings.get("vsync"),
        () => {
          Settings.set("vsync", !Settings.get("vsync"));
          Display.applyVideo();
        },
        {
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
      gemsRow(
        I18n.textRef("SETTINGS_DISP_AA"),
        gemsSelect("antialias", aaItems, {
          onChange: () => Display.applyVideo(),
        }),
      ),
    );
    scroll.scrollBody.insertChild(dispSection);

    const uiSection = gemsSection(I18n.textRef("SETTINGS_UI_TITLE"));
    uiSection.insertChild(
      gemsRow(
        I18n.textRef("SETTINGS_UI_SCALE"),
        // live: resize the GUI layer + reflow all roots (this menu included) as it moves
        gemsSlider("uiScale", 0.5, 2, 0.1, {
          onChange: (v) => UI.applyScale(v),
        }),
      ),
    );
    scroll.scrollBody.insertChild(uiSection);

    // color theme (dark/light) — applies LIVE: _applyTheme fades, swaps the palette, and rebuilds
    // the scene UI + this menu under cover (colors are baked at build, so a rebuild is required)
    const themeSection = gemsSection(I18n.textRef("SETTINGS_THEME_TITLE"));
    const themeItems = [
      { name: I18n.text("SETTINGS_THEME_DARK"), value: "dark" },
      { name: I18n.text("SETTINGS_THEME_LIGHT"), value: "light" },
    ];
    const themeIdx = Math.max(
      0,
      themeItems.findIndex((it) => it.value === Settings.get("theme")),
    );
    themeSection.insertChild(
      gemsRow(
        I18n.textRef("SETTINGS_THEME_LABEL"),
        gemsSelectCustom(themeItems, themeIdx, (_i, value) =>
          SystemMenu._applyTheme(value),
        ),
      ),
    );
    scroll.scrollBody.insertChild(themeSection);

    const langSection = gemsSection(I18n.textRef("SETTINGS_LANG_TITLE"));
    const langItems = [
      { name: I18n.text("LANG_EN_US"), value: "en-US" },
      { name: I18n.text("LANG_KO_KR"), value: "ko-KR" },
    ];
    const langIdx = Math.max(
      0,
      langItems.findIndex((it) => it.value === Settings.get("language")),
    );
    langSection.insertChild(
      gemsRow(
        I18n.textRef("SETTINGS_LANG_LABEL"),
        // language switch reloads I18n + re-adopts the locale font; live-textRef UI updates in place
        gemsSelectCustom(langItems, langIdx, (_i, value) => {
          Settings.set("language", value);
          I18n.load("i18n/" + value + "/manifest.json");
          draw_set_font(I18n.font("default"));
        }),
      ),
    );
    scroll.scrollBody.insertChild(langSection);

    // settings persist only on explicit Save (Settings.set updates live in memory)
    const saveRow = new UIElement({
      width: "100%",
      height: 44,
      flexShrink: 0,
      flexDirection: "row",
      justifyContent: "flex-end",
    });
    saveRow.insertChild(
      gemsButton(I18n.textRef("SETTINGS_SAVE"), () => Settings.save(), {
        width: 160,
      }),
    );
    scroll.scrollBody.insertChild(saveRow);

    return scroll;
  }

  // About — static project + engine info (reuses the credits strings)
  static _aboutTab() {
    const scroll = gemsScroll({ grow: true });
    const card = gemsCard({ gap: GemsTheme.gapSm });
    const lines = [
      [I18n.textRef("CREDITS_NAME"), GemsTheme.text],
      [I18n.textRef("CREDITS_TAGLINE"), GemsTheme.textMuted],
      [() => "", "#000000"],
      [I18n.textRef("CREDITS_DEV"), GemsTheme.textMuted],
      [I18n.textRef("CREDITS_ENGINE"), GemsTheme.textMuted],
      [I18n.textRef("CREDITS_LIBS"), GemsTheme.textMuted],
    ];
    for (let i = 0; i < lines.length; i++) {
      const row = new UIElement({ width: "100%", height: 22, flexShrink: 0 });
      row.insertChild(gemsLabel(lines[i][0], { color: lines[i][1] }));
      card.insertChild(row);
    }
    scroll.scrollBody.insertChild(card);
    return scroll;
  }
};
