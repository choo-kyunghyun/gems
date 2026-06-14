// Shared draggable inventory/equipment/stats window for the RPG genre scenes. The bag
// list is a UITable (sortable columns + a category filter + a name search) — the overhaul of
// the old row-of-buttons placeholder. The window's persistent structure (table, filter,
// the select/action row, the equipment + stats sections) is built ONCE in build(); a bag
// change only refreshes data via `table.setRows`, so the player's sort + filter + scroll
// survive every equip/use (a full body rebuild would reset them). Scenes keep only the
// open/close state.
//
// Contract: the scene owns `ui`, `world`, `ctrl` (with `.id`), `invOpen`, and the fields
// this module sets/reads — `_invWin` (the gemsWindow), `_invTable` (the UITable
// component), `_invSel` (the selected row model, or null) + `_invSelTime` (double-click
// timer), `_invCat`/`_invSearch` (the live filter + search state), `_invEquipHost`/
// `_invExtraHost` (the rebuilt sections), `_invDirty` (refresh-needed flag).
//
// Usage:
//   create():            RpgInventoryUI.build(scene)
//   step() (when dirty):  RpgInventoryUI.rebuild(scene, { equipSlots, extraRows? })
globalThis.RpgInventoryUI = {
  // Build the (hidden) draggable window + its persistent structure; store on the scene.
  build(scene) {
    const gw = display_get_gui_width();
    const width = 500;
    const left = gw > 0 ? gw / 2 - width / 2 : 60;
    scene._invWin = gemsWindow(I18n.textRef("RPG_INVENTORY"), {
      left,
      top: 50,
      width,
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

    const body = scene._invWin.body;

    // Top row: slot/weight usage (live) + a category filter driving the table.
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
    body.insertChild(top);

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
        scene._invSearch = RpgInventoryUI._lower(v);
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
    body.insertChild(searchRow);

    // The bag table. Built once; rebuild() only swaps its rows, so sort/filter/scroll
    // persist. Click a header to sort (multi-key); a row selects, double-click / the
    // action button / a gamepad confirm acts on it.
    const table = gemsTable(RpgInventoryUI._columns(), {
      rows: 6,
      rowH: 26,
      headerH: 26,
      sortBy: 1, // Name
      emptyText: I18n.text("RPG_EMPTY"),
      onSelect: (row) => RpgInventoryUI._onSelect(scene, row),
      onActivate: (row) => RpgInventoryUI._activate(scene, row),
    });
    scene._invTable = table.getComponent(UITable);
    body.insertChild(table);

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
    body.insertChild(action);

    // Equipment (clickable rows unequip) — repopulated per rebuild into this host.
    body.insertChild(gemsDivider());
    const eqTitle = new UIElement({ width: "100%", height: 22 });
    eqTitle.insertChild(
      gemsLabel(I18n.textRef("RPG_EQUIPMENT"), { color: "#ffd166" }),
    );
    body.insertChild(eqTitle);
    scene._invEquipHost = new UIElement({
      width: "100%",
      gap: GemsTheme.gapSm,
    });
    body.insertChild(scene._invEquipHost);

    // Stats (live).
    body.insertChild(gemsDivider());
    const stats = new UIElement({ width: "100%", height: 22 });
    stats.insertChild(
      gemsLabel(
        () => {
          const st = scene.world.get(Stats, scene.ctrl.id);
          return (
            I18n.text("STAT_LEVEL") +
            ": " +
            st.level +
            "   " +
            I18n.text("STAT_ATK") +
            ": " +
            st.attack +
            "   " +
            I18n.text("STAT_DEF") +
            ": " +
            st.defense +
            "   " +
            I18n.text("STAT_SPD") +
            ": " +
            Math.round(st.speed)
          );
        },
        { color: GemsTheme.text },
      ),
    );
    body.insertChild(stats);

    // Genre-specific trailing rows (e.g. top-down's records) — repopulated per rebuild.
    scene._invExtraHost = new UIElement({
      width: "100%",
      gap: GemsTheme.gapSm,
    });
    body.insertChild(scene._invExtraHost);
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

    // Genre extra rows.
    const xh = scene._invExtraHost;
    const xk = [...xh.children];
    for (let i = 0; i < xk.length; i++) xk[i].destroy();
    if (opts.extraRows !== undefined) opts.extraRows(scene, xh);
  },

  // The bag table columns (data-only accessors over the row models from _buildRows). A
  // narrow worn-marker, the rarity-colored Name, the category, and right-aligned
  // Qty/Weight/Value. Built once (labels resolve at build time).
  _columns() {
    const gold = gemsColor("#ffd166");
    const accent = gemsColor(GemsTheme.accent);
    return [
      {
        label: "",
        width: 20,
        sortable: false,
        text: (r) => (r.worn ? "E" : ""),
        color: () => accent,
      },
      {
        label: I18n.text("INV_COL_NAME"),
        flex: 1,
        text: (r) => r.name,
        color: (r) => r.color,
        sortValue: (r) => r.name,
      },
      {
        label: I18n.text("INV_COL_TYPE"),
        width: 112,
        text: (r) => I18n.text(r.catKey),
        sortValue: (r) => r.cat,
      },
      {
        label: I18n.text("INV_COL_QTY"),
        width: 46,
        align: fa_right,
        text: (r) => string(r.qty),
        sortValue: (r) => r.qty,
      },
      {
        label: I18n.text("INV_COL_WT"),
        width: 56,
        align: fa_right,
        text: (r) => string_format(r.weight, 0, 1),
        sortValue: (r) => r.weight,
      },
      {
        label: I18n.text("INV_COL_VAL"),
        width: 74,
        align: fa_right,
        text: (r) => string(r.value),
        color: () => gold,
        sortValue: (r) => r.value,
      },
    ];
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
      rows.push(RpgInventoryUI._rowModel(slot, it, worn));
    }
    return rows;
  },

  _rowModel(slot, it, worn) {
    const cat = RpgInventoryUI._category(it);
    const name = it !== undefined ? I18n.text(it.name) : slot.itemId;
    return {
      itemId: slot.itemId,
      qty: slot.qty,
      worn,
      name,
      search: RpgInventoryUI._lower(name), // precomputed for the search filter
      cat: cat.code,
      catKey: cat.key,
      weight: it !== undefined ? it.weight * slot.qty : 0, // total stack weight
      value:
        it !== undefined ? Math.round(Rarity.modify(it.rarity, it.value)) : 0,
      color: RpgWorldOverlay._rarityColor(slot.itemId),
    };
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

  // ASCII-only lowercase (A–Z → a–z) for case-insensitive search. JS toLowerCase()
  // returns garbage Unicode on GMRT (CLAUDE.md), so map by char code; non-Latin text
  // (e.g. Korean, which is caseless) passes through unchanged.
  _lower(s) {
    let out = "";
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      out += c >= 65 && c <= 90 ? String.fromCharCode(c + 32) : s[i];
    }
    return out;
  },

  // Filter/display category from the item's capability components.
  _category(it) {
    if (it === undefined) return { code: "misc", key: "INV_CAT_MISC" };
    if (it.hasComponent(Weapon))
      return { code: "weapon", key: "INV_CAT_WEAPON" };
    if (it.hasComponent(Equippable))
      return { code: "gear", key: "INV_CAT_GEAR" };
    if (it.hasComponent(Consumable))
      return { code: "consumable", key: "INV_CAT_CONSUMABLE" };
    return { code: "misc", key: "INV_CAT_MISC" };
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

  // The context action verb for the selected item ("—" when none / no action).
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
