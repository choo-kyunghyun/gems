// Near-fullscreen, tabbed character window (Items / Equipment / Party / Stats / Quests / Settings).
// Built ONCE; rebuild() only swaps data so filter/selection/active tab survive every equip or use.
/**
 * The Items tab is a slot GRID (UISlots) beside a detail pane — icons carry recognition, the pane
 * carries the metadata a table would spread across columns (chest/trade keep their tables).
 */
globalThis.RpgInventoryUI = {
  /**
   * Build the hidden overlay + persistent tabbed structure once. Fixed panel (not a UIModal):
   * absolute host, dim backdrop toggled via .enabled, flex-grow tab host reflows on a live
   * uiScale change. Build-once + toggle-.enabled is what lets a rebuild keep sort/filter/scroll.
   */
  build(scene) {
    // near-fullscreen shell (dim host + centered card + title/close) — gemsOverlay.
    // Inserted AFTER the HUD so the backdrop veils it; Esc / the inventory key also close
    // (sceneRpg.handleEscape + step() toggle). Tabs (built below) flex-grow in host.body.
    const host = gemsOverlay(I18n.textRef("INV_TITLE"), {
      onClose: () => {
        scene.invOpen = false;
        scene._invWin.enabled = false;
      },
    });
    scene._invWin = host;
    scene.ui.insertChild(host);

    scene._invSel = null; // selected row model
    scene._invClick = { key: "", time: 0 }; // InvTable.reclick latch (double-click-to-use)
    scene._invCat = ""; // active category filter code ("" = all)

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

  // Items-tab grid geometry + detail-pane tuning (plain data on the namespace object)
  GRID_COLS: 6,
  GRID_CELL: 64,
  GRID_GAP: 6,
  DETAIL_WRAP: 520, // wrap width for lore/description text in the detail pane
  // Equippable.mods stat keys → i18n labels for the detail pane bonus lines
  STAT_KEYS: {
    attack: "STAT_ATK",
    defense: "STAT_DEF",
    speed: "STAT_SPD",
    maxHp: "STAT_HP",
    maxStamina: "STAT_STA",
  },

  // ── tab pages
  // Items: usage + category filter + sort, the bag slot GRID (icons; rarity borders, worn/fav
  // badges) beside a detail pane (name, maker + lore, description, stats), select/action row.
  _buildItemsTab(scene) {
    // fill the tab host so the grid+detail row takes the leftover height
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
      // read scene.entities LIVE (not a captured const): RpgMap.go swaps scene.entities on a map
      // change while the window is open, so a captured ref would read the parked old store.
      gemsLabel(
        () => {
          const v = scene.entities.get(Inventory, scene.playerId);
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
        RpgInventoryUI._refreshGrid(scene);
        RpgInventoryUI._refreshDetail(scene); // the selection may have filtered away
      }),
    );
    top.insertChild(filterCell);
    // tidy the REAL bag order (merge stacks, category → rarer-first); the grid mirrors it
    top.insertChild(
      gemsButton(
        I18n.textRef("INV_SORT"),
        () => {
          InventorySystem.sort(scene.entities.get(Inventory, scene.playerId));
          scene._invDirty = true;
        },
        { width: 90, height: 28 },
      ),
    );
    page.insertChild(top);

    // grid (left, sized to the bag) + detail pane (right, fills the rest & stretches).
    // No gemsScroll around the grid — a clipped scroll beside a non-clipped sibling is the
    // GMRT batch-flush trap (see CraftingUI); the grid fits the tall card instead.
    const content = new UIElement({
      width: "100%",
      flexGrow: 1,
      flexBasis: 0,
      flexDirection: "row",
      gap: GemsTheme.gap,
    });
    const grid = gemsSlots([], {
      cols: RpgInventoryUI.GRID_COLS,
      cellSize: RpgInventoryUI.GRID_CELL,
      gap: RpgInventoryUI.GRID_GAP,
      onSelect: (i) => RpgInventoryUI._onGridSelect(scene, i),
      onActivate: (i) => {
        // browse-mode confirm acts on the cursor slot (the mouse path double-clicks)
        const row = scene._invView[i];
        if (row !== undefined) RpgInventoryUI._activate(scene, row);
      },
    });
    scene._invGrid = grid.getComponent(UISlots);
    scene._invGridEl = grid;
    scene._invView = []; // filtered row models, parallel to the grid's items
    const gridCell = new UIElement({ flexShrink: 0 });
    gridCell.insertChild(grid);
    content.insertChild(gridCell);

    const detail = new UIElement({
      flexGrow: 1,
      flexBasis: 0,
      padding: GemsTheme.padSm,
      gap: 4,
    });
    detail.addComponent(
      new UIPanel({
        color: gemsColor(GemsTheme.panel),
        rad: GemsTheme.radius,
        border: 1,
        borderColor: gemsColor(GemsTheme.border),
      }),
    );
    scene._invDetailHost = detail;
    content.insertChild(detail);
    page.insertChild(content);

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
    // The number keys 1..N USE the bound item in play (bound by PlayerSystem, dispatched by
    // sceneRpg._useHotbar). Labels read the live Hotbar.
    const hbTitle = new UIElement({ width: "100%", height: 20 });
    hbTitle.insertChild(
      gemsLabel(I18n.textRef("INV_HOTBAR"), { color: "warn" }),
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

  /**
   * one hotbar manage button: "[n] Name" (or "[n]" when empty), read live
   */
  _hotbarBtn(scene, i) {
    return gemsButton(
      () => {
        const hb = scene.entities.get(Hotbar, scene.playerId);
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
    const hb = scene.entities.get(Hotbar, scene.playerId);
    if (hb === undefined) return;
    if (scene._invSel !== null) HotbarSystem.set(hb, i, scene._invSel.itemId);
    else HotbarSystem.clear(hb, i);
    scene._showHotbar(); // pop the HUD bar so the change is visible
  },

  /**
   * favorite action-button verb ("Favorite" / "Unfavorite"; "-" when none)
   */
  _favLabel(scene) {
    if (scene._invSel === null) return I18n.text("INV_NOACTION");
    const fav = scene.entities.get(Favorites, scene.playerId);
    return fav !== undefined && FavoritesSystem.has(fav, scene._invSel.itemId)
      ? I18n.text("INV_UNFAVORITE")
      : I18n.text("INV_FAVORITE");
  },

  _toggleFav(scene) {
    if (scene._invSel === null) return;
    const fav = scene.entities.get(Favorites, scene.playerId);
    if (fav === undefined) return;
    FavoritesSystem.toggle(fav, scene._invSel.itemId);
    scene._invDirty = true;
  },

  /**
   * Equipment: worn-slot rows, repopulated per rebuild into this host.
   */
  _buildEquipTab(scene) {
    const page = new UIElement({ width: "100%", gap: GemsTheme.gapSm });
    const title = new UIElement({ width: "100%", height: 22 });
    title.insertChild(
      gemsLabel(I18n.textRef("RPG_EQUIPMENT"), { color: "warn" }),
    );
    page.insertChild(title);
    scene._invEquipHost = new UIElement({
      width: "100%",
      gap: GemsTheme.gapSm,
    });
    page.insertChild(scene._invEquipHost);
    return page;
  },

  /**
   * Party: companion roster host + a binding-aware recall hint. Roster repopulated per rebuild
   * (present companions change across maps); per-row text + Dismiss state read the live Follower.
   */
  _buildFollowerTab(scene) {
    const page = new UIElement({ width: "100%", gap: GemsTheme.gapSm });
    const title = new UIElement({ width: "100%", height: 22 });
    title.insertChild(
      gemsLabel(I18n.textRef("INV_FOLLOWERS"), { color: "warn" }),
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
        () => I18n.text("FOLLOWER_RECALL_HINT", Input.get("interact").label()),
        { color: GemsTheme.textDim },
      ),
    );
    page.insertChild(hint);
    return page;
  },

  /**
   * One card per squad companion, by live membership query (empty notice when none). Called from
   * rebuild(), not build() — the squad isn't seeded until after the window is built.
   */
  _buildFollowerRows(scene, host) {
    const squad = scene.entities.get(Squad, scene.playerId);
    const ids =
      squad !== undefined
        ? FollowerSystem.members(scene.entities, squad.id, scene.playerId)
        : [];
    if (ids.length <= 1) {
      // [0] is the player
      const empty = new UIElement({ width: "100%", height: 24 });
      empty.insertChild(
        gemsLabel(I18n.textRef("INV_NO_FOLLOWERS"), {
          color: GemsTheme.textDim,
        }),
      );
      host.insertChild(empty);
      return;
    }
    for (let i = 1; i < ids.length; i++) {
      if (!scene.entities.isValid(ids[i])) continue;
      host.insertChild(RpgInventoryUI._followerRow(scene, ids[i]));
    }
  },

  /**
   * one companion card: name, live status + carry-bonus line, Kick button (leaves the squad
   * PERMANENTLY, in place — rehire by walking up and talking)
   */
  _followerRow(scene, fid) {
    const card = gemsCard({ padding: GemsTheme.padSm, gap: GemsTheme.gapSm });

    const head = new UIElement({ width: "100%", height: 22 });
    head.insertChild(
      gemsLabel(
        () => {
          const nm = scene.entities.get(Name, fid);
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
          const f = scene.entities.get(Follower, fid);
          if (f === undefined) return "";
          let state;
          if (scene.entities.get(Downed, fid) !== undefined)
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
        () => scene._kickFollower(fid),
        {
          height: 30,
          disabled: () => {
            return (
              scene.entities.get(Squad, fid) === undefined || // already out
              scene.entities.get(Downed, fid) !== undefined // can't kick while down
            );
          },
        },
      ),
    );
    return card;
  },

  /**
   * Stats: live character sheet + the genre's extra records (Profile) host.
   */
  _buildStatsTab(scene) {
    const page = new UIElement({ width: "100%", gap: GemsTheme.gapSm });
    const statRow = (labelKey, getter) =>
      gemsKeyValueRow(I18n.textRef(labelKey), () => {
        const st = scene.entities.get(Stats, scene.playerId);
        return st === undefined ? "" : String(getter(st));
      });
    page.insertChild(statRow("STAT_ATK", (st) => st.attack));
    page.insertChild(statRow("STAT_DEF", (st) => st.defense));
    page.insertChild(statRow("STAT_SPD", (st) => Math.round(st.speed)));

    // primary attributes — the inputs the derived stats come from. Data-driven from
    // StatModel.ATTRS, reading the live Attributes bag, so a *_shard grant shows on next rebuild.
    page.insertChild(gemsDivider());
    page.insertChild(
      gemsLabel(I18n.textRef("INV_ATTRIBUTES"), { color: "warn" }),
    );
    const attrRow = (def) =>
      gemsKeyValueRow(I18n.textRef(def.name), () => {
        const at = scene.entities.get(Attributes, scene.playerId);
        return at === undefined ? "" : String(at[def.id]);
      });
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

  /**
   * Quests: live tracker bound to the global QuestLog.
   */
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

  /**
   * Achievements: one card per registered def. Built ONCE (the set is static after registration,
   * which precedes the window build); the status label reads Achievement live, so unlocks — or the
   * Debug section's Unlock/Clear All — show with no rebuild.
   */
  _buildAchievementsTab(_level) {
    const page = new UIElement({ width: "100%", gap: GemsTheme.gapSm });
    const all = Achievement.all();
    for (let i = 0; i < all.length; i++)
      page.insertChild(RpgInventoryUI._achievementRow(all[i]));
    return page;
  },

  /**
   * one achievement card: name + live unlock status on the head row, description under
   */
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

  /**
   * Settings: per-column visibility toggles, persisted. Toggling calls setColumns, which keeps
   * the current sort by column key.
   */
  _buildSettingsTab(scene) {
    const page = new UIElement({ width: "100%", gap: GemsTheme.gapSm });
    const title = new UIElement({ width: "100%", height: 22 });
    title.insertChild(
      gemsLabel(I18n.textRef("INV_SET_COLS"), { color: "warn" }),
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
          Settings.save(SETTINGS_FILE);
          RpgInventoryUI._applyColumns(scene);
        },
        { style: "switch" },
      );
    page.insertChild(toggle("INV_COL_RARITY", "invColRarity"));
    page.insertChild(toggle("INV_COL_MAKER", "invColMaker"));
    page.insertChild(toggle("INV_COL_TYPE", "invColType"));
    page.insertChild(toggle("INV_COL_WT", "invColWeight"));
    page.insertChild(toggle("INV_COL_VAL", "invColValue"));

    // Units: ambient-temperature display unit. The HUD reads Temperature.display() live, so
    // persisting updates it next frame — no rebuild.
    page.insertChild(gemsDivider());
    const unitsTitle = new UIElement({ width: "100%", height: 22 });
    unitsTitle.insertChild(
      gemsLabel(I18n.textRef("INV_SET_UNITS"), { color: "warn" }),
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
          Settings.save(SETTINGS_FILE);
        }),
      ),
    );

    // HUD: player-centered radar (RadarArrows, drawn live in sceneRpg.draw, reads the setting
    // each frame) — just flip + persist, no _applyColumns like the column toggles.
    page.insertChild(gemsDivider());
    const hudTitle = new UIElement({ width: "100%", height: 22 });
    hudTitle.insertChild(
      gemsLabel(I18n.textRef("INV_SET_HUD"), { color: "warn" }),
    );
    page.insertChild(hudTitle);
    page.insertChild(
      gemsCheckbox(
        I18n.textRef("INV_RADAR"),
        () => Settings.get("rpgRadar"),
        () => {
          Settings.set("rpgRadar", !Settings.get("rpgRadar"));
          Settings.save(SETTINGS_FILE);
        },
        { style: "switch" },
      ),
    );
    return page;
  },

  /**
   * Refresh live data only (so the view/filter/active tab survive): swap the grid's items,
   * re-map the selection, refresh the detail pane, rebuild equipment + extra + party sections.
   *   opts: { equipSlots: [{ slot, labelKey }], extraRows?(scene, host) }
   */
  rebuild(scene, opts) {
    RpgInventoryUI._refreshGrid(scene);
    RpgInventoryUI._refreshDetail(scene);

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

  /**
   * The bag is a grid now (no columns), but the Settings toggles still govern the shared
   * chest/trade tables — sync the chest window when it's open.
   */
  _applyColumns(scene) {
    if (scene._storeBagTable !== undefined) StorageUI._applyColumns(scene);
  },

  /**
   * Build row models from the live bag. `worn` marks by INSTANCE uid (exact), so with two of the
   * same equippable only the worn instance lights.
   */
  _buildRows(scene) {
    const inv = scene.entities.get(Inventory, scene.playerId);
    const eq = scene.entities.get(Equipment, scene.playerId);
    const fav = scene.entities.get(Favorites, scene.playerId);
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

  /**
   * Rebuild the grid view from the live bag: filter row models by category, map to UISlots
   * items (icon + rarity border + worn/fav badge), pad the unfiltered view with empty cells up
   * to capacity (the bag's size reads at a glance), re-map the selection, resize the element.
   */
  _refreshGrid(scene) {
    const rows = RpgInventoryUI._buildRows(scene);
    const cat = scene._invCat;
    const view = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      // "fav" is a pseudo-category (the favorited flag, not item type); the rest match r.cat
      if (cat === "" || (cat === "fav" ? r.fav : r.cat === cat)) view.push(r);
    }
    scene._invView = view;

    const gold = gemsColor("warn");
    const accent = gemsColor(GemsTheme.accent);
    const items = [];
    for (let i = 0; i < view.length; i++) {
      const r = view[i];
      const it = Item.get(r.itemId);
      items.push({
        sprite: it !== undefined ? it.sprite : -1,
        count: r.qty > 1 ? r.qty : null,
        borderColor: r.color, // rarity tint
        badge: r.worn ? "E" : r.fav ? "*" : null,
        badgeColor: r.worn ? accent : gold,
      });
    }
    if (cat === "") {
      const inv = scene.entities.get(Inventory, scene.playerId);
      for (let i = view.length; i < inv.capacity; i++) items.push(null);
    }

    const g = scene._invGrid;
    g.items = items;

    // re-map the selection by uid/itemId (row models are fresh objects each refresh)
    let sel = -1;
    if (scene._invSel !== null) {
      for (let i = 0; i < view.length; i++) {
        if (RpgInventoryUI._sameRow(view[i], scene._invSel)) {
          sel = i;
          break;
        }
      }
      scene._invSel = sel >= 0 ? view[sel] : null;
    }
    g.selected = sel;

    // fit the host element to the item count (flexpanel point mutation — the UIText idiom)
    const rowsN = Math.max(1, Math.ceil(items.length / g.cols));
    uiResizeTo(
      scene._invGridEl,
      g.cols * g.cellSize + (g.cols - 1) * g.gap,
      rowsN * g.cellSize + (rowsN - 1) * g.gap,
    );
  },

  /**
   * Grid click → select the backing row model; a re-click acts on it (InvTable.reclick owns the
   * gesture). Clicking an empty/padding cell clears the selection.
   */
  _onGridSelect(scene, i) {
    const row = i >= 0 && i < scene._invView.length ? scene._invView[i] : null;
    if (row === null) {
      scene._invSel = null;
      scene._invGrid.selected = -1;
      RpgInventoryUI._refreshDetail(scene);
      return;
    }
    if (InvTable.reclick(scene._invClick, row, "bag")) {
      RpgInventoryUI._activate(scene, row); // sets _invDirty → rebuild refreshes grid+detail
      return;
    }
    scene._invSel = row;
    RpgInventoryUI._refreshDetail(scene);
  },

  /**
   * Rebuild the detail pane for the current selection: icon + name + rarity, maker + lore,
   * description, the instance's COMPOSED weapon stats (maker ops + attachments included),
   * ammo ballistics, equip bonuses, installed attachments, qty/weight/value. Rebuilt on
   * selection change + rebuild() — cheap (a dozen elements), same pattern as CraftingUI.
   */
  _refreshDetail(scene) {
    const host = scene._invDetailHost;
    if (host === undefined) return;
    const kids = [...host.children];
    for (let i = 0; i < kids.length; i++) kids[i].destroy();

    const row = scene._invSel;
    if (row === null) {
      host.insertChild(
        gemsLabel(I18n.textRef("INV_SELECT_NONE"), {
          color: GemsTheme.textDim,
        }),
      );
      return;
    }
    const it = Item.get(row.itemId);
    const inv = scene.entities.get(Inventory, scene.playerId);
    const inst =
      row.uid !== undefined
        ? InventorySystem.findByUid(inv, row.uid)
        : undefined;

    // head: icon + name over rarity
    const head = new UIElement({
      width: "100%",
      flexDirection: "row",
      alignItems: "center",
      gap: GemsTheme.gapSm,
    });
    if (it !== undefined && sprite_exists(it.sprite)) {
      const ic = new UIElement({ width: 48, height: 48, flexShrink: 0 });
      ic.addComponent(
        new UIImage({ sprite: it.sprite, fit: OBJECT_FIT.CONTAIN }),
      );
      head.insertChild(ic);
    }
    const hcol = new UIElement({ flexGrow: 1, flexBasis: 0, gap: 2 });
    hcol.insertChild(gemsLabel(row.name, { font: "header", color: row.color }));
    const rar = it !== undefined ? Rarity.get(it.rarity) : undefined;
    if (rar !== undefined)
      hcol.insertChild(
        gemsLabel(I18n.textRef(rar.name), {
          font: "description",
          color: rar.color,
        }),
      );
    head.insertChild(hcol);
    host.insertChild(head);

    // maker: company name in brand color + its lore line
    const mk = it !== undefined ? Manufacturer.get(it.maker) : undefined;
    if (mk !== undefined) {
      host.insertChild(gemsLabel(I18n.textRef(mk.name), { color: mk.color }));
      if (mk.lore !== "")
        host.insertChild(
          gemsLabel(I18n.textRef(mk.lore), {
            font: "description",
            color: GemsTheme.textDim,
            wrap: RpgInventoryUI.DETAIL_WRAP,
          }),
        );
    }

    if (it !== undefined && it.description !== "")
      host.insertChild(
        gemsLabel(I18n.textRef(it.description), {
          color: GemsTheme.textMuted,
          wrap: RpgInventoryUI.DETAIL_WRAP,
        }),
      );

    host.insertChild(gemsDivider());
    const statLine = (key, v) =>
      gemsLabel(I18n.text(key) + ": " + v, { color: GemsTheme.textMuted });

    // weapon: this INSTANCE's composed profile (maker ops + installed attachments applied)
    const prof =
      inst !== undefined && it !== undefined && it.hasComponent(Weapon)
        ? EquipmentSystem.composeWeapon(inst)
        : null;
    if (prof !== null) {
      if (prof.kind === "gun") {
        host.insertChild(statLine("MOD_POWER", Math.round(prof.power)));
        host.insertChild(statLine("MOD_VELOCITY", Math.round(prof.velocity)));
        host.insertChild(statLine("MOD_PEN", prof.penetration));
        if (prof.fireCd !== undefined)
          host.insertChild(statLine("MOD_FIRECD", prof.fireCd));
        const am = Item.get(prof.ammo);
        host.insertChild(
          statLine(
            "MOD_AMMO",
            (am !== undefined
              ? I18n.text(am.name)
              : I18n.text("MOD_UNLOADED")) +
              "  " +
              prof.rounds +
              "/" +
              prof.magazine,
          ),
        );
      } else {
        host.insertChild(
          statLine("MOD_DMG", Math.round(prof.damage * 10) / 10),
        );
        host.insertChild(statLine("MOD_REACH", prof.reach));
        host.insertChild(statLine("MOD_FIRECD", Math.round(prof.fireCd)));
      }
    }

    // ammo item: the base ballistics a gun fires
    const ammo = it !== undefined ? it.getComponent(Ammo) : undefined;
    if (ammo !== undefined) {
      host.insertChild(statLine("MOD_MASS", ammo.mass));
      host.insertChild(statLine("MOD_VELOCITY", ammo.velocity));
      host.insertChild(statLine("MOD_POWER", ammo.power));
      host.insertChild(statLine("MOD_PEN", ammo.penetration));
    }

    // equip stat bonuses (Equippable.mods folded into the sheet while worn)
    const eqp = it !== undefined ? it.getComponent(Equippable) : undefined;
    if (eqp !== undefined && eqp.mods !== undefined) {
      for (const k in eqp.mods) {
        const key = RpgInventoryUI.STAT_KEYS[k];
        const v = eqp.mods[k];
        host.insertChild(
          gemsLabel(
            (key !== undefined ? I18n.text(key) : k) +
              " " +
              (v >= 0 ? "+" : "") +
              v,
            { color: GemsTheme.accent },
          ),
        );
      }
    }

    // installed attachments on this instance ("+N" in the name)
    if (inst !== undefined && inst.mods !== undefined) {
      for (const sid in inst.mods) {
        const m = Item.get(inst.mods[sid]);
        if (m !== undefined)
          host.insertChild(
            gemsLabel("+ " + I18n.text(m.name), {
              font: "description",
              color: InvTable.rarityColor(m.id),
            }),
          );
      }
    }

    host.insertChild(gemsDivider());
    host.insertChild(
      gemsLabel(
        I18n.text("INV_COL_QTY") +
          " " +
          row.qty +
          "   " +
          I18n.text("INV_COL_WT") +
          " " +
          row.weight +
          "   " +
          I18n.text("INV_COL_VAL") +
          " " +
          row.value,
        { color: "warn" },
      ),
    );
  },

  /**
   * same item — InvTable.rowId owns the uid-over-itemId rule
   */
  _sameRow(a, b) {
    return InvTable.rowId(a) === InvTable.rowId(b);
  },

  _activate(scene, row) {
    if (row === null || row === undefined) return;
    RpgInventoryUI.useItem(scene, row.itemId, row.worn, row.uid);
  },

  /**
   * context action verb for the selected item ("-" when none)
   */
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

  /**
   * One equipment slot: a click-to-unequip button when worn, else a muted label. The slot holds
   * the equipped INSTANCE uid; resolve it to the live bag slot for the itemId + mods.
   */
  _equipRow(scene, slot, labelKey) {
    const eq = scene.entities.get(Equipment, scene.playerId);
    const uid = eq !== undefined ? eq.slots[slot] : "";
    if (uid !== undefined && uid !== "") {
      const inv = scene.entities.get(Inventory, scene.playerId);
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
          EquipmentSystem.unequip(scene.entities, scene.playerId, slot);
          scene._invDirty = true;
          Log.info(`unequipped ${itemId}`);
        },
        {
          height: 30,
          textColor: InvTable.rarityColor(itemId),
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

  /**
   * Act on an item: equippables toggle equip/unequip, consumables use one unit. `wasWorn` is the
   * row's shown state (so with two identical equippables only the shown-equipped row unequips).
   * `uid` equips that exact instance; without it (the hotbar) equipFirst picks the first owned.
   */
  useItem(scene, itemId, wasWorn, uid) {
    const item = Item.get(itemId);
    if (item === undefined) return;
    if (item.hasComponent(Equippable)) {
      const eqp = item.getComponent(Equippable);
      if (wasWorn) {
        EquipmentSystem.unequip(scene.entities, scene.playerId, eqp.slot);
        Log.info(`unequipped ${itemId}`);
      } else {
        const ok =
          uid !== undefined
            ? EquipmentSystem.equip(scene.entities, scene.playerId, uid)
            : EquipmentSystem.equipFirst(
                scene.entities,
                scene.playerId,
                itemId,
              );
        if (ok) Log.info(`equipped ${itemId}`);
      }
    } else if (item.hasComponent(Consumable)) {
      if (ConsumableSystem.use(scene.entities, scene.playerId, itemId)) {
        // per-effect cue: food/drink consumption, bandaging a heal, magic for buffs/attr grants
        const c = item.getComponent(Consumable);
        if ((c.thirst ?? 0) > 0 || (c.hunger ?? 0) > 0)
          Audio.play({ sound: snd_drink });
        else if ((c.heal ?? 0) > 0) Audio.play({ sound: snd_bandage });
        else Audio.play({ sound: snd_magic });
        Log.info(`used ${itemId}`);
      }
    }
    scene._invDirty = true;
  },
};
