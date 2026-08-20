// Merchant trade window — the shop counterpart to StorageUI (near-fullscreen shell over StorageUI's
// two-column layout: LEFT = stock/BUY, RIGHT = bag/SELL). All logic is TradeSystem.
/**
 * This file is presentation + the double-click/amount gesture, plus the sell-side worn/favorited
 * guard (it reads the player's Equipment/Favorites). Each column is a sortable UITable with a Price
 * column. State on the scene (_trade*). Opened by sceneColony._npcActivate when the targeted NPC carries
 * a Merchant; it closes itself past TRADE_RANGE (Interactable's range-close covers only windows
 * opened from an Interaction, and a merchant NPC has none — so without this, walking away would leave
 * the shop open).
 */
globalThis.TradeUI = {
  build(scene) {
    scene._tradeMerchantId = -1;
    scene._tradeOpen = false;
    scene._tradeDirty = false;
    scene._tradeClick = { key: "", time: 0 }; // InvTable.reclick latch
    scene._tradeQtyModal = null; // open amount-picker modal, else null

    // near-fullscreen shell (dim host + centered card + title/close) — gemsOverlay.
    // Title reads the ACTIVE merchant live; Esc / E also close.
    const host = gemsOverlay(
      () => {
        const npc = scene.level.entities.get(scene._tradeMerchantId, NPC);
        return npc !== undefined
          ? I18n.text(npc.name)
          : I18n.text("TRADE_TITLE");
      },
      { onClose: () => TradeUI.close(scene) },
    );
    scene._tradeWin = host;
    scene.ui.insertChild(host);
    const card = host.body;

    // player credits, live, right-aligned just before the close button.
    host.titleRow.insertChild(
      gemsLabel(() => TradeUI._balanceText(scene), {
        font: "header",
        color: "warn",
      }),
      1,
    );

    // BUY (merchant stock) | SELL (player bag); flexGrow so the tables fill the height.
    const cols = new UIElement({
      width: "100%",
      flexGrow: 1,
      flexBasis: 0,
      flexDirection: "row",
      gap: GemsTheme.gap,
    });
    const buyTable = TradeUI._table(scene, "buy");
    const sellTable = TradeUI._table(scene, "sell");
    scene._tradeBuyTable = buyTable.getComponent(UITable);
    scene._tradeSellTable = sellTable.getComponent(UITable);
    cols.insertChild(
      // BUY column sub-label = the finite merchant's till (empty for an infinite one).
      TradeUI._column(I18n.textRef("TRADE_BUY"), buyTable, () => {
        const m = scene.level.entities.get(scene._tradeMerchantId, Merchant);
        return m === undefined || m.infinite
          ? ""
          : I18n.text("TRADE_MERCHANT_TILL", m.credits);
      }),
    );
    cols.insertChild(
      TradeUI._column(I18n.textRef("TRADE_SELL"), sellTable, () => ""),
    );
    card.insertChild(cols);

    const hint = new UIElement({ width: "100%", height: 20 });
    hint.insertChild(
      gemsLabel(I18n.textRef("TRADE_HINT"), { color: GemsTheme.textMuted }),
    );
    card.insertChild(hint);
  },

  /**
   * player's balance in the active merchant's currencyId (else "coin").
   */
  _coins(scene) {
    const inv = scene.level.entities.get(scene.playerId, Inventory);
    const m = scene.level.entities.get(scene._tradeMerchantId, Merchant);
    const cur = m !== undefined ? m.currencyId : "coin";
    return inv !== undefined ? InventorySystem.count(inv, cur) : 0;
  },

  /**
   * "<currency name>: <balance>" — reads the currency item's own display name, not a hardcoded word.
   */
  _balanceText(scene) {
    const m = scene.level.entities.get(scene._tradeMerchantId, Merchant);
    const cur = m !== undefined ? m.currencyId : "coin";
    const it = Item.get(cur);
    const nm = it !== undefined ? I18n.text(it.name) : cur;
    return nm + ": " + TradeUI._coins(scene);
  },

  /**
   * titled column: gold header (title + live sub-label) over the sortable table.
   */
  _column(titleRef, tableEl, subFn) {
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
    titleCell.insertChild(gemsLabel(titleRef, { color: "warn" }));
    header.insertChild(titleCell);
    header.insertChild(gemsLabel(subFn, { color: GemsTheme.textMuted }));
    col.insertChild(header);
    col.insertChild(tableEl);
    return col;
  },

  /**
   * per-side table. `side` ("buy"/"sell") routes the transaction direction.
   */
  _table(scene, side) {
    return gemsTable(TradeUI._columns(side), {
      grow: true, // fill the column; reflows row count on resize
      rowH: 26,
      headerH: 26,
      sortBy: 0, // Name
      emptyText: I18n.text(
        side === "buy" ? "TRADE_BUY_EMPTY" : "TRADE_SELL_EMPTY",
      ),
      onSelect: (row) => TradeUI._click(scene, side, row),
      onActivate: (row) => TradeUI._act(scene, side, row),
    });
  },

  /**
   * Columns: icon+Name (rarity color) · Price (gold) · Qty. Price reads the buy or sell price.
   */
  _columns(side) {
    const gold = gemsColor("warn");
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
        width: 78,
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
   * `idx` valid until the next refresh. `worn`/`fav` (sell side) drive the no-sell guard in _act.
   */
  _rows(scene, side) {
    const entities = scene.level.entities;
    const m = entities.get(scene._tradeMerchantId, Merchant);
    if (m === undefined) return [];
    const inv =
      side === "buy"
        ? entities.get(scene._tradeMerchantId, Inventory)
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

  open(scene, merchantId) {
    scene._tradeMerchantId = merchantId;
    scene._tradeOpen = true;
    scene._tradeWin.enabled = true;
    scene._tradeDirty = true;
  },

  close(scene) {
    scene._tradeOpen = false;
    scene._tradeWin.enabled = false;
    scene._tradeMerchantId = -1;
    if (scene._tradeQtyModal !== null && scene._tradeQtyModal !== undefined)
      scene._tradeQtyModal.close();
  },

  refresh(scene) {
    if (scene._tradeBuyTable !== undefined)
      scene._tradeBuyTable.setRows(TradeUI._rows(scene, "buy"));
    if (scene._tradeSellTable !== undefined)
      scene._tradeSellTable.setRows(TradeUI._rows(scene, "sell"));
  },

  /** single click selects; a re-click transacts (InvTable.reclick owns the gesture). */
  _click(scene, side, row) {
    if (row === null || row === undefined) return;
    if (InvTable.reclick(scene._tradeClick, row, side))
      TradeUI._act(scene, side, row);
  },

  /**
   * transact (double-click / confirm). sell-side worn/favorited refused with a toast. a fungible
   * stack > 1 opens the amount picker; an instance or single unit transacts immediately.
   */
  _act(scene, side, row) {
    if (row === null || row === undefined) return;
    if (side === "sell") {
      if (row.worn) {
        Toast.push(I18n.text("TRADE_WORN"), { type: "warn" });
        return;
      }
      if (row.fav) {
        Toast.push(I18n.text("TRADE_FAVORITED"), { type: "warn" });
        return;
      }
    }
    const entities = scene.level.entities;
    const m = entities.get(scene._tradeMerchantId, Merchant);
    if (m === undefined) return;
    const def = Item.get(row.itemId);
    const instanced = def !== undefined && def.isInstanced();

    let maxQty = 1;
    if (!instanced) {
      if (side === "buy") {
        // picker max = what the player can afford, bounded by finite stock.
        const coins = TradeUI._coins(scene);
        const price = TradeSystem.buyPrice(m, row.itemId);
        const byCoins = price > 0 ? Math.floor(coins / price) : row.qty;
        maxQty = m.infinite ? byCoins : Math.min(row.qty, byCoins);
        if (maxQty < 1) maxQty = 1; // can't afford even one → let _doBuy report NO_FUNDS
      } else {
        maxQty = row.qty;
      }
    }
    if (!instanced && maxQty > 1) {
      TradeUI._promptAmount(scene, side, row, maxQty);
      return;
    }
    if (side === "buy") TradeUI._doBuy(scene, row, 1);
    else TradeUI._doSell(scene, row, 1);
  },

  /**
   * amount picker (gemsAmountPicker): stepper (default = full amount) + 1/Half/All shortcuts.
   * closeOnEscape stays off in the factory — handleEscape cancels the picker first, then the window.
   */
  _promptAmount(scene, side, row, maxQty) {
    scene._tradeQtyModal = gemsAmountPicker({
      title: row.name,
      max: maxQty,
      prompt: I18n.text("STORAGE_QTY_PROMPT"),
      half: I18n.text("STORAGE_QTY_HALF"),
      all: I18n.text("STORAGE_QTY_ALL"),
      cancelLabel: I18n.text("STORAGE_CANCEL"),
      confirmLabel: I18n.text(side === "buy" ? "TRADE_BUY" : "TRADE_SELL"),
      onConfirm: (amount) => {
        if (side === "buy") TradeUI._doBuy(scene, row, amount);
        else TradeUI._doSell(scene, row, amount);
      },
      onClose: () => (scene._tradeQtyModal = null),
    });
  },

  _doBuy(scene, row, amount) {
    const res = TradeSystem.buy(
      scene.level.entities,
      scene.playerId,
      scene._tradeMerchantId,
      row.idx,
      amount,
    );
    TradeUI._after(scene, res, "bought", row.itemId);
  },

  _doSell(scene, row, amount) {
    const res = TradeSystem.sell(
      scene.level.entities,
      scene.playerId,
      scene._tradeMerchantId,
      row.idx,
      amount,
    );
    TradeUI._after(scene, res, "sold", row.itemId);
  },

  /** post-transaction: coin cue + refresh on success, else a toast of the refusal reason. */
  _after(scene, res, verb, itemId) {
    if (res.amount > 0) {
      Audio.play({ sound: sndCoin });
      scene._tradeDirty = true;
      scene._invDirty = true; // keep the inventory window in sync
      Log.info(`${verb} ${res.amount}x ${itemId}`);
    } else if (res.reason !== "") {
      Toast.push(I18n.text(res.reason), { type: "warn" });
    }
  },
};
