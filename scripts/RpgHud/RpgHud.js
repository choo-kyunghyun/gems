// HUD + overlay panels for the RPG level — free functions taking the level (mirrors RpgCombat/
// RpgMap). Panels read level.entities/level.playerId LIVE via gemsLabel callbacks, so they survive
// the store swap on a map change (RpgMap.go).
globalThis.RpgHud = {
  // build the persistent panels once (level create)
  build(level) {
    RpgHud._hud(level);
    RpgHud._hotbar(level);
    RpgHud._dialogue(level);
    RpgHud._sleepOverlay(level);
  },

  // Bottom-center quick-use bar — one card per Hotbar slot, a LIVE "[n] Name (qty)" label read off
  // the player each frame. Display-only (binding is in RpgInventoryUI, using is sceneRpg._useHotbar).
  // sceneRpg hides the whole bar while build mode owns the bottom-center HUD.
  _hotbar(level) {
    const wrap = new UIElement({
      positionType: "absolute",
      left: 0,
      right: 0,
      bottom: 64, // clear of the dialogue box (bottom:24); above the key-hint footer
      flexDirection: "row",
      justifyContent: "center",
      gap: GemsTheme.gapSm,
    });
    for (let i = 0; i < RPG_HOTBAR_SIZE; i++)
      wrap.insertChild(RpgHud._hotbarSlot(level, i));
    level._hotbarBar = wrap;
    level.ui.insertChild(wrap);
  },

  _hotbarSlot(level, i) {
    const card = gemsCard({ width: 140, padding: GemsTheme.padSm });
    const row = new UIElement({
      width: "100%",
      flexDirection: "row",
      alignItems: "center",
    });
    // live item icon left of the label; "" (→ 0 width, no gap) when the slot is empty
    row.insertChild(
      gemsRichText(
        () => {
          if (level.playerId === undefined) return "";
          const hb = level.entities.get(Hotbar, level.playerId);
          const itemId = hb !== undefined ? hb.slots[i] : "";
          return itemId ? RpgWorldOverlay.iconTag(itemId) : "";
        },
        { font: "description" },
      ),
    );
    row.insertChild(
      gemsLabel(
        () => {
          const key = i + 1;
          if (level.playerId === undefined) return "[" + key + "]";
          const hb = level.entities.get(Hotbar, level.playerId);
          const itemId = hb !== undefined ? hb.slots[i] : "";
          if (itemId === "" || itemId === undefined) return "[" + key + "]  —";
          const it = Item.get(itemId);
          const name = it !== undefined ? I18n.text(it.name) : itemId;
          const inv = level.entities.get(Inventory, level.playerId);
          const n = inv !== undefined ? InventorySystem.count(inv, itemId) : 0;
          return "[" + key + "]  " + name + " (" + n + ")";
        },
        { color: GemsTheme.text, font: "description" },
      ),
    );
    card.insertChild(row);
    return card;
  },

  // one survival-need RESERVE bar: gemsProgress of (1 - value/max), so full = satiated, read live
  _needBar(level, token, labelKey, fillColor) {
    const row = new UIElement({ width: "100%", height: 20 });
    row.insertChild(
      gemsProgress(
        () => 1 - Survival.fraction(level.entities.get(token, level.playerId)),
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

  // centered "Sleeping…" overlay, toggled by level._sleeping while a bed fast-forwards time
  _sleepOverlay(level) {
    const wrap = new UIElement({
      positionType: "absolute",
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      justifyContent: "center",
      alignItems: "center",
    });
    const card = gemsCard({ padding: GemsTheme.pad });
    card.insertChild(
      gemsLabel(I18n.textRef("RPG_SLEEPING"), {
        color: GemsTheme.text,
        font: "header",
        halign: fa_center,
      }),
    );
    wrap.insertChild(card);
    wrap.enabled = false;
    level._sleepOverlay = wrap;
    level.ui.insertChild(wrap);
  },

  // Top-right HUD card: HP / ammo / stamina / needs / clock / weather / status + quest tracker.
  _hud(level) {
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
          const st = level.entities.get(Stats, level.playerId);
          const hpC = level.entities.get(Health, level.playerId);
          const hp = hpC !== undefined ? hpC.hp : 0;
          return I18n.text("RPG_HUD", hp, st.maxHp);
        },
        { color: GemsTheme.text, font: "header" },
      ),
    );
    card.insertChild(hpRow);
    // equipped-gun ammo readout (live): "<ammo>  rounds/magazine", unloaded hint, or "" for melee/
    // unarmed (the row self-sizes, so it collapses to ~0 height then)
    const ammoRow = new UIElement({ width: "100%" });
    ammoRow.insertChild(
      gemsLabel(
        () => {
          if (level.playerId === undefined) return "";
          const prof = EquipmentSystem.weaponProfile(
            level.entities,
            level.playerId,
          );
          if (prof === null || prof.kind !== "gun") return ""; // melee/unarmed → hide
          if (prof.noAmmo) return I18n.text("MOD_UNLOADED");
          const it = Item.get(prof.ammo);
          const nm = it !== undefined ? I18n.text(it.name) : prof.ammo;
          return nm + "  " + prof.rounds + "/" + prof.magazine;
        },
        { color: GemsTheme.warn, font: "description" },
      ),
    );
    card.insertChild(ammoRow);
    // stamina bar (sprint) — fraction of Stats.maxStamina, read live. Tall enough to seat the
    // centered "description"-font label inside the bar.
    const staRow = new UIElement({ width: "100%", height: 20 });
    staRow.insertChild(
      gemsProgress(
        () => {
          const sta = level.entities.get(Stamina, level.playerId);
          const st = level.entities.get(Stats, level.playerId);
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
    card.insertChild(RpgHud._needBar(level, Thirst, "RPG_THIRST", "#4aa3d6"));
    card.insertChild(RpgHud._needBar(level, Hunger, "RPG_HUNGER", "#c98a3a"));
    card.insertChild(
      RpgHud._needBar(level, Drowsiness, "RPG_DROWSY", "#8a7ec0"),
    );
    // world clock: "Season · Day N  HH:MM", read live
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
    // weather condition + ambient temperature, both derived live
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
    // active buffs/debuffs — each name tinted by its def color, read live; rich-text [c=#hex] spans
    // so several statuses tint independently ("" when none)
    const statusRow = new UIElement({ width: "100%", height: 20 });
    statusRow.insertChild(
      gemsRichText(
        () => {
          const list = StatusSystem.list(level.entities, level.playerId);
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
    card.insertChild(gemsDivider());
    card.insertChild(
      gemsQuestTracker({
        source: QuestLog,
        emptyText: I18n.textRef("RPG_NO_QUEST"),
      }),
    );
    hud.insertChild(card);
    level.ui.insertChild(hud);
  },

  // Bottom-center dialogue card, toggled via level._dlg.enabled from step().
  _dialogue(level) {
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
      gemsLabel(() => I18n.text(level.dialogueName), {
        color: GemsTheme.warn,
        font: "header",
      }),
    );
    const line = new UIElement({ width: "100%", height: 26 });
    line.insertChild(
      gemsLabel(() => I18n.text(level.dialogueLine), { color: GemsTheme.text }),
    );
    const action = new UIElement({ width: "100%", height: 22 });
    action.insertChild(
      gemsLabel(
        () =>
          level.dialogueAction !== ""
            ? "[E] " + I18n.text(level.dialogueAction)
            : "",
        { color: GemsTheme.good },
      ),
    );
    card.insertChild(name);
    card.insertChild(line);
    card.insertChild(action);
    wrap.insertChild(card);
    wrap.enabled = false;
    level._dlg = wrap;
    level.ui.insertChild(wrap);
  },
};
