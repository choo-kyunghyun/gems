/**
 * SystemMenu — the global, open-anytime "simulator/emulator manager" overlay (standalone
 * static singleton, NOT a UIComponent — same shape as Toast / SlotDrag / UINav). It is the
 * app's one menu: a near-fullscreen, multi-tabbed panel that pauses ALL game + behind-UI
 * logic while open, and lets you drive the running sim (resume / restart / quit / time-
 * scale / frame-step), change settings, read About, and inspect debug info. It absorbed
 * both the old SettingsMenu and the old PauseMenu (it now owns the gameplay pause + nav).
 *
 * Pausing is global (any scene, not just gameplay): `obj_game` skips `scene.step()` while
 * `SystemMenu.isOpen()`, and the menu forces `Time.scale = 0` each frame so Time.delta-
 * based animation behind the overlay freezes too (the menu itself runs on Time.raw). The
 * underlying UI is blocked by the UIModal (pointer + nav exclusive).
 *
 * Open triggers: `F1` anywhere and gamepad Start during gameplay open it directly. Esc
 * during gameplay is context-aware — a scene's optional `handleEscape()` hook gets first
 * refusal (close a window / exit build mode) and Esc opens the menu only if the scene
 * didn't consume the press (so F1/Start remain the always-on pause). A scene opts into the
 * gameplay pause/nav by setting `this.gameplay = true`. While closed over a gameplay scene,
 * update() keeps `UINav.suspended = true` so gameplay keys don't drive a stray focus ring.
 *
 * Wiring (obj_game + SceneManager):
 *   Step_0          : SystemMenu.update(this)  (before UINav.update; passes the controller
 *                     so the System tab can read/restart/quit the live scene via game.scenes)
 *   SceneManager.step: scene.step() gated by `!SystemMenu.isOpen() || consumeStep()`
 *                     (frame-step runs exactly one scene.step while paused — see consumeStep)
 *   SceneManager._apply: SystemMenu.reset()    (close + restore Time.scale on every scene swap)
 * The lobby footer also calls open() (Settings → System tab, Credits → About tab).
 */
