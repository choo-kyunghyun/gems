// Bag↔Chest transfer window — near-fullscreen shell over a two-column UITable layout (like
// TradeUI/RpgInventoryUI). Open/close/prompt owned by Interactable; all state on level (_store*).
/**
 * Tables swap rows via setRows (not rebuilt) so column sort survives every transfer. Caller contract:
 * set level._storeDirty whenever the bag changes from outside this file (a craft, a pickup, an equip)
 * — refresh is flag-driven and will otherwise show stale rows.
 */
globalThis.StorageUI = {
  build(level) {
    level._storageId = -1;
    level._storeOpen = false;
    level._storeDirty = false;
    level._storeClickKey = ""; // last-clicked "side|idx" for double-click detection
    level._storeClickTime = 0;
    level._storeQtyModal = null; // open amount-picker modal, else null

    // near-fullscreen shell (dim host + centered card + title/close) — gemsOverlay.
    // Esc / E also close (handleEscape / _dispatchInteract).
    const host = gemsOverlay(I18n.textRef("STORAGE_TITLE"), {
      onClose: () => StorageUI.close(level),
    });
    level._storeWin = host;
    level.ui.insertChild(host);
    const card = host.body;

    const cols = new UIElement({
      width: "100%",
      flexGrow: 1, // tables grow to fill the card height
      flexBasis: 0,
      flexDirection: "row",
      gap: GemsTheme.gap,
    });
    const bagTable = StorageUI._table(level, "bag");
    const boxTable = StorageUI._table(level, "box");
    level._storeBagTable = bagTable.getComponent(UITable);
    level._storeBoxTable = boxTable.getComponent(UITable);
    cols.insertChild(
      StorageUI._column(
        I18n.textRef("STORAGE_BAG"),
        bagTable,
        I18n.textRef("STORAGE_STORE_ALL"),
        () => StorageUI._allFrom(level, "bag"),
        () => level.entities.get(Inventory, level.playerId),
      ),
    );
    cols.insertChild(
      StorageUI._column(
        I18n.textRef("STORAGE_BOX"),
        boxTable,
        I18n.textRef("STORAGE_TAKE_ALL"),
        () => StorageUI._allFrom(level, "box"),
        () => level.entities.get(Inventory, level._storageId),
      ),
    );
    card.insertChild(cols);

    const hint = new UIElement({ width: "100%", height: 20 });
    hint.insertChild(
      gemsLabel(I18n.textRef("STORAGE_HINT"), { color: GemsTheme.textMuted }),
    );
    card.insertChild(hint);
  },

  // titled column: header (title + bulk "All" button) + live usage line + the table.
  // invFn is a live () => Inventory feeding the usage readout and the All empty-gate.
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

  // "Slots used/cap   Weight cur[/max]" — the "/max" tail only when weight-capped (the bag).
  _usageText(inv) {
    if (inv === undefined) return "";
    let s =
      I18n.text("RPG_SLOTS") + " " + inv.slots.length + "/" + inv.capacity;
    s += "   " + I18n.text("RPG_WEIGHT") + " " + InventorySystem.weight(inv);
    if (inv.maxWeight !== undefined) s += "/" + inv.maxWeight;
    return s;
  },

  // per-side bag/chest table. `side` ("bag"/"box") routes the transfer direction.
  _table(level, side) {
    return gemsTable(InvTable.columns({ fav: true }), {
      grow: true, // fill the column; reflows row count on resize
      rowH: 26,
      headerH: 26,
      sortBy: 0, // Name
      emptyText: I18n.text("STORAGE_EMPTY"),
      onSelect: (row) => StorageUI._click(level, side, row),
      onActivate: (row) => StorageUI._move(level, side, row),
    });
  },

  // re-apply the Settings-driven column set to both tables (toggle changed / chest opened).
  _applyColumns(level) {
    level._storeBagTable.setColumns(InvTable.columns({ fav: true }));
    level._storeBoxTable.setColumns(InvTable.columns({ fav: true }));
  },

  // row models for one inventory. `idx` (slot index) is valid until the next refresh =
  // when a transfer happens, so it never drifts. `fav` drives the "*" marker on both sides.
  _rows(level, inv) {
    const fav = level.entities.get(Favorites, level.playerId);
    const rows = [];
    for (let i = 0; i < inv.slots.length; i++) {
      const s = inv.slots[i];
      const favd = fav !== undefined && FavoritesSystem.has(fav, s.itemId);
      rows.push({
        ...InvTable.rowModel(s.itemId, s.qty, s.uid, s.mods),
        idx: i, // transfer slot
        fav: favd,
      });
    }
    return rows;
  },

  open(level, id) {
    level._storageId = id;
    level._storeOpen = true;
    level._storeWin.enabled = true;
    StorageUI._applyColumns(level); // pick up any column-setting change since build
    level._storeDirty = true;
  },

  close(level) {
    level._storeOpen = false;
    level._storeWin.enabled = false;
    level._storageId = -1;
    level._storeOnTake = undefined; // per-open hook (corpse looting) never outlives the window
    // dismiss a dangling amount picker if the window closed under it
    if (level._storeQtyModal !== null && level._storeQtyModal !== undefined)
      level._storeQtyModal.close();
  },

  refresh(level) {
    const entities = level.entities;
    const bagInv = entities.get(Inventory, level.playerId);
    const boxInv = entities.get(Inventory, level._storageId);
    if (bagInv === undefined || boxInv === undefined) return;
    level._storeBagTable.setRows(StorageUI._rows(level, bagInv)); // re-applies the sort
    level._storeBoxTable.setRows(StorageUI._rows(level, boxInv));
  },

  // single click selects; a same-row click within 350ms transfers. browse-mode arrowing
  // fires onSelect with a different row each step, so it can't accidentally transfer.
  _click(level, side, row) {
    if (row === null || row === undefined) return;
    const now = current_time;
    const key = side + "|" + row.idx;
    if (level._storeClickKey === key && now - level._storeClickTime < 350) {
      StorageUI._move(level, side, row);
      return;
    }
    level._storeClickKey = key;
    level._storeClickTime = now;
  },

  // activate (double-click / confirm) on a row. a fungible stack > 1 opens the amount picker;
  // a single unit or an instance transfers whole. storing a favorited item from the bag is
  // refused; taking from the chest is never protected.
  _move(level, side, row) {
    if (row === null || row === undefined) return;
    const entities = level.entities;
    const srcInv = entities.get(
      Inventory,
      side === "bag" ? level.playerId : level._storageId,
    );
    if (srcInv === undefined) return;
    if (side === "bag" && StorageUI._storeBlocked(level, false)[row.itemId])
      return; // favorited
    const s = srcInv.slots[row.idx];
    if (s === undefined) return;
    const def = Item.get(s.itemId);
    if ((def === undefined || !def.isInstanced()) && s.qty > 1) {
      StorageUI._promptAmount(level, side, row, s.qty);
      return;
    }
    StorageUI._doMove(level, side, row, s.qty);
  },

  // amount picker (gemsAmountPicker): stepper (default = full stack) + 1/Half/All shortcuts.
  // Esc is owned by the level's handleEscape (closeOnEscape:false in the factory), so it
  // cancels the picker before the window.
  _promptAmount(level, side, row, maxQty) {
    level._storeQtyModal = gemsAmountPicker({
      title: row.name,
      max: maxQty,
      prompt: I18n.text("STORAGE_QTY_PROMPT"),
      half: I18n.text("STORAGE_QTY_HALF"),
      all: I18n.text("STORAGE_QTY_ALL"),
      cancelLabel: I18n.text("STORAGE_CANCEL"),
      confirmLabel: I18n.text("STORAGE_TRANSFER"),
      onConfirm: (amount) => StorageUI._doMove(level, side, row, amount),
      onClose: () => (level._storeQtyModal = null),
    });
  },

  // transfer `amount` to the opposite side. storing the LAST copy out of the bag unbinds
  // its hotbar slot; a partial transfer keeps the binding usable.
  _doMove(level, side, row, amount) {
    const entities = level.entities;
    const bag = entities.get(Inventory, level.playerId);
    const box = entities.get(Inventory, level._storageId);
    if (bag === undefined || box === undefined) return;
    if (side === "bag") {
      const moved = StorageUI._transfer(level, bag, box, row.idx, amount);
      if (moved > 0 && !InventorySystem.has(bag, row.itemId, 1)) {
        const hb = entities.get(Hotbar, level.playerId);
        if (hb !== undefined) HotbarSystem.clearItem(hb, row.itemId);
      }
    } else {
      const moved = StorageUI._transfer(level, box, bag, row.idx, amount);
      // optional take hook (set by the opener, e.g. corpse looting reports pickup credit);
      // a plain chest never sets it, so withdrawing can't farm collect quests
      if (moved > 0 && level._storeOnTake !== undefined)
        level._storeOnTake(row.itemId, moved);
    }
  },

  // move up to `amount` of slot `idx` src→dst (capped at what fits). `amount` only bounds a
  // fungible stack; an INSTANCE always moves whole by reference (preserving uid + mods).
  // returns the amount moved (0 if nothing fit) so the caller can react (e.g. unbind hotbar).
  _transfer(level, srcInv, dstInv, idx, amount) {
    if (idx < 0 || idx >= srcInv.slots.length) return 0;
    const s = srcInv.slots[idx];
    const itemId = s.itemId;
    const def = Item.get(itemId);
    let moved;
    if (def !== undefined && def.isInstanced()) {
      // move the whole instance slot by reference — add() would mint a fresh uid and drop the mods.
      if (InventorySystem.addSlot(dstInv, s) !== 0) return 0; // dst full / weight-gated
      srcInv.slots.splice(idx, 1);
      moved = 1;
    } else {
      const want = amount === undefined ? s.qty : Math.min(amount, s.qty);
      if (want <= 0) return 0;
      const leftover = InventorySystem.add(dstInv, itemId, want);
      moved = want - leftover;
      if (moved <= 0) return 0; // dst full / weight-gated
      s.qty -= moved;
      if (s.qty <= 0) srcInv.slots.splice(idx, 1);
    }
    StorageUI._reconcileEquip(level, srcInv);

    level._storeDirty = true;
    level._invDirty = true; // keep the inventory window in sync
    Log.info(`transferred ${moved}x ${itemId}`);
    return moved;
  },

  // bulk Take/Store All: move every stack of `side` to the other inventory, greedy fill that
  // halts cleanly when the destination hits its slot/weight cap (per-stack add gate).
  _allFrom(level, side) {
    const entities = level.entities;
    const bag = entities.get(Inventory, level.playerId);
    const box = entities.get(Inventory, level._storageId);
    if (bag === undefined || box === undefined) return;
    // storing from the bag keeps equipped copies behind (Equipment slot mustn't dangle) and
    // skips protected items (favorited / hotbar-bound); taking from the chest protects nothing.
    if (side === "bag")
      StorageUI._transferAll(
        level,
        bag,
        box,
        StorageUI._equipKeep(level),
        StorageUI._storeBlocked(level, true), // bulk store protects hotbar items too
      );
    else
      StorageUI._transferAll(level, box, bag, null, null, level._storeOnTake);
  },

  // items excluded from storing out of the bag, flat { itemId: true }. favorited always blocked;
  // hotbar-bound blocked only for BULK Store All (`includeHotbar`) — a single double-click can
  // still store one (it unbinds the hotbar; see _move).
  _storeBlocked(level, includeHotbar) {
    const blocked = {};
    const fav = level.entities.get(Favorites, level.playerId);
    if (fav !== undefined)
      for (let i = 0; i < fav.ids.length; i++) blocked[fav.ids[i]] = true;
    if (includeHotbar) {
      const hb = level.entities.get(Hotbar, level.playerId);
      if (hb !== undefined)
        for (let i = 0; i < hb.slots.length; i++)
          if (hb.slots[i] !== "") blocked[hb.slots[i]] = true;
    }
    return blocked;
  },

  // equipped instance uids to keep in the bag during a Store All — a worn instance must stay so
  // its Equipment slot doesn't dangle. exact { uid: true } set (Equipment keys by uid).
  _equipKeep(level) {
    const keep = {};
    const eq = level.entities.get(Equipment, level.playerId);
    if (eq === undefined) return keep;
    for (const slot in eq.slots) {
      const uid = eq.slots[slot];
      if (uid !== undefined && uid !== "") keep[uid] = true;
    }
    return keep;
  },

  // `keep` ({ uid: true } or null) = equipped instances to leave behind; `blocked` ({ itemId: true }
  // or null) = fully excluded (favorited / hotbar-bound). instance moves whole, fungible as much as
  // fits. `onMoved(itemId, qty)` (optional) fires per stack moved — the take-direction hook.
  _transferAll(level, srcInv, dstInv, keep, blocked, onMoved) {
    let total = 0;
    let i = 0;
    while (i < srcInv.slots.length) {
      const s = srcInv.slots[i];
      if (blocked !== null && blocked[s.itemId]) {
        i++;
        continue; // favorited / hotbar-bound — never store
      }
      const def = Item.get(s.itemId);
      if (def !== undefined && def.isInstanced()) {
        // Equipped instance — keep it in the bag so its Equipment slot doesn't dangle.
        if (keep !== null && s.uid !== undefined && keep[s.uid]) {
          i++;
          continue;
        }
        if (InventorySystem.addSlot(dstInv, s) === 0) {
          srcInv.slots.splice(i, 1); // moved by reference — next slot shifts into i, don't advance
          total += 1;
          if (onMoved !== undefined) onMoved(s.itemId, 1);
          continue;
        }
        i++; // dst full — leave it
        continue;
      }
      const leftover = InventorySystem.add(dstInv, s.itemId, s.qty);
      const moved = s.qty - leftover;
      if (moved > 0) {
        total += moved;
        if (onMoved !== undefined) onMoved(s.itemId, moved);
        s.qty -= moved;
        if (s.qty <= 0) {
          srcInv.slots.splice(i, 1); // emptied — next slot shifts into i, don't advance
          continue;
        }
      }
      i++; // partial (dst full) or nothing fit — leave the stack and move on
    }
    if (total === 0) return;
    level._storeDirty = true;
    level._invDirty = true;
    Log.info(`transferred all (${total} items)`);
  },

  // unequip any worn item no longer in the bag, else its Equipment slot (and stat mods) dangle.
  // no-op when srcInv isn't the player bag.
  _reconcileEquip(level, srcInv) {
    if (srcInv !== level.entities.get(Inventory, level.playerId)) return;
    const eq = level.entities.get(Equipment, level.playerId);
    if (eq === undefined) return;
    for (const slot in eq.slots) {
      const uid = eq.slots[slot];
      if (
        uid !== undefined &&
        uid !== "" &&
        InventorySystem.findByUid(srcInv, uid) === undefined
      ) {
        EquipmentSystem.unequip(level.entities, level.playerId, slot);
      }
    }
  },
};
