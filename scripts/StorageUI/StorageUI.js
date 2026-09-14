// Bag↔Chest transfer page of the scene's Window — a two-column UITable layout.
/**
 * Opened by the "storage" / "corpse" InteractActions through the shell —
 * `scene.window.open("storage", { target, onTake })`: `target` is the chest entity (read live off
 * scene.window.target), `onTake` an optional per-open hook fired per stack taken (a corpse's pickup
 * credit; a plain chest sets none, so withdrawing can't farm collect quests). Open, close, Esc and
 * the refresh are the shell's (Window). Tables swap rows via setRows (not rebuilt) so column sort
 * survives every transfer. Caller contract: set scene.window.dirty whenever the bag changes from
 * outside this file (a craft, a pickup, an equip) — the refresh is flag-driven and would otherwise
 * show stale rows. The move itself is Bag.transfer / transferAll; this file holds the
 * rows, the gesture and the colony's guards — what the bag keeps back (_kept) and what a store
 * drags along (_afterStore). State on the page: bagTable / boxTable (UITable), click (the
 * InvTable.reclick latch), onTake.
 */
globalThis.StorageUI = {
  /** build the page once; the scene adds it to its Window under "storage" */
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
      click: { key: "", time: 0 }, // InvTable.reclick latch
      onTake: undefined, // per-open take hook (corpse looting) — never outlives the open
      refresh: () => StorageUI.refresh(scene, page),
      onOpen: (opts) => {
        page.onTake = opts.onTake;
        StorageUI._applyColumns(page); // pick up any column-setting change since build
      },
      onClose: () => {
        page.onTake = undefined;
      },
    };

    const cols = new UIElement({
      width: "100%",
      flexGrow: 1, // tables grow to fill the card height
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

  /**
   * one side's column: the title with its bulk "All" button, a live usage line, the table.
   * invFn is a live () => Inventory feeding the usage readout and the All empty-gate.
   */
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

  /**
   * True when an inventory is missing or holds no stacks (drives the All-button gate).
   */
  _empty(inv) {
    return inv === undefined || inv.slots.length === 0;
  },

  /**
   * "Slots used/cap   Weight cur[/max]" — the "/max" tail only when weight-capped (the bag).
   */
  _usageText(inv) {
    if (inv === undefined) return "";
    let s =
      I18n.text("INV_SLOTS") + " " + inv.slots.length + "/" + inv.capacity;
    s += "   " + I18n.text("INV_WEIGHT") + " " + Bag.weight(inv);
    if (inv.maxWeight !== undefined) s += "/" + inv.maxWeight;
    return s;
  },

  /**
   * per-side bag/chest table. `side` ("bag"/"box") routes the transfer direction.
   */
  _table(scene, page, side) {
    return InvTable.table(InvTable.columns({ fav: true }), {
      emptyText: I18n.text("COMMON_EMPTY"),
      onSelect: (row) => StorageUI._click(scene, page, side, row),
      onActivate: (row) => StorageUI._move(scene, page, side, row),
    });
  },

  /**
   * re-apply the Settings-driven column set to both tables (on every open, so a toggle made in
   * the bag's Settings tab since the build lands).
   */
  _applyColumns(page) {
    page.bagTable.setColumns(InvTable.columns({ fav: true }));
    page.boxTable.setColumns(InvTable.columns({ fav: true }));
  },

  refresh(scene, page) {
    const entities = scene.level.entities;
    const bagInv = entities.require(scene.playerId, Inventory);
    const boxInv = entities.get(scene.window.target, Inventory);
    if (boxInv === undefined) return; // the target went (a reaped corpse) — the engine range-closes
    const fav = entities.require(scene.playerId, Favorites); // the "*" marker on both sides
    page.bagTable.setRows(InvTable.rows(bagInv, fav)); // re-applies the sort
    page.boxTable.setRows(InvTable.rows(boxInv, fav));
  },

  /**
   * single click selects; a re-click transfers (InvTable.reclick owns the gesture).
   */
  _click(scene, page, side, row) {
    if (row === null || row === undefined) return;
    if (InvTable.reclick(page.click, row, side))
      StorageUI._move(scene, page, side, row);
  },

  /**
   * activate (double-click / confirm) on a row. a fungible stack > 1 opens the amount picker;
   * a single unit or an instance transfers whole. storing a kept-back item (a favorite) is
   * refused; taking from the chest is never protected.
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

  /**
   * amount picker (facetAmountPicker): stepper (default = full stack) + 1/Half/All shortcuts,
   * held by the shell so Esc cancels the picker before the page (closeOnEscape stays off in
   * the factory; the scene's handleEscape drives Window.back).
   */
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

  /**
   * transfer `amount` of the row's slot to the opposite side, then what the direction drags
   * along: a store's hotbar unbind / equipment reconcile, a take's per-open hook.
   */
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
      // the per-open take hook (corpse looting reports pickup credit)
      if (moved > 0 && page.onTake !== undefined)
        page.onTake(row.itemId, moved);
    }
    if (moved <= 0) return;
    scene.window.dirty = true;
    Log.info(`transferred ${moved}x ${row.itemId}`);
  },

  /**
   * bulk Take/Store All: every stack of `side` to the other inventory, as much as fits. A store
   * keeps back what _kept names for a bulk move; a take keeps nothing back and reports each
   * stack to the per-open hook.
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
   * The bag's keep-back rule as a slot predicate. A favorited item never stores. A BULK store
   * (`bulk`) also keeps hotbar-bound items and worn instances — an Equipment slot must not
   * dangle — where a single move stores one and unbinds / unequips it instead (_afterStore).
   */
  _kept(scene, bulk) {
    const entities = scene.level.entities;
    const fav = entities.get(scene.playerId, Favorites);
    const hb = bulk ? entities.get(scene.playerId, Hotbar) : undefined;
    const eq = bulk ? entities.get(scene.playerId, Equipment) : undefined;
    return (s) => {
      if (fav !== undefined && Star.has(fav, s.itemId)) return true;
      if (hb !== undefined && hb.slots.indexOf(s.itemId) !== -1) return true;
      if (eq !== undefined && s.uid !== undefined) {
        for (const slot in eq.slots) if (eq.slots[slot] === s.uid) return true;
      }
      return false;
    };
  },

  /**
   * what a store out of the bag drags along: the LAST copy unbinds its hotbar slot (a partial
   * transfer keeps the binding usable), and a worn instance that left is unequipped.
   */
  _afterStore(scene, bag, itemId) {
    const entities = scene.level.entities;
    if (!Bag.has(bag, itemId, 1)) {
      HotbarSystem.clearItem(entities.require(scene.playerId, Hotbar), itemId);
    }
    Loadout.reconcile(entities, scene.playerId);
  },
};
