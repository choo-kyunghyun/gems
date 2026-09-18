// HUD + overlay panels for the colony scene — free functions taking the scene (mirrors ColonyCombat/ColonyMap).
// Panels read scene.level.entities/playerId LIVE via facetLabel callbacks, surviving the map-change store swap.
/**
 * build() returns the HUD HANDLE — the three panels this module keeps TOGGLING (`bar` the hotbar,
 * `dialogue` the NPC card, `sleep` the veil) beside the hotbar's own timing (`timer`/`slide`) — and
 * the scene keeps that one field, handing it back to update(), the shape a `*UI` page already
 * takes (see Window). The top-right card isn't in it: nothing touches it after it is built.
 * update() is the panels' whole frame job, so no scene field mirrors what a panel shows.
 */
const HOTBAR_HUD_SECS = 3; // wall-clock seconds the hotbar HUD stays up after a hotbar keypress
const HOTBAR_SLIDE = 150; // GUI px the hotbar bar slides DOWN (off the bottom edge) when hidden
const HOTBAR_SLIDE_SPD = 16; // approach speed for the slide (higher = snappier pop)

globalThis.Hud = {
  /**
   * build the persistent panels once (scene create) and hand back the handle
   */
  build(scene) {
    const hud = {
      bar: null, // the hotbar row
      dialogue: null, // the bottom-center NPC card
      sleep: null, // the "Sleeping..." veil
      timer: HOTBAR_HUD_SECS, // counts down on Time.raw; the bar shows while > 0
      slide: 0, // 0 = tucked below the screen, 1 = fully up; eased toward show/hide
    };
    Hud._hud(scene);
    hud.bar = Hud._hotbar(scene);
    hud.dialogue = Hud._dialogue(scene);
    hud.sleep = Hud._sleepOverlay(scene);
    return hud;
  },

  /**
   * Once per frame, AFTER the scene has resolved what the panels report (the frame's pick, build
   * mode): the hotbar's auto-hide ease and the two veils' visibility. UI timing runs on Time.raw
   * (wall clock), so the ease is unaffected by a paused or fast-forwarded sim.
   */
  update(scene, hud) {
    if (hud.timer > 0) hud.timer -= Time.raw;
    // build mode owns the bottom-center HUD, so the bar tucks away for it whatever the timer says
    const show = !scene.build.armed && hud.timer > 0;
    hud.slide = approach(hud.slide, show ? 1 : 0, HOTBAR_SLIDE_SPD);
    hud.bar.dragY = (1 - hud.slide) * HOTBAR_SLIDE; // offset, not mutation (see UIElement.getLayoutPosition)
    hud.bar.enabled = hud.slide > 0.001; // skip drawing once fully tucked away
    hud.dialogue.enabled = scene.nearNpc;
    hud.sleep.enabled = scene.sleeping;
  },

  /** reveal the hotbar HUD and refresh its auto-hide countdown (a hotbar press, a slot rebind) */
  showHotbar(hud) {
    hud.timer = HOTBAR_HUD_SECS;
  },

  /**
   * Bottom-center quick-use bar — one card per Hotbar slot, a LIVE "[n] Name (qty)" label read off
   * the player each frame. Display-only (binding is in InventoryUI, using is sceneColony._useHotbar);
   * update() slides it away while build mode owns the bottom-center HUD.
   */
  _hotbar(scene) {
    const wrap = new UIElement({
      positionType: "absolute",
      left: 0,
      right: 0,
      bottom: 64, // clear of the dialogue box (bottom:24); above the key-hint footer
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
    // live item icon left of the label; "" (→ 0 width, no gap) when the slot is empty
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

  /**
   * one survival-need RESERVE bar: facetProgress of (1 - value/max), so full = satiated, read live;
   * tinted like the need's critical debuff (its Status color)
   */
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

  /**
   * centered "Sleeping…" overlay, shown by update() while a bed fast-forwards time (scene.sleeping)
   */
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

  /**
   * Top-right HUD card: HP / ammo / stamina / needs / clock / weather / status + quest tracker.
   */
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
    // equipped-gun ammo readout (live): "<ammo>  rounds/magazine", unloaded hint, or "" for melee/
    // unarmed (the row self-sizes, so it collapses to ~0 height then)
    const ammoRow = new UIElement({ width: "100%" });
    ammoRow.insertChild(
      facetLabel(
        () => {
          if (scene.playerId === undefined) return "";
          const prof = Loadout.weaponProfile(
            scene.level.entities,
            scene.playerId,
          );
          if (prof === null || prof.kind !== "gun") return ""; // melee/unarmed → hide
          if (prof.noAmmo) return I18n.text("MOD_UNLOADED");
          const it = Item.get(prof.ammo);
          const nm = it !== undefined ? I18n.text(it.name) : prof.ammo;
          return nm + "  " + prof.rounds + "/" + prof.magazine;
        },
        { color: FacetTheme.warn, font: "description" },
      ),
    );
    card.insertChild(ammoRow);
    // stamina bar (sprint) — fraction of Stats.maxStamina, read live. Tall enough to seat the
    // centered "description"-font label inside the bar.
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
    // the survival needs as reserve bars, in registry order; the critical debuff shows in the
    // status row below
    const needs = Need.all();
    for (let i = 0; i < needs.length; i++)
      card.insertChild(Hud._needBar(scene, needs[i]));
    // world clock: "Season · Day N  HH:MM", read live
    const timeRow = new UIElement({ width: "100%", height: 20 });
    timeRow.insertChild(
      facetLabel(
        () =>
          I18n.text(
            "HUD_TIME",
            I18n.text(WorldClock.season().name),
            WorldClock.seasonDay(),
            WorldClock.clockText(),
          ),
        { color: FacetTheme.textMuted },
      ),
    );
    card.insertChild(timeRow);
    // weather condition + the temperature where the player stands (the room's, or the sky's),
    // both derived live
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
    // active buffs/debuffs — each name tinted by its def color, read live; rich-text [c=#hex] spans
    // so several statuses tint independently ("" when none)
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
  },

  /**
   * Bottom-center dialogue card, shown by update() while the frame's pick is an NPC (scene.nearNpc).
   */
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
