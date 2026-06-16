// Shared draggable character window for the RPG genre scenes — a wider, TABBED panel
// (Items / Equipment / Stats / Quests / Settings) so the player can manage gear, read
// the sheet, track quests, and tune the item table all in one place.
//
//  - Items:      the bag UITable (sortable columns + category filter + name search) over
//                a usage line, plus a select/action row (Use / Equip / Unequip).
//  - Equipment:  the worn-slot rows (click a worn slot to unequip).
//  - Stats:      the live character sheet + the genre's extra records (Profile).
//  - Quests:     a live UIQuestTracker bound to the global QuestLog.
//  - Settings:   per-column visibility toggles (Rarity / Type / Weight / Value),
//                persisted via Settings; the table rebuilds its column set on change.
//
// The whole structure is built ONCE in build(); a bag change only refreshes data via
// `table.setRows` + repopulating the equip host, so the player's sort/filter/scroll and
// the active tab survive every equip/use. Column visibility comes from Settings, so a
// toggle persists across launches. Scenes keep only the open/close state.
//
// Contract: the scene owns `ui`, `world`, `ctrl` (with `.id`), `invOpen`, and the fields
// this module sets/reads — `_invWin` (the gemsWindow), `_invTable` (the UITable
// component), `_invSel` (selected row model | null) + `_invSelTime` (double-click timer),
// `_invCat`/`_invSearch` (filter + search state), `_invEquipHost`/`_invExtraHost` (the
// rebuilt sections), `_invDirty` (refresh-needed flag).
//
// Usage:
//   create():            RpgInventoryUI.build(scene)
//   step() (when dirty):  RpgInventoryUI.rebuild(scene, { equipSlots, extraRows? })
globalThis.RpgInventoryUI = {
  // Build the (hidden) draggable window + its persistent tabbed structure.
  build(scene) {
    scene._invWin = gemsWindow(I18n.textRef("INV_TITLE"), {
      top: 40,
      width: 640,
      onClose: () => {
        scene.invOpen = false;
        scene._invWin.enabled = false;
      },
    });
    scene._invWin.enabled = false;
    scene.ui.insertChild(scene._invWin);

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
          label: I18n.textRef("INV_TAB_STATS"),
          content: RpgInventoryUI._buildStatsTab(scene),
        },
        {
          label: I18n.textRef("INV_TAB_QUESTS"),
          content: RpgInventoryUI._buildQuestsTab(scene),
        },
        {
          label: I18n.textRef("INV_TAB_SETTINGS"),
          content: RpgInventoryUI._buildSettingsTab(scene),
        },
      ],
      { height: 384 },
    );
    scene._invWin.body.insertChild(tabs);
  },

  // ── tab pages ───────────────────────────────────────────────
  // Items: usage + category filter, search + clear, the bag table, select/action row.
  _buildItemsTab(scene) {
    const page = new UIElement({ width: "100%", gap: GemsTheme.gapSm });

    const top = new UIElement({
      width: "100%",
      height: 30,
      flexDirection: "row",
      alignItems: "center",
      gap: GemsTheme.gapSm,
    });
    const usageCell = new UIElement({ flexGrow: 1, flexBasis: 0 });
    usageCell.insertChild(
      // Reads scene.world LIVE each frame (never a captured const): an open window
      // survives a map change (loadMap swaps scene.world + the player), so a captured
      // ref would deref the destroyed old world and fault.
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
      { name: I18n.text("INV_CAT_WEAPON"), value: "weapon" },
      { name: I18n.text("INV_CAT_GEAR"), value: "gear" },
      { name: I18n.text("INV_CAT_CONSUMABLE"), value: "consumable" },
      { name: I18n.text("INV_CAT_MISC"), value: "misc" },
    ];
    // Fixed-width cell — gemsSelectCustom is width:100%, so without a sized wrapper it
    // would eat the whole row and squish the usage label.
    const filterCell = new UIElement({ width: 170, flexShrink: 0 });
    filterCell.insertChild(
      gemsSelectCustom(cats, 0, (_i, code) => {
        scene._invCat = code;
        RpgInventoryUI._applyFilter(scene);
      }),
    );
    top.insertChild(filterCell);
    page.insertChild(top);

    // Search row: a free-text name filter + a Clear button. Search and the category
    // select compose into one table predicate (see _applyFilter). Typing focuses the
    // UIInput (UIInput.active), which suspends UINav so the caret keeps the keys.
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

    // The bag table. Built once with the Settings-driven column set; rebuild() only
    // swaps its rows (and a column toggle calls setColumns), so sort/filter/scroll
    // persist. Click a header to sort (multi-key); a row selects, double-click / the
    // action button / a gamepad confirm acts on it.
    const table = gemsTable(InvTable.columns({ worn: true }), {
      rows: 8,
      rowH: 26,
      headerH: 26,
      sortBy: 1, // Name (always column index 1: worn marker is 0, Name is 1)
      emptyText: I18n.text("RPG_EMPTY"),
      onSelect: (row) => RpgInventoryUI._onSelect(scene, row),
      onActivate: (row) => RpgInventoryUI._activate(scene, row),
    });
    scene._invTable = table.getComponent(UITable);
    page.insertChild(table);

    // Select/action row: the selected item name + a context action (Use/Equip/Unequip).
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
        () => RpgInventoryUI._actionLabel(scene),
        () => {
          if (scene._invSel !== null)
            RpgInventoryUI._activate(scene, scene._invSel);
        },
        { width: 120, height: 28 },
      ),
    );
    page.insertChild(action);
    return page;
  },

  // Equipment: the worn-slot rows (repopulated per rebuild into this host).
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

  // Stats: the live character sheet + the genre's extra records (Profile) host.
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
    page.insertChild(statRow("STAT_LEVEL", (st) => st.level));
    page.insertChild(statRow("STAT_ATK", (st) => st.attack));
    page.insertChild(statRow("STAT_DEF", (st) => st.defense));
    page.insertChild(statRow("STAT_SPD", (st) => Math.round(st.speed)));
    page.insertChild(gemsDivider());
    scene._invExtraHost = new UIElement({
      width: "100%",
      gap: GemsTheme.gapSm,
    });
    page.insertChild(scene._invExtraHost);
    return page;
  },

  // Quests: a live tracker bound to the global QuestLog.
  _buildQuestsTab(scene) {
    const page = new UIElement({ width: "100%", gap: GemsTheme.gapSm });
    page.insertChild(
      gemsQuestTracker({ emptyText: I18n.text("INV_NO_QUESTS") }),
    );
    return page;
  },

  // Settings: per-column visibility toggles, persisted via Settings. Toggling rebuilds
  // the Items table's column set (setColumns keeps the current sort by column key).
  _buildSettingsTab(scene) {
    const page = new UIElement({ width: "100%", gap: GemsTheme.gapSm });
    const title = new UIElement({ width: "100%", height: 22 });
    title.insertChild(
      gemsLabel(I18n.textRef("INV_SET_COLS"), { color: "#ffd166" }),
    );
    page.insertChild(title);
    // UICheckbox.onToggle is called with NO argument (it doesn't pass the new value),
    // so flip the setting ourselves off the live value — taking a `v` arg would always
    // be undefined, which made the toggles one-way (could disable but never re-enable).
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

    // Units: ambient-temperature display unit. The HUD reads Temperature.display() live,
    // so persisting the setting updates it next frame — no table/HUD rebuild needed.
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
    return page;
  },

  // Refresh the live data: swap the table rows (keeping sort/filter/scroll), re-map the
  // selection by itemId, and rebuild the equipment + extra sections. `opts`:
  //   { equipSlots: [{ slot, labelKey }], extraRows?(scene, host) }
  rebuild(scene, opts) {
    const rows = RpgInventoryUI._buildRows(scene);
    scene._invTable.setRows(rows);

    // Re-map the selection by itemId so the highlight + action button survive the swap
    // (row models are fresh objects each refresh; the old _invSel ref is stale).
    if (scene._invSel !== null) {
      let found = null;
      for (let i = 0; i < rows.length; i++) {
        if (rows[i].itemId === scene._invSel.itemId) {
          found = rows[i];
          break;
        }
      }
      scene._invSel = found;
      scene._invTable.selectRow(found);
    }

    // Equipment rows (child-tree edits are GMRT-safe; only flexpanel *style* mutation
    // is unreliable on 0.19).
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

    // Genre extra rows (Profile records) into the Stats tab.
    const xh = scene._invExtraHost;
    const xk = [...xh.children];
    for (let i = 0; i < xk.length; i++) xk[i].destroy();
    if (opts.extraRows !== undefined) opts.extraRows(scene, xh);
  },

  // Push the current Settings-driven column set onto the live table (a toggle changed).
  // The chest shares these column Settings, so keep its two tables in sync too (live,
  // for when both windows are open; StorageUI also re-applies them on open).
  _applyColumns(scene) {
    scene._invTable.setColumns(InvTable.columns({ worn: true }));
    if (scene._storeBagTable !== undefined) StorageUI._applyColumns(scene);
  },

  // Build the row models from the live bag. `worn` is claimed by the first matching row
  // (Equipment is keyed by itemId, so with two of the same equippable only one is worn).
  _buildRows(scene) {
    const inv = scene.world.get(Inventory, scene.ctrl.id);
    const eq = scene.world.get(Equipment, scene.ctrl.id);
    const wornClaimed = {};
    const rows = [];
    for (let i = 0; i < inv.slots.length; i++) {
      const slot = inv.slots[i];
      const it = Item.get(slot.itemId);
      let worn = false;
      if (it !== undefined && it.hasComponent(Equippable)) {
        const eqp = it.getComponent(Equippable);
        if (eq.slots[eqp.slot] === slot.itemId && !wornClaimed[slot.itemId]) {
          worn = true;
          wornClaimed[slot.itemId] = true;
        }
      }
      rows.push({ ...InvTable.rowModel(slot.itemId, slot.qty), worn });
    }
    return rows;
  },

  // Compose the category select + the search box into ONE table predicate (UITable
  // takes a single filter fn). null when neither is active, so the table shows all.
  _applyFilter(scene) {
    const cat = scene._invCat;
    const q = scene._invSearch;
    if (cat === "" && q === "") {
      scene._invTable.setFilter(null);
      return;
    }
    scene._invTable.setFilter(
      (r) =>
        (cat === "" || r.cat === cat) && (q === "" || r.search.indexOf(q) >= 0),
    );
  },

  // Click selects a row; a second click on the same item within 350ms uses/equips it
  // (double-click), matching the action button + gamepad confirm.
  _onSelect(scene, row) {
    const now = current_time;
    if (
      scene._invSel !== null &&
      scene._invSel.itemId === row.itemId &&
      now - scene._invSelTime < 350
    ) {
      RpgInventoryUI._activate(scene, row);
      return;
    }
    scene._invSel = row;
    scene._invSelTime = now;
  },

  _activate(scene, row) {
    if (row === null || row === undefined) return;
    RpgInventoryUI.useItem(scene, row.itemId, row.worn);
  },

  // The context action verb for the selected item ("-" when none / no action).
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

  // One equipment slot: a button (click unequips) when worn, else a muted label row.
  _equipRow(scene, slot, labelKey) {
    const eq = scene.world.get(Equipment, scene.ctrl.id);
    const itemId = eq !== undefined ? eq.slots[slot] : "";
    if (itemId !== undefined && itemId !== "") {
      const it = Item.get(itemId);
      const nm = it !== undefined ? I18n.text(it.name) : itemId;
      return gemsButton(
        I18n.text(labelKey) + ": " + nm,
        () => {
          EquipmentSystem.unequip(scene.world, scene.ctrl.id, slot);
          scene._invDirty = true;
          Log.info(`unequipped ${itemId}`);
        },
        { height: 30, textColor: RpgWorldOverlay._rarityColor(itemId) },
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

  // Act on an item: equippables toggle equip/unequip, consumables are used (one unit).
  // `wasWorn` is the row's displayed equipped-state — acting on it (not the shared
  // itemId) means that with two identical equippables only the row shown as equipped
  // unequips; clicking the spare falls to equip(), which no-ops for an already-equipped
  // item rather than toggling the worn one off.
  useItem(scene, itemId, wasWorn) {
    const item = Item.get(itemId);
    if (item === undefined) return;
    if (item.hasComponent(Equippable)) {
      const eqp = item.getComponent(Equippable);
      if (wasWorn) {
        EquipmentSystem.unequip(scene.world, scene.ctrl.id, eqp.slot);
        Log.info(`unequipped ${itemId}`);
      } else if (EquipmentSystem.equip(scene.world, scene.ctrl.id, itemId)) {
        Log.info(`equipped ${itemId}`);
      }
    } else if (item.hasComponent(Consumable)) {
      if (ConsumableSystem.use(scene.world, scene.ctrl.id, itemId)) {
        Log.info(`used ${itemId}`);
      }
    }
    scene._invDirty = true;
  },
};
