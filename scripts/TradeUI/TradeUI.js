// Merchant trade page of the scene's Window — the shop counterpart to StorageUI, in three columns:
// LEFT = stock, MIDDLE = bag, RIGHT = the deal panel that prices and commits. All logic is TradeSystem.
/**
 * This file is presentation + the deal gesture, plus the sell-side worn/favorited guard (it reads
 * the player's Equipment/Favorites). ONE row is selected across both tables — picking in one clears
 * the other — and the deal column prices it: unit price, availability, an amount slider with -/+
 * steps, the total, and a SINGLE context button reading Buy or Sell for the side the selection came
 * from. A click only ever selects; there is no amount modal. A sale the guard blocks states its
 * reason in the panel and greys the button, while every economic refusal stays TradeSystem's (its
 * `reason` key, toasted). Opened by the `trade` InteractAction (a merchant NPC's Interaction)
 * through the shell — `scene.window.open("trade", { target })`, the merchant read live off
 * scene.window.target — and driven like every station page: the shell refreshes it when
 * scene.window.dirty is set, Interactable range-closes it. State on the page: buyTable / sellTable
 * (UITable), side + sel (the one selection, re-mapped by InvTable.rowId on every refresh — row
 * models are fresh objects), slider (the amount, its max re-bound to the selection) and nameText;
 * its titleExtra is the player's balance.
 */