globalThis.SystemMenu = class SystemMenu {
  static _modal = null; // open UIModal handle, or null
  static _game = null; // the obj_game controller (its scene lifecycle lives in game.scenes)
  static _scale = 1; // Time.scale to restore on resume; the System tab "Speed" edits it
  static _stepRequested = false; // one-shot frame-step flag

  // Driven every frame from obj_game Step_0 (before UINav.update). Also the integrated
  // pause: it owns UINav.suspended for gameplay scenes (the former PauseMenu job). A scene
  // opts in by setting `this.gameplay = true` in create() (a subclass field initializer
  // wouldn't run — GMRT — so it's set in the method).
  static update(game) {
    SystemMenu._game = game;
    const scene = game !== null ? game.scenes.current : null;

    if (SystemMenu._modal !== null) {
      // Open: F1 / gamepad Start toggle it closed (Esc-close is handled by the UIModal).
      if (keyboard_check_pressed(vk_f1) || SystemMenu._startPressed()) {
        SystemMenu.close();
      }
      UINav.suspended = false; // the overlay must stay nav-reachable over any scene
      Time.scale = 0; // freeze every Time.delta consumer behind the overlay
      Time.delta = 0;
      return;
    }

    // Closed. F1 opens the menu anywhere (even a non-gameplay scene like the lobby).
    if (keyboard_check_pressed(vk_f1)) {
      SystemMenu.open();
      return;
    }

    // Everything below is gameplay-only. Read scene.gameplay LIVE here, never cached into a
    // local boolean — GMRT clobbers a cached primitive bool mid-function (a `const` flips
    // true→false across the following keyboard/handleEscape calls), which silently made every
    // branch below fail and broke Esc entirely. See the boolean-local clobber GMRT idiom.
    if (scene === null || scene.gameplay !== true) return;

    // gamepad Start opens the pause menu directly.
    if (SystemMenu._startPressed()) {
      SystemMenu.open();
      return;
    }

    // Esc during gameplay is context-aware: the scene gets first refusal via an optional
    // handleEscape() hook (close an open window / exit build mode); Esc opens the menu only
    // when the scene doesn't consume the press (so F1/Start remain the always-on pause).
    if (keyboard_check_pressed(vk_escape)) {
      if (scene.handleEscape !== undefined && scene.handleEscape()) {
        UINav.suspended = true; // consumed by the scene; menu stays closed
      } else {
        SystemMenu.open();
      }
      return;
    }

    UINav.suspended = true; // active gameplay owns the keys (no stray menu focus ring)
  }

  static _startPressed() {
    return gamepad_is_connected(0) && gamepad_button_check_pressed(0, gp_start);
  }

  static isOpen() {
    // A METHOD, not a `static get`: on GMRT 0.20 a static getter with a comparison body
    // (`_modal !== null`) miscompiles to a constant — verified, it returned false while
    // _modal held a live UIModal (the inline comparison returned true). See CLAUDE.md.
    return SystemMenu._modal !== null;
  }

  static scale() {
    return SystemMenu._scale;
  }

  // True at most once per Step button press; obj_game reads it to run a single
  // scene.step() (one frame of sim) while otherwise paused.
  static consumeStep() {
    if (!SystemMenu._stepRequested) return false;
    SystemMenu._stepRequested = false;
    return true;
  }

  static open(tabIndex = 0) {
    if (SystemMenu._modal !== null) return;
    SystemMenu._scale = Time.scale; // remember the live speed to restore on resume
    Time.scale = 0;
    Time.delta = 0;

    // Near-fullscreen window: the card fills the padded root and the tab host flex-grows
    // to fill it (grow: true below), so the menu reflows when the GUI is resized (live
    // uiScale) instead of snapshotting display_get_gui_height() once at open.
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

    // The visible window: a full-height card, capped on ultra-wide displays.
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

    // Title row: name on the left, a live "Paused" badge on the right.
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
        font: I18n.font("header"),
        color: GemsTheme.text,
      }),
    );
    titleRow.insertChild(
      gemsLabel(I18n.textRef("SYS_PAUSED"), { color: GemsTheme.accent }),
    );
    card.insertChild(titleRow);
    card.insertChild(gemsDivider());

    const tabsRoot = gemsTabs(
      [
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
      ],
      { grow: true },
    );
    card.insertChild(tabsRoot);

    // Footer: a universal Close (Esc / backdrop also close).
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
    UINav.suspended = false;
    if (tabIndex > 0) tabsRoot.tabs.select(tabIndex); // e.g. Credits → About (index 2)
  }

  static close() {
    if (SystemMenu._modal !== null) SystemMenu._modal.close();
  }

  // Cleared on every scene swap from obj_game; defensively closes a still-open modal
  // (the modal root self-removes via its own onUpdate) and restores the time scale.
  static reset() {
    if (SystemMenu._modal !== null) {
      SystemMenu._modal.close();
      Time.scale = SystemMenu._scale;
    }
    SystemMenu._modal = null;
  }

  // ── tabs ──────────────────────────────────────────────────────

  // System / simulation manager: live readouts + sim controls (the "emulator" core).
  static _systemTab() {
    const scroll = gemsScroll({ grow: true });

    const sim = gemsSection(I18n.textRef("SYS_SIM"));
    sim.insertChild(
      SystemMenu._stat(I18n.textRef("SYS_SCENE"), () => {
        const g = SystemMenu._game;
        return g !== null ? g.scenes.label() : "-";
      }),
    );
    sim.insertChild(
      SystemMenu._stat(
        I18n.textRef("SYS_FPS"),
        () => string_format(fps_real, 0, 0) + " / " + string_format(fps, 0, 0),
      ),
    );
    sim.insertChild(
      SystemMenu._stat(I18n.textRef("SYS_ENTITIES"), () => {
        const w = SystemMenu._world();
        return w !== null ? String(w.ids.next - w.ids.freeIndices.length) : "-";
      }),
    );

    // Time scale (the speed restored on resume). Discrete steps via a custom select.
    const speeds = [
      { name: "0.25x", value: 0.25 },
      { name: "0.5x", value: 0.5 },
      { name: "1x", value: 1 },
      { name: "2x", value: 2 },
      { name: "4x", value: 4 },
    ];
    const sIdx = Math.max(
      0,
      speeds.findIndex((s) => s.value === SystemMenu._scale),
    );
    sim.insertChild(
      gemsRow(
        I18n.textRef("SYS_SPEED"),
        gemsSelectCustom(speeds, sIdx, (_i, s) => {
          SystemMenu._scale = s.value;
        }),
      ),
    );
    scroll.scrollBody.insertChild(sim);

    const controls = gemsSection(I18n.textRef("SYS_CONTROLS"));
    const bar = gemsGrid();
    bar.insertChild(
      gemsButton(I18n.textRef("SYS_RESUME"), () => SystemMenu.close(), {
        width: 200,
        primary: true,
      }),
    );
    // Step requests one scene.step() while paused (obj_game consumes the flag).
    bar.insertChild(
      gemsButton(
        I18n.textRef("SYS_STEP"),
        () => {
          SystemMenu._stepRequested = true;
        },
        { width: 200 },
      ),
    );
    bar.insertChild(
      gemsButton(
        I18n.textRef("SYS_RESTART"),
        () => {
          const g = SystemMenu._game;
          if (g !== null) g.scenes.restart();
          SystemMenu.close();
        },
        { width: 200 },
      ),
    );
    bar.insertChild(
      gemsButton(
        I18n.textRef("SYS_QUIT"),
        () => {
          const g = SystemMenu._game;
          if (g !== null) g.scenes.request(SCENES.lobby);
          SystemMenu.close();
        },
        { width: 200 },
      ),
    );
    controls.insertChild(bar);
    scroll.scrollBody.insertChild(controls);

    return scroll;
  }

  // Settings form (audio / display / UI scale / language) — the former SettingsMenu body.
  static _settingsTab() {
    const scroll = gemsScroll({ grow: true });

    const volSection = gemsSection(I18n.textRef("SETTINGS_VOL_TITLE"));
    // 0–1 volumes read as a percentage rather than a bare "0.80".
    const volPct = { format: (v) => string_format(v * 100, 0, 0) + "%" };
    const volSlider = (key) => gemsSlider(key, 0, 1, undefined, volPct);
    volSection.insertChild(
      gemsRow(I18n.textRef("SETTINGS_VOL_MASTER"), volSlider("volMaster")),
    );
    volSection.insertChild(
      gemsRow(I18n.textRef("SETTINGS_VOL_MUSIC"), volSlider("volMusic")),
    );
    volSection.insertChild(
      gemsRow(I18n.textRef("SETTINGS_VOL_SFX"), volSlider("volSfx")),
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
        // A dropdown list rather than a < > cycler — scales as more presets are added.
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
        gemsSelect("fpsLimit", [
          { name: "30", value: 30 },
          { name: "60", value: 60 },
          { name: "120", value: 120 },
          { name: I18n.text("SETTINGS_DISP_FPS_UNLIMITED"), value: 0 },
        ]),
      ),
    );
    scroll.scrollBody.insertChild(dispSection);

    const uiSection = gemsSection(I18n.textRef("SETTINGS_UI_TITLE"));
    uiSection.insertChild(
      gemsRow(
        I18n.textRef("SETTINGS_UI_SCALE"),
        // Live: resize the GUI layer + reflow all roots (this menu included) as it moves.
        gemsSlider("uiScale", 0.5, 2, 0.1, {
          onChange: (v) => UI.applyScale(v),
        }),
      ),
    );
    scroll.scrollBody.insertChild(uiSection);

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
        // Switching language reloads I18n and re-adopts the locale's base font, so the
        // open UI (built from live textRefs) updates in place.
        gemsSelectCustom(langItems, langIdx, (_i, value) => {
          Settings.set("language", value);
          I18n.load("i18n/" + value + "/manifest.json");
          draw_set_font(I18n.font("default"));
        }),
      ),
    );
    scroll.scrollBody.insertChild(langSection);

    // Settings persist only on explicit Save (Settings.set updates live in memory).
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

  // About / info — static project + engine info (reuses the credits strings).
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

  // ── helpers ───────────────────────────────────────────────────

  // The current scene's World, or null. Defensive: not every scene owns one.
  static _world() {
    const g = SystemMenu._game;
    const scene = g !== null ? g.scenes.current : null;
    return scene !== null && scene.world != null ? scene.world : null;
  }

  // A fixed-height "label … value" readout row (value is a live () => string).
  static _stat(labelRef, valueRef) {
    const row = new UIElement({
      width: "100%",
      height: 22,
      flexShrink: 0,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    });
    row.insertChild(gemsLabel(labelRef, { color: GemsTheme.textMuted }));
    // fa_right: UIText can't self-size on 0.19, so the value box is width 0 at the row's
    // right edge (space-between) — right-align draws the text leftward from there (fa_left
    // would overflow off the right edge and clip). See the UIText self-size quirk.
    row.insertChild(
      gemsLabel(valueRef, { color: GemsTheme.text, halign: fa_right }),
    );
    return row;
  }
};
