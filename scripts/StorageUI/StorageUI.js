/**
 * Bag–chest transfer page of the scene's Window, opened with `{ target, onTake }`: `target` is the
 * chest entity, `onTake` an optional per-open hook fired per stack taken (a plain chest sets none,
 * so withdrawing can't farm collect quests). Rows are swapped in place, so column sort survives
 * every transfer. Caller contract: set scene.window.dirty whenever the bag changes from outside
 * this page — the refresh is flag-driven and would otherwise show stale rows. This page owns the
 * rows, the gesture and the colony's guards: what the bag keeps back and what a store drags along.
 */
globalThis.StorageUI = {
  build(scene) {
    const page = {
      title: I18n.textRef("STORAGE_TITLE"),
      el: new UIElement({
        width: "100%",
        flexGrow: 1,
        flexBasis: 0,
        gap: FacetTheme.gapSm,
      }),
      bagTable: null,
      boxTable: null,
      click: { key: "", time: 0 }, // the re-click latch
      onTake: undefined, // never outlives the open
      refresh: () => StorageUI.refresh(scene, page),
      onOpen: (opts) => {
        page.onTake = opts.onTake;
        StorageUI._applyColumns(page);
      },
      onClose: () => {
        page.onTake = undefined;
      },
    };

    const cols = new UIElement({
      width: "100%",
      flexGrow: 1,
      flexBasis: 0,
      flexDirection: "row",
      gap: FacetTheme.gap,
    });
    const bagTable = StorageUI._table(scene, page, "bag");
    const boxTable = StorageUI._table(scene, page, "box");
    page.bagTable = bagTable.getComponent(UITable);
    page.boxTable = boxTable.getComponent(UITable);
    cols.insertChild(
      StorageUI._column(
        I18n.textRef("STORAGE_BAG"),
        bagTable,
        I18n.textRef("STORAGE_STORE_ALL"),
        () => StorageUI._allFrom(scene, page, "bag"),
        () => scene.level.entities.get(scene.playerId, Inventory),
      ),
    );
    cols.insertChild(
      StorageUI._column(
        I18n.textRef("STORAGE_BOX"),
        boxTable,
        I18n.textRef("STORAGE_TAKE_ALL"),
        () => StorageUI._allFrom(scene, page, "box"),
        () => scene.level.entities.get(scene.window.target, Inventory),
      ),
    );
    page.el.insertChild(cols);

    const hint = new UIElement({ width: "100%", height: 20 });
    hint.insertChild(
      facetLabel(I18n.textRef("STORAGE_HINT"), { color: FacetTheme.textMuted }),
    );
    page.el.insertChild(hint);
    return page;
  },

  /** `invFn` is read live: () => Inventory. */
  _column(titleRef, tableEl, allLabelRef, onAll, invFn) {
    const usage = new UIElement({ width: "100%", height: 20 });
    usage.insertChild(
      facetLabel(() => StorageUI._usageText(invFn()), {
        color: FacetTheme.textMuted,
      }),
    );
    return facetColumn(titleRef, [usage, tableEl], {
      trailing: facetButton(allLabelRef, onAll, {
        width: 100,
        height: 24,
        disabled: () => StorageUI._empty(invFn()),
      }),
    });
  },

  _empty(inv) {
    return inv === undefined || inv.slots.length === 0;
  },

  _usageText(inv) {
    if (inv === undefined) return "";
    let s =
      I18n.text("INV_SLOTS") + " " + inv.slots.length + "/" + inv.capacity;
    s += "   " + I18n.text("INV_WEIGHT") + " " + Bag.weight(inv);
    if (inv.maxWeight !== undefined) s += "/" + inv.maxWeight;
    return s;
  },

  /** `side` ("bag"/"box") is the source of a transfer. */
  _table(scene, page, side) {
    return InvTable.table(InvTable.columns({ fav: true }), {
      emptyText: I18n.text("COMMON_EMPTY"),
      onSelect: (row) => StorageUI._click(scene, page, side, row),
      onActivate: (row) => StorageUI._move(scene, page, side, row),
    });
  },

  /** On every open, so a column setting changed since the build lands. */
  _applyColumns(page) {
    page.bagTable.setColumns(InvTable.columns({ fav: true }));
    page.boxTable.setColumns(InvTable.columns({ fav: true }));
  },

  refresh(scene, page) {
    const entities = scene.level.entities;
    const bagInv = entities.require(scene.playerId, Inventory);
    const boxInv = entities.get(scene.window.target, Inventory);
    if (boxInv === undefined) return; // the target is gone; the page closes on range
    const fav = entities.require(scene.playerId, Favorites);
    page.bagTable.setRows(InvTable.rows(bagInv, fav));
    page.boxTable.setRows(InvTable.rows(boxInv, fav));
  },

  /** A click selects; a re-click transfers. */
  _click(scene, page, side, row) {
    if (row === null || row === undefined) return;
    if (InvTable.reclick(page.click, row, side))
      StorageUI._move(scene, page, side, row);
  },

  /**
   * A fungible stack asks for an amount; a single unit or an instance moves whole. Storing a
   * favorite is refused; taking is never protected.
   */
  _move(scene, page, side, row) {
    if (row === null || row === undefined) return;
    const entities = scene.level.entities;
    const srcInv = entities.get(
      side === "bag" ? scene.playerId : scene.window.target,
      Inventory,
    );
    if (srcInv === undefined) return;
    const s = srcInv.slots[row.idx];
    if (s === undefined) return;
    if (side === "bag" && StorageUI._kept(scene, false)(s)) return;
    const def = Item.get(s.itemId);
    if ((def === undefined || !def.isInstanced()) && s.qty > 1) {
      StorageUI._promptAmount(scene, page, side, row, s.qty);
      return;
    }
    StorageUI._doMove(scene, page, side, row, s.qty);
  },

  /** Held by the window as a prompt, so Esc cancels the picker before the page. */
  _promptAmount(scene, page, side, row, maxQty) {
    scene.window.prompt(
      facetAmountPicker({
        title: row.name,
        max: maxQty,
        prompt: I18n.text("STORAGE_QTY_PROMPT"),
        half: I18n.text("STORAGE_QTY_HALF"),
        all: I18n.text("STORAGE_QTY_ALL"),
        cancelLabel: I18n.text("COMMON_CANCEL"),
        confirmLabel: I18n.text("STORAGE_TRANSFER"),
        onConfirm: (amount) =>
          StorageUI._doMove(scene, page, side, row, amount),
      }),
    );
  },

  /** Move `amount` to the other side, then what the direction drags along. */
  _doMove(scene, page, side, row, amount) {
    const entities = scene.level.entities;
    const bag = entities.require(scene.playerId, Inventory);
    const box = entities.get(scene.window.target, Inventory);
    if (box === undefined) return;
    let moved;
    if (side === "bag") {
      moved = Bag.transfer(bag, box, row.idx, amount);
      if (moved > 0) StorageUI._afterStore(scene, bag, row.itemId);
    } else {
      moved = Bag.transfer(box, bag, row.idx, amount);
      if (moved > 0 && page.onTake !== undefined)
        page.onTake(row.itemId, moved);
    }
    if (moved <= 0) return;
    scene.window.dirty = true;
    Log.info(`transferred ${moved}x ${row.itemId}`);
  },

  /**
   * Every stack of `side` to the other side, as much as fits. A store keeps back what a bulk move
   * must; a take keeps nothing back.
   */
  _allFrom(scene, page, side) {
    const entities = scene.level.entities;
    const bag = entities.require(scene.playerId, Inventory);
    const box = entities.get(scene.window.target, Inventory);
    if (box === undefined) return;
    const total =
      side === "bag"
        ? Bag.transferAll(bag, box, {
            skip: StorageUI._kept(scene, true),
          })
        : Bag.transferAll(box, bag, { onMoved: page.onTake });
    if (total <= 0) return;
    scene.window.dirty = true;
    Log.info(`transferred all (${total} items)`);
  },

  /**
   * The bag's keep-back rule as a slot predicate. A favorite never stores; a bulk store also keeps
   * hotbar-bound items and worn instances, which a single move stores and unbinds instead.
   */
  _kept(scene, bulk) {
    const entities = scene.level.entities;
    const fav = entities.get(scene.playerId, Favorites);
    const hb = bulk ? entities.get(scene.playerId, Hotbar) : undefined;
    const eq = bulk ? entities.get(scene.playerId, Equipment) : undefined;
    return (s) => {
      if (fav !== undefined && Star.has(fav, s.itemId)) return true;
      if (hb !== undefined && Belt.has(hb, s.itemId)) return true;
      return eq !== undefined ? Loadout.wears(eq, s.uid) : false;
    };
  },

  /**
   * Only the last copy unbinds its hotbar slot, so a partial store keeps the binding usable; a
   * worn instance that left is unequipped.
   */
  _afterStore(scene, bag, itemId) {
    const entities = scene.level.entities;
    if (!Bag.has(bag, itemId, 1)) {
      Belt.clearItem(entities.require(scene.playerId, Hotbar), itemId);
    }
    Loadout.reconcile(entities, scene.playerId);
  },
};