globalThis.TradeUI = {
  DEAL_W: 280, // deal column width (px); the two tables split what is left
  WRAP: 244, // text wrap inside that column
  STEP_W: 34, // -/+ step button size

  /** build the page once; the scene adds it to its Window under "trade" */
  build(scene) {
    const page = {
      // the ACTIVE merchant's name, live
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
      // player credits, live, in the title row before the close button
      titleExtra: facetLabel(() => TradeUI._balanceText(scene), {
        font: "header",
        color: "warn",
      }),
      buyTable: null,
      sellTable: null,
      side: "", // "buy" | "sell" | "" — the table the selection came from
      sel: null, // the selected row model, else null
      slider: null, // the amount UISlider
      nameText: null, // the deal column's name UIText (its color tracks the selection's rarity)
      refresh: () => TradeUI.refresh(scene, page),
      onOpen: () => TradeUI._select(page, "", null), // a fresh shop opens unselected
    };

    // BUY (merchant stock) | SELL (player bag) | DEAL — the tables grow, the deal column is fixed.
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
      // BUY column sub-label = the finite merchant's till (empty for an infinite one).
      TradeUI._column(I18n.textRef("TRADE_BUY"), buyTable, () => {
        const m = scene.level.entities.get(scene.window.target, Merchant);
        return m === undefined || m.infinite
          ? ""
          : I18n.text("TRADE_MERCHANT_TILL", m.credits);
      }),
    );
    cols.insertChild(
      TradeUI._column(I18n.textRef("TRADE_SELL"), sellTable, () => ""),
    );
    cols.insertChild(TradeUI._deal(scene, page));
    page.el.insertChild(cols);

    const hint = new UIElement({ width: "100%", height: 20 });
    hint.insertChild(
      facetLabel(I18n.textRef("TRADE_HINT"), { color: FacetTheme.textMuted }),
    );
    page.el.insertChild(hint);
    return page;
  },

  /**
   * player's balance in the active merchant's currencyId (else "coin").
   */
  _coins(scene) {
    const inv = scene.level.entities.get(scene.playerId, Inventory);
    const m = scene.level.entities.get(scene.window.target, Merchant);
    const cur = m !== undefined ? m.currencyId : "coin";
    return inv !== undefined ? InventorySystem.count(inv, cur) : 0;
  },

  /**
   * "<currency name>: <balance>" — reads the currency item's own display name, not a hardcoded word.
   */
  _balanceText(scene) {
    const m = scene.level.entities.get(scene.window.target, Merchant);
    const cur = m !== undefined ? m.currencyId : "coin";
    const it = Item.get(cur);
    const nm = it !== undefined ? I18n.text(it.name) : cur;
    return nm + ": " + TradeUI._coins(scene);
  },

  /**
   * column header: gold title + a live sub-label pushed to the right edge.
   */
  _header(titleRef, subFn) {
    const header = new UIElement({
      width: "100%",
      height: 26,
      flexDirection: "row",
      alignItems: "center",
      gap: FacetTheme.gapSm,
    });
    const titleCell = new UIElement({ flexGrow: 1, flexBasis: 0 });
    titleCell.insertChild(facetLabel(titleRef, { color: "warn" }));
    header.insertChild(titleCell);
    header.insertChild(facetLabel(subFn, { color: FacetTheme.textMuted }));
    return header;
  },

  /**
   * titled table column: the header over the sortable table, sharing the row's free width.
   */
  _column(titleRef, tableEl, subFn) {
    const col = new UIElement({
      flexGrow: 1,
      flexBasis: 0,
      gap: FacetTheme.gapSm,
    });
    col.insertChild(TradeUI._header(titleRef, subFn));
    col.insertChild(tableEl);
    return col;
  },

  /**
   * DEAL column: the selection's name and prices over the amount row and the one context button, in
   * the well the tables wear. Built ONCE — every readout is a live closure over `page`, so a pick
   * or a transaction moves page state and never rebuilds the panel.
   */
  _deal(scene, page) {
    const col = new UIElement({
      width: TradeUI.DEAL_W,
      flexShrink: 0,
      gap: FacetTheme.gapSm,
    });
    col.insertChild(TradeUI._header(I18n.textRef("TRADE_DEAL"), () => ""));

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
    // availability names what it counts: the merchant's stock, or what the bag holds
    well.insertChild(
      facetKeyValueRow(
        () => I18n.text(page.side === "sell" ? "TRADE_OWNED" : "TRADE_STOCK"),
        () => (page.sel === null ? "-" : page.sel.qtyText),
      ),
    );
    well.insertChild(facetDivider());

    // the amount reads in the value column with the prices, so the slider keeps its whole width
    well.insertChild(
      facetKeyValueRow(
        I18n.textRef("TRADE_AMOUNT"),
        () => string(page.slider.value),
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

    // the guard's reason, stated where the refusal is (the button below greys out with it)
    well.insertChild(
      facetLabel(
        () => {
          const key = TradeUI._blocked(page);
          return key === "" ? "" : I18n.text(key);
        },
        { color: "warn", wrap: TradeUI.WRAP },
      ),
    );

    // spacer pushes the action button to the bottom of the column
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

    col.insertChild(well);
    return col;
  },

  /**
   * amount row: -/+ step buttons around the slider. Both drive the same UISlider, so a drag and a
   * step can never disagree; the slider's own readout is the amount.
   */
  _amount(page) {
    const sliderEl = facetSlider({
      value: 1,
      min: 1,
      max: 1,
      step: 1,
      showValue: false, // the Amount row above is the readout
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

  /**
   * one step button, dimmed at the end of the range it steps toward.
   */
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

  /**
   * per-side table. `side` ("buy"/"sell") routes the transaction direction. A click selects and
   * nothing more — the deal column commits.
   */
  _table(scene, page, side) {
    return facetTable(TradeUI._columns(side), {
      grow: true, // fill the column; reflows row count on resize
      rowH: 26,
      headerH: 26,
      sortBy: 0, // Name
      emptyText: I18n.text(
        side === "buy" ? "TRADE_BUY_EMPTY" : "TRADE_SELL_EMPTY",
      ),
      onSelect: (row) => TradeUI._pick(scene, page, side, row),
    });
  },

  /**
   * Columns: icon+Name (rarity color) · Price (gold) · Qty. Price reads the buy or sell price.
   */
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
   * row models for one side. BUY = merchant stock, SELL = player bag minus the currency item.
   * `idx` valid until the next refresh. `worn`/`fav` (sell side) drive the no-sell guard in _blocked.
   */
  _rows(scene, side) {
    const entities = scene.level.entities;
    const m = entities.get(scene.window.target, Merchant);
    if (m === undefined) return [];
    const inv =
      side === "buy"
        ? entities.get(scene.window.target, Inventory)
        : entities.get(scene.playerId, Inventory);
    if (inv === undefined) return [];
    const fav =
      side === "sell" ? entities.get(scene.playerId, Favorites) : undefined;
    const eq =
      side === "sell" ? entities.get(scene.playerId, Equipment) : undefined;
    const rows = [];
    for (let i = 0; i < inv.slots.length; i++) {
      const s = inv.slots[i];
      if (side === "sell" && s.itemId === m.currencyId) continue; // money isn't sellable
      const price =
        side === "buy"
          ? TradeSystem.buyPrice(m, s.itemId)
          : TradeSystem.sellPrice(m, s.itemId);
      let worn = false;
      if (side === "sell" && s.uid !== undefined && eq !== undefined) {
        const it = Item.get(s.itemId);
        if (
          it !== undefined &&
          it.hasComponent(Equippable) &&
          eq.slots[it.getComponent(Equippable).slot] === s.uid
        )
          worn = true;
      }
      rows.push({
        ...InvTable.rowModel(s.itemId, s.qty, s.uid, s.mods),
        idx: i,
        price,
        // infinite merchant BUY qty shows "-" (SDF fonts are Latin-1, no ∞ glyph).
        qtyText: side === "buy" && m.infinite ? "-" : string(s.qty),
        worn,
        fav: fav !== undefined && FavoritesSystem.has(fav, s.itemId),
      });
    }
    return rows;
  },

  refresh(scene, page) {
    page.buyTable.setRows(TradeUI._rows(scene, "buy"));
    page.sellTable.setRows(TradeUI._rows(scene, "sell"));
    TradeUI._remap(page);
    TradeUI._bindAmount(scene, page);
  },

  /**
   * a click (or a browse step) picks the row the deal column prices. Re-picking the SAME row is a
   * no-op, so it never resets an amount already dialled in.
   */
  _pick(scene, page, side, row) {
    if (row === null || row === undefined || row === page.sel) return;
    TradeUI._select(page, side, row);
    TradeUI._bindAmount(scene, page);
    page.slider.setValue(1); // a new pick starts at one
  },

  /**
   * THE one selection across both tables: adopt `row` on `side` (a null row clears it) and mirror
   * it into the tables so only the picked one highlights.
   */
  _select(page, side, row) {
    page.side = row === null ? "" : side;
    page.sel = row;
    page.buyTable.selectRow(page.side === "buy" ? row : null);
    page.sellTable.selectRow(page.side === "sell" ? row : null);
    // the rarity tint is per-selection, so it can't be baked at build — UIText reads color at draw
    page.nameText.color = facetColor(
      row !== null ? row.color : FacetTheme.textDim,
    );
  },

  /**
   * Re-point the selection at the fresh row model for the same item (row models are rebuilt every
   * refresh), dropping it when the item left the side it was picked from.
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

  /**
   * Re-bind the slider to the selection's ceiling; setValue clamps the held amount into the new
   * range (a no-op only while it still fits).
   */
  _bindAmount(scene, page) {
    page.slider.max = TradeUI._max(scene, page);
    page.slider.setValue(page.slider.value);
  },

  /**
   * amount ceiling for the selection: 1 for an instance, the whole stack on the sell side, and on
   * the buy side what the player can afford (bounded by finite stock).
   */
  _max(scene, page) {
    const row = page.sel;
    if (row === null) return 1;
    const def = Item.get(row.itemId);
    if (def !== undefined && def.isInstanced()) return 1;
    if (page.side === "sell") return row.qty;
    const m = scene.level.entities.get(scene.window.target, Merchant);
    if (m === undefined) return 1;
    const price = TradeSystem.buyPrice(m, row.itemId);
    const byCoins =
      price > 0 ? Math.floor(TradeUI._coins(scene) / price) : row.qty;
    const max = m.infinite ? byCoins : Math.min(row.qty, byCoins);
    return Math.max(1, max); // can't afford even one → let the Buy report NO_FUNDS
  },

  /**
   * i18n key for why the selection can't be sold ("" = it can): a worn instance or a favorited item.
   * The buy side is never blocked here — an unaffordable buy is TradeSystem's refusal to report.
   */
  _blocked(page) {
    const row = page.sel;
    if (row === null || page.side !== "sell") return "";
    if (row.worn) return "TRADE_WORN";
    if (row.fav) return "TRADE_FAVORITED";
    return "";
  },

  /**
   * commit the dialled amount on the selection's side (the button gates the guard + empty selection).
   */
  _act(scene, page) {
    const row = page.sel;
    if (row === null) return;
    const amount = page.slider.value;
    if (page.side === "buy") TradeUI._doBuy(scene, row, amount);
    else TradeUI._doSell(scene, row, amount);
  },

  _doBuy(scene, row, amount) {
    const res = TradeSystem.buy(
      scene.level.entities,
      scene.playerId,
      scene.window.target,
      row.idx,
      amount,
    );
    TradeUI._after(scene, res, "bought", row.itemId);
  },

  _doSell(scene, row, amount) {
    const res = TradeSystem.sell(
      scene.level.entities,
      scene.playerId,
      scene.window.target,
      row.idx,
      amount,
    );
    TradeUI._after(scene, res, "sold", row.itemId);
  },

  /** post-transaction: coin cue + refresh on success, else a toast of the refusal reason. */
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
