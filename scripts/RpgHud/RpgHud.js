// HUD + overlay panels for the RPG scene — the top-right HP/quest card, the bottom-center
// dialogue box, and the corner minimap — extracted from sceneRpg as free functions taking the
// scene (composition; mirrors RpgScene/RpgMap). The card + dialogue read scene.world/scene.ctrl
// LIVE via gemsLabel callbacks, so they keep working after RpgMap.load swaps the world on a map
// change. The minimap is the exception (gemsMinimap captures world/target by value), so
// RpgMap.load rebuilds it per map via buildMinimap.
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
        { color: GemsTheme.text, font: I18n.font("header") },
      ),
    );
    card.insertChild(hpRow);
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
    // Ambient temperature in Kelvin, derived live from season + time of day. Slice #3 prepends
    // the weather condition to this row.
    const tempRow = new UIElement({ width: "100%", height: 20 });
    tempRow.insertChild(
      gemsLabel(() => I18n.text("RPG_TEMP", Math.round(Temperature.now())), {
        color: GemsTheme.textMuted,
      }),
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
        font: I18n.font("header"),
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

  // (Re)build the bottom-right minimap: a framed radar of nearby slimes (red), the NPC (gold),
  // and doors (violet) around the player marker. gemsMinimap captures world/target by value, so
  // RpgMap.load rebuilds it whenever it creates a new world; old wrapper removed first.
  // Absolute-positioned so it floats over the scene instead of stacking in the column.
  buildMinimap(scene) {
    if (scene._miniWrap !== undefined) scene._miniWrap.destroy(); // self-removes from scene.ui
    const miniWrap = new UIElement({
      positionType: "absolute",
      bottom: 16,
      right: 16,
      width: 150,
      height: 150,
    });
    miniWrap.insertChild(
      gemsMinimap({
        world: scene.world,
        target: scene.ctrl.id,
        range: 460,
        size: 150,
        rules: [
          { tag: "enemy", color: "#e0584f" },
          { tag: "npc", color: "#ffd166" },
          { tag: "portal", color: "#9b8cff" },
          { tag: "follower", color: "#6fd0a0" },
        ],
      }),
    );
    scene._miniWrap = miniWrap;
    scene.ui.insertChild(miniWrap);
  },
};
