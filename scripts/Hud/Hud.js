/**
 * HUD panels for the colony scene.
 *
 * build() returns the HUD handle — the panels this module toggles and the hotbar's timing — which
 * the scene hands back to update(). update() is the panels' whole frame job, so no scene field
 * mirrors what a panel shows; an open window stands in for all but the sleep card.
 */
const HOTBAR_HUD_SECS = 3; // wall-clock seconds the hotbar stays up after a hotbar keypress
const HOTBAR_SLIDE = 150; // GUI px the hotbar slides down off the bottom edge when hidden
const HOTBAR_SLIDE_SPD = 16; // higher = snappier
const HOTBAR_CELL = 56; // GUI px per hotbar slot

globalThis.Hud = {
  /** Once per scene. Every panel goes into `scene.ui` but the sleep card, the scene's to place. */
  build(scene) {
    const hud = {
      bar: null,
      cells: null, // the bar's slot grid
      sleep: null,
      timer: HOTBAR_HUD_SECS, // wall clock; the bar shows while > 0
      slide: 0, // 0 = tucked below the screen, 1 = fully up
    };
    Hud._hud(scene);
    hud.bar = Hud._hotbar(scene, hud);
    hud.sleep = Hud._sleep(scene);
    return hud;
  },

  /**
   * Once per frame, after the scene has resolved what the panels report. On the wall clock, so a
   * paused or fast-forwarded sim leaves the ease alone.
   */
  update(scene, hud) {
    if (hud.timer > 0) hud.timer -= Time.raw;
    // build mode owns the bottom-center HUD, so the bar tucks away for it whatever the timer says
    const show = !scene.build.armed && hud.timer > 0;
    hud.slide = approach(hud.slide, show ? 1 : 0, HOTBAR_SLIDE_SPD);
    hud.bar.dragY = (1 - hud.slide) * HOTBAR_SLIDE; // an offset, leaving the layout alone
    hud.bar.enabled = hud.slide > 0.001;
    if (hud.bar.enabled && scene.playerId !== undefined)
      hud.cells.items = InvTable.beltCells(scene.level.entities, scene.playerId);
    hud.sleep.enabled = scene.sleep.on;
  },

  /** Reveal the hotbar and restart its auto-hide countdown. */
  showHotbar(hud) {
    hud.timer = HOTBAR_HUD_SECS;
  },

  /** Display-only: the belt's cells, which update() refreshes while the bar shows. */
  _hotbar(scene, hud) {
    const wrap = new UIElement({
      positionType: "absolute",
      left: 0,
      right: 0,
      bottom: 76, // above the bottom-edge toasts
      flexDirection: "row",
      justifyContent: "center",
    });
    const grid = facetSlots(new Array(HOTBAR_SIZE).fill(null), {
      cols: HOTBAR_SIZE,
      cellSize: HOTBAR_CELL,
      passive: true, // the bar never eats a shot aimed past it
    });
    hud.cells = grid.getComponent(UISlots);
    wrap.insertChild(grid);
    scene.ui.insertChild(wrap);
    return wrap;
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

  _sleep(scene) {
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
  },
};
