/**
 * Shared columns and row model for the colony inventory tables. A table sort is view-only: it
 * never reorders the underlying Inventory.
 */
globalThis.InvTable = {
  DOUBLE_MS: 350,
  ROW_H: 26, // a data row and its header

  /**
   * A row's identity: the instance uid when present, so a re-map after a refresh hits the same
   * instance and not its twin, else the item id. "#" keeps a uid from colliding with an item id.
   */
  rowId(row) {
    return row.uid !== undefined ? "#" + row.uid : row.itemId;
  },

  /**
   * The double-click gesture: true when `row` repeats the row latched in `state` within
   * DOUBLE_MS, else it latches and returns false. `state` is the panel's own { key, time }, so
   * two panels can't cross-trigger; `scope` separates panes within one.
   */
  reclick(state, row, scope) {
    const key = scope + "|" + InvTable.rowId(row) + "|" + (row.idx ?? "");
    const now = current_time;
    if (state.key === key && now - state.time < InvTable.DOUBLE_MS) return true;
    state.key = key;
    state.time = now;
    return false;
  },

  // Settings-gated column set; a stable `key` keeps the sort across a toggle.
  columns(opts = {}) {
    const gold = facetColor("warn");
    const accent = facetColor(FacetTheme.accent);
    const cols = [];
    if (opts.fav)
      cols.push({
        key: "fav",
        label: "",
        width: 18,
        sortable: false,
        // "*", not a star glyph: the bundled fonts are Latin-1 only
        text: (r) => (r.fav ? "*" : ""),
        color: () => gold,
      });
    if (opts.worn)
      cols.push({
        key: "worn",
        label: "",
        width: 20,
        sortable: false,
        text: (r) => (r.worn ? "E" : ""),
        color: () => accent,
      });
    cols.push({
      key: "name",
      label: I18n.text("INV_COL_NAME"),
      width: 100,
      flex: 3,
      sprite: (r) => {
        const it = Item.get(r.itemId);
        return it !== undefined ? it.sprite : -1;
      },
      text: (r) => r.name,
      color: (r) => r.color,
      sortValue: (r) => r.name,
    });
    if (Settings.get("invColRarity"))
      cols.push({
        key: "rarity",
        label: I18n.text("INV_COL_RARITY"),
        width: 90,
        flex: 1,
        text: (r) => r.rarityName,
        color: (r) => r.color,
        sortValue: (r) => r.rarityRank,
      });
    if (Settings.get("invColMaker"))
      cols.push({
        key: "maker",
        label: I18n.text("INV_COL_MAKER"),
        width: 110,
        flex: 1,
        text: (r) => r.makerName,
        color: (r) => r.makerColor,
        sortValue: (r) => r.makerRank,
      });
    if (Settings.get("invColType"))
      cols.push({
        key: "type",
        label: I18n.text("INV_COL_TYPE"),
        width: 116,
        flex: 1,
        text: (r) => I18n.text(r.catKey),
        sortValue: (r) => r.catRank,
      });
    cols.push({
      key: "qty",
      label: I18n.text("INV_COL_QTY"),
      width: 46,
      align: fa_right,
      text: (r) => string(r.qty),
      sortValue: (r) => r.qty,
    });
    if (Settings.get("invColWeight"))
      cols.push({
        key: "weight",
        label: I18n.text("INV_COL_WT"),
        width: 56,
        align: fa_right,
        text: (r) => string_format(r.weight, 0, 1),
        sortValue: (r) => r.weight,
      });
    if (Settings.get("invColValue"))
      cols.push({
        key: "value",
        label: I18n.text("INV_COL_VAL"),
        width: 84,
        align: fa_right,
        text: (r) => string(r.value),
        color: () => gold,
        sortValue: (r) => r.value,
      });
    return cols;
  },

  /** The shared table geometry; `opts` { emptyText, onSelect, onActivate }. */
  table(columns, opts = {}) {
    return facetTable(columns, {
      grow: true,
      rowH: InvTable.ROW_H,
      headerH: InvTable.ROW_H,
      sortBy: 0,
      emptyText: opts.emptyText,
      onSelect: opts.onSelect,
      onActivate: opts.onActivate,
    });
  },

  /** Row models for every slot of `inv`; a row's `idx` is valid only until the next refresh. */
  rows(inv, fav) {
    const rows = [];
    for (let i = 0; i < inv.slots.length; i++) {
      const s = inv.slots[i];
      rows.push({
        ...InvTable.rowModel(s.itemId, s.qty, s.uid, s.mods),
        idx: i,
        fav: fav !== undefined && Star.has(fav, s.itemId),
      });
    }
    return rows;
  },

  rowModel(itemId, qty, uid, mods) {
    const it = Item.get(itemId);
    const catRank = Bag.category(it);
    const cat = Bag.CATEGORIES[catRank];
    // mods is a plain object, not a Map (docs/GMRT.md)
    let modCount = 0;
    if (mods !== undefined) for (const slotId in mods) modCount++;
    const name = it !== undefined ? I18n.text(it.name) : itemId;
    const rarId = it !== undefined ? it.rarity : undefined;
    const rar = rarId !== undefined ? Rarity.get(rarId) : undefined;
    const mk = it !== undefined ? Manufacturer.get(it.maker) : undefined;
    return {
      itemId,
      qty,
      uid,
      modCount,
      // tells instances of the same item apart
      name: modCount > 0 ? name + " +" + modCount : name,
      search: InvTable.lower(name),
      cat: cat.code,
      catKey: cat.key,
      catRank,
      rarityName: rar !== undefined ? I18n.text(rar.name) : "",
      rarityRank: rarId !== undefined ? Rarity.rank(rarId) : -1,
      makerName: mk !== undefined ? I18n.text(mk.name) : "",
      makerColor: mk !== undefined ? mk.color : c_white,
      makerRank: mk !== undefined ? Manufacturer.rank(mk.id) : -1,
      weight: it !== undefined ? it.weight * qty : 0,
      value:
        it !== undefined ? Math.round(Rarity.modify(it.rarity, it.value)) : 0,
      color: InvTable.rarityColor(itemId),
    };
  },

  /**
   * Body `id`'s hotbar as slot-grid cells, one per slot, an empty one included: its key number in
   * the corner, lit while the bound gear is worn, and the icon dimmed while the bag holds none.
   */
  beltCells(entities, id) {
    const hb = entities.require(id, Hotbar);
    const inv = entities.require(id, Inventory);
    const eq = entities.require(id, Equipment);
    const accent = facetColor(FacetTheme.accent);
    const muted = facetColor(FacetTheme.textMuted);
    const cells = [];
    for (let i = 0; i < hb.slots.length; i++) {
      const itemId = hb.slots[i];
      const it = Item.get(itemId);
      const uid = Belt.instance(hb, inv, i);
      const n = uid !== undefined ? 1 : Bag.count(inv, itemId);
      const worn =
        uid !== undefined
          ? Loadout.wears(eq, uid)
          : Loadout.worn(entities, id, itemId);
      cells.push({
        sprite: it !== undefined ? it.sprite : -1,
        count: n,
        color: n > 0 ? c_white : c_dkgray,
        borderColor: worn
          ? accent
          : it !== undefined
            ? InvTable.rarityColor(itemId)
            : null,
        badge: string(i + 1),
        badgeColor: worn ? accent : muted,
      });
    }
    return cells;
  },

  /** The shared item color: its rarity's, c_white when the id or its rarity is unknown. */
  rarityColor(itemId) {
    const it = Item.get(itemId);
    const r = it !== undefined ? Rarity.get(it.rarity) : undefined;
    return r !== undefined ? r.color : c_white;
  },

  /** BUG: ASCII lowercase via char codes; toLowerCase() is broken (docs/GMRT.md #15563) */
  lower(s) {
    let out = "";
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      out += c >= 65 && c <= 90 ? String.fromCharCode(c + 32) : s[i];
    }
    return out;
  },
};
