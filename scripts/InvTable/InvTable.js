// Shared column set + row model for RPG inventory UITables — centralized so column widths / Settings
// gates and the row field set live in one place. StorageUI takes both; RpgInventoryUI only the rows.
/**
 * A table sort is VIEW-ONLY — it never reorders the underlying Inventory. The bag's own Sort button
 * (RpgInventoryUI) is the one thing that rewrites real slot order.
 */
globalThis.InvTable = {
  DOUBLE_MS: 350, // re-click window of the double-click gesture below

  /**
   * THE identity of a row model across the inventory family: the instance uid when present (so a
   * re-click, or a re-map after a refresh, hits the same modded gun and not its twin), else the
   * item id. "#" keeps a uid from ever colliding with an item id.
   * @param {Object} row @returns {string}
   */
  rowId(row) {
    return row.uid !== undefined ? "#" + row.uid : row.itemId;
  },

  /**
   * THE double-click gesture of the inventory panels: true when `row` repeats the last row
   * latched in `state` within DOUBLE_MS — the caller then acts on it — else it latches and
   * returns false (a plain select). `state` is the panel's own { key, time } bag, so two panels
   * can't cross-trigger; `scope` separates panes within one (bag vs chest), and the row's slot
   * index keeps two stacks of the same item apart. Arrowing a list fires with a different row
   * each step, so browse mode can never trip it.
   * @param {{key:string, time:number}} state @param {Object} row @param {string} scope
   * @returns {boolean}
   */
  reclick(state, row, scope) {
    const key = scope + "|" + InvTable.rowId(row) + "|" + (row.idx ?? "");
    const now = current_time;
    if (state.key === key && now - state.time < InvTable.DOUBLE_MS) return true;
    state.key = key;
    state.time = now;
    return false;
  },

  // Settings-gated column set. stable `key` lets UITable.setColumns remap the sort on toggle.
  columns(opts = {}) {
    const gold = gemsColor("#ffd166");
    const accent = gemsColor(GemsTheme.accent);
    const cols = [];
    if (opts.fav)
      cols.push({
        key: "fav",
        label: "",
        width: 18,
        sortable: false,
        // "*" not a star glyph: the bundled SDF fonts are Latin-1 only (no U+2605). Gold = favorited.
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
    // text columns flex-grow with the window; numeric columns stay fixed-width
    cols.push({
      key: "name",
      label: I18n.text("INV_COL_NAME"),
      width: 100,
      flex: 3,
      // item icon; missing/-1 draws nothing (UITable shifts text past it by rowH)
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
        sortValue: (r) => r.cat,
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

  // row model from an inventory slot. callers extend with their own fields (bag adds `worn`, chest adds `idx`).
  rowModel(itemId, qty, uid, mods) {
    const it = Item.get(itemId);
    const cat = InvTable.category(it);
    // mods is a plain-object MAP; count filled slots (for...in is GMRT-safe, Map iterator is not)
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
      // "Name +N" so multiple instances of the same weapon are distinguishable
      name: modCount > 0 ? name + " +" + modCount : name,
      search: InvTable.lower(name),
      cat: cat.code,
      catKey: cat.key,
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

  // Item-id tint by rarity, c_white when the id or its rarity is unknown. THE shared item
  // color: every inventory-family panel and the world drop squares read it from here.
  rarityColor(itemId) {
    const it = Item.get(itemId);
    const r = it !== undefined ? Rarity.get(it.rarity) : undefined;
    return r !== undefined ? r.color : c_white;
  },

  // filter/display category from capability components
  category(it) {
    if (it === undefined) return { code: "misc", key: "INV_CAT_MISC" };
    if (it.hasComponent(Weapon))
      return { code: "weapon", key: "INV_CAT_WEAPON" };
    if (it.hasComponent(Equippable))
      return { code: "gear", key: "INV_CAT_GEAR" };
    if (it.hasComponent(Consumable))
      return { code: "consumable", key: "INV_CAT_CONSUMABLE" };
    return { code: "misc", key: "INV_CAT_MISC" };
  },

  // ASCII lowercase via char codes — toLowerCase() returns garbage Unicode on GMRT (see CLAUDE.md)
  lower(s) {
    let out = "";
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      out += c >= 65 && c <= 90 ? String.fromCharCode(c + 32) : s[i];
    }
    return out;
  },
};
