// Shared inventory-table model for the RPG item windows — the column set, row models, item
// category, and ASCII-lowercase helper that the bag window (RpgInventoryUI) and the chest
// transfer window (StorageUI) both build their UITables from. These were duplicated, near-
// identical methods on both modules; centralized here so the column widths/Settings gates and
// the per-row field set live in exactly one place. Rarity row color stays RpgWorldOverlay.
// _rarityColor (the documented shared item→color helper).
globalThis.InvTable = {
  // The Settings-gated column set: Name / Rarity? / Type? / Qty / Weight? / Value?. `opts.worn`
  // prepends a worn-marker "E" column (the bag window; the chest omits it). Each column carries a
  // stable `key` so UITable.setColumns can remap the active sort when a column is toggled.
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
    // The text columns carry a `width` floor + a `flex` weight so they GROW (and stop
    // truncating) as a resizable window widens; the numeric columns below stay fixed
    // (right-aligned numbers don't need the room). Name gets the largest share.
    cols.push({
      key: "name",
      label: I18n.text("INV_COL_NAME"),
      width: 100,
      flex: 3,
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
        width: 84, // fits the "Value" header; numeric data is short, so it stays fixed
        align: fa_right,
        text: (r) => string(r.value),
        color: () => gold,
        sortValue: (r) => r.value,
      });
    return cols;
  },

  // Shared row model from an inventory slot (itemId + qty, plus the slot's `uid`/`mods` for an
  // instance). Carries the full field set every shared column can render. Callers spread it and
  // add their own fields: the bag window adds `worn`, the chest adds `idx` (the slot index for the
  // transfer). `search` is the precomputed lowercase name for the bag's name filter (harmless/
  // unused on the chest side). `uid` (instance gear only, else undefined) is how the worn-marker
  // and selection identify the specific instance; `modCount` shows installed weapon mods.
  rowModel(itemId, qty, uid, mods) {
    const it = Item.get(itemId);
    const cat = InvTable.category(it);
    const modCount = mods !== undefined ? mods.length : 0;
    const name = it !== undefined ? I18n.text(it.name) : itemId;
    const rarId = it !== undefined ? it.rarity : undefined;
    const rar = rarId !== undefined ? Rarity.get(rarId) : undefined;
    return {
      itemId,
      qty,
      uid,
      modCount,
      // Modded weapons read "Name +N" so duplicates are distinguishable at a glance in the list.
      name: modCount > 0 ? name + " +" + modCount : name,
      search: InvTable.lower(name),
      cat: cat.code,
      catKey: cat.key,
      rarityName: rar !== undefined ? I18n.text(rar.name) : "",
      rarityRank: rarId !== undefined ? Rarity.order.indexOf(rarId) : -1,
      weight: it !== undefined ? it.weight * qty : 0, // total stack weight
      value:
        it !== undefined ? Math.round(Rarity.modify(it.rarity, it.value)) : 0,
      color: RpgWorldOverlay._rarityColor(itemId),
    };
  },

  // Filter/display category from the item's capability components.
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

  // ASCII-only lowercase (A–Z → a–z) for case-insensitive search. JS toLowerCase() returns
  // garbage Unicode on GMRT (CLAUDE.md), so map by char code; non-Latin text (e.g. Korean,
  // which is caseless) passes through unchanged.
  lower(s) {
    let out = "";
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      out += c >= 65 && c <= 90 ? String.fromCharCode(c + 32) : s[i];
    }
    return out;
  },
};
