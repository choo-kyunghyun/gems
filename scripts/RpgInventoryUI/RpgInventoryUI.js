// Near-fullscreen, tabbed character window (Items / Equipment / Party / Stats / Quests / Settings).
// Built ONCE; rebuild() only swaps data so sort/filter/scroll/tab survive every equip or use.
globalThis.RpgInventoryUI = {
  // Build the hidden overlay + persistent tabbed structure once. Fixed panel (not a UIModal):
  // absolute host, dim backdrop toggled via .enabled, flex-grow tab host reflows on a live
  // uiScale change. Build-once + toggle-.enabled is what lets a rebuild keep sort/filter/scroll.
  build(scene) {
    const margin = 28;
    // Absolute → fills the screen ignoring gemsRoot padding. Inserted AFTER the HUD so the
    // backdrop veils it.
    const host = new UIElement({
      positionType: "absolute",
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
      padding: margin,
      alignItems: "center",
    });
    host.addComponent(
      new UIPanel({ color: gemsColor("#000000"), alpha: 0.72 }),
    );
    host.addComponent(new UITrigger({})); // swallow clicks on the dim so they don't reach the world
    scene._invWin = host;
    scene._invWin.enabled = false;
    scene.ui.insertChild(scene._invWin);

    // full-height card, capped on ultra-wide displays
    const inner = new UIElement({
      width: "100%",
      maxWidth: 1100,
      height: "100%",
    });
    const card = gemsCard({
      width: "100%",
      flexGrow: 1,
      padding: GemsTheme.pad,
      gap: GemsTheme.gapSm,
    });

    // title + close (x); Esc / the inventory key also close (sceneRpg.handleEscape + step() toggle)
    const titleRow = new UIElement({
      width: "100%",
      height: 40,
      flexShrink: 0,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    });
    titleRow.insertChild(
      gemsLabel(I18n.textRef("INV_TITLE"), {
        font: "header",
        color: GemsTheme.text,
      }),
    );
    titleRow.insertChild(
      gemsButton(
        "x",
        () => {
          scene.invOpen = false;
          scene._invWin.enabled = false;
        },
        { width: 32, height: 32, rad: GemsTheme.radiusSm },
      ),
    );
    card.insertChild(titleRow);
    card.insertChild(gemsDivider());

    inner.insertChild(card);
    host.insertChild(inner);
    host.body = card; // the tabs (built below) flex-grow inside the card, under the title row

    scene._invSel = null; // selected row model
    scene._invSelTime = 0; // last select time (ms) for double-click-to-use
    scene._invCat = ""; // active category filter code ("" = all)
    scene._invSearch = ""; // active name search (lowercased; "" = none)

    const tabs = gemsTabs(
      [
        {
          label: I18n.textRef("INV_TAB_ITEMS"),
          content: RpgInventoryUI._buildItemsTab(scene),
        },
        {
          label: I18n.textRef("INV_TAB_EQUIP"),
          content: RpgInventoryUI._buildEquipTab(scene),
        },
        {
          label: I18n.textRef("INV_TAB_PARTY"),
          content: RpgInventoryUI._buildFollowerTab(scene),
        },
        {
          label: I18n.textRef("INV_TAB_STATS"),
          content: RpgInventoryUI._buildStatsTab(scene),
        },
        {
          label: I18n.textRef("INV_TAB_QUESTS"),
          content: RpgInventoryUI._buildQuestsTab(scene),
        },
        {
          label: I18n.textRef("INV_TAB_ACH"),
          content: RpgInventoryUI._buildAchievementsTab(scene),
        },
        {
          label: I18n.textRef("INV_TAB_SETTINGS"),
          content: RpgInventoryUI._buildSettingsTab(scene),
        },
      ],
      { grow: true }, // fill the card; the Items tab + bag table grow with it
    );
    scene._invWin.body.insertChild(tabs);
  },

  // ── tab pages
  // Items: usage + category filter, search + clear, the bag table, select/action row.
  _buildItemsTab(scene) {
    // fill the tab host so the grow table takes leftover height + reflows its row count on resize
    const page = new UIElement({
      width: "100%",
      flexGrow: 1,
      flexBasis: 0,
      gap: GemsTheme.gapSm,
    });

    const top = new UIElement({
      width: "100%",
      height: 30,
      flexDirection: "row",
      alignItems: "center",
      gap: GemsTheme.gapSm,
    });
    const usageCell = new UIElement({ flexGrow: 1, flexBasis: 0 });
    usageCell.insertChild(
      // read scene.world LIVE (not a captured const): RpgMap.go swaps scene.world on a map
      // change while the window is open, so a captured ref would read the parked old world.
      gemsLabel(
        () => {
          const v = scene.world.get(Inventory, scene.ctrl.id);
          let s =
            I18n.text("RPG_SLOTS") + " " + v.slots.length + "/" + v.capacity;
          if (v.maxWeight !== undefined)
            s +=
              "   " +
              I18n.text("RPG_WEIGHT") +
              " " +
              InventorySystem.weight(v) +
              "/" +
              v.maxWeight;
          return s;
        },
        { color: GemsTheme.textMuted },
      ),
    );
    top.insertChild(usageCell);
    const cats = [
      { name: I18n.text("INV_CAT_ALL"), value: "" },
      { name: I18n.text("INV_CAT_FAV"), value: "fav" },
      { name: I18n.text("INV_CAT_WEAPON"), value: "weapon" },
      { name: I18n.text("INV_CAT_GEAR"), value: "gear" },
      { name: I18n.text("INV_CAT_CONSUMABLE"), value: "consumable" },
      { name: I18n.text("INV_CAT_MISC"), value: "misc" },
    ];
    // fixed-width wrapper — gemsSelectCustom is width:100% and would else squish the usage label
    const filterCell = new UIElement({ width: 170, flexShrink: 0 });
    filterCell.insertChild(
      gemsSelectCustom(cats, 0, (_i, code) => {
        scene._invCat = code;
        RpgInventoryUI._applyFilter(scene);
      }),
    );
    top.insertChild(filterCell);
    page.insertChild(top);

    // free-text name filter + Clear; composes with the category select into one predicate
    // (see _applyFilter). Typing sets UIInput.active, which suspends UINav so the caret keeps keys.
    const searchRow = new UIElement({
      width: "100%",
      height: 32,
      flexDirection: "row",
      alignItems: "center",
      gap: GemsTheme.gapSm,
    });
    const searchCell = new UIElement({ flexGrow: 1, flexBasis: 0 });
    const searchInput = gemsInput({
      height: 30,
      placeholder: I18n.text("INV_SEARCH"),
      onChange: (v) => {
        scene._invSearch = InvTable.lower(v);
        RpgInventoryUI._applyFilter(scene);
      },
    });
    const searchComp = searchInput.getComponent(UIInput);
    searchCell.insertChild(searchInput);
    searchRow.insertChild(searchCell);
    searchRow.insertChild(
      gemsButton(
        I18n.textRef("INV_CLEAR"),
        () => {
          searchComp.setValue(""); // setValue doesn't fire onChange — reset by hand
          scene._invSearch = "";
          RpgInventoryUI._applyFilter(scene);
        },
        { width: 76, height: 28 },
      ),
    );
    page.insertChild(searchRow);

    // bag table, built once with the Settings-driven column set; rebuild() only swaps rows (a
    // column toggle calls setColumns), so sort/filter/scroll persist.
    const table = gemsTable(InvTable.columns({ worn: true, fav: true }), {
      grow: true, // fill the page; UITable reflows its row count to the live height
      rowH: 26,
      headerH: 26,
      sortBy: 1, // Name (always column index 1: worn marker is 0, Name is 1)
      emptyText: I18n.text("RPG_EMPTY"),
      onSelect: (row) => RpgInventoryUI._onSelect(scene, row),
      onActivate: (row) => RpgInventoryUI._activate(scene, row),
    });
    scene._invTable = table.getComponent(UITable);
    page.insertChild(table);

    // selected item name + a context action (Use/Equip/Unequip)
    const action = new UIElement({
      width: "100%",
      height: 32,
      flexDirection: "row",
      alignItems: "center",
      gap: GemsTheme.gapSm,
    });
    const selCell = new UIElement({ flexGrow: 1, flexBasis: 0 });
    selCell.insertChild(
      gemsLabel(
        () =>
          scene._invSel === null
            ? I18n.text("INV_SELECT_NONE")
            : scene._invSel.name,
        { color: GemsTheme.text },
      ),
    );
    action.insertChild(selCell);
    action.insertChild(
      gemsButton(
        () => RpgInventoryUI._favLabel(scene),
        () => RpgInventoryUI._toggleFav(scene),
        { width: 110, height: 28, disabled: () => scene._invSel === null },
      ),
    );
    action.insertChild(
      gemsButton(
        () => RpgInventoryUI._actionLabel(scene),
        () => {
          if (scene._invSel !== null)
            RpgInventoryUI._activate(scene, scene._invSel);
        },
        { width: 120, height: 28 },
      ),
    );
    page.insertChild(action);

    // Hotbar manage strip: click a slot to bind the selected bag item, or clear when none selected.
    // The number keys 1..N USE the bound item in play (RpgController). Labels read the live Hotbar.
    const hbTitle = new UIElement({ width: "100%", height: 20 });
    hbTitle.insertChild(
      gemsLabel(I18n.textRef("INV_HOTBAR"), { color: "#ffd166" }),
    );
    page.insertChild(hbTitle);
    const hbRow = new UIElement({
      width: "100%",
      height: 34,
      flexDirection: "row",
      alignItems: "center",
      gap: GemsTheme.gapSm,
    });
    for (let i = 0; i < RPG_HOTBAR_SIZE; i++) {
      const cell = new UIElement({ flexGrow: 1, flexBasis: 0 });
      cell.insertChild(RpgInventoryUI._hotbarBtn(scene, i));
      hbRow.insertChild(cell);
    }
    page.insertChild(hbRow);
    return page;
  },

  // one hotbar manage button: "[n] Name" (or "[n]" when empty), read live
  _hotbarBtn(scene, i) {
    return gemsButton(
      () => {
        const hb = scene.world.get(Hotbar, scene.ctrl.id);
        const itemId = hb !== undefined ? hb.slots[i] : "";
        if (itemId === "" || itemId === undefined) return "[" + (i + 1) + "]";
        const it = Item.get(itemId);
        return (
          "[" +
          (i + 1) +
          "] " +
          (it !== undefined ? I18n.text(it.name) : itemId)
        );
      },
      () => RpgInventoryUI._assignHotbar(scene, i),
      { height: 30 },
    );
  },

  _assignHotbar(scene, i) {
    const hb = scene.world.get(Hotbar, scene.ctrl.id);
    if (hb === undefined) return;
    if (scene._invSel !== null) HotbarSystem.set(hb, i, scene._invSel.itemId);
    else HotbarSystem.clear(hb, i);
    scene._showHotbar(); // pop the HUD bar so the change is visible
  },

  // favorite action-button verb ("Favorite" / "Unfavorite"; "-" when none)
  _favLabel(scene) {
    if (scene._invSel === null) return I18n.text("INV_NOACTION");
    const fav = scene.world.get(Favorites, scene.ctrl.id);
    return fav !== undefined && FavoritesSystem.has(fav, scene._invSel.itemId)
      ? I18n.text("INV_UNFAVORITE")
      : I18n.text("INV_FAVORITE");
  },

  _toggleFav(scene) {
    if (scene._invSel === null) return;
    const fav = scene.world.get(Favorites, scene.ctrl.id);
    if (fav === undefined) return;
    FavoritesSystem.toggle(fav, scene._invSel.itemId);
    scene._invDirty = true;
  },

  // Equipment: worn-slot rows, repopulated per rebuild into this host.
  _buildEquipTab(scene) {
    const page = new UIElement({ width: "100%", gap: GemsTheme.gapSm });
    const title = new UIElement({ width: "100%", height: 22 });
    title.insertChild(
      gemsLabel(I18n.textRef("RPG_EQUIPMENT"), { color: "#ffd166" }),
    );
    page.insertChild(title);
    scene._invEquipHost = new UIElement({
      width: "100%",
      gap: GemsTheme.gapSm,
    });
    page.insertChild(scene._invEquipHost);
    return page;
  },

  // Party: companion roster host + a binding-aware recall hint. Roster repopulated per rebuild
  // (present companions change across maps); per-row text + Dismiss state read the live Follower.
  _buildFollowerTab(scene) {
    const page = new UIElement({ width: "100%", gap: GemsTheme.gapSm });
    const title = new UIElement({ width: "100%", height: 22 });
    title.insertChild(
      gemsLabel(I18n.textRef("INV_FOLLOWERS"), { color: "#ffd166" }),
    );
    page.insertChild(title);
    scene._invFollowerHost = new UIElement({
      width: "100%",
      gap: GemsTheme.gapSm,
    });
    page.insertChild(scene._invFollowerHost);

    // recall hint, binding-aware (reads the follow action's live key, like gemsKeyHints)
    page.insertChild(gemsDivider());
    const hint = new UIElement({ width: "100%", height: 20 });
    hint.insertChild(
      gemsLabel(
        () => I18n.text("FOLLOWER_RECALL_HINT", Input.get("follow").label()),
        { color: GemsTheme.textDim },
      ),
    );
    page.insertChild(hint);
    return page;
  },

  // One card per companion in scene.followers (empty notice when none). Called from rebuild(),
  // not build() — the party isn't seeded until after the window is built.
  _buildFollowerRows(scene, host) {
    const ids = scene.followers;
    if (ids === undefined || ids.length === 0) {
      const empty = new UIElement({ width: "100%", height: 24 });
      empty.insertChild(
        gemsLabel(I18n.textRef("INV_NO_FOLLOWERS"), {
          color: GemsTheme.textDim,
        }),
      );
      host.insertChild(empty);
      return;
    }
    for (let i = 0; i < ids.length; i++) {
      if (!scene.world.isValid(ids[i])) continue;
      host.insertChild(RpgInventoryUI._followerRow(scene, ids[i]));
    }
  },

  // one companion card: name, live status + carry-bonus line, Dismiss button (sends to the
  // claimed build area, disabled unless currently following — recall is walk-up + follow key)
  _followerRow(scene, fid) {
    const card = gemsCard({ padding: GemsTheme.padSm, gap: GemsTheme.gapSm });

    const head = new UIElement({ width: "100%", height: 22 });
    head.insertChild(
      gemsLabel(
        () => {
          const nm = scene.world.get(Name, fid);
          return nm !== undefined ? nm.name : I18n.text("FOLLOWER_DEFAULT");
        },
        { color: GemsTheme.text, font: "header" },
      ),
    );
    card.insertChild(head);

    const status = new UIElement({ width: "100%", height: 20 });
    status.insertChild(
      gemsLabel(
        () => {
          const f = scene.world.get(Follower, fid);
          if (f === undefined) return "";
          let state;
          if (scene.world.get(Downed, fid) !== undefined)
            state = I18n.text("FOLLOWER_STATE_DOWN"); // incapacitated, recovering to base
          else if (f.state === "follow")
            state = I18n.text("FOLLOWER_STATE_FOLLOW");
          else state = I18n.text("FOLLOWER_STATE_WAIT");
          return (
            state +
            "   ·   " +
            I18n.text(
              "FOLLOWER_BONUS",
              f.bonusCapacity ?? 0,
              f.bonusWeight ?? 0,
            )
          );
        },
        { color: GemsTheme.textMuted },
      ),
    );
    card.insertChild(status);

    card.insertChild(
      gemsButton(
        I18n.textRef("FOLLOWER_DISMISS"),
        () => scene._dismissFollower(fid),
        {
          height: 30,
          disabled: () => {
            const f = scene.world.get(Follower, fid);
            return (
              f === undefined ||
              f.state !== "follow" ||
              scene.world.get(Downed, fid) !== undefined // can't dismiss while down
            );
          },
        },
      ),
    );
    return card;
  },

  // Stats: live character sheet + the genre's extra records (Profile) host.
  _buildStatsTab(scene) {
    const page = new UIElement({ width: "100%", gap: GemsTheme.gapSm });
    const statRow = (labelKey, getter) => {
      const row = new UIElement({
        width: "100%",
        height: 26,
        flexDirection: "row",
        alignItems: "center",
      });
      const lc = new UIElement({ flexGrow: 1, flexBasis: 0 });
      lc.insertChild(
        gemsLabel(I18n.textRef(labelKey), { color: GemsTheme.textMuted }),
      );
      row.insertChild(lc);
      row.insertChild(
        gemsLabel(
          () => {
            const st = scene.world.get(Stats, scene.ctrl.id);
            return st === undefined ? "" : String(getter(st));
          },
          { color: GemsTheme.text },
        ),
      );
      return row;
    };
    page.insertChild(statRow("STAT_ATK", (st) => st.attack));
    page.insertChild(statRow("STAT_DEF", (st) => st.defense));
    page.insertChild(statRow("STAT_SPD", (st) => Math.round(st.speed)));

    // primary attributes — the inputs the derived stats come from. Data-driven from
    // StatModel.ATTRS, reading the live Attributes bag, so a *_shard grant shows on next rebuild.
    page.insertChild(gemsDivider());
    page.insertChild(
      gemsLabel(I18n.textRef("INV_ATTRIBUTES"), { color: "#ffd166" }),
    );
    const attrRow = (def) => {
      const row = new UIElement({
        width: "100%",
        height: 26,
        flexDirection: "row",
        alignItems: "center",
      });
      const lc = new UIElement({ flexGrow: 1, flexBasis: 0 });
      lc.insertChild(
        gemsLabel(I18n.textRef(def.name), { color: GemsTheme.textMuted }),
      );
      row.insertChild(lc);
      row.insertChild(
        gemsLabel(
          () => {
            const at = scene.world.get(Attributes, scene.ctrl.id);
            return at === undefined ? "" : String(at[def.id]);
          },
          { color: GemsTheme.text },
        ),
      );
      return row;
    };
    for (let i = 0; i < StatModel.ATTRS.length; i++) {
      page.insertChild(attrRow(StatModel.ATTRS[i]));
    }

    page.insertChild(gemsDivider());
    scene._invExtraHost = new UIElement({
      width: "100%",
      gap: GemsTheme.gapSm,
    });
    page.insertChild(scene._invExtraHost);
    return page;
  },

  // Quests: live tracker bound to the global QuestLog.
  _buildQuestsTab(scene) {
    const page = new UIElement({ width: "100%", gap: GemsTheme.gapSm });
    page.insertChild(
      gemsQuestTracker({
        source: QuestLog,
        emptyText: I18n.text("INV_NO_QUESTS"),
      }),
    );
    return page;
  },

  // Achievements: one card per registered def. Built ONCE (the set is static after registration,
  // which precedes the window build); the status label reads Achievement live, so unlocks — or the
  // Debug panel's Unlock/Clear All — show with no rebuild.
  _buildAchievementsTab(_scene) {
    const page = new UIElement({ width: "100%", gap: GemsTheme.gapSm });
    const all = Achievement.all();
    for (let i = 0; i < all.length; i++)
      page.insertChild(RpgInventoryUI._achievementRow(all[i]));
    return page;
  },

  // one achievement card: name + live unlock status on the head row, description under
  _achievementRow(a) {
    const card = gemsCard({ padding: GemsTheme.padSm, gap: GemsTheme.gapSm });

    const head = new UIElement({
      width: "100%",
      height: 22,
      flexDirection: "row",
      alignItems: "center",
    });
    const nameCell = new UIElement({ flexGrow: 1, flexBasis: 0 });
    nameCell.insertChild(
      gemsLabel(I18n.textRef(a.name), {
        color: GemsTheme.text,
        font: "header",
      }),
    );
    head.insertChild(nameCell);
    head.insertChild(
      gemsRichText(() =>
        Achievement.isUnlocked(a.id)
          ? "[c=accent]" + I18n.text("ACH_UNLOCKED") + "[/c]"
          : "[c=dim]" + I18n.text("ACH_LOCKED") + "[/c]",
      ),
    );
    card.insertChild(head);

    const desc = new UIElement({ width: "100%", height: 20 });
    desc.insertChild(
      gemsLabel(I18n.textRef(a.desc), { color: GemsTheme.textMuted }),
    );
    card.insertChild(desc);
    return card;
  },

  // Settings: per-column visibility toggles, persisted. Toggling calls setColumns, which keeps
  // the current sort by column key.
  _buildSettingsTab(scene) {
    const page = new UIElement({ width: "100%", gap: GemsTheme.gapSm });
    const title = new UIElement({ width: "100%", height: 22 });
    title.insertChild(
      gemsLabel(I18n.textRef("INV_SET_COLS"), { color: "#ffd166" }),
    );
    page.insertChild(title);
    // UICheckbox.onToggle passes NO argument — flip off the live value, not a `v` arg (which
    // would be undefined and made the toggles one-way: disable but never re-enable).
    const toggle = (labelKey, settingKey) =>
      gemsCheckbox(
        I18n.textRef(labelKey),
        () => Settings.get(settingKey),
        () => {
          Settings.set(settingKey, !Settings.get(settingKey));
          Settings.save();
          RpgInventoryUI._applyColumns(scene);
        },
        { style: "switch" },
      );
    page.insertChild(toggle("INV_COL_RARITY", "invColRarity"));
    page.insertChild(toggle("INV_COL_TYPE", "invColType"));
    page.insertChild(toggle("INV_COL_WT", "invColWeight"));
    page.insertChild(toggle("INV_COL_VAL", "invColValue"));

    // Units: ambient-temperature display unit. The HUD reads Temperature.display() live, so
    // persisting updates it next frame — no rebuild.
    page.insertChild(gemsDivider());
    const unitsTitle = new UIElement({ width: "100%", height: 22 });
    unitsTitle.insertChild(
      gemsLabel(I18n.textRef("INV_SET_UNITS"), { color: "#ffd166" }),
    );
    page.insertChild(unitsTitle);
    const units = [
      { name: "K", value: "K" },
      { name: "°C", value: "C" },
      { name: "°F", value: "F" },
    ];
    let unitIdx = 0;
    for (let i = 0; i < units.length; i++)
      if (units[i].value === Settings.get("tempUnit")) unitIdx = i;
    page.insertChild(
      gemsRow(
        I18n.textRef("INV_SET_TEMP"),
        gemsSelectCustom(units, unitIdx, (_i, code) => {
          Settings.set("tempUnit", code);
          Settings.save();
        }),
      ),
    );

    // HUD: player-centered radar (RadarArrows, drawn live in sceneRpg.draw, reads the setting
    // each frame) — just flip + persist, no _applyColumns like the column toggles.
    page.insertChild(gemsDivider());
    const hudTitle = new UIElement({ width: "100%", height: 22 });
    hudTitle.insertChild(
      gemsLabel(I18n.textRef("INV_SET_HUD"), { color: "#ffd166" }),
    );
    page.insertChild(hudTitle);
    page.insertChild(
      gemsCheckbox(
        I18n.textRef("INV_RADAR"),
        () => Settings.get("rpgRadar"),
        () => {
          Settings.set("rpgRadar", !Settings.get("rpgRadar"));
          Settings.save();
        },
        { style: "switch" },
      ),
    );
    return page;
  },

  // Refresh live data only (so the view/scroll/active tab survive): swap rows keeping
  // sort/filter, re-map the selection, rebuild equipment + extra + party sections.
  //   opts: { equipSlots: [{ slot, labelKey }], extraRows?(scene, host) }
  rebuild(scene, opts) {
    const rows = RpgInventoryUI._buildRows(scene);
    scene._invTable.setRows(rows);

    // re-map the selection by uid/itemId so the highlight survives the swap (row models are
    // fresh objects each refresh, so the old _invSel ref is stale)
    if (scene._invSel !== null) {
      let found = null;
      for (let i = 0; i < rows.length; i++) {
        if (RpgInventoryUI._sameRow(rows[i], scene._invSel)) {
          found = rows[i];
          break;
        }
      }
      scene._invSel = found;
      scene._invTable.selectRow(found);
    }

    // equipment rows: clear + re-add for the new contents
    const eh = scene._invEquipHost;
    const ek = [...eh.children];
    for (let i = 0; i < ek.length; i++) ek[i].destroy();
    for (let i = 0; i < opts.equipSlots.length; i++)
      eh.insertChild(
        RpgInventoryUI._equipRow(
          scene,
          opts.equipSlots[i].slot,
          opts.equipSlots[i].labelKey,
        ),
      );

    // genre extra rows (Profile records) into the Stats tab
    const xh = scene._invExtraHost;
    const xk = [...xh.children];
    for (let i = 0; i < xk.length; i++) xk[i].destroy();
    if (opts.extraRows !== undefined) opts.extraRows(scene, xh);

    // party roster rebuilt here (not live) because present companions change across maps
    // (a "follow" one travels, a "wait" one is map-local). Per-row state is live off the Follower.
    const fh = scene._invFollowerHost;
    if (fh !== undefined) {
      const fk = [...fh.children];
      for (let i = 0; i < fk.length; i++) fk[i].destroy();
      RpgInventoryUI._buildFollowerRows(scene, fh);
    }
  },

  // Push the current Settings-driven column set onto the live table (setColumns remaps the sort
  // by column key). The chest shares these Settings, so sync its tables too when both are open.
  _applyColumns(scene) {
    scene._invTable.setColumns(InvTable.columns({ worn: true, fav: true }));
    if (scene._storeBagTable !== undefined) StorageUI._applyColumns(scene);
  },

  // Build row models from the live bag. `worn` marks by INSTANCE uid (exact), so with two of the
  // same equippable only the worn instance lights.
  _buildRows(scene) {
    const inv = scene.world.get(Inventory, scene.ctrl.id);
    const eq = scene.world.get(Equipment, scene.ctrl.id);
    const fav = scene.world.get(Favorites, scene.ctrl.id);
    const rows = [];
    for (let i = 0; i < inv.slots.length; i++) {
      const slot = inv.slots[i];
      const it = Item.get(slot.itemId);
      let worn = false;
      if (it !== undefined && it.hasComponent(Equippable)) {
        const eqp = it.getComponent(Equippable);
        if (slot.uid !== undefined && eq.slots[eqp.slot] === slot.uid)
          worn = true;
      }
      const favd = fav !== undefined && FavoritesSystem.has(fav, slot.itemId);
      rows.push({
        ...InvTable.rowModel(slot.itemId, slot.qty, slot.uid, slot.mods),
        worn,
        fav: favd,
      });
    }
    return rows;
  },

  // Compose the category select + search box into ONE predicate (UITable takes one filter fn);
  // null when neither active.
  _applyFilter(scene) {
    const cat = scene._invCat;
    const q = scene._invSearch;
    if (cat === "" && q === "") {
      scene._invTable.setFilter(null);
      return;
    }
    // "fav" is a pseudo-category (the favorited flag, not item type); the rest match r.cat
    scene._invTable.setFilter(
      (r) =>
        (cat === "" || (cat === "fav" ? r.fav : r.cat === cat)) &&
        (q === "" || r.search.indexOf(q) >= 0),
    );
  },

  // Click selects; a second click on the SAME row within 350ms acts on it (double-click).
  // Identity is the instance uid when present (so a re-click hits the same instance, not its twin).
  _onSelect(scene, row) {
    const now = current_time;
    if (
      scene._invSel !== null &&
      RpgInventoryUI._sameRow(scene._invSel, row) &&
      now - scene._invSelTime < 350
    ) {
      RpgInventoryUI._activate(scene, row);
      return;
    }
    scene._invSel = row;
    scene._invSelTime = now;
  },

  // same item: by instance uid when present, else by itemId
  _sameRow(a, b) {
    if (a.uid !== undefined || b.uid !== undefined) return a.uid === b.uid;
    return a.itemId === b.itemId;
  },

  _activate(scene, row) {
    if (row === null || row === undefined) return;
    RpgInventoryUI.useItem(scene, row.itemId, row.worn, row.uid);
  },

  // context action verb for the selected item ("-" when none)
  _actionLabel(scene) {
    if (scene._invSel === null) return I18n.text("INV_NOACTION");
    const it = Item.get(scene._invSel.itemId);
    if (it !== undefined && it.hasComponent(Equippable))
      return scene._invSel.worn
        ? I18n.text("INV_UNEQUIP")
        : I18n.text("INV_EQUIP");
    if (it !== undefined && it.hasComponent(Consumable))
      return I18n.text("INV_USE");
    return I18n.text("INV_NOACTION");
  },

  // One equipment slot: a click-to-unequip button when worn, else a muted label. The slot holds
  // the equipped INSTANCE uid; resolve it to the live bag slot for the itemId + mods.
  _equipRow(scene, slot, labelKey) {
    const eq = scene.world.get(Equipment, scene.ctrl.id);
    const uid = eq !== undefined ? eq.slots[slot] : "";
    if (uid !== undefined && uid !== "") {
      const inv = scene.world.get(Inventory, scene.ctrl.id);
      const inst =
        inv !== undefined ? InventorySystem.findByUid(inv, uid) : undefined;
      const itemId = inst !== undefined ? inst.itemId : "";
      const it = Item.get(itemId);
      const base = it !== undefined ? I18n.text(it.name) : itemId;
      // `mods` is the named-slot MAP { slotId -> attachmentItemId }; count its filled slots for "+N".
      let modCount = 0;
      if (inst !== undefined && inst.mods !== undefined)
        for (const slotId in inst.mods) modCount++;
      const nm = modCount > 0 ? base + " +" + modCount : base;
      return gemsButton(
        I18n.text(labelKey) + ": " + nm,
        () => {
          EquipmentSystem.unequip(scene.world, scene.ctrl.id, slot);
          scene._invDirty = true;
          Log.info(`unequipped ${itemId}`);
        },
        {
          height: 30,
          textColor: RpgWorldOverlay._rarityColor(itemId),
          icon: it !== undefined ? it.sprite : -1,
        },
      );
    }
    const row = new UIElement({ width: "100%", height: 26 });
    row.insertChild(
      gemsLabel(I18n.text(labelKey) + ": " + I18n.text("SLOT_EMPTY"), {
        color: GemsTheme.textDim,
      }),
    );
    return row;
  },

  // Act on an item: equippables toggle equip/unequip, consumables use one unit. `wasWorn` is the
  // row's shown state (so with two identical equippables only the shown-equipped row unequips).
  // `uid` equips that exact instance; without it (the hotbar) equipFirst picks the first owned.
  useItem(scene, itemId, wasWorn, uid) {
    const item = Item.get(itemId);
    if (item === undefined) return;
    if (item.hasComponent(Equippable)) {
      const eqp = item.getComponent(Equippable);
      if (wasWorn) {
        EquipmentSystem.unequip(scene.world, scene.ctrl.id, eqp.slot);
        Log.info(`unequipped ${itemId}`);
      } else {
        const ok =
          uid !== undefined
            ? EquipmentSystem.equip(scene.world, scene.ctrl.id, uid)
            : EquipmentSystem.equipFirst(scene.world, scene.ctrl.id, itemId);
        if (ok) Log.info(`equipped ${itemId}`);
      }
    } else if (item.hasComponent(Consumable)) {
      if (ConsumableSystem.use(scene.world, scene.ctrl.id, itemId)) {
        Audio.play("snd_powerup"); // consumable used (heal / buff / attribute grant)
        Log.info(`used ${itemId}`);
      }
    }
    scene._invDirty = true;
  },
};
