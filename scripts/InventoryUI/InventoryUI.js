/**
 * Bag page of the tabbed character window.
 *
 * The Items tab is a slot grid beside a detail pane: icons carry recognition, the pane carries
 * the metadata a table would spread across columns. The page is built once and rebuilt only in
 * its live data, so sort, filter, scroll and the active tab survive a rebuild.
 */
globalThis.InventoryUI = {
  /**
   * `opts` are the genre's per-rebuild hooks: { equipSlots: [{ slot, labelKey }],
   * extraRows?(scene, host) }.
   */
  build(scene, opts) {
    const page = {
      title: I18n.textRef("INV_TITLE"),
      el: new UIElement({
        width: "100%",
        flexGrow: 1,
        flexBasis: 0,
        gap: FacetTheme.gapSm,
      }),
      sel: null, // selected row model
      click: { key: "", time: 0 }, // double-click-to-use latch
      cat: "", // active category filter code ("" = all)
      grid: null,
      gridEl: null,
      view: [], // filtered row models, parallel to the grid's items
      detailHost: null,
      equipHost: null,
      extraHost: null,
      followerHost: null,
      refresh: () => InventoryUI.rebuild(scene, page, opts),
    };

    const tabs = facetTabs(
      [
        {
          label: I18n.textRef("INV_TAB_ITEMS"),
          content: InventoryUI._buildItemsTab(scene, page),
        },
        {
          label: I18n.textRef("INV_TAB_EQUIP"),
          content: InventoryUI._buildEquipTab(page),
        },
        {
          label: I18n.textRef("INV_TAB_PARTY"),
          content: InventoryUI._buildFollowerTab(page),
        },
        {
          label: I18n.textRef("INV_TAB_STATS"),
          content: InventoryUI._buildStatsTab(scene, page),
        },
        {
          label: I18n.textRef("INV_TAB_QUESTS"),
          content: InventoryUI._buildQuestsTab(),
        },
        {
          // eight equal segments: the full label would overrun its neighbour, so the strip draws
          // the abbreviation and the full name is its hover tooltip
          label: I18n.textRef("INV_TAB_ACH"),
          short: I18n.textRef("INV_TAB_ACH_ABBR"),
          content: InventoryUI._buildAchievementsTab(),
        },
        {
          label: I18n.textRef("INV_TAB_RADIO"),
          content: RadioUI.build(scene),
        },
        {
          label: I18n.textRef("INV_TAB_SETTINGS"),
          content: InventoryUI._buildSettingsTab(),
        },
      ],
      { grow: true },
    );
    page.el.insertChild(tabs);
    return page;
  },

  GRID_COLS: 6,
  GRID_CELL: 64,
  GRID_GAP: 6,
  DETAIL_WRAP: 520,
  // equip-bonus stat key -> i18n label
  STAT_KEYS: {
    attack: "STAT_ATK",
    defense: "STAT_DEF",
    speed: "STAT_SPD",
    maxHp: "STAT_HP",
    maxStamina: "STAT_STA",
  },

  _buildItemsTab(scene, page) {
    const tab = new UIElement({
      width: "100%",
      flexGrow: 1,
      flexBasis: 0,
      gap: FacetTheme.gapSm,
    });

    const top = new UIElement({
      width: "100%",
      height: 30,
      flexDirection: "row",
      alignItems: "center",
      gap: FacetTheme.gapSm,
    });
    const usageCell = new UIElement({ flexGrow: 1, flexBasis: 0 });
    usageCell.insertChild(
      // read the store live: a map change swaps it while the window is open
      facetLabel(
        () => {
          const v = scene.level.entities.get(scene.playerId, Inventory);
          let s =
            I18n.text("INV_SLOTS") + " " + v.slots.length + "/" + v.capacity;
          if (v.maxWeight !== undefined)
            s +=
              "   " +
              I18n.text("INV_WEIGHT") +
              " " +
              Bag.weight(v) +
              "/" +
              v.maxWeight;
          return s;
        },
        { color: FacetTheme.textMuted },
      ),
    );
    top.insertChild(usageCell);
    const cats = [
      { name: I18n.text("INV_CAT_ALL"), value: "" },
      { name: I18n.text("INV_CAT_FAV"), value: "fav" },
      { name: I18n.text("INV_CAT_WEAPON"), value: "weapon" },
      { name: I18n.text("INV_CAT_GEAR"), value: "gear" },
      { name: I18n.text("INV_CAT_CONSUMABLE"), value: "consumable" },
      { name: I18n.text("INV_CAT_MISC"), value: "misc" },
    ];
    // fixed width: a full-width select would squish the usage label
    const filterCell = new UIElement({ width: 170, flexShrink: 0 });
    filterCell.insertChild(
      facetSelect(cats, {
        onChange: (_i, code) => {
          page.cat = code;
          InventoryUI._refreshGrid(scene, page);
          InventoryUI._refreshDetail(scene, page); // the selection may have filtered away
        },
      }),
    );
    top.insertChild(filterCell);
    // sorts the real bag, not the view; the grid mirrors it
    top.insertChild(
      facetButton(
        I18n.textRef("COMMON_SORT"),
        () => {
          Bag.sort(
            scene.level.entities.get(scene.playerId, Inventory),
          );
          scene.window.dirty = true;
        },
        { width: 90, height: 28 },
      ),
    );
    tab.insertChild(top);

    // BUG: no scroll around the grid: a clipped scroll beside a non-clipped sibling hits the
    // scissor flush quirk (docs/GMRT.md); the grid fits the tall card instead.
    const content = new UIElement({
      width: "100%",
      flexGrow: 1,
      flexBasis: 0,
      flexDirection: "row",
      gap: FacetTheme.gap,
    });
    const grid = facetSlots([], {
      cols: InventoryUI.GRID_COLS,
      cellSize: InventoryUI.GRID_CELL,
      gap: InventoryUI.GRID_GAP,
      onSelect: (i) => InventoryUI._onGridSelect(scene, page, i),
      onActivate: (i) => {
        // browse-mode confirm acts on the cursor slot (the mouse path double-clicks)
        const row = page.view[i];
        if (row !== undefined) InventoryUI._activate(scene, row);
      },
    });
    page.grid = grid.getComponent(UISlots);
    page.gridEl = grid;
    const gridCell = new UIElement({ flexShrink: 0 });
    gridCell.insertChild(grid);
    content.insertChild(gridCell);

    const detail = new UIElement({
      flexGrow: 1,
      flexBasis: 0,
      padding: FacetTheme.padSm,
      gap: 4,
    });
    detail.addComponent(
      new UIPanel({
        color: facetColor(FacetTheme.panel),
        rad: FacetTheme.radius,
        border: 1,
        borderColor: facetColor(FacetTheme.border),
      }),
    );
    page.detailHost = detail;
    content.insertChild(detail);
    tab.insertChild(content);

    const action = new UIElement({
      width: "100%",
      height: 32,
      flexDirection: "row",
      alignItems: "center",
      gap: FacetTheme.gapSm,
    });
    const selCell = new UIElement({ flexGrow: 1, flexBasis: 0 });
    selCell.insertChild(
      facetLabel(
        () =>
          page.sel === null ? I18n.text("INV_SELECT_NONE") : page.sel.name,
        { color: FacetTheme.text },
      ),
    );
    action.insertChild(selCell);
    action.insertChild(
      facetButton(
        () => InventoryUI._favLabel(scene, page),
        () => InventoryUI._toggleFav(scene, page),
        { width: 110, height: 28, disabled: () => page.sel === null },
      ),
    );
    action.insertChild(
      facetButton(
        () => InventoryUI._actionLabel(page),
        () => {
          if (page.sel !== null) InventoryUI._activate(scene, page.sel);
        },
        { width: 120, height: 28 },
      ),
    );
    tab.insertChild(action);

    // hotbar strip: a slot click binds the selected item, or clears the slot when none is selected
    const hbTitle = new UIElement({ width: "100%", height: 20 });
    hbTitle.insertChild(
      facetLabel(I18n.textRef("INV_HOTBAR"), { color: "warn" }),
    );
    tab.insertChild(hbTitle);
    const hbRow = new UIElement({
      width: "100%",
      height: 34,
      flexDirection: "row",
      alignItems: "center",
      gap: FacetTheme.gapSm,
    });
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      const cell = new UIElement({ flexGrow: 1, flexBasis: 0 });
      cell.insertChild(InventoryUI._hotbarBtn(scene, page, i));
      hbRow.insertChild(cell);
    }
    tab.insertChild(hbRow);
    return tab;
  },

  _hotbarBtn(scene, page, i) {
    return facetButton(
      () => {
        const hb = scene.level.entities.require(scene.playerId, Hotbar);
        const itemId = hb.slots[i];
        if (itemId === "" || itemId === undefined) return "[" + (i + 1) + "]";
        const it = Item.get(itemId);
        return (
          "[" +
          (i + 1) +
          "] " +
          (it !== undefined ? I18n.text(it.name) : itemId)
        );
      },
      () => InventoryUI._assignHotbar(scene, page, i),
      { height: 30 },
    );
  },

  _assignHotbar(scene, page, i) {
    const hb = scene.level.entities.require(scene.playerId, Hotbar);
    if (page.sel !== null) Belt.set(hb, i, page.sel.itemId);
    else Belt.clear(hb, i);
    scene.showHotbar(); // pop the HUD bar so the change is visible
  },

  _favLabel(scene, page) {
    if (page.sel === null) return I18n.text("INV_NOACTION");
    const fav = scene.level.entities.require(scene.playerId, Favorites);
    return Star.has(fav, page.sel.itemId)
      ? I18n.text("INV_UNFAVORITE")
      : I18n.text("INV_FAVORITE");
  },

  _toggleFav(scene, page) {
    if (page.sel === null) return;
    const fav = scene.level.entities.require(scene.playerId, Favorites);
    Star.toggle(fav, page.sel.itemId);
    scene.window.dirty = true;
  },

  _buildEquipTab(page) {
    const tab = new UIElement({ width: "100%", gap: FacetTheme.gapSm });
    const title = new UIElement({ width: "100%", height: 22 });
    title.insertChild(
      facetLabel(I18n.textRef("INV_EQUIPMENT"), { color: "warn" }),
    );
    tab.insertChild(title);
    page.equipHost = new UIElement({
      width: "100%",
      gap: FacetTheme.gapSm,
    });
    tab.insertChild(page.equipHost);
    return tab;
  },

  _buildFollowerTab(page) {
    const tab = new UIElement({ width: "100%", gap: FacetTheme.gapSm });
    const title = new UIElement({ width: "100%", height: 22 });
    title.insertChild(
      facetLabel(I18n.textRef("INV_FOLLOWERS"), { color: "warn" }),
    );
    tab.insertChild(title);
    page.followerHost = new UIElement({
      width: "100%",
      gap: FacetTheme.gapSm,
    });
    tab.insertChild(page.followerHost);

    // the hint reads the live binding, so a rebind shows without a rebuild
    tab.insertChild(facetDivider());
    const hint = new UIElement({ width: "100%", height: 20 });
    hint.insertChild(
      facetLabel(
        () => I18n.text("FOLLOWER_RECALL_HINT", Input.get("interact").label()),
        { color: FacetTheme.textDim },
      ),
    );
    tab.insertChild(hint);
    return tab;
  },

  /**
   * Runs per rebuild, not at build: the squad is seeded only after the window is built.
   */
  _buildFollowerRows(scene, host) {
    const squad = scene.level.entities.require(scene.playerId, Squad);
    const ids = Companions.members(
      scene.level.entities,
      squad.id,
      scene.playerId,
    );
    if (ids.length <= 1) {
      // [0] is the player
      const empty = new UIElement({ width: "100%", height: 24 });
      empty.insertChild(
        facetLabel(I18n.textRef("INV_NO_FOLLOWERS"), {
          color: FacetTheme.textDim,
        }),
      );
      host.insertChild(empty);
      return;
    }
    for (let i = 1; i < ids.length; i++) {
      if (!scene.level.entities.isValid(ids[i])) continue;
      host.insertChild(InventoryUI._followerRow(scene, ids[i]));
    }
  },

  /**
   * Its dismiss leaves the companion out of the squad permanently, in place; rehiring is by talk.
   */
  _followerRow(scene, fid) {
    // a well, not a card: the row sits inside the window's card
    const card = facetPanel({
      color: FacetTheme.panelLo,
      rad: FacetTheme.radiusSm,
      padding: FacetTheme.padSm,
      gap: FacetTheme.gapSm,
    });

    const head = new UIElement({ width: "100%", height: 22 });
    head.insertChild(
      facetLabel(
        () => {
          const nm = scene.level.entities.get(fid, Name);
          return nm !== undefined ? nm.name : I18n.text("FOLLOWER_DEFAULT");
        },
        { color: FacetTheme.text, font: "header" },
      ),
    );
    card.insertChild(head);

    const status = new UIElement({ width: "100%", height: 20 });
    status.insertChild(
      facetLabel(
        () => {
          const f = scene.level.entities.get(fid, Follower);
          if (f === undefined) return "";
          let state;
          if (scene.level.entities.has(fid, Downed))
            state = I18n.text("FOLLOWER_STATE_DOWN");
          else if (f.state === "follow")
            state = I18n.text("FOLLOWER_STATE_FOLLOW");
          else state = I18n.text("FOLLOWER_STATE_WAIT");
          return (
            state +
            "   ·   " +
            I18n.text(
              "FOLLOWER_BONUS",
              f.bonusCapacity ?? 0,
              f.bonusWeight ?? 0,
            )
          );
        },
        { color: FacetTheme.textMuted },
      ),
    );
    card.insertChild(status);

    card.insertChild(
      facetButton(
        I18n.textRef("FOLLOWER_DISMISS"),
        () => {
          if (!Companions.kick(scene.level.entities, scene.playerId, fid)) return;
          scene.window.dirty = true;
          Toast.push(I18n.text("SQUAD_KICKED"), { type: "info" });
        },
        {
          height: 30,
          disabled: () => !Companions.kickable(scene.level.entities, fid),
        },
      ),
    );
    return card;
  },

  _buildStatsTab(scene, page) {
    const tab = new UIElement({ width: "100%", gap: FacetTheme.gapSm });
    const statRow = (labelKey, getter) =>
      facetKeyValueRow(I18n.textRef(labelKey), () => {
        const st = scene.level.entities.require(scene.playerId, Stats);
        return String(getter(st));
      });
    tab.insertChild(statRow("STAT_ATK", (st) => st.attack));
    tab.insertChild(statRow("STAT_DEF", (st) => st.defense));
    tab.insertChild(statRow("STAT_SPD", (st) => Math.round(st.speed)));

    // primary attributes: the inputs the derived stats come from
    tab.insertChild(facetDivider());
    tab.insertChild(
      facetLabel(I18n.textRef("INV_ATTRIBUTES"), { color: "warn" }),
    );
    const attrRow = (def) =>
      facetKeyValueRow(I18n.textRef(def.name), () => {
        const at = scene.level.entities.require(scene.playerId, Attributes);
        return String(at[def.id]);
      });
    for (let i = 0; i < StatModel.ATTRS.length; i++) {
      tab.insertChild(attrRow(StatModel.ATTRS[i]));
    }

    tab.insertChild(facetDivider());
    page.extraHost = new UIElement({
      width: "100%",
      gap: FacetTheme.gapSm,
    });
    tab.insertChild(page.extraHost);
    return tab;
  },

  _buildQuestsTab() {
    const tab = new UIElement({ width: "100%", gap: FacetTheme.gapSm });
    tab.insertChild(
      facetQuestTracker({
        source: Tracker,
        emptyText: I18n.text("QUEST_NONE"),
      }),
    );
    return tab;
  },

  /**
   * Built once: the achievement set is fixed before the window builds, and each status reads
   * live, so an unlock shows with no rebuild.
   */
  _buildAchievementsTab() {
    const tab = new UIElement({ width: "100%", gap: FacetTheme.gapSm });
    const all = Achievement.all();
    for (let i = 0; i < all.length; i++)
      tab.insertChild(InventoryUI._achievementRow(all[i]));
    return tab;
  },

  _achievementRow(a) {
    // a well, not a card: the row sits inside the window's card
    const card = facetPanel({
      color: FacetTheme.panelLo,
      rad: FacetTheme.radiusSm,
      padding: FacetTheme.padSm,
      gap: FacetTheme.gapSm,
    });

    const head = new UIElement({
      width: "100%",
      height: 22,
      flexDirection: "row",
      alignItems: "center",
    });
    const nameCell = new UIElement({ flexGrow: 1, flexBasis: 0 });
    nameCell.insertChild(
      facetLabel(I18n.textRef(a.name), {
        color: FacetTheme.text,
        font: "header",
      }),
    );
    head.insertChild(nameCell);
    head.insertChild(
      facetRichText(() =>
        Tracker.isUnlocked(a.id)
          ? "[c=accent]" + I18n.text("ACH_UNLOCKED") + "[/c]"
          : "[c=dim]" + I18n.text("ACH_LOCKED") + "[/c]",
      ),
    );
    card.insertChild(head);

    const desc = new UIElement({ width: "100%", height: 20 });
    desc.insertChild(
      facetLabel(I18n.textRef(a.desc), { color: FacetTheme.textMuted }),
    );
    card.insertChild(desc);
    return card;
  },

  /**
   * Toggles only persist: only one page shows at a time, and each reads the settings on open.
   */
  _buildSettingsTab() {
    const tab = new UIElement({ width: "100%", gap: FacetTheme.gapSm });
    const title = new UIElement({ width: "100%", height: 22 });
    title.insertChild(
      facetLabel(I18n.textRef("INV_SET_COLS"), { color: "warn" }),
    );
    tab.insertChild(title);
    // the toggle callback gets no argument, so flip the live value
    const toggle = (labelKey, settingKey) =>
      facetCheckbox(
        I18n.textRef(labelKey),
        () => Settings.get(settingKey),
        () => {
          Settings.set(settingKey, !Settings.get(settingKey));
          Settings.save(SETTINGS_FILE);
        },
        { style: "switch", key: settingKey },
      );
    tab.insertChild(toggle("INV_COL_RARITY", "invColRarity"));
    tab.insertChild(toggle("INV_COL_MAKER", "invColMaker"));
    tab.insertChild(toggle("INV_COL_TYPE", "invColType"));
    tab.insertChild(toggle("INV_COL_WT", "invColWeight"));
    tab.insertChild(toggle("INV_COL_VAL", "invColValue"));

    // display settings are read live each frame, so persisting is enough
    tab.insertChild(facetDivider());
    const unitsTitle = new UIElement({ width: "100%", height: 22 });
    unitsTitle.insertChild(
      facetLabel(I18n.textRef("INV_SET_UNITS"), { color: "warn" }),
    );
    tab.insertChild(unitsTitle);
    const units = [
      { name: "K", value: "K" },
      { name: "°C", value: "C" },
      { name: "°F", value: "F" },
    ];
    tab.insertChild(
      facetRow(
        I18n.textRef("INV_SET_TEMP"),
        facetSelect(units, {
          key: "tempUnit",
          onChange: () => Settings.save(SETTINGS_FILE),
        }),
        { key: "tempUnit" },
      ),
    );

    tab.insertChild(facetDivider());
    const hudTitle = new UIElement({ width: "100%", height: 22 });
    hudTitle.insertChild(
      facetLabel(I18n.textRef("INV_SET_HUD"), { color: "warn" }),
    );
    tab.insertChild(hudTitle);
    tab.insertChild(
      facetCheckbox(
        I18n.textRef("INV_RADAR"),
        () => Settings.get("hudRadar"),
        () => {
          Settings.set("hudRadar", !Settings.get("hudRadar"));
          Settings.save(SETTINGS_FILE);
        },
        { style: "switch", key: "hudRadar" },
      ),
    );
    return tab;
  },

  /**
   * Refreshes live data only, so the view, filter and active tab survive. `opts` as for build.
   */
  rebuild(scene, page, opts) {
    InventoryUI._refreshGrid(scene, page);
    InventoryUI._refreshDetail(scene, page);

    const eh = page.equipHost;
    facetClear(eh);
    for (let i = 0; i < opts.equipSlots.length; i++)
      eh.insertChild(
        InventoryUI._equipRow(
          scene,
          opts.equipSlots[i].slot,
          opts.equipSlots[i].labelKey,
        ),
      );

    const xh = page.extraHost;
    facetClear(xh);
    if (opts.extraRows !== undefined) opts.extraRows(scene, xh);

    // the roster is rebuilt, not live: present companions change across maps
    const fh = page.followerHost;
    facetClear(fh);
    InventoryUI._buildFollowerRows(scene, fh);
  },

  /**
   * `worn` matches by instance uid, so of two identical equippables only the worn one lights.
   */
  _buildRows(scene) {
    const inv = scene.level.entities.get(scene.playerId, Inventory);
    const eq = scene.level.entities.get(scene.playerId, Equipment);
    const fav = scene.level.entities.get(scene.playerId, Favorites);
    const rows = [];
    for (let i = 0; i < inv.slots.length; i++) {
      const slot = inv.slots[i];
      const favd = fav !== undefined && Star.has(fav, slot.itemId);
      rows.push({
        ...InvTable.rowModel(slot.itemId, slot.qty, slot.uid, slot.mods),
        worn: Loadout.wears(eq, slot.uid),
        fav: favd,
      });
    }
    return rows;
  },

  /**
   * The unfiltered view pads to capacity with empty cells, so the bag's size reads at a glance.
   */
  _refreshGrid(scene, page) {
    const rows = InventoryUI._buildRows(scene);
    const cat = page.cat;
    const view = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      // "fav" is a pseudo-category: the favorited flag, not an item type
      if (cat === "" || (cat === "fav" ? r.fav : r.cat === cat)) view.push(r);
    }
    page.view = view;

    const gold = facetColor("warn");
    const accent = facetColor(FacetTheme.accent);
    const items = [];
    for (let i = 0; i < view.length; i++) {
      const r = view[i];
      const it = Item.get(r.itemId);
      items.push({
        sprite: it !== undefined ? it.sprite : -1,
        count: r.qty > 1 ? r.qty : null,
        borderColor: r.color,
        badge: r.worn ? "E" : r.fav ? "*" : null,
        badgeColor: r.worn ? accent : gold,
      });
    }
    if (cat === "") {
      const inv = scene.level.entities.get(scene.playerId, Inventory);
      for (let i = view.length; i < inv.capacity; i++) items.push(null);
    }

    const g = page.grid;
    g.items = items;

    // re-map the selection by identity: row models are fresh objects each refresh
    let sel = -1;
    if (page.sel !== null) {
      for (let i = 0; i < view.length; i++) {
        if (InventoryUI._sameRow(view[i], page.sel)) {
          sel = i;
          break;
        }
      }
      page.sel = sel >= 0 ? view[sel] : null;
    }
    g.selected = sel;

    const rowsN = Math.max(1, Math.ceil(items.length / g.cols));
    UIDraw.resizeTo(
      page.gridEl,
      g.cols * g.cellSize + (g.cols - 1) * g.gap,
      rowsN * g.cellSize + (rowsN - 1) * g.gap,
    );
  },

  /**
   * A re-click acts on the row; an empty cell clears the selection.
   */
  _onGridSelect(scene, page, i) {
    const row = i >= 0 && i < page.view.length ? page.view[i] : null;
    if (row === null) {
      page.sel = null;
      page.grid.selected = -1;
      InventoryUI._refreshDetail(scene, page);
      return;
    }
    if (InvTable.reclick(page.click, row, "bag")) {
      InventoryUI._activate(scene, row); // dirties the window; its rebuild refreshes the pane
      return;
    }
    page.sel = row;
    InventoryUI._refreshDetail(scene, page);
  },

  /**
   * Rebuilt whole on each selection change: a dozen elements is cheap. Weapon stats are the
   * instance's composed profile, not the base item's.
   */
  _refreshDetail(scene, page) {
    const host = page.detailHost;
    facetClear(host);

    const row = page.sel;
    if (row === null) {
      host.insertChild(
        facetLabel(I18n.textRef("INV_SELECT_NONE"), {
          color: FacetTheme.textDim,
        }),
      );
      return;
    }
    const it = Item.get(row.itemId);
    const inv = scene.level.entities.get(scene.playerId, Inventory);
    const inst =
      row.uid !== undefined
        ? Bag.findByUid(inv, row.uid)
        : undefined;

    const head = new UIElement({
      width: "100%",
      flexDirection: "row",
      alignItems: "center",
      gap: FacetTheme.gapSm,
    });
    if (it !== undefined && sprite_exists(it.sprite)) {
      const ic = new UIElement({ width: 48, height: 48, flexShrink: 0 });
      ic.addComponent(
        new UIImage({ sprite: it.sprite, fit: OBJECT_FIT.CONTAIN }),
      );
      head.insertChild(ic);
    }
    const hcol = new UIElement({ flexGrow: 1, flexBasis: 0, gap: 2 });
    hcol.insertChild(
      facetLabel(row.name, { font: "header", color: row.color }),
    );
    const rar = it !== undefined ? Rarity.get(it.rarity) : undefined;
    if (rar !== undefined)
      hcol.insertChild(
        facetLabel(I18n.textRef(rar.name), {
          font: "description",
          color: rar.color,
        }),
      );
    head.insertChild(hcol);
    host.insertChild(head);

    const mk = it !== undefined ? Manufacturer.get(it.maker) : undefined;
    if (mk !== undefined) {
      host.insertChild(facetLabel(I18n.textRef(mk.name), { color: mk.color }));
      if (mk.lore !== "")
        host.insertChild(
          facetLabel(I18n.textRef(mk.lore), {
            font: "description",
            color: FacetTheme.textDim,
            wrap: InventoryUI.DETAIL_WRAP,
          }),
        );
    }

    if (it !== undefined && it.description !== "")
      host.insertChild(
        facetLabel(I18n.textRef(it.description), {
          color: FacetTheme.textMuted,
          wrap: InventoryUI.DETAIL_WRAP,
        }),
      );

    host.insertChild(facetDivider());
    const statLine = (key, v) =>
      facetLabel(I18n.text(key) + ": " + v, { color: FacetTheme.textMuted });

    const prof =
      inst !== undefined && it !== undefined && it.hasComponent(Weapon)
        ? Loadout.composeWeapon(inst)
        : null;
    if (prof !== null) {
      if (prof.kind === "gun") {
        host.insertChild(statLine("MOD_POWER", Math.round(prof.power)));
        host.insertChild(statLine("MOD_VELOCITY", Math.round(prof.velocity)));
        host.insertChild(statLine("MOD_PEN", prof.penetration));
        if (prof.fireCd !== undefined)
          host.insertChild(statLine("MOD_FIRECD", Math.round(prof.fireCd * 100) / 100));
        const am = Item.get(prof.ammo);
        host.insertChild(
          statLine(
            "MOD_AMMO",
            (am !== undefined
              ? I18n.text(am.name)
              : I18n.text("MOD_UNLOADED")) +
              "  " +
              prof.rounds +
              "/" +
              prof.magazine,
          ),
        );
      } else {
        host.insertChild(
          statLine("MOD_DMG", Math.round(prof.damage * 10) / 10),
        );
        if (prof.hitbox !== undefined)
          host.insertChild(statLine("MOD_REACH", Melee.reach(prof.hitbox)));
        host.insertChild(statLine("MOD_FIRECD", Math.round(prof.fireCd * 100) / 100));
      }
    }

    const ammo = it !== undefined ? it.getComponent(Ammo) : undefined;
    if (ammo !== undefined) {
      host.insertChild(statLine("MOD_MASS", ammo.mass));
      host.insertChild(statLine("MOD_VELOCITY", ammo.velocity));
      host.insertChild(statLine("MOD_POWER", ammo.power));
      host.insertChild(statLine("MOD_PEN", ammo.penetration));
    }

    const eqp = it !== undefined ? it.getComponent(Equippable) : undefined;
    if (eqp !== undefined && eqp.mods !== undefined) {
      for (const k in eqp.mods) {
        const key = InventoryUI.STAT_KEYS[k];
        const v = eqp.mods[k];
        host.insertChild(
          facetLabel(
            (key !== undefined ? I18n.text(key) : k) +
              " " +
              (v >= 0 ? "+" : "") +
              v,
            { color: FacetTheme.accent },
          ),
        );
      }
    }

    if (inst !== undefined && inst.mods !== undefined) {
      for (const sid in inst.mods) {
        const m = Item.get(inst.mods[sid]);
        if (m !== undefined)
          host.insertChild(
            facetLabel("+ " + I18n.text(m.name), {
              font: "description",
              color: InvTable.rarityColor(m.id),
            }),
          );
      }
    }

    host.insertChild(facetDivider());
    host.insertChild(
      facetLabel(
        I18n.text("INV_COL_QTY") +
          " " +
          row.qty +
          "   " +
          I18n.text("INV_COL_WT") +
          " " +
          row.weight +
          "   " +
          I18n.text("INV_COL_VAL") +
          " " +
          row.value,
        { color: "warn" },
      ),
    );
  },

  _sameRow(a, b) {
    return InvTable.rowId(a) === InvTable.rowId(b);
  },

  _activate(scene, row) {
    if (row === null || row === undefined) return;
    InventoryUI.use(scene, row.itemId, row.uid);
  },

  _actionLabel(page) {
    if (page.sel === null) return I18n.text("INV_NOACTION");
    const it = Item.get(page.sel.itemId);
    if (it !== undefined && it.hasComponent(Equippable))
      return page.sel.worn ? I18n.text("INV_UNEQUIP") : I18n.text("INV_EQUIP");
    if (it !== undefined && it.hasComponent(Consumable))
      return I18n.text("INV_USE");
    return I18n.text("INV_NOACTION");
  },

  /**
   * An equipment slot holds the worn instance's uid, resolved through the live bag.
   */
  _equipRow(scene, slot, labelKey) {
    const eq = scene.level.entities.require(scene.playerId, Equipment);
    const uid = eq.slots[slot];
    if (uid !== undefined && uid !== "") {
      const inv = scene.level.entities.require(scene.playerId, Inventory);
      const inst = Bag.findByUid(inv, uid);
      const itemId = inst !== undefined ? inst.itemId : "";
      const it = Item.get(itemId);
      const base = it !== undefined ? I18n.text(it.name) : itemId;
      // `mods` is a map { slotId -> attachmentItemId }
      let modCount = 0;
      if (inst !== undefined && inst.mods !== undefined)
        for (const slotId in inst.mods) modCount++;
      const nm = modCount > 0 ? base + " +" + modCount : base;
      return facetButton(
        I18n.text(labelKey) + ": " + nm,
        () => {
          Loadout.unequip(scene.level.entities, scene.playerId, slot);
          scene.window.dirty = true;
          Log.info(`unequipped ${itemId}`);
        },
        {
          height: 30,
          textColor: InvTable.rarityColor(itemId),
          icon: it !== undefined ? it.sprite : -1,
        },
      );
    }
    const row = new UIElement({ width: "100%", height: 26 });
    row.insertChild(
      facetLabel(I18n.text(labelKey) + ": " + I18n.text("COMMON_EMPTY"), {
        color: FacetTheme.textDim,
      }),
    );
    return row;
  },

  /** The use gesture's view: one call into Use, then its refusal or its sound. */
  use(scene, itemId, uid) {
    const why = Use.item(scene.level.entities, scene.playerId, itemId, uid);
    scene.window.dirty = true;
    if (why !== "") {
      Toast.push(I18n.text(why), { type: "warn" });
      return;
    }
    Log.info(`used ${itemId}`);
    const c = Item.get(itemId).getComponent(Consumable);
    if (c === undefined) return;
    if ((c.thirst ?? 0) > 0 || (c.hunger ?? 0) > 0)
      Audio.play({ sound: sndDrink });
    else if ((c.heal ?? 0) > 0) Audio.play({ sound: sndBandage });
    else Audio.play({ sound: sndMagic });
  },
};
