/**
 * HUD and overlay panels for the colony scene.
 *
 * build() returns the HUD handle — the panels this module toggles and the hotbar's timing — which
 * the scene hands back to update(). update() is the panels' whole frame job, so no scene field
 * mirrors what a panel shows; an open window hides all but the sleep veil.
 */
const HOTBAR_HUD_SECS = 3; // wall-clock seconds the hotbar stays up after a hotbar keypress
const HOTBAR_SLIDE = 150; // GUI px the hotbar slides down off the bottom edge when hidden
const HOTBAR_SLIDE_SPD = 16; // higher = snappier

globalThis.Hud = {
  /** Once per scene. */
  build(scene) {
    const hud = {
      card: null,
      bar: null,
      dialogue: null,
      sleep: null,
      timer: HOTBAR_HUD_SECS, // wall clock; the bar shows while > 0
      slide: 0, // 0 = tucked below the screen, 1 = fully up
    };
    hud.card = Hud._hud(scene);
    hud.bar = Hud._hotbar(scene);
    hud.dialogue = Hud._dialogue(scene);
    hud.sleep = Hud._sleepOverlay(scene);
    return hud;
  },

  /**
   * Once per frame, after the scene has resolved what the panels report. On the wall clock, so a
   * paused or fast-forwarded sim leaves the ease alone.
   */
  update(scene, hud) {
    if (hud.timer > 0) hud.timer -= Time.raw;
    // the window's translucent card would show the panels through it
    const open = scene.window.isOpen();
    hud.card.enabled = !open;
    // build mode owns the bottom-center HUD, so the bar tucks away for it whatever the timer says
    const show = !scene.build.armed && hud.timer > 0;
    hud.slide = approach(hud.slide, show ? 1 : 0, HOTBAR_SLIDE_SPD);
    hud.bar.dragY = (1 - hud.slide) * HOTBAR_SLIDE; // an offset, leaving the layout alone
    hud.bar.enabled = !open && hud.slide > 0.001;
    hud.dialogue.enabled = !open && scene.nearNpc;
    hud.sleep.enabled = scene.sleep.on;
  },

  /** Reveal the hotbar and restart its auto-hide countdown. */
  showHotbar(hud) {
    hud.timer = HOTBAR_HUD_SECS;
  },

  /** Display-only: one card per hotbar slot, read live off the player. */
  _hotbar(scene) {
    const wrap = new UIElement({
      positionType: "absolute",
      left: 0,
      right: 0,
      bottom: 64, // clear of the dialogue card and above the key-hint footer
      flexDirection: "row",
      justifyContent: "center",
      gap: FacetTheme.gapSm,
    });
    for (let i = 0; i < HOTBAR_SIZE; i++)
      wrap.insertChild(Hud._hotbarSlot(scene, i));
    scene.ui.insertChild(wrap);
    return wrap;
  },

  _hotbarSlot(scene, i) {
    const card = facetCard({ width: 140, padding: FacetTheme.padSm });
    const row = new UIElement({
      width: "100%",
      flexDirection: "row",
      alignItems: "center",
    });
    // an empty slot's "" takes no width
    row.insertChild(
      facetRichText(
        () => {
          if (scene.playerId === undefined) return "";
          const hb = scene.level.entities.require(scene.playerId, Hotbar);
          const itemId = hb.slots[i];
          return itemId ? WorldOverlay.iconTag(itemId) : "";
        },
        { font: "description" },
      ),
    );
    row.insertChild(
      facetLabel(
        () => {
          const key = i + 1;
          if (scene.playerId === undefined) return "[" + key + "]";
          const hb = scene.level.entities.require(scene.playerId, Hotbar);
          const itemId = hb.slots[i];
          if (itemId === "" || itemId === undefined) return "[" + key + "]  —";
          const it = Item.get(itemId);
          const name = it !== undefined ? I18n.text(it.name) : itemId;
          const inv = scene.level.entities.require(scene.playerId, Inventory);
          const n = Bag.count(inv, itemId);
          return "[" + key + "]  " + name + " (" + n + ")";
        },
        { color: FacetTheme.text, font: "description" },
      ),
    );
    card.insertChild(row);
    return card;
  },

  /** A need as a reserve bar — full is satiated — tinted like its critical debuff. */
  _needBar(scene, need) {
    const status = Status.get(need.seed.status);
    const row = new UIElement({ width: "100%", height: 20 });
    row.insertChild(
      facetProgress(
        () =>
          1 -
          Needs.fraction(scene.level.entities.get(scene.playerId, need.id)),
        {
          label: I18n.textRef(need.name),
          fillColor: status !== undefined ? status.color : FacetTheme.text,
          height: 20,
          font: "description",
        },
      ),
    );
    return row;
  },

  _sleepOverlay(scene) {
    const wrap = new UIElement({
      positionType: "absolute",
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      justifyContent: "center",
      alignItems: "center",
    });
    const card = facetCard({ padding: FacetTheme.pad });
    card.insertChild(
      facetLabel(I18n.textRef("SURVIVAL_SLEEPING"), {
        color: FacetTheme.text,
        font: "header",
        halign: fa_center,
      }),
    );
    wrap.insertChild(card);
    wrap.enabled = false;
    scene.ui.insertChild(wrap);
    return wrap;
  },

  _hud(scene) {
    const hud = new UIElement({
      positionType: "absolute",
      top: 16,
      right: 16,
      width: 300,
    });
    const card = facetCard({ padding: FacetTheme.padSm, gap: FacetTheme.gapSm });
    const hpRow = new UIElement({ width: "100%", height: 24 });
    hpRow.insertChild(
      facetLabel(
        () => {
          const st = scene.level.entities.require(scene.playerId, Stats);
          const hp = scene.level.entities.require(scene.playerId, Health).hp;
          return I18n.text("HUD_HP", hp, st.maxHp);
        },
        { color: FacetTheme.text, font: "header" },
      ),
    );
    card.insertChild(hpRow);
    // self-sized, so the row collapses when there is no gun
    const ammoRow = new UIElement({ width: "100%" });
    ammoRow.insertChild(
      facetLabel(
        () => {
          if (scene.playerId === undefined) return "";
          const prof = Loadout.weaponProfile(
            scene.level.entities,
            scene.playerId,
          );
          if (prof === null || prof.kind !== "gun") return "";
          if (prof.noAmmo) return I18n.text("MOD_UNLOADED");
          const it = Item.get(prof.ammo);
          const nm = it !== undefined ? I18n.text(it.name) : prof.ammo;
          return nm + "  " + prof.rounds + "/" + prof.magazine;
        },
        { color: FacetTheme.warn, font: "description" },
      ),
    );
    card.insertChild(ammoRow);
    // tall enough to seat the label inside the bar
    const staRow = new UIElement({ width: "100%", height: 20 });
    staRow.insertChild(
      facetProgress(
        () => {
          const sta = scene.level.entities.require(scene.playerId, Stamina);
          const st = scene.level.entities.require(scene.playerId, Stats);
          if (st.maxStamina <= 0) return 0;
          return sta.value / st.maxStamina;
        },
        {
          label: I18n.textRef("HUD_STAMINA"),
          fillColor: "#5bc8d6",
          height: 20,
          font: "description",
        },
      ),
    );
    card.insertChild(staRow);
    const needs = Need.all();
    for (let i = 0; i < needs.length; i++)
      card.insertChild(Hud._needBar(scene, needs[i]));
    const timeRow = new UIElement({ width: "100%", height: 20 });
    timeRow.insertChild(
      facetLabel(
        () =>
          I18n.text(
            "HUD_TIME",
            I18n.text(Season.now().name),
            Season.day(),
            WorldClock.clockText(),
          ),
        { color: FacetTheme.textMuted },
      ),
    );
    card.insertChild(timeRow);
    // the temperature where the player stands, indoors or out
    const tempRow = new UIElement({ width: "100%", height: 20 });
    tempRow.insertChild(
      facetLabel(
        () => {
          const pos = scene.level.entities.require(scene.playerId, Position);
          const k = Shelter.tempAt(scene.level, pos.x, pos.y);
          return I18n.text(
            "HUD_CONDITION",
            I18n.text(Weather.current().name),
            Temperature.format(k),
          );
        },
        { color: FacetTheme.textMuted },
      ),
    );
    card.insertChild(tempRow);
    // rich text, so each status tints independently
    const statusRow = new UIElement({ width: "100%", height: 20 });
    statusRow.insertChild(
      facetRichText(
        () => {
          const list = Effects.list(scene.level.entities, scene.playerId);
          let s = "";
          for (let i = 0; i < list.length; i++) {
            const def = Status.get(list[i].id);
            if (def === undefined) continue;
            if (s !== "") s += "   ";
            s += "[c=" + def.color + "]" + I18n.text(def.name) + "[/c]";
          }
          return s;
        },
        { font: "description" },
      ),
    );
    card.insertChild(statusRow);
    card.insertChild(facetDivider());
    card.insertChild(
      facetQuestTracker({
        source: Tracker,
        emptyText: I18n.textRef("QUEST_NONE"),
      }),
    );
    hud.insertChild(card);
    scene.ui.insertChild(hud);
    return hud;
  },

  _dialogue(scene) {
    const wrap = new UIElement({
      positionType: "absolute",
      left: 0,
      right: 0,
      bottom: 24,
      alignItems: "center",
    });
    const card = facetCard({ width: 640, padding: FacetTheme.pad });
    const name = new UIElement({ width: "100%", height: 26 });
    name.insertChild(
      facetLabel(() => I18n.text(scene.dialogueName), {
        color: FacetTheme.warn,
        font: "header",
      }),
    );
    const line = new UIElement({ width: "100%", height: 26 });
    line.insertChild(
      facetLabel(() => I18n.text(scene.dialogueLine), { color: FacetTheme.text }),
    );
    const action = new UIElement({ width: "100%", height: 22 });
    action.insertChild(
      facetLabel(
        () =>
          scene.dialogueAction !== ""
            ? "[E] " + I18n.text(scene.dialogueAction)
            : "",
        { color: FacetTheme.good },
      ),
    );
    card.insertChild(name);
    card.insertChild(line);
    card.insertChild(action);
    wrap.insertChild(card);
    wrap.enabled = false;
    scene.ui.insertChild(wrap);
    return wrap;
  },
};
