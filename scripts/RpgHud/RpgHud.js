// HUD + overlay panels for the RPG scene — the top-right HP/quest card and the bottom-center
// dialogue box — extracted from sceneRpg as free functions taking the scene (composition;
// mirrors RpgScene/RpgMap). The card + dialogue read scene.world/scene.ctrl LIVE via gemsLabel
// callbacks, so they keep working after RpgMap.load swaps the world on a map change. (The corner
// minimap was replaced by the player-centered RadarArrows radar, drawn in sceneRpg.draw.)
globalThis.RpgHud = {
  // Build the persistent HUD panels once (scene create): the HP/quest card + the dialogue box.
  build(scene) {
    RpgHud._hud(scene);
    RpgHud._dialogue(scene);
  },

  // Top-right HUD card: HP/level line (live) + the QuestLog-bound quest tracker.
  _hud(scene) {
    const hud = new UIElement({
      positionType: "absolute",
      top: 16,
      right: 16,
      width: 300,
    });
    const card = gemsCard({ padding: GemsTheme.padSm, gap: GemsTheme.gapSm });
    const hpRow = new UIElement({ width: "100%", height: 24 });
    hpRow.insertChild(
      gemsLabel(
        () => {
          const st = scene.world.get(Stats, scene.ctrl.id);
          const hpC = scene.world.get(Health, scene.ctrl.id);
          const hp = hpC !== undefined ? hpC.hp : 0;
          return I18n.text("RPG_HUD", st.level, hp, st.maxHp);
        },
        { color: GemsTheme.text, font: "header" },
      ),
    );
    card.insertChild(hpRow);
    // Stamina bar (sprint resource) — fraction of Stats.maxStamina, read live each frame.
    const staRow = new UIElement({ width: "100%", height: 14 });
    staRow.insertChild(
      gemsProgress(
        () => {
          const sta = scene.world.get(Stamina, scene.ctrl.id);
          const st = scene.world.get(Stats, scene.ctrl.id);
          if (sta === undefined || st === undefined || st.maxStamina <= 0)
            return 0;
          return sta.value / st.maxStamina;
        },
        {
          label: I18n.textRef("RPG_STAMINA"),
          fillColor: "#5bc8d6",
          height: 14,
        },
      ),
    );
    card.insertChild(staRow);
    // World clock: "Season · Day N  HH:MM", read live from the WorldClock each frame.
    const timeRow = new UIElement({ width: "100%", height: 20 });
    timeRow.insertChild(
      gemsLabel(
        () =>
          I18n.text(
            "RPG_TIME",
            I18n.text(WorldClock.season().name),
            WorldClock.seasonDay(),
            WorldClock.clockText(),
          ),
        { color: GemsTheme.textMuted },
      ),
    );
    card.insertChild(timeRow);
    // Weather condition + ambient Kelvin temperature, both derived live (season + time of day +
    // the active weather modifier).
    const tempRow = new UIElement({ width: "100%", height: 20 });
    tempRow.insertChild(
      gemsLabel(
        () =>
          I18n.text(
            "RPG_COND",
            I18n.text(Weather.current().name),
            Temperature.display(),
          ),
        { color: GemsTheme.textMuted },
      ),
    );
    card.insertChild(tempRow);
    card.insertChild(gemsDivider());
    card.insertChild(
      gemsQuestTracker({ emptyText: I18n.textRef("RPG_NO_QUEST") }),
    );
    hud.insertChild(card);
    scene.ui.insertChild(hud);
  },

  // Bottom-center dialogue card, toggled via scene._dlg.enabled from step().
  _dialogue(scene) {
    const wrap = new UIElement({
      positionType: "absolute",
      left: 0,
      right: 0,
      bottom: 24,
      alignItems: "center",
    });
    const card = gemsCard({ width: 640, padding: GemsTheme.pad });
    const name = new UIElement({ width: "100%", height: 26 });
    name.insertChild(
      gemsLabel(() => I18n.text(scene.dialogueName), {
        color: "#ffd166",
        font: "header",
      }),
    );
    const line = new UIElement({ width: "100%", height: 26 });
    line.insertChild(
      gemsLabel(() => I18n.text(scene.dialogueLine), { color: GemsTheme.text }),
    );
    const action = new UIElement({ width: "100%", height: 22 });
    action.insertChild(
      gemsLabel(
        () =>
          scene.dialogueAction !== ""
            ? "[E] " + I18n.text(scene.dialogueAction)
            : "",
        { color: "#54c98a" },
      ),
    );
    card.insertChild(name);
    card.insertChild(line);
    card.insertChild(action);
    wrap.insertChild(card);
    wrap.enabled = false;
    scene._dlg = wrap;
    scene.ui.insertChild(wrap);
  },
};
