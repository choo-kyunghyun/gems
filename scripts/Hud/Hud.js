// HUD + overlay panels for the colony scene — free functions taking the scene (mirrors ColonyCombat/ColonyMap).
// Panels read scene.level.entities/playerId LIVE via facetLabel callbacks, surviving the map-change store swap.
globalThis.Hud = {
  /**
   * build the persistent panels once (scene create)
   */
  build(scene) {
    Hud._hud(scene);
    Hud._hotbar(scene);
    Hud._dialogue(scene);
    Hud._sleepOverlay(scene);
  },

  /**
   * Bottom-center quick-use bar — one card per Hotbar slot, a LIVE "[n] Name (qty)" label read off
   * the player each frame. Display-only (binding is in InventoryUI, using is sceneColony._useHotbar).
   * sceneColony hides the whole bar while build mode owns the bottom-center HUD.
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
    scene._hotbarBar = wrap;
    scene.ui.insertChild(wrap);
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
          const hb = scene.level.entities.get(scene.playerId, Hotbar);
          const itemId = hb !== undefined ? hb.slots[i] : "";
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
          const hb = scene.level.entities.get(scene.playerId, Hotbar);
          const itemId = hb !== undefined ? hb.slots[i] : "";
          if (itemId === "" || itemId === undefined) return "[" + key + "]  —";
          const it = Item.get(itemId);
          const name = it !== undefined ? I18n.text(it.name) : itemId;
          const inv = scene.level.entities.get(scene.playerId, Inventory);
          const n = inv !== undefined ? InventorySystem.count(inv, itemId) : 0;
          return "[" + key + "]  " + name + " (" + n + ")";
        },
        { color: FacetTheme.text, font: "description" },
      ),
    );
    card.insertChild(row);
    return card;
  },

  /**
   * one survival-need RESERVE bar: facetProgress of (1 - value/max), so full = satiated, read live
   */
  _needBar(scene, token, labelKey, fillColor) {
    const row = new UIElement({ width: "100%", height: 20 });
    row.insertChild(
      facetProgress(
        () => 1 - Survival.fraction(scene.level.entities.get(scene.playerId, token)),
        {
          label: I18n.textRef(labelKey),
          fillColor: fillColor,
          height: 20,
          font: "description",
        },
      ),
    );
    return row;
  },

  /**
   * centered "Sleeping…" overlay, toggled by scene._sleeping while a bed fast-forwards time
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
      facetLabel(I18n.textRef("RPG_SLEEPING"), {
        color: FacetTheme.text,
        font: "header",
        halign: fa_center,
      }),
    );
    wrap.insertChild(card);
    wrap.enabled = false;
    scene._sleepOverlay = wrap;
    scene.ui.insertChild(wrap);
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
          const st = scene.level.entities.get(scene.playerId, Stats);
          const hpC = scene.level.entities.get(scene.playerId, Health);
          const hp = hpC !== undefined ? hpC.hp : 0;
          return I18n.text("RPG_HUD", hp, st.maxHp);
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
          const prof = EquipmentSystem.weaponProfile(
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
          const sta = scene.level.entities.get(scene.playerId, Stamina);
          const st = scene.level.entities.get(scene.playerId, Stats);
          if (sta === undefined || st === undefined || st.maxStamina <= 0)
            return 0;
          return sta.value / st.maxStamina;
        },
        {
          label: I18n.textRef("RPG_STAMINA"),
          fillColor: "#5bc8d6",
          height: 20,
          font: "description",
        },
      ),
    );
    card.insertChild(staRow);
    // survival needs — Thirst / Hunger / Drowsiness as reserve bars; the critical debuff
    // (dehydrated/starving/drowsy) shows in the status row below
    card.insertChild(Hud._needBar(scene, Thirst, "RPG_THIRST", "#4aa3d6"));
    card.insertChild(Hud._needBar(scene, Hunger, "RPG_HUNGER", "#c98a3a"));
    card.insertChild(
      Hud._needBar(scene, Drowsiness, "RPG_DROWSY", "#8a7ec0"),
    );
    // world clock: "Season · Day N  HH:MM", read live
    const timeRow = new UIElement({ width: "100%", height: 20 });
    timeRow.insertChild(
      facetLabel(
        () =>
          I18n.text(
            "RPG_TIME",
            I18n.text(WorldClock.season().name),
            WorldClock.seasonDay(),
            WorldClock.clockText(),
          ),
        { color: FacetTheme.textMuted },
      ),
    );
    card.insertChild(timeRow);
    // weather condition + ambient temperature, both derived live
    const tempRow = new UIElement({ width: "100%", height: 20 });
    tempRow.insertChild(
      facetLabel(
        () =>
          I18n.text(
            "RPG_COND",
            I18n.text(Weather.current().name),
            Temperature.display(),
          ),
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
          const list = StatusSystem.list(scene.level.entities, scene.playerId);
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
        emptyText: I18n.textRef("RPG_NO_QUEST"),
      }),
    );
    hud.insertChild(card);
    scene.ui.insertChild(hud);
  },

  /**
   * Bottom-center dialogue card, toggled via scene._dlg.enabled from step().
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
    scene._dlg = wrap;
    scene.ui.insertChild(wrap);
  },
};
