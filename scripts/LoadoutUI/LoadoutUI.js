/**
 * Gear page of the scene's Window over another body — a squad member, or a turret or gun mount —
 * opened with `{ target }`: the player's bag beside the target's, and the slots the target wears.
 * A double-click moves a row whole to the other bag; the selected row of the target's bag is put
 * on it and a worn slot taken off, the player acting on the target, so a protected loadout refuses
 * both and keeps its worn instances. Caller contract: set scene.window.dirty whenever either bag
 * changes from outside this page.
 */
globalThis.LoadoutUI = {
  /** `slots` is [{ slot, labelKey }], the order the worn column lists what the target wears. */
  build(scene, slots) {
    const page = {
      title: I18n.textRef("INV_GEAR_TITLE"),
      el: new UIElement({
        width: "100%",
        flexGrow: 1,
        flexBasis: 0,
        gap: FacetTheme.gapSm,
      }),
      bagTable: null,
      boxTable: null,
      wornHost: null,
      sel: null, // the target's row Equip acts on
      click: { key: "", time: 0 }, // the re-click latch
      refresh: () => LoadoutUI.refresh(scene, page, slots),
      onOpen: () => {
        page.sel = null;
        page.bagTable.setColumns(LoadoutUI._columns());
        page.boxTable.setColumns(LoadoutUI._columns());
      },
    };

    const cols = new UIElement({
      width: "100%",
      flexGrow: 1,
      flexBasis: 0,
      flexDirection: "row",
      gap: FacetTheme.gap,
    });
    const bagTable = LoadoutUI._table(scene, page, "bag");
    const boxTable = LoadoutUI._table(scene, page, "box");
    page.bagTable = bagTable.getComponent(UITable);
    page.boxTable = boxTable.getComponent(UITable);
    cols.insertChild(facetColumn(I18n.textRef("INV_GEAR_BAG"), bagTable));
    cols.insertChild(
      facetColumn(() => LoadoutUI._name(scene), boxTable, {
        trailing: facetButton(
          I18n.textRef("INV_GEAR_EQUIP"),
          () => LoadoutUI._equip(scene, page),
          { width: 100, height: 24, disabled: () => !LoadoutUI._armable(scene, page) },
        ),
      }),
    );
    page.wornHost = new UIElement({ width: "100%", gap: FacetTheme.gapSm });
    cols.insertChild(
      facetColumn(I18n.textRef("INV_GEAR_WORN"), page.wornHost, { width: 340 }),
    );
    page.el.insertChild(cols);

    const hint = new UIElement({ width: "100%", height: 20 });
    hint.insertChild(
      facetLabel(
        () =>
          I18n.text(LoadoutUI._locked(scene) ? "INV_PROTECTED" : "INV_GEAR_HINT"),
        { color: FacetTheme.textMuted },
      ),
    );
    page.el.insertChild(hint);
    return page;
  },

  refresh(scene, page, slots) {
    const entities = scene.level.entities;
    const target = scene.window.target;
    if (entities.get(target, Inventory) === undefined) return; // gone; the page closes on range
    const fav = entities.require(scene.playerId, Favorites);
    page.bagTable.setRows(LoadoutUI._rows(entities, scene.playerId, fav));
    const rows = LoadoutUI._rows(entities, target, fav);
    page.boxTable.setRows(rows);
    // re-map the selection by identity: row models are fresh objects each refresh
    let sel = null;
    if (page.sel !== null) {
      const key = InvTable.rowId(page.sel);
      for (let i = 0; i < rows.length; i++) if (InvTable.rowId(rows[i]) === key) sel = rows[i];
    }
    page.sel = sel;
    page.boxTable.selectRow(sel);
    LoadoutUI._worn(scene, page, slots);
  },

  _columns() {
    return InvTable.columns({ fav: true, worn: true });
  },

  /** `side` ("bag"/"box") is the source of a move. */
  _table(scene, page, side) {
    return InvTable.table(LoadoutUI._columns(), {
      emptyText: I18n.text("COMMON_EMPTY"),
      onSelect: (row) => LoadoutUI._click(scene, page, side, row),
      onActivate: (row) => LoadoutUI._move(scene, page, side, row),
    });
  },

  /** `id`'s bag as rows, each lit while `id` wears it. */
  _rows(entities, id, fav) {
    const rows = InvTable.rows(entities.require(id, Inventory), fav);
    const eq = entities.get(id, Equipment);
    for (let i = 0; i < rows.length; i++)
      rows[i].worn = eq !== undefined ? Loadout.wears(eq, rows[i].uid) : false;
    return rows;
  },

  _name(scene) {
    const nm = scene.level.entities.get(scene.window.target, Name);
    return nm !== undefined ? nm.name : I18n.text("INV_GEAR_THEIRS");
  },

  _locked(scene) {
    const entities = scene.level.entities;
    const target = scene.window.target;
    if (!entities.has(target, Equipment)) return false;
    return !Loadout.editable(entities, scene.playerId, target);
  },

  /** A target row picks what Equip puts on; a re-click moves either side's row. */
  _click(scene, page, side, row) {
    if (row === null || row === undefined) return;
    if (side === "box") {
      page.sel = row;
      page.bagTable.selectRow(null);
    } else {
      page.sel = null;
      page.boxTable.selectRow(null);
    }
    if (InvTable.reclick(page.click, row, side)) LoadoutUI._move(scene, page, side, row);
  },

  /**
   * The row whole to the other bag, and off whoever wore it. A favorite never leaves the player's
   * bag, and a worn instance never leaves a protected target's.
   */
  _move(scene, page, side, row) {
    if (row === null || row === undefined) return;
    const entities = scene.level.entities;
    const target = scene.window.target;
    const bag = entities.require(scene.playerId, Inventory);
    const box = entities.get(target, Inventory);
    if (box === undefined) return;
    const s = (side === "bag" ? bag : box).slots[row.idx];
    if (s === undefined) return;
    if (side === "bag") {
      const fav = entities.get(scene.playerId, Favorites);
      if (fav !== undefined && Star.has(fav, s.itemId)) return;
    } else if (LoadoutUI._locked(scene)) {
      if (Loadout.wears(entities.require(target, Equipment), s.uid)) {
        Toast.push(I18n.text("INV_PROTECTED"), { type: "info" });
        return;
      }
    }
    const from = side === "bag" ? scene.playerId : target;
    const moved = side === "bag" ? Bag.transfer(bag, box, row.idx) : Bag.transfer(box, bag, row.idx);
    if (moved <= 0) return;
    if (entities.has(from, Equipment)) Loadout.reconcile(entities, from);
    scene.window.dirty = true;
    Log.info(`moved ${moved}x ${s.itemId} from the ${side}`);
  },

  _armable(scene, page) {
    if (page.sel === null) return false;
    if (page.sel.uid === undefined) return false;
    return !LoadoutUI._locked(scene);
  },

  _equip(scene, page) {
    if (page.sel === null) return;
    const why = Loadout.equip(
      scene.level.entities,
      scene.window.target,
      page.sel.uid,
      scene.playerId,
    );
    if (why !== "") Toast.push(I18n.text(why), { type: "info" });
    scene.window.dirty = true;
  },

  /** One row per slot the target has, in `slots` order; a click takes the worn item off. */
  _worn(scene, page, slots) {
    const host = page.wornHost;
    facetClear(host);
    const entities = scene.level.entities;
    const target = scene.window.target;
    const eq = entities.get(target, Equipment);
    if (eq === undefined) {
      host.insertChild(facetLabel(I18n.textRef("COMMON_EMPTY"), { color: FacetTheme.textDim }));
      return;
    }
    const inv = entities.require(target, Inventory);
    const locked = LoadoutUI._locked(scene);
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i].slot;
      const uid = eq.slots[slot];
      if (uid === undefined) continue;
      const inst = uid !== "" ? Bag.findByUid(inv, uid) : undefined;
      const it = inst !== undefined ? Item.get(inst.itemId) : undefined;
      const nm = it !== undefined ? I18n.text(it.name) : I18n.text("COMMON_EMPTY");
      host.insertChild(
        facetButton(
          I18n.text(slots[i].labelKey) + ": " + nm,
          () => {
            Loadout.unequip(entities, target, slot, scene.playerId);
            scene.window.dirty = true;
          },
          {
            height: 30,
            disabled: inst === undefined ? true : locked,
            textColor: it !== undefined ? InvTable.rarityColor(it.id) : FacetTheme.textDim,
            icon: it !== undefined ? Bag.icon(it) : -1,
            iconColor: it !== undefined ? InvTable.rarityColor(it.id) : c_white,
          },
        ),
      );
    }
  },
};
