/**
 * Merchant trade page of the scene's Window, for the merchant at `scene.window.target`.
 *
 * Owns presentation, the deal gesture and the sell-side guard against selling a worn or favorited
 * item. One row is selected across both tables, and a click only selects; the deal column prices
 * it and a single button commits it as a buy or a sell. Economic refusals are not decided here:
 * they come back from the transaction as a reason key and are toasted.
 */
globalThis.TradeUI = {
  DEAL_W: 280, // px; the two tables split what is left
  WRAP: 244,
  STEP_W: 34,

  build(scene) {
    const page = {
      title: () => {
        const npc = scene.level.entities.get(scene.window.target, NPC);
        return npc !== undefined
          ? I18n.text(npc.name)
          : I18n.text("TRADE_TITLE");
      },
      el: new UIElement({
        width: "100%",
        flexGrow: 1,
        flexBasis: 0,
        gap: FacetTheme.gapSm,
      }),
      titleExtra: facetLabel(() => TradeUI._balanceText(scene), {
        font: "header",
        color: "warn",
      }),
      buyTable: null,
      sellTable: null,
      side: "", // "buy" | "sell" | "" — the table the selection came from
      sel: null,
      slider: null,
      nameText: null,
      refresh: () => TradeUI.refresh(scene, page),
      onOpen: () => TradeUI._select(page, "", null),
    };

    const cols = new UIElement({
      width: "100%",
      flexGrow: 1,
      flexBasis: 0,
      flexDirection: "row",
      gap: FacetTheme.gap,
    });
    const buyTable = TradeUI._table(scene, page, "buy");
    const sellTable = TradeUI._table(scene, page, "sell");
    page.buyTable = buyTable.getComponent(UITable);
    page.sellTable = sellTable.getComponent(UITable);
    cols.insertChild(
      facetColumn(I18n.textRef("TRADE_BUY"), buyTable, {
        trailing: facetLabel(
          () => {
            const m = scene.level.entities.get(scene.window.target, Merchant);
            return m === undefined || m.infinite
              ? ""
              : I18n.text("TRADE_MERCHANT_TILL", m.credits);
          },
          { color: FacetTheme.textMuted },
        ),
      }),
    );
    cols.insertChild(facetColumn(I18n.textRef("TRADE_SELL"), sellTable));
    cols.insertChild(TradeUI._deal(scene, page));
    page.el.insertChild(cols);

    const hint = new UIElement({ width: "100%", height: 20 });
    hint.insertChild(
      facetLabel(I18n.textRef("TRADE_HINT"), { color: FacetTheme.textMuted }),
    );
    page.el.insertChild(hint);
    return page;
  },

  /** The player's balance in the active merchant's currency. */
  _coins(scene) {
    const inv = scene.level.entities.require(scene.playerId, Inventory);
    const m = scene.level.entities.get(scene.window.target, Merchant);
    const cur = m !== undefined ? m.currencyId : "coin";
    return Bag.count(inv, cur);
  },

  _balanceText(scene) {
    const m = scene.level.entities.get(scene.window.target, Merchant);
    const cur = m !== undefined ? m.currencyId : "coin";
    const it = Item.get(cur);
    const nm = it !== undefined ? I18n.text(it.name) : cur;
    return nm + ": " + TradeUI._coins(scene);
  },

  /**
   * Built once: every readout is a live closure over `page`, so a pick or a transaction never
   * rebuilds the column.
   */
  _deal(scene, page) {
    const well = new UIElement({
      width: "100%",
      flexGrow: 1,
      flexBasis: 0,
      padding: FacetTheme.padSm,
      gap: FacetTheme.gapSm,
    });
    well.addComponent(
      new UIPanel({
        color: facetColor(FacetTheme.panelLo),
        rad: FacetTheme.radiusSm,
        border: 1,
        borderColor: facetColor(FacetTheme.border),
      }),
    );

    const name = facetLabel(
      () => (page.sel === null ? I18n.text("TRADE_SELECT") : page.sel.name),
      { wrap: TradeUI.WRAP },
    );
    page.nameText = name.getComponent(UIText);
    well.insertChild(name);
    well.insertChild(facetDivider());

    well.insertChild(
      facetKeyValueRow(
        I18n.textRef("TRADE_UNIT"),
        () => (page.sel === null ? "-" : string(page.sel.price)),
        { valueColor: "warn" },
      ),
    );
    well.insertChild(
      facetKeyValueRow(
        () => I18n.text(page.side === "sell" ? "TRADE_OWNED" : "TRADE_STOCK"),
        () => (page.sel === null ? "-" : page.sel.qtyText),
      ),
    );
    well.insertChild(facetDivider());

    // the amount reads beside the prices, so the slider keeps its whole width
    well.insertChild(
      facetKeyValueRow(I18n.textRef("TRADE_AMOUNT"), () =>
        string(page.slider.value),
      ),
    );
    well.insertChild(TradeUI._amount(page));
    well.insertChild(
      facetKeyValueRow(
        I18n.textRef("TRADE_TOTAL"),
        () =>
          page.sel === null ? "-" : string(page.sel.price * page.slider.value),
        { valueColor: "warn" },
      ),
    );

    well.insertChild(
      facetLabel(
        () => {
          const key = TradeUI._blocked(page);
          return key === "" ? "" : I18n.text(key);
        },
        { color: "warn", wrap: TradeUI.WRAP },
      ),
    );

    well.insertChild(
      new UIElement({ width: "100%", flexGrow: 1, flexBasis: 0 }),
    );
    well.insertChild(
      facetButton(
        () => I18n.text(page.side === "sell" ? "TRADE_SELL" : "TRADE_BUY"),
        () => TradeUI._act(scene, page),
        {
          primary: true,
          disabled: () => page.sel === null || TradeUI._blocked(page) !== "",
        },
      ),
    );

    return facetColumn(I18n.textRef("TRADE_DEAL"), well, {
      width: TradeUI.DEAL_W,
    });
  },

  /** The -/+ steps drive the slider itself, so a drag and a step never disagree. */
  _amount(page) {
    const sliderEl = facetSlider({
      value: 1,
      min: 1,
      max: 1,
      step: 1,
      showValue: false,
    });
    page.slider = sliderEl.getComponent(UISlider);
    const row = new UIElement({
      width: "100%",
      height: FacetTheme.sliderH,
      flexShrink: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: FacetTheme.gapSm,
    });
    row.insertChild(TradeUI._step(page, -1));
    const cell = new UIElement({ flexGrow: 1, flexBasis: 0 });
    cell.insertChild(sliderEl);
    row.insertChild(cell);
    row.insertChild(TradeUI._step(page, 1));
    return row;
  },

  _step(page, dir) {
    return facetButton(
      dir < 0 ? "-" : "+",
      () => page.slider.setValue(page.slider.value + dir),
      {
        width: TradeUI.STEP_W,
        height: TradeUI.STEP_W,
        disabled: () =>
          dir < 0
            ? page.slider.value <= page.slider.min
            : page.slider.value >= page.slider.max,
      },
    );
  },

  /** A click only selects; the deal column commits. */
  _table(scene, page, side) {
    return InvTable.table(TradeUI._columns(side), {
      emptyText: I18n.text(
        side === "buy" ? "TRADE_BUY_EMPTY" : "TRADE_SELL_EMPTY",
      ),
      onSelect: (row) => TradeUI._pick(scene, page, side, row),
    });
  },

  _columns(side) {
    const gold = facetColor("warn");
    return [
      {
        key: "name",
        label: I18n.text("INV_COL_NAME"),
        width: 120,
        flex: 3,
        sprite: (r) => {
          const it = Item.get(r.itemId);
          return it !== undefined ? it.sprite : -1;
        },
        text: (r) => r.name,
        color: (r) => r.color,
        sortValue: (r) => r.name,
      },
      {
        key: "price",
        label: I18n.text("TRADE_COL_PRICE"),
        width: 72,
        align: fa_right,
        text: (r) => string(r.price),
        color: () => gold,
        sortValue: (r) => r.price,
      },
      {
        key: "qty",
        label: I18n.text("INV_COL_QTY"),
        width: 54,
        align: fa_right,
        text: (r) => r.qtyText,
        sortValue: (r) => r.qty,
      },
    ];
  },

  /**
   * Fresh row models for one side: the merchant's stock, or the player's bag minus the currency.
   */
  _rows(scene, side) {
    const entities = scene.level.entities;
    const m = entities.get(scene.window.target, Merchant);
    if (m === undefined) return [];
    const inv = entities.get(
      side === "buy" ? scene.window.target : scene.playerId,
      Inventory,
    );
    if (inv === undefined) return [];
    const fav =
      side === "sell" ? entities.get(scene.playerId, Favorites) : undefined;
    const eq =
      side === "sell" ? entities.get(scene.playerId, Equipment) : undefined;
    const base = InvTable.rows(inv, fav);
    const rows = [];
    for (let i = 0; i < base.length; i++) {
      const r = base[i];
      if (side === "sell" && r.itemId === m.currencyId) continue;
      r.price =
        side === "buy"
          ? Trade.buyPrice(m, r.itemId)
          : Trade.sellPrice(m, r.itemId);
      // "-" for infinite stock: the fonts are Latin-1, with no ∞ glyph
      r.qtyText = side === "buy" && m.infinite ? "-" : string(r.qty);
      r.worn = false;
      if (eq !== undefined && r.uid !== undefined) {
        const it = Item.get(r.itemId);
        if (
          it !== undefined &&
          it.hasComponent(Equippable) &&
          eq.slots[it.getComponent(Equippable).slot] === r.uid
        )
          r.worn = true;
      }
      rows.push(r);
    }
    return rows;
  },

  refresh(scene, page) {
    page.buyTable.setRows(TradeUI._rows(scene, "buy"));
    page.sellTable.setRows(TradeUI._rows(scene, "sell"));
    TradeUI._remap(page);
    TradeUI._bindAmount(scene, page);
  },

  /** Re-picking the same row is a no-op, so it never resets an amount already dialled in. */
  _pick(scene, page, side, row) {
    if (row === null || row === undefined || row === page.sel) return;
    TradeUI._select(page, side, row);
    TradeUI._bindAmount(scene, page);
    page.slider.setValue(1);
  },

  /** The one selection across both tables; a null row clears it. */
  _select(page, side, row) {
    page.side = row === null ? "" : side;
    page.sel = row;
    page.buyTable.selectRow(page.side === "buy" ? row : null);
    page.sellTable.selectRow(page.side === "sell" ? row : null);
    // the rarity tint is per selection, so it cannot be baked at build
    page.nameText.color = facetColor(
      row !== null ? row.color : FacetTheme.textDim,
    );
  },

  /**
   * Re-points the selection at the rebuilt row model for the same item, dropping it when the item
   * left its side.
   */
  _remap(page) {
    if (page.sel === null) return;
    const rows = (
      page.side === "sell" ? page.sellTable : page.buyTable
    ).getRows();
    const id = InvTable.rowId(page.sel);
    let next = null;
    for (let i = 0; i < rows.length; i++) {
      if (InvTable.rowId(rows[i]) === id) {
        next = rows[i];
        break;
      }
    }
    TradeUI._select(page, page.side, next);
  },

  /** setValue clamps the held amount into the new range. */
  _bindAmount(scene, page) {
    page.slider.max = TradeUI._max(scene, page);
    page.slider.setValue(page.slider.value);
  },

  /** Amount ceiling: the whole stack when selling, what the player can afford when buying. */
  _max(scene, page) {
    const row = page.sel;
    if (row === null) return 1;
    const def = Item.get(row.itemId);
    if (def !== undefined && def.isInstanced()) return 1;
    if (page.side === "sell") return row.qty;
    const m = scene.level.entities.get(scene.window.target, Merchant);
    if (m === undefined) return 1;
    const price = Trade.buyPrice(m, row.itemId);
    const byCoins =
      price > 0 ? Math.floor(TradeUI._coins(scene) / price) : row.qty;
    const max = m.infinite ? byCoins : Math.min(row.qty, byCoins);
    return Math.max(1, max); // at least one, so an unaffordable buy reports its refusal
  },

  /**
   * i18n key for why the selection cannot be sold, "" when it can. The buy side is never blocked
   * here; its refusals come from the transaction.
   */
  _blocked(page) {
    const row = page.sel;
    if (row === null || page.side !== "sell") return "";
    if (row.worn) return "TRADE_WORN";
    if (row.fav) return "TRADE_FAVORITED";
    return "";
  },

  _act(scene, page) {
    const row = page.sel;
    if (row === null) return;
    const amount = page.slider.value;
    if (page.side === "buy") TradeUI._doBuy(scene, row, amount);
    else TradeUI._doSell(scene, row, amount);
  },

  _doBuy(scene, row, amount) {
    const res = Trade.buy(
      scene.level.entities,
      scene.playerId,
      scene.window.target,
      row.idx,
      amount,
    );
    TradeUI._after(scene, res, "bought", row.itemId);
  },

  _doSell(scene, row, amount) {
    const res = Trade.sell(
      scene.level.entities,
      scene.playerId,
      scene.window.target,
      row.idx,
      amount,
    );
    TradeUI._after(scene, res, "sold", row.itemId);
  },

  _after(scene, res, verb, itemId) {
    if (res.amount > 0) {
      Audio.play({ sound: sndCoin });
      scene.window.dirty = true;
      Log.info(`${verb} ${res.amount}x ${itemId}`);
    } else if (res.reason !== "") {
      Toast.push(I18n.text(res.reason), { type: "warn" });
    }
  },
};
