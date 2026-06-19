// Storage-chest transfer WINDOW for the RPG scene. A "storage" station (a
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
  build(scene) {
    scene._storageId = -1;
    scene._storeOpen = false;
    scene._storeDirty = false;
    scene._storeClickKey = ""; // last-clicked "side|idx" for double-click detection
    scene._storeClickTime = 0;

    // Transfer window: Bag | Chest columns, each a UITable. Wide enough for two tables
    // that mirror the inventory's (Settings-driven) columns side by side without
    // clipping their headers.
    const win = gemsWindow(I18n.textRef("STORAGE_TITLE"), {
      top: 80,
      width: 1100,
      // Resizable; the explicit height gives the grow columns/tables a starting basis
      // (height 432 reproduces the old fixed 8-row layout).
      height: 432,
      minWidth: 720,
      minHeight: 300,
      onClose: () => StorageUI.close(scene),
    });
    win.enabled = false;

    const cols = new UIElement({
      width: "100%",
      flexGrow: 1, // fill the resized window so the two tables grow with it
      flexBasis: 0,
      flexDirection: "row",
      gap: GemsTheme.gap,
    });
    const bagTable = StorageUI._table(scene, "bag");
    const boxTable = StorageUI._table(scene, "box");
    scene._storeBagTable = bagTable.getComponent(UITable);
    scene._storeBoxTable = boxTable.getComponent(UITable);
    cols.insertChild(
      StorageUI._column(
        I18n.textRef("STORAGE_BAG"),
        bagTable,
        I18n.textRef("STORAGE_STORE_ALL"),
        () => StorageUI._allFrom(scene, "bag"),
        () => scene.world.get(Inventory, scene.ctrl.id),
      ),
    );
    cols.insertChild(
      StorageUI._column(
        I18n.textRef("STORAGE_BOX"),
        boxTable,
        I18n.textRef("STORAGE_TAKE_ALL"),
        () => StorageUI._allFrom(scene, "box"),
        () => scene.world.get(Inventory, scene._storageId),
      ),
    );
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

  // One titled column: a header (title + a bulk "All" button), a live slots/weight usage
  // line, then the sortable table. `onAll` moves every stack of this side to the other
  // (gated by capacity/weight); `invFn` is a live () => Inventory used for both the usage
  // readout and the All button's empty-gate.
  _column(titleRef, tableEl, allLabelRef, onAll, invFn) {
    const col = new UIElement({
      flexGrow: 1,
      flexBasis: 0,
      gap: GemsTheme.gapSm,
    });
    const header = new UIElement({
      width: "100%",
      height: 26,
      flexDirection: "row",
      alignItems: "center",
      gap: GemsTheme.gapSm,
    });
    const titleCell = new UIElement({ flexGrow: 1, flexBasis: 0 });
    titleCell.insertChild(gemsLabel(titleRef, { color: "#ffd166" }));
    header.insertChild(titleCell);
    header.insertChild(
      gemsButton(allLabelRef, onAll, {
        width: 100,
        height: 24,
        disabled: () => StorageUI._empty(invFn()),
      }),
    );
    col.insertChild(header);

    const usage = new UIElement({ width: "100%", height: 20 });
    usage.insertChild(
      gemsLabel(() => StorageUI._usageText(invFn()), {
        color: GemsTheme.textMuted,
      }),
    );
    col.insertChild(usage);

    col.insertChild(tableEl);
    return col;
  },

  // True when an inventory is missing or holds no stacks (drives the All-button gate).
  _empty(inv) {
    return inv === undefined || inv.slots.length === 0;
  },

  // "Slots used/cap   Weight cur[/max]" for the column header. Weight shows the current
  // total always (so the chest reports it too); the "/max" tail only when the inventory
  // is weight-capped (the bag), matching the inventory window's usage line.
  _usageText(inv) {
    if (inv === undefined) return "";
    let s =
      I18n.text("RPG_SLOTS") + " " + inv.slots.length + "/" + inv.capacity;
    s += "   " + I18n.text("RPG_WEIGHT") + " " + InventorySystem.weight(inv);
    if (inv.maxWeight !== undefined) s += "/" + inv.maxWeight;
    return s;
  },

  // The per-side bag/chest table. `side` ("bag"/"box") routes the transfer direction;
  // onSelect tracks a double-click, onActivate (double-click / confirm) moves the stack.
  _table(scene, side) {
    return gemsTable(InvTable.columns({ fav: true }), {
      grow: true, // fill the column; reflows row count as the window resizes
      rowH: 26,
      headerH: 26,
      sortBy: 0, // Name
      emptyText: I18n.text("STORAGE_EMPTY"),
      onSelect: (row) => StorageUI._click(scene, side, row),
      onActivate: (row) => StorageUI._move(scene, side, row),
    });
  },

  // Push the current Settings-driven column set onto both tables (a toggle changed, or
  // the chest just opened). Shared with the inventory via RpgInventoryUI._applyColumns.
  _applyColumns(scene) {
    scene._storeBagTable.setColumns(InvTable.columns({ fav: true }));
    scene._storeBoxTable.setColumns(InvTable.columns({ fav: true }));
  },

  // Row models for one inventory. `idx` is the slot index at build time — valid until
  // the next refresh, which is exactly when a transfer happens (one click/frame), so the
  // captured index never drifts (same contract as the old per-row closure). Carries the
  // full field set so any of the shared columns can render. `fav` (the player's favorited
  // set, by itemId) drives the "*" marker column on BOTH sides, mirroring the inventory.
  _rows(scene, inv) {
    const fav = scene.world.get(Favorites, scene.ctrl.id);
    const rows = [];
    for (let i = 0; i < inv.slots.length; i++) {
      const s = inv.slots[i];
      const favd = fav !== undefined && FavoritesSystem.has(fav, s.itemId);
      rows.push({ ...InvTable.rowModel(s.itemId, s.qty), idx: i, fav: favd }); // idx = transfer slot
    }
    return rows;
  },

  // Called by Interactable when the player activates a storage station.
  open(scene, id) {
    scene._storageId = id;
    scene._storeOpen = true;
    scene._storeWin.enabled = true;
    StorageUI._applyColumns(scene); // pick up any column-setting change since build
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
    scene._storeBagTable.setRows(StorageUI._rows(scene, bagInv)); // setRows re-applies the sort
    scene._storeBoxTable.setRows(StorageUI._rows(scene, boxInv));
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

  // Transfer the activated row's stack to the opposite side. Storing FROM the bag is refused for
  // a FAVORITED item (the player's explicit "don't store this"). A hotbar-bound item, by contrast,
  // CAN be stored this way — a deliberate single double-click stores it AND unregisters it from the
  // hotbar (so the slot never dangles on an item the player no longer has). Taking FROM the chest is
  // never protected.
  _move(scene, side, row) {
    if (row === null || row === undefined) return;
    const world = scene.world;
    const bag = world.get(Inventory, scene.ctrl.id);
    const box = world.get(Inventory, scene._storageId);
    if (bag === undefined || box === undefined) return;
    if (side === "bag") {
      if (StorageUI._storeBlocked(scene, false)[row.itemId]) return; // favorited — fully protected
      const moved = StorageUI._transfer(scene, bag, box, row.idx);
      // Unbind the hotbar slot(s) only when the LAST copy left the bag. Storing one of several
      // copies — another stack, or a partial transfer that left some behind — keeps the item
      // present, so the binding stays usable.
      if (moved > 0 && !InventorySystem.has(bag, row.itemId, 1)) {
        const hb = world.get(Hotbar, scene.ctrl.id);
        if (hb !== undefined) HotbarSystem.clearItem(hb, row.itemId);
      }
    } else StorageUI._transfer(scene, box, bag, row.idx);
  },

  // Move slot `idx` of srcInv into dstInv (as much as fits), removing the moved amount from that
  // exact slot. Marks the window dirty so it repopulates next update(). Returns the amount moved
  // (0 if nothing fit) so the caller can react to a successful store (e.g. unbind the hotbar).
  _transfer(scene, srcInv, dstInv, idx) {
    if (idx < 0 || idx >= srcInv.slots.length) return 0;
    const s = srcInv.slots[idx];
    const itemId = s.itemId;
    const leftover = InventorySystem.add(dstInv, itemId, s.qty);
    const moved = s.qty - leftover;
    if (moved <= 0) return 0; // destination full / weight-gated
    s.qty -= moved;
    if (s.qty <= 0) srcInv.slots.splice(idx, 1);
    StorageUI._reconcileEquip(scene, srcInv);

    scene._storeDirty = true;
    scene._invDirty = true; // keep the main inventory window in sync if it's open
    Log.info(`transferred ${moved}x ${itemId}`);
    return moved;
  },

  // Bulk "Take All" / "Store All": move every stack of `side` ("bag"/"box") to the
  // other inventory, as much as fits. Each stack is gated by InventorySystem.add
  // (maxWeight then capacity), so when the destination hits its slot/weight cap the
  // remaining stacks simply stay put — greedy fill that halts cleanly at the limit.
  _allFrom(scene, side) {
    const world = scene.world;
    const bag = world.get(Inventory, scene.ctrl.id);
    const box = world.get(Inventory, scene._storageId);
    if (bag === undefined || box === undefined) return;
    // Storing FROM the bag keeps equipped copies behind (a worn item must stay in the bag
    // so its Equipment slot doesn't dangle) AND skips protected items entirely (favorited /
    // hotbar-bound never store); taking FROM the chest has nothing to protect.
    if (side === "bag")
      StorageUI._transferAll(
        scene,
        bag,
        box,
        StorageUI._equipKeep(scene),
        StorageUI._storeBlocked(scene, true), // bulk store protects hotbar items too
      );
    else StorageUI._transferAll(scene, box, bag, null, null);
  },

  // Items EXCLUDED from storing out of the bag. Flat { itemId: true }. Favorited items are the
  // player's explicit "don't auto-store this" and are ALWAYS blocked. Hotbar-bound items are
  // blocked only for the BULK Store All (`includeHotbar` true) — a deliberate single double-click
  // CAN store one (it unregisters it from the hotbar; see _move), so they're left out when
  // `includeHotbar` is false. null/absent for the take-from-chest direction.
  _storeBlocked(scene, includeHotbar) {
    const blocked = {};
    const fav = scene.world.get(Favorites, scene.ctrl.id);
    if (fav !== undefined)
      for (let i = 0; i < fav.ids.length; i++) blocked[fav.ids[i]] = true;
    if (includeHotbar) {
      const hb = scene.world.get(Hotbar, scene.ctrl.id);
      if (hb !== undefined)
        for (let i = 0; i < hb.slots.length; i++)
          if (hb.slots[i] !== "") blocked[hb.slots[i]] = true;
    }
    return blocked;
  },

  // Units of each itemId to KEEP in the bag during a Store All — one per equipment slot
  // that references it (Equipment is keyed by itemId, so a worn item needs ≥1 copy present).
  // null/empty for the take-from-chest direction. Flat { itemId: count }.
  _equipKeep(scene) {
    const keep = {};
    const eq = scene.world.get(Equipment, scene.ctrl.id);
    if (eq === undefined) return keep;
    for (const slot in eq.slots) {
      const itemId = eq.slots[slot];
      if (itemId !== undefined && itemId !== "")
        keep[itemId] = (keep[itemId] ?? 0) + 1;
    }
    return keep;
  },

  // `keep` (or null) is a { itemId: units-to-leave } map — the equipped copies excluded from
  // a Store All. The first stack(s) of a protected id keep that many units in srcInv; spare
  // (unequipped) copies still move. Each stack is otherwise capacity/weight-gated by add.
  // `blocked` (or null) is a { itemId: true } set fully excluded from storing (favorited /
  // hotbar-bound) — those stacks never move at all, regardless of `keep`.
  _transferAll(scene, srcInv, dstInv, keep, blocked) {
    let total = 0;
    let i = 0;
    while (i < srcInv.slots.length) {
      const s = srcInv.slots[i];
      if (blocked !== null && blocked[s.itemId]) {
        i++;
        continue; // favorited / hotbar-bound — never store
      }
      let movable = s.qty;
      if (keep !== null && keep[s.itemId] > 0) {
        const held = keep[s.itemId] < s.qty ? keep[s.itemId] : s.qty;
        movable = s.qty - held;
        keep[s.itemId] -= held; // this stack absorbed its share of the protection
      }
      if (movable <= 0) {
        i++;
        continue; // fully protected (the equipped copy) — leave it
      }
      const leftover = InventorySystem.add(dstInv, s.itemId, movable);
      const moved = movable - leftover;
      if (moved > 0) {
        total += moved;
        s.qty -= moved;
        if (s.qty <= 0) {
          srcInv.slots.splice(i, 1); // emptied — next slot shifts into i, don't advance
          continue;
        }
      }
      i++; // partial (dst full) or nothing fit — leave the stack and move on
    }
    if (total === 0) return;
    scene._storeDirty = true;
    scene._invDirty = true;
    Log.info(`transferred all (${total} items)`);
  },

  // Storing an equipped item out of the player's own bag must unequip it once the player
  // no longer owns any copy — equipped items normally stay in the bag, so a worn item
  // moved to the chest would otherwise leave a dangling Equipment slot (and its stat
  // mods) referencing an item we no longer have. No-op when srcInv isn't the player bag.
  _reconcileEquip(scene, srcInv) {
    if (srcInv !== scene.world.get(Inventory, scene.ctrl.id)) return;
    const eq = scene.world.get(Equipment, scene.ctrl.id);
    if (eq === undefined) return;
    for (const slot in eq.slots) {
      const itemId = eq.slots[slot];
      if (
        itemId !== undefined &&
        itemId !== "" &&
        !InventorySystem.has(srcInv, itemId, 1)
      ) {
        EquipmentSystem.unequip(scene.world, scene.ctrl.id, slot);
      }
    }
  },
};
