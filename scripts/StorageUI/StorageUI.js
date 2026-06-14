// Storage-chest transfer WINDOW for the genre templates (RPG). A "storage" station (a
// Station {kind:"storage"} entity carrying an Inventory) opens a two-column transfer
// window — left = the player's Bag, right = the Chest — each a sortable UITable.
// Double-clicking a row (or a gamepad/keyboard confirm in browse mode) moves that whole
// stack to the other side (capacity/weight-gated by InventorySystem.add). Manager-drawn
// UI on the GUI layer (Draw_75), built once and toggled.
//
// Like the main inventory window, each table is built ONCE; a transfer only swaps its
// rows via `setRows`, so the player's column sort survives every move (a row sort is
// view-only — it never reorders the underlying Inventory).
//
// Proximity selection, the open/close keybind, the prompt, and the world highlight are
// owned by the shared `Interactable` module — this file only builds the window and
// reacts to open/close/refresh calls. All per-open state lives on the SCENE
// (namespaced `_store*`) so two scenes can't clobber each other and teardownScene
// (which destroys scene.ui) cleans up with no extra work.
//
// Scene contract: scene.world, scene.ctrl.id (player), scene.ui. Built once in create()
// via Interactable.build (after the player + ui exist); set scene._storeDirty = true if
// the player inventory changes from elsewhere while open.
globalThis.StorageUI = {
  _rarityColor(itemId) {
    const it = Item.get(itemId);
    const r = it !== undefined ? Rarity.get(it.rarity) : undefined;
    return r !== undefined ? r.color : c_white;
  },

  build(scene) {
    scene._storageId = -1;
    scene._storeOpen = false;
    scene._storeDirty = false;
    scene._storeClickKey = ""; // last-clicked "side|idx" for double-click detection
    scene._storeClickTime = 0;

    // Transfer window: Bag | Chest columns, each a UITable.
    const gw = display_get_gui_width();
    const width = 600;
    const left = gw > 0 ? gw / 2 - width / 2 : 80;
    const win = gemsWindow(I18n.textRef("STORAGE_TITLE"), {
      left,
      top: 80,
      width,
      onClose: () => StorageUI.close(scene),
    });
    win.enabled = false;

    const cols = new UIElement({
      width: "100%",
      flexDirection: "row",
      gap: GemsTheme.gap,
    });
    const bagTable = StorageUI._table(scene, "bag");
    const boxTable = StorageUI._table(scene, "box");
    scene._storeBagTable = bagTable.getComponent(UITable);
    scene._storeBoxTable = boxTable.getComponent(UITable);
    cols.insertChild(StorageUI._column(I18n.textRef("STORAGE_BAG"), bagTable));
    cols.insertChild(StorageUI._column(I18n.textRef("STORAGE_BOX"), boxTable));
    win.body.insertChild(cols);

    // Discoverability: double-click (or confirm) transfers — single click just selects.
    const hint = new UIElement({ width: "100%", height: 20 });
    hint.insertChild(
      gemsLabel(I18n.textRef("STORAGE_HINT"), { color: GemsTheme.textMuted }),
    );
    win.body.insertChild(hint);

    scene._storeWin = win;
    scene.ui.insertChild(win);
  },

  // One titled column: a header label over a sortable table. Returns the column element.
  _column(titleRef, tableEl) {
    const col = new UIElement({
      flexGrow: 1,
      flexBasis: 0,
      gap: GemsTheme.gapSm,
    });
    const title = new UIElement({ width: "100%", height: 22 });
    title.insertChild(gemsLabel(titleRef, { color: "#ffd166" }));
    col.insertChild(title);
    col.insertChild(tableEl);
    return col;
  },

  // The per-side bag/chest table. `side` ("bag"/"box") routes the transfer direction;
  // onSelect tracks a double-click, onActivate (double-click / confirm) moves the stack.
  _table(scene, side) {
    return gemsTable(StorageUI._columns(), {
      rows: 8,
      rowH: 26,
      headerH: 26,
      sortBy: 0, // Name
      emptyText: I18n.text("STORAGE_EMPTY"),
      onSelect: (row) => StorageUI._click(scene, side, row),
      onActivate: (row) => StorageUI._move(scene, side, row),
    });
  },

  // Name (rarity-colored) + right-aligned Qty + Value. Compact for two side-by-side
  // tables in the window; Weight/Type are dropped vs the main inventory.
  _columns() {
    const gold = gemsColor("#ffd166");
    return [
      {
        label: I18n.text("INV_COL_NAME"),
        flex: 1,
        text: (r) => r.name,
        color: (r) => r.color,
        sortValue: (r) => r.name,
      },
      {
        label: I18n.text("INV_COL_QTY"),
        width: 44,
        align: fa_right,
        text: (r) => string(r.qty),
        sortValue: (r) => r.qty,
      },
      {
        label: I18n.text("INV_COL_VAL"),
        width: 56,
        align: fa_right,
        text: (r) => string(r.value),
        color: () => gold,
        sortValue: (r) => r.value,
      },
    ];
  },

  // Row models for one inventory. `idx` is the slot index at build time — valid until
  // the next refresh, which is exactly when a transfer happens (one click/frame), so the
  // captured index never drifts (same contract as the old per-row closure).
  _rows(inv) {
    const rows = [];
    for (let i = 0; i < inv.slots.length; i++) {
      const s = inv.slots[i];
      const it = Item.get(s.itemId);
      rows.push({
        idx: i,
        itemId: s.itemId,
        name: it !== undefined ? I18n.text(it.name) : s.itemId,
        qty: s.qty,
        value:
          it !== undefined ? Math.round(Rarity.modify(it.rarity, it.value)) : 0,
        color: StorageUI._rarityColor(s.itemId),
      });
    }
    return rows;
  },

  // Called by Interactable when the player activates a storage station.
  open(scene, id) {
    scene._storageId = id;
    scene._storeOpen = true;
    scene._storeWin.enabled = true;
    scene._storeDirty = true;
  },

  close(scene) {
    scene._storeOpen = false;
    scene._storeWin.enabled = false;
    scene._storageId = -1;
  },

  refresh(scene) {
    const world = scene.world;
    const bagInv = world.get(Inventory, scene.ctrl.id);
    const boxInv = world.get(Inventory, scene._storageId);
    if (bagInv === undefined || boxInv === undefined) return;
    scene._storeBagTable.setRows(StorageUI._rows(bagInv)); // setRows re-applies the sort
    scene._storeBoxTable.setRows(StorageUI._rows(boxInv));
  },

  // Single click selects; a second click on the same row within 350ms transfers it
  // (matching the inventory window's double-click-to-act). Browse-mode arrowing fires
  // onSelect with a different row each step, so it can't accidentally transfer.
  _click(scene, side, row) {
    if (row === null || row === undefined) return;
    const now = current_time;
    const key = side + "|" + row.idx;
    if (scene._storeClickKey === key && now - scene._storeClickTime < 350) {
      StorageUI._move(scene, side, row);
      return;
    }
    scene._storeClickKey = key;
    scene._storeClickTime = now;
  },

  // Transfer the activated row's stack to the opposite side.
  _move(scene, side, row) {
    if (row === null || row === undefined) return;
    const world = scene.world;
    const bag = world.get(Inventory, scene.ctrl.id);
    const box = world.get(Inventory, scene._storageId);
    if (bag === undefined || box === undefined) return;
    if (side === "bag") StorageUI._transfer(scene, bag, box, row.idx);
    else StorageUI._transfer(scene, box, bag, row.idx);
  },

  // Move slot `idx` of srcInv into dstInv (as much as fits), removing the moved amount
  // from that exact slot. Marks the window dirty so it repopulates next update().
  _transfer(scene, srcInv, dstInv, idx) {
    if (idx < 0 || idx >= srcInv.slots.length) return;
    const s = srcInv.slots[idx];
    const itemId = s.itemId;
    const leftover = InventorySystem.add(dstInv, itemId, s.qty);
    const moved = s.qty - leftover;
    if (moved <= 0) return; // destination full / weight-gated
    s.qty -= moved;
    if (s.qty <= 0) srcInv.slots.splice(idx, 1);

    // Storing an equipped item out of the player's own bag must unequip it once the
    // player no longer owns any copy — equipped items normally stay in the bag, so a
    // worn item moved to the chest would otherwise leave a dangling Equipment slot
    // (and its stat mods) referencing an item we no longer have.
    if (srcInv === scene.world.get(Inventory, scene.ctrl.id)) {
      const eq = scene.world.get(Equipment, scene.ctrl.id);
      if (eq !== undefined && !InventorySystem.has(srcInv, itemId, 1)) {
        for (const slot in eq.slots) {
          if (eq.slots[slot] === itemId) {
            EquipmentSystem.unequip(scene.world, scene.ctrl.id, slot);
            break;
          }
        }
      }
    }

    scene._storeDirty = true;
    scene._invDirty = true; // keep the main inventory window in sync if it's open
    Log.info(`transferred ${moved}x ${itemId}`);
  },
};
