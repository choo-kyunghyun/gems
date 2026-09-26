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
      amount: null, // the UISlider a stack's transfer reads
      picked: "", // the stack the amount was set for
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
    page.el.insertChild(StorageUI._amountRow(page));

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

  /** The amount a stack moves: a slider over the selected stack, with quick picks. */
  _amountRow(page) {
    const row = new UIElement({
      width: "100%",
      height: FacetTheme.rowH,
      flexShrink: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: FacetTheme.gapSm,
    });
    const label = new UIElement({ flexGrow: 1, flexBasis: 0 });
    label.insertChild(
      facetLabel(I18n.textRef("STORAGE_QTY_PROMPT"), { color: FacetTheme.textMuted }),
    );
    row.insertChild(label);
    const sliderEl = facetSlider({ min: 1, max: 1, value: 1, step: 1, width: 240 });
    const slider = sliderEl.getComponent(UISlider);
    page.amount = slider;
    row.insertChild(sliderEl);
    const quick = (text, value) =>
      facetButton(text, () => slider.setValue(value()), { width: 90, height: FacetTheme.rowHSm });
    row.insertChild(quick("1", () => 1));
    row.insertChild(
      quick(I18n.textRef("STORAGE_QTY_HALF"), () => Math.max(1, Math.floor(slider.max / 2))),
    );
    row.insertChild(quick(I18n.textRef("STORAGE_QTY_ALL"), () => slider.max));
    return row;
  },

  /** A newly selected stack sets the amount to all of it; a re-click transfers. */
  _click(scene, page, side, row) {
    if (row === null || row === undefined) return;
    const key = side + "|" + InvTable.rowId(row) + "|" + row.idx;
    if (key !== page.picked) {
      page.picked = key;
      page.amount.max = Math.max(1, row.qty);
      page.amount.setValue(page.amount.max);
    }
    if (InvTable.reclick(page.click, row, side))
      StorageUI._move(scene, page, side, row);
  },

  /**
   * A fungible stack moves the chosen amount; a single unit or an instance moves whole. Storing a
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
    const fungible = def === undefined ? true : !def.isInstanced();
    const amount = fungible ? clamp(page.amount.value, 1, s.qty) : s.qty;
    StorageUI._doMove(scene, page, side, row, amount);
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
      // a worn instance that left comes off; a hotbar binding outlives its stock
      if (moved > 0) Loadout.reconcile(entities, scene.playerId);
    } else {
      moved = Bag.transfer(box, bag, row.idx, amount);
      if (moved > 0 && page.onTake !== undefined)
        page.onTake(row.itemId, moved);
    }
    if (moved <= 0) return;
    page.picked = ""; // the stack changed, so the next selection re-reads it
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
   * hotbar-bound items and worn instances, which a single move stores instead.
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
};
