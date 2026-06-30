// Merchant trade window — the shop counterpart to StorageUI. near-fullscreen shell (absolute host
// + dim backdrop + centered card, shown/hidden via `.enabled`, built once) over StorageUI's two-
// column layout: LEFT = stock (BUY), RIGHT = bag (SELL), each a sortable UITable with a Price column.
// all logic is TradeSystem; this file is presentation + the double-click/amount gesture, plus the
// sell-side worn/favorited guard (it reads the player's Equipment/Favorites). state on scene (_trade*).
// opened by sceneRpg._npcActivate when the targeted NPC carries a Merchant.
globalThis.TradeUI = {
  build(scene) {
    scene._tradeMerchantId = -1;
    scene._tradeOpen = false;
    scene._tradeDirty = false;
    scene._tradeClickKey = ""; // last-clicked "side|id|idx" for double-click detection
    scene._tradeClickTime = 0;
    scene._tradeQtyModal = null; // open amount-picker modal, else null

    const margin = 28;
    // absolute dim backdrop host — fills the screen, veils the HUD behind it.
    const host = new UIElement({
      positionType: "absolute",
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
      padding: margin,
      alignItems: "center",
    });
    host.addComponent(new UIPanel({ color: gemsColor("#000000"), alpha: 0.72 }));
    host.addComponent(new UITrigger({})); // swallow backdrop clicks
    scene._tradeWin = host;
    scene._tradeWin.enabled = false;
    scene.ui.insertChild(scene._tradeWin);

    const inner = new UIElement({ width: "100%", maxWidth: 1100, height: "100%" });
    const card = gemsCard({
      width: "100%",
      flexGrow: 1,
      padding: GemsTheme.pad,
      gap: GemsTheme.gapSm,
    });

    // Title row: merchant name · player credits · close (x). all read live to track the active merchant.
    const titleRow = new UIElement({
      width: "100%",
      height: 40,
      flexShrink: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: GemsTheme.gapSm,
    });
    const nameCell = new UIElement({ flexGrow: 1, flexBasis: 0 });
    nameCell.insertChild(
      gemsLabel(
        () => {
          const npc = scene.world.get(NPC, scene._tradeMerchantId);
          return npc !== undefined ? I18n.text(npc.name) : I18n.text("TRADE_TITLE");
        },
        { font: "header", color: GemsTheme.text },
      ),
    );
    titleRow.insertChild(nameCell);
    titleRow.insertChild(
      gemsLabel(() => TradeUI._balanceText(scene), {
        font: "header",
        color: "#ffd166",
      }),
    );
    titleRow.insertChild(
      gemsButton("x", () => TradeUI.close(scene), {
        width: 32,
        height: 32,
        rad: GemsTheme.radiusSm,
      }),
    );
    card.insertChild(titleRow);
    card.insertChild(gemsDivider());

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
        const m = scene.world.get(Merchant, scene._tradeMerchantId);
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

    inner.insertChild(card);
    host.insertChild(inner);
  },

  // player's balance in the active merchant's currencyId (else "coin").
  _coins(scene) {
    const inv = scene.world.get(Inventory, scene.ctrl.id);
    const m = scene.world.get(Merchant, scene._tradeMerchantId);
    const cur = m !== undefined ? m.currencyId : "coin";
    return inv !== undefined ? InventorySystem.count(inv, cur) : 0;
  },

  // "<currency name>: <balance>" — reads the currency item's own display name, not a hardcoded word.
  _balanceText(scene) {
    const m = scene.world.get(Merchant, scene._tradeMerchantId);
    const cur = m !== undefined ? m.currencyId : "coin";
    const it = Item.get(cur);
    const nm = it !== undefined ? I18n.text(it.name) : cur;
    return nm + ": " + TradeUI._coins(scene);
  },

  // titled column: gold header (title + live sub-label) over the sortable table.
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
    titleCell.insertChild(gemsLabel(titleRef, { color: "#ffd166" }));
    header.insertChild(titleCell);
    header.insertChild(gemsLabel(subFn, { color: GemsTheme.textMuted }));
    col.insertChild(header);
    col.insertChild(tableEl);
    return col;
  },

  // per-side table. `side` ("buy"/"sell") routes the transaction direction.
  _table(scene, side) {
    return gemsTable(TradeUI._columns(side), {
      grow: true, // fill the column; reflows row count on resize
      rowH: 26,
      headerH: 26,
      sortBy: 0, // Name
      emptyText: I18n.text(side === "buy" ? "TRADE_BUY_EMPTY" : "TRADE_SELL_EMPTY"),
      onSelect: (row) => TradeUI._click(scene, side, row),
      onActivate: (row) => TradeUI._act(scene, side, row),
    });
  },

  // Columns: icon+Name (rarity color) · Price (gold) · Qty. Price reads the buy or sell price.
  _columns(side) {
    const gold = gemsColor("#ffd166");
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

  // row models for one side. BUY = merchant stock, SELL = player bag minus the currency item.
  // `idx` valid until the next refresh. `worn`/`fav` (sell side) drive the no-sell guard in _act.
  _rows(scene, side) {
    const world = scene.world;
    const m = world.get(Merchant, scene._tradeMerchantId);
    if (m === undefined) return [];
    const inv =
      side === "buy"
        ? world.get(Inventory, scene._tradeMerchantId)
        : world.get(Inventory, scene.ctrl.id);
    if (inv === undefined) return [];
    const fav = side === "sell" ? world.get(Favorites, scene.ctrl.id) : undefined;
    const eq = side === "sell" ? world.get(Equipment, scene.ctrl.id) : undefined;
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

  // single click selects; a same-row click within 350ms transacts. identity = instance uid (so a
  // re-click hits the same modded gun, not its twin) else itemId, plus side + slot index.
  _click(scene, side, row) {
    if (row === null || row === undefined) return;
    const now = current_time;
    const key =
      side + "|" + (row.uid !== undefined ? row.uid : row.itemId) + "|" + row.idx;
    if (scene._tradeClickKey === key && now - scene._tradeClickTime < 350) {
      TradeUI._act(scene, side, row);
      return;
    }
    scene._tradeClickKey = key;
    scene._tradeClickTime = now;
  },

  // transact (double-click / confirm). sell-side worn/favorited refused with a toast. a fungible
  // stack > 1 opens the amount picker; an instance or single unit transacts immediately.
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
    const world = scene.world;
    const m = world.get(Merchant, scene._tradeMerchantId);
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

  // amount picker (StorageUI's shape): stepper (default = full amount) + 1/Half/All shortcuts.
  _promptAmount(scene, side, row, maxQty) {
    let amount = maxQty;
    const body = new UIElement({ width: "100%", gap: GemsTheme.gapSm });
    body.insertChild(
      gemsLabel(I18n.text("STORAGE_QTY_PROMPT") + " (" + maxQty + ")", {
        color: GemsTheme.textMuted,
      }),
    );
    const stepEl = gemsStepper(amount, (v) => (amount = v), {
      min: 1,
      max: maxQty,
      step: 1,
    });
    const stepper = stepEl.getComponent(UIStepper);
    body.insertChild(stepEl);

    const quick = new UIElement({
      width: "100%",
      flexDirection: "row",
      gap: GemsTheme.gapSm,
    });
    quick.insertChild(TradeUI._quickBtn("1", () => stepper.setValue(1)));
    quick.insertChild(
      TradeUI._quickBtn(I18n.text("STORAGE_QTY_HALF"), () =>
        stepper.setValue(Math.floor(maxQty / 2)),
      ),
    );
    quick.insertChild(
      TradeUI._quickBtn(I18n.text("STORAGE_QTY_ALL"), () =>
        stepper.setValue(maxQty),
      ),
    );
    body.insertChild(quick);

    scene._tradeQtyModal = gemsModal({
      title: row.name,
      width: 360,
      body,
      closeOnEscape: false, // handleEscape cancels the picker first, then the window
      buttons: [
        { label: I18n.text("STORAGE_CANCEL") },
        {
          label: I18n.text(side === "buy" ? "TRADE_BUY" : "TRADE_SELL"),
          primary: true,
          onClick: () => {
            if (side === "buy") TradeUI._doBuy(scene, row, amount);
            else TradeUI._doSell(scene, row, amount);
          },
        },
      ],
      onClose: () => (scene._tradeQtyModal = null),
    });
  },

  _quickBtn(label, onClick) {
    const cell = new UIElement({ flexGrow: 1, flexBasis: 0 });
    cell.insertChild(gemsButton(label, onClick, { height: 30 }));
    return cell;
  },

  _doBuy(scene, row, amount) {
    const res = TradeSystem.buy(
      scene.world,
      scene.ctrl.id,
      scene._tradeMerchantId,
      row.idx,
      amount,
    );
    TradeUI._after(scene, res, "bought", row.itemId);
  },

  _doSell(scene, row, amount) {
    const res = TradeSystem.sell(
      scene.world,
      scene.ctrl.id,
      scene._tradeMerchantId,
      row.idx,
      amount,
    );
    TradeUI._after(scene, res, "sold", row.itemId);
  },

  // post-transaction: coin cue + refresh on success, else a toast of the refusal reason.
  _after(scene, res, verb, itemId) {
    if (res.amount > 0) {
      Audio.play("snd_coin");
      scene._tradeDirty = true;
      scene._invDirty = true; // keep the inventory window in sync
      Log.info(`${verb} ${res.amount}x ${itemId}`);
    } else if (res.reason !== "") {
      Toast.push(I18n.text(res.reason), { type: "warn" });
    }
  },
};
