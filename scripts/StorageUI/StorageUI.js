// Bag↔Chest transfer window. near-fullscreen shell (absolute host + dim backdrop + centered card,
// shown/hidden via `.enabled`, built once — same as TradeUI/RpgInventoryUI) over a two-column
// UITable layout. tables swap rows via setRows (not rebuilt) so column sort survives every transfer.
// open/close/prompt owned by Interactable; all state on scene (_store* namespace).
globalThis.StorageUI = {
  build(scene) {
    scene._storageId = -1;
    scene._storeOpen = false;
    scene._storeDirty = false;
    scene._storeClickKey = ""; // last-clicked "side|idx" for double-click detection
    scene._storeClickTime = 0;
    scene._storeQtyModal = null; // open amount-picker modal, else null

    const margin = 28;
    // absolute dim backdrop host — fills the screen, veils the HUD behind it.
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
    host.addComponent(new UITrigger({})); // swallow backdrop clicks
    scene._storeWin = host;
    scene._storeWin.enabled = false;
    scene.ui.insertChild(scene._storeWin);

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

    // title + close (x); Esc / E also close (handleEscape / _dispatchInteract).
    const titleRow = new UIElement({
      width: "100%",
      height: 40,
      flexShrink: 0,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    });
    titleRow.insertChild(
      gemsLabel(I18n.textRef("STORAGE_TITLE"), {
        font: "header",
        color: GemsTheme.text,
      }),
    );
    titleRow.insertChild(
      gemsButton("x", () => StorageUI.close(scene), {
        width: 32,
        height: 32,
        rad: GemsTheme.radiusSm,
      }),
    );
    card.insertChild(titleRow);
    card.insertChild(gemsDivider());

    const cols = new UIElement({
      width: "100%",
      flexGrow: 1, // tables grow to fill the card height
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
    card.insertChild(cols);

    const hint = new UIElement({ width: "100%", height: 20 });
    hint.insertChild(
      gemsLabel(I18n.textRef("STORAGE_HINT"), { color: GemsTheme.textMuted }),
    );
    card.insertChild(hint);

    inner.insertChild(card);
    host.insertChild(inner);
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
  _table(scene, side) {
    return gemsTable(InvTable.columns({ fav: true }), {
      grow: true, // fill the column; reflows row count on resize
      rowH: 26,
      headerH: 26,
      sortBy: 0, // Name
      emptyText: I18n.text("STORAGE_EMPTY"),
      onSelect: (row) => StorageUI._click(scene, side, row),
      onActivate: (row) => StorageUI._move(scene, side, row),
    });
  },

  // re-apply the Settings-driven column set to both tables (toggle changed / chest opened).
  _applyColumns(scene) {
    scene._storeBagTable.setColumns(InvTable.columns({ fav: true }));
    scene._storeBoxTable.setColumns(InvTable.columns({ fav: true }));
  },

  // row models for one inventory. `idx` (slot index) is valid until the next refresh =
  // when a transfer happens, so it never drifts. `fav` drives the "*" marker on both sides.
  _rows(scene, inv) {
    const fav = scene.world.get(Favorites, scene.ctrl.id);
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
    scene._storeOnTake = undefined; // per-open hook (corpse looting) never outlives the window
    // dismiss a dangling amount picker if the window closed under it
    if (scene._storeQtyModal !== null && scene._storeQtyModal !== undefined)
      scene._storeQtyModal.close();
  },

  refresh(scene) {
    const world = scene.world;
    const bagInv = world.get(Inventory, scene.ctrl.id);
    const boxInv = world.get(Inventory, scene._storageId);
    if (bagInv === undefined || boxInv === undefined) return;
    scene._storeBagTable.setRows(StorageUI._rows(scene, bagInv)); // re-applies the sort
    scene._storeBoxTable.setRows(StorageUI._rows(scene, boxInv));
  },

  // single click selects; a same-row click within 350ms transfers. browse-mode arrowing
  // fires onSelect with a different row each step, so it can't accidentally transfer.
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

  // activate (double-click / confirm) on a row. a fungible stack > 1 opens the amount picker;
  // a single unit or an instance transfers whole. storing a favorited item from the bag is
  // refused; taking from the chest is never protected.
  _move(scene, side, row) {
    if (row === null || row === undefined) return;
    const world = scene.world;
    const srcInv = world.get(
      Inventory,
      side === "bag" ? scene.ctrl.id : scene._storageId,
    );
    if (srcInv === undefined) return;
    if (side === "bag" && StorageUI._storeBlocked(scene, false)[row.itemId])
      return; // favorited
    const s = srcInv.slots[row.idx];
    if (s === undefined) return;
    const def = Item.get(s.itemId);
    if ((def === undefined || !def.isInstanced()) && s.qty > 1) {
      StorageUI._promptAmount(scene, side, row, s.qty);
      return;
    }
    StorageUI._doMove(scene, side, row, s.qty);
  },

  // amount picker: stepper (default = full stack) + 1/Half/All shortcuts. Esc is owned by the
  // scene's handleEscape (closeOnEscape:false), so it cancels the picker before the window.
  _promptAmount(scene, side, row, maxQty) {
    let amount = maxQty; // the Transfer button reads it on confirm
    const body = new UIElement({ width: "100%", gap: GemsTheme.gapSm });
    body.insertChild(
      gemsLabel(I18n.text("STORAGE_QTY_PROMPT") + " (" + maxQty + ")", {
        color: GemsTheme.textMuted,
      }),
    );
    const stepEl = gemsStepper(amount, (v) => (amount = v), {
      min: 1,
      max: maxQty,
      step: 1,
    });
    const stepper = stepEl.getComponent(UIStepper);
    body.insertChild(stepEl);

    const quick = new UIElement({
      width: "100%",
      flexDirection: "row",
      gap: GemsTheme.gapSm,
    });
    quick.insertChild(StorageUI._quickBtn("1", () => stepper.setValue(1)));
    quick.insertChild(
      StorageUI._quickBtn(I18n.text("STORAGE_QTY_HALF"), () =>
        stepper.setValue(Math.floor(maxQty / 2)),
      ),
    );
    quick.insertChild(
      StorageUI._quickBtn(I18n.text("STORAGE_QTY_ALL"), () =>
        stepper.setValue(maxQty),
      ),
    );
    body.insertChild(quick);

    scene._storeQtyModal = gemsModal({
      title: row.name,
      width: 360,
      body,
      closeOnEscape: false, // handleEscape cancels the picker first
      buttons: [
        { label: I18n.text("STORAGE_CANCEL") },
        {
          label: I18n.text("STORAGE_TRANSFER"),
          primary: true,
          onClick: () => StorageUI._doMove(scene, side, row, amount),
        },
      ],
      onClose: () => (scene._storeQtyModal = null),
    });
  },

  _quickBtn(label, onClick) {
    const cell = new UIElement({ flexGrow: 1, flexBasis: 0 });
    cell.insertChild(gemsButton(label, onClick, { height: 30 }));
    return cell;
  },

  // transfer `amount` to the opposite side. storing the LAST copy out of the bag unbinds
  // its hotbar slot; a partial transfer keeps the binding usable.
  _doMove(scene, side, row, amount) {
    const world = scene.world;
    const bag = world.get(Inventory, scene.ctrl.id);
    const box = world.get(Inventory, scene._storageId);
    if (bag === undefined || box === undefined) return;
    if (side === "bag") {
      const moved = StorageUI._transfer(scene, bag, box, row.idx, amount);
      if (moved > 0 && !InventorySystem.has(bag, row.itemId, 1)) {
        const hb = world.get(Hotbar, scene.ctrl.id);
        if (hb !== undefined) HotbarSystem.clearItem(hb, row.itemId);
      }
    } else {
      const moved = StorageUI._transfer(scene, box, bag, row.idx, amount);
      // optional take hook (set by the opener, e.g. corpse looting reports pickup credit);
      // a plain chest never sets it, so withdrawing can't farm collect quests
      if (moved > 0 && scene._storeOnTake !== undefined)
        scene._storeOnTake(row.itemId, moved);
    }
  },

  // move up to `amount` of slot `idx` src→dst (capped at what fits). `amount` only bounds a
  // fungible stack; an INSTANCE always moves whole by reference (preserving uid + mods).
  // returns the amount moved (0 if nothing fit) so the caller can react (e.g. unbind hotbar).
  _transfer(scene, srcInv, dstInv, idx, amount) {
    if (idx < 0 || idx >= srcInv.slots.length) return 0;
    const s = srcInv.slots[idx];
    const itemId = s.itemId;
    const def = Item.get(itemId);
    let moved;
    if (def !== undefined && def.isInstanced()) {
      // move the whole instance slot by reference — add() would mint a fresh uid and drop the mods.
      if (!InventorySystem.addSlot(dstInv, s)) return 0; // dst full / weight-gated
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
    StorageUI._reconcileEquip(scene, srcInv);

    scene._storeDirty = true;
    scene._invDirty = true; // keep the inventory window in sync
    Log.info(`transferred ${moved}x ${itemId}`);
    return moved;
  },

  // bulk Take/Store All: move every stack of `side` to the other inventory, greedy fill that
  // halts cleanly when the destination hits its slot/weight cap (per-stack add gate).
  _allFrom(scene, side) {
    const world = scene.world;
    const bag = world.get(Inventory, scene.ctrl.id);
    const box = world.get(Inventory, scene._storageId);
    if (bag === undefined || box === undefined) return;
    // storing from the bag keeps equipped copies behind (Equipment slot mustn't dangle) and
    // skips protected items (favorited / hotbar-bound); taking from the chest protects nothing.
    if (side === "bag")
      StorageUI._transferAll(
        scene,
        bag,
        box,
        StorageUI._equipKeep(scene),
        StorageUI._storeBlocked(scene, true), // bulk store protects hotbar items too
      );
    else
      StorageUI._transferAll(scene, box, bag, null, null, scene._storeOnTake);
  },

  // items excluded from storing out of the bag, flat { itemId: true }. favorited always blocked;
  // hotbar-bound blocked only for BULK Store All (`includeHotbar`) — a single double-click can
  // still store one (it unbinds the hotbar; see _move).
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

  // equipped instance uids to keep in the bag during a Store All — a worn instance must stay so
  // its Equipment slot doesn't dangle. exact { uid: true } set (Equipment keys by uid).
  _equipKeep(scene) {
    const keep = {};
    const eq = scene.world.get(Equipment, scene.ctrl.id);
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
  _transferAll(scene, srcInv, dstInv, keep, blocked, onMoved) {
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
        if (InventorySystem.addSlot(dstInv, s)) {
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
    scene._storeDirty = true;
    scene._invDirty = true;
    Log.info(`transferred all (${total} items)`);
  },

  // unequip any worn item no longer in the bag, else its Equipment slot (and stat mods) dangle.
  // no-op when srcInv isn't the player bag.
  _reconcileEquip(scene, srcInv) {
    if (srcInv !== scene.world.get(Inventory, scene.ctrl.id)) return;
    const eq = scene.world.get(Equipment, scene.ctrl.id);
    if (eq === undefined) return;
    for (const slot in eq.slots) {
      const uid = eq.slots[slot];
      if (
        uid !== undefined &&
        uid !== "" &&
        InventorySystem.findByUid(srcInv, uid) === undefined
      ) {
        EquipmentSystem.unequip(scene.world, scene.ctrl.id, slot);
      }
    }
  },
};
