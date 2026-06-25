// Draggable character window for the RPG scene — a wider, TABBED panel
// (Items / Equipment / Party / Stats / Quests / Settings) so the player can manage gear, read
// the sheet, track quests, command companions, and tune the item table all in one place.
//
//  - Items:      the bag UITable (sortable columns + category filter + name search) over
//                a usage line, plus a select/action row (Use / Equip / Unequip).
//  - Equipment:  the worn-slot rows (click a worn slot to unequip).
//  - Party:      the companion roster — each follower's name, follow/wait status, carry bonus,
//                and a Dismiss-to-base button (re-hire is walk-up + the follow key). The roster
//                is repopulated per rebuild (it changes across maps); per-row text is live.
//  - Stats:      the live character sheet + the genre's extra records (Profile).
//  - Quests:     a live UIQuestTracker bound to the global QuestLog.
//  - Settings:   per-column visibility toggles (Rarity / Type / Weight / Value),
//                persisted via Settings; the table rebuilds its column set on change.
//
// The whole structure is built ONCE in build(); a bag change only refreshes data via
// `table.setRows` + repopulating the equip host, so the player's sort/filter/scroll and
// the active tab survive every equip/use. Column visibility comes from Settings, so a
// toggle persists across launches. Scenes keep only the open/close state.
//
// Contract: the scene owns `ui`, `world`, `ctrl` (with `.id`), `invOpen`, and the fields
// this module sets/reads — `_invWin` (the gemsWindow), `_invTable` (the UITable
// component), `_invSel` (selected row model | null) + `_invSelTime` (double-click timer),
// `_invCat`/`_invSearch` (filter + search state), `_invEquipHost`/`_invExtraHost` (the
// rebuilt sections), `_invDirty` (refresh-needed flag).
//
// Usage:
//   create():            RpgInventoryUI.build(scene)
//   step() (when dirty):  RpgInventoryUI.rebuild(scene, { equipSlots, extraRows? })
globalThis.RpgInventoryUI = {
  // Build the (hidden) draggable window + its persistent tabbed structure.
  build(scene) {
    scene._invWin = gemsWindow(I18n.textRef("INV_TITLE"), {
      top: 40,
      width: 760,
      // Resizable (grab the bottom-right grip). The explicit height gives the grow tabs +
      // bag table a starting basis; height 508 reproduces the old fixed 384px tab host.
      height: 508,
      minWidth: 600, // keeps the six tab labels from crowding at the floor
      minHeight: 360,
      onClose: () => {
        scene.invOpen = false;
        scene._invWin.enabled = false;
      },
    });
    scene._invWin.enabled = false;
    scene.ui.insertChild(scene._invWin);

    scene._invSel = null; // selected row model
    scene._invSelTime = 0; // last select time (ms) for double-click-to-use
    scene._invCat = ""; // active category filter code ("" = all)
    scene._invSearch = ""; // active name search (lowercased; "" = none)

    const tabs = gemsTabs(
      [
        {
          label: I18n.textRef("INV_TAB_ITEMS"),
          content: RpgInventoryUI._buildItemsTab(scene),
        },
        {
          label: I18n.textRef("INV_TAB_EQUIP"),
          content: RpgInventoryUI._buildEquipTab(scene),
        },
        {
          label: I18n.textRef("INV_TAB_PARTY"),
          content: RpgInventoryUI._buildFollowerTab(scene),
        },
        {
          label: I18n.textRef("INV_TAB_STATS"),
          content: RpgInventoryUI._buildStatsTab(scene),
        },
        {
          label: I18n.textRef("INV_TAB_QUESTS"),
          content: RpgInventoryUI._buildQuestsTab(scene),
        },
        {
          label: I18n.textRef("INV_TAB_SETTINGS"),
          content: RpgInventoryUI._buildSettingsTab(scene),
        },
      ],
      { grow: true }, // fill the resizable window; the Items tab + bag table grow with it
    );
    scene._invWin.body.insertChild(tabs);
  },

  // ── tab pages ───────────────────────────────────────────────
  // Items: usage + category filter, search + clear, the bag table, select/action row.
  _buildItemsTab(scene) {
    // Fills the tab host so the bag table (grow) takes the leftover vertical space and
    // reflows its row count as the window is resized.
    const page = new UIElement({
      width: "100%",
      flexGrow: 1,
      flexBasis: 0,
      gap: GemsTheme.gapSm,
    });

    const top = new UIElement({
      width: "100%",
      height: 30,
      flexDirection: "row",
      alignItems: "center",
      gap: GemsTheme.gapSm,
    });
    const usageCell = new UIElement({ flexGrow: 1, flexBasis: 0 });
    usageCell.insertChild(
      // Reads scene.world LIVE each frame (never a captured const): an open window
      // survives a map change (RpgMap.go swaps scene.world + the player), so a captured
      // ref would read the parked old world instead of the live one.
      gemsLabel(
        () => {
          const v = scene.world.get(Inventory, scene.ctrl.id);
          let s =
            I18n.text("RPG_SLOTS") + " " + v.slots.length + "/" + v.capacity;
          if (v.maxWeight !== undefined)
            s +=
              "   " +
              I18n.text("RPG_WEIGHT") +
              " " +
              InventorySystem.weight(v) +
              "/" +
              v.maxWeight;
          return s;
        },
        { color: GemsTheme.textMuted },
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
    // Fixed-width cell — gemsSelectCustom is width:100%, so without a sized wrapper it
    // would eat the whole row and squish the usage label.
    const filterCell = new UIElement({ width: 170, flexShrink: 0 });
    filterCell.insertChild(
      gemsSelectCustom(cats, 0, (_i, code) => {
        scene._invCat = code;
        RpgInventoryUI._applyFilter(scene);
      }),
    );
    top.insertChild(filterCell);
    page.insertChild(top);

    // Search row: a free-text name filter + a Clear button. Search and the category
    // select compose into one table predicate (see _applyFilter). Typing focuses the
    // UIInput (UIInput.active), which suspends UINav so the caret keeps the keys.
    const searchRow = new UIElement({
      width: "100%",
      height: 32,
      flexDirection: "row",
      alignItems: "center",
      gap: GemsTheme.gapSm,
    });
    const searchCell = new UIElement({ flexGrow: 1, flexBasis: 0 });
    const searchInput = gemsInput({
      height: 30,
      placeholder: I18n.text("INV_SEARCH"),
      onChange: (v) => {
        scene._invSearch = InvTable.lower(v);
        RpgInventoryUI._applyFilter(scene);
      },
    });
    const searchComp = searchInput.getComponent(UIInput);
    searchCell.insertChild(searchInput);
    searchRow.insertChild(searchCell);
    searchRow.insertChild(
      gemsButton(
        I18n.textRef("INV_CLEAR"),
        () => {
          searchComp.setValue(""); // setValue doesn't fire onChange — reset by hand
          scene._invSearch = "";
          RpgInventoryUI._applyFilter(scene);
        },
        { width: 76, height: 28 },
      ),
    );
    page.insertChild(searchRow);

    // The bag table. Built once with the Settings-driven column set; rebuild() only
    // swaps its rows (and a column toggle calls setColumns), so sort/filter/scroll
    // persist. Click a header to sort (multi-key); a row selects, double-click / the
    // action button / a gamepad confirm acts on it.
    const table = gemsTable(InvTable.columns({ worn: true, fav: true }), {
      grow: true, // fill the page; UITable reflows its row count to the live height
      rowH: 26,
      headerH: 26,
      sortBy: 1, // Name (always column index 1: worn marker is 0, Name is 1)
      emptyText: I18n.text("RPG_EMPTY"),
      onSelect: (row) => RpgInventoryUI._onSelect(scene, row),
      onActivate: (row) => RpgInventoryUI._activate(scene, row),
    });
    scene._invTable = table.getComponent(UITable);
    page.insertChild(table);

    // Select/action row: the selected item name + a context action (Use/Equip/Unequip).
    const action = new UIElement({
      width: "100%",
      height: 32,
      flexDirection: "row",
      alignItems: "center",
      gap: GemsTheme.gapSm,
    });
    const selCell = new UIElement({ flexGrow: 1, flexBasis: 0 });
    selCell.insertChild(
      gemsLabel(
        () =>
          scene._invSel === null
            ? I18n.text("INV_SELECT_NONE")
            : scene._invSel.name,
        { color: GemsTheme.text },
      ),
    );
    action.insertChild(selCell);
    action.insertChild(
      gemsButton(
        () => RpgInventoryUI._favLabel(scene),
        () => RpgInventoryUI._toggleFav(scene),
        { width: 110, height: 28, disabled: () => scene._invSel === null },
      ),
    );
    action.insertChild(
      gemsButton(
        () => RpgInventoryUI._actionLabel(scene),
        () => {
          if (scene._invSel !== null)
            RpgInventoryUI._activate(scene, scene._invSel);
        },
        { width: 120, height: 28 },
      ),
    );
    page.insertChild(action);

    // Hotbar manage strip: a gold section title + one button per slot. Click a slot with a bag
    // item selected → bind it to that slot; click with nothing selected → clear it. The number
    // keys (1..N) USE the bound item in play (RpgController / sceneRpg._useHotbar). Labels read the
    // live Hotbar, so a bind/clear/use updates the strip + the HUD bar with no rebuild.
    const hbTitle = new UIElement({ width: "100%", height: 20 });
    hbTitle.insertChild(
      gemsLabel(I18n.textRef("INV_HOTBAR"), { color: "#ffd166" }),
    );
    page.insertChild(hbTitle);
    const hbRow = new UIElement({
      width: "100%",
      height: 34,
      flexDirection: "row",
      alignItems: "center",
      gap: GemsTheme.gapSm,
    });
    for (let i = 0; i < RPG_HOTBAR_SIZE; i++) {
      const cell = new UIElement({ flexGrow: 1, flexBasis: 0 });
      cell.insertChild(RpgInventoryUI._hotbarBtn(scene, i));
      hbRow.insertChild(cell);
    }
    page.insertChild(hbRow);
    return page;
  },

  // One hotbar manage button: shows "[n] Name" for the bound item (or "[n]" empty), read live.
  // Click assigns the selected bag item to the slot, or clears it when nothing is selected.
  _hotbarBtn(scene, i) {
    return gemsButton(
      () => {
        const hb = scene.world.get(Hotbar, scene.ctrl.id);
        const itemId = hb !== undefined ? hb.slots[i] : "";
        if (itemId === "" || itemId === undefined) return "[" + (i + 1) + "]";
        const it = Item.get(itemId);
        return (
          "[" +
          (i + 1) +
          "] " +
          (it !== undefined ? I18n.text(it.name) : itemId)
        );
      },
      () => RpgInventoryUI._assignHotbar(scene, i),
      { height: 30 },
    );
  },

  // Bind the selected bag item to hotbar slot i, or clear the slot when nothing is selected.
  _assignHotbar(scene, i) {
    const hb = scene.world.get(Hotbar, scene.ctrl.id);
    if (hb === undefined) return;
    if (scene._invSel !== null) HotbarSystem.set(hb, i, scene._invSel.itemId);
    else HotbarSystem.clear(hb, i);
    scene._showHotbar(); // pop the HUD bar so the player sees the binding change
  },

  // Favorite action-button verb for the selected item ("Favorite" / "Unfavorite"; "-" when none).
  _favLabel(scene) {
    if (scene._invSel === null) return I18n.text("INV_NOACTION");
    const fav = scene.world.get(Favorites, scene.ctrl.id);
    return fav !== undefined && FavoritesSystem.has(fav, scene._invSel.itemId)
      ? I18n.text("INV_UNFAVORITE")
      : I18n.text("INV_FAVORITE");
  },

  // Toggle the selected item's favorited state, then flag a refresh so the star column updates.
  _toggleFav(scene) {
    if (scene._invSel === null) return;
    const fav = scene.world.get(Favorites, scene.ctrl.id);
    if (fav === undefined) return;
    FavoritesSystem.toggle(fav, scene._invSel.itemId);
    scene._invDirty = true;
  },

  // Equipment: the worn-slot rows (repopulated per rebuild into this host).
  _buildEquipTab(scene) {
    const page = new UIElement({ width: "100%", gap: GemsTheme.gapSm });
    const title = new UIElement({ width: "100%", height: 22 });
    title.insertChild(
      gemsLabel(I18n.textRef("RPG_EQUIPMENT"), { color: "#ffd166" }),
    );
    page.insertChild(title);
    scene._invEquipHost = new UIElement({
      width: "100%",
      gap: GemsTheme.gapSm,
    });
    page.insertChild(scene._invEquipHost);
    return page;
  },

  // Party: the companion roster host + a binding-aware recall hint. The roster is
  // repopulated per rebuild (companions present in the world change across maps); each row's
  // text + the Dismiss button's disabled-state read the live Follower component, so a follow/
  // wait change (F-toggle or Dismiss) updates the row with no rebuild.
  _buildFollowerTab(scene) {
    const page = new UIElement({ width: "100%", gap: GemsTheme.gapSm });
    const title = new UIElement({ width: "100%", height: 22 });
    title.insertChild(
      gemsLabel(I18n.textRef("INV_FOLLOWERS"), { color: "#ffd166" }),
    );
    page.insertChild(title);
    scene._invFollowerHost = new UIElement({
      width: "100%",
      gap: GemsTheme.gapSm,
    });
    page.insertChild(scene._invFollowerHost);

    // Recall hint, binding-aware (reads the follow action's CURRENT key live, like gemsKeyHints):
    // a waiting/dismissed companion is re-hired by walking up to it and pressing the follow key.
    page.insertChild(gemsDivider());
    const hint = new UIElement({ width: "100%", height: 20 });
    hint.insertChild(
      gemsLabel(
        () => I18n.text("FOLLOWER_RECALL_HINT", Input.get("follow").label()),
        { color: GemsTheme.textDim },
      ),
    );
    page.insertChild(hint);
    return page;
  },

  // Populate the roster host with one card per companion in scene.followers (empty notice when
  // there are none here). Called from rebuild() — never at build() time, since the party isn't
  // seeded until after the window is built.
  _buildFollowerRows(scene, host) {
    const ids = scene.followers;
    if (ids === undefined || ids.length === 0) {
      const empty = new UIElement({ width: "100%", height: 24 });
      empty.insertChild(
        gemsLabel(I18n.textRef("INV_NO_FOLLOWERS"), {
          color: GemsTheme.textDim,
        }),
      );
      host.insertChild(empty);
      return;
    }
    for (let i = 0; i < ids.length; i++) {
      if (!scene.world.isValid(ids[i])) continue;
      host.insertChild(RpgInventoryUI._followerRow(scene, ids[i]));
    }
  },

  // One companion card: name, a live status + carry-bonus line, and a Dismiss button. Dismiss
  // sends the companion to the player's claimed build area (scene._dismissFollower) and is
  // disabled (live) unless it is currently following — a waiting/dismissed companion is recalled
  // by walking up to it and pressing the follow key, not from here.
  _followerRow(scene, fid) {
    const card = gemsCard({ padding: GemsTheme.padSm, gap: GemsTheme.gapSm });

    const head = new UIElement({ width: "100%", height: 22 });
    head.insertChild(
      gemsLabel(
        () => {
          const nm = scene.world.get(Name, fid);
          return nm !== undefined ? nm.name : I18n.text("FOLLOWER_DEFAULT");
        },
        { color: GemsTheme.text, font: "header" },
      ),
    );
    card.insertChild(head);

    const status = new UIElement({ width: "100%", height: 20 });
    status.insertChild(
      gemsLabel(
        () => {
          const f = scene.world.get(Follower, fid);
          if (f === undefined) return "";
          let state;
          if (scene.world.get(Downed, fid) !== undefined)
            state = I18n.text("FOLLOWER_STATE_DOWN"); // incapacitated, recovering to base
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
        { color: GemsTheme.textMuted },
      ),
    );
    card.insertChild(status);

    card.insertChild(
      gemsButton(
        I18n.textRef("FOLLOWER_DISMISS"),
        () => scene._dismissFollower(fid),
        {
          height: 30,
          disabled: () => {
            const f = scene.world.get(Follower, fid);
            return (
              f === undefined ||
              f.state !== "follow" ||
              scene.world.get(Downed, fid) !== undefined // can't dismiss while down
            );
          },
        },
      ),
    );
    return card;
  },

  // Stats: the live character sheet + the genre's extra records (Profile) host.
  _buildStatsTab(scene) {
    const page = new UIElement({ width: "100%", gap: GemsTheme.gapSm });
    const statRow = (labelKey, getter) => {
      const row = new UIElement({
        width: "100%",
        height: 26,
        flexDirection: "row",
        alignItems: "center",
      });
      const lc = new UIElement({ flexGrow: 1, flexBasis: 0 });
      lc.insertChild(
        gemsLabel(I18n.textRef(labelKey), { color: GemsTheme.textMuted }),
      );
      row.insertChild(lc);
      row.insertChild(
        gemsLabel(
          () => {
            const st = scene.world.get(Stats, scene.ctrl.id);
            return st === undefined ? "" : String(getter(st));
          },
          { color: GemsTheme.text },
        ),
      );
      return row;
    };
    page.insertChild(statRow("STAT_ATK", (st) => st.attack));
    page.insertChild(statRow("STAT_DEF", (st) => st.defense));
    page.insertChild(statRow("STAT_SPD", (st) => Math.round(st.speed)));

    // Primary attributes — the inputs the derived stats above come from. Data-driven from
    // StatModel.ATTRS (swap the model and this list follows), each reading the live Attributes bag,
    // so a *_shard consumable's grant shows immediately on the next rebuild.
    page.insertChild(gemsDivider());
    page.insertChild(
      gemsLabel(I18n.textRef("INV_ATTRIBUTES"), { color: "#ffd166" }),
    );
    const attrRow = (def) => {
      const row = new UIElement({
        width: "100%",
        height: 26,
        flexDirection: "row",
        alignItems: "center",
      });
      const lc = new UIElement({ flexGrow: 1, flexBasis: 0 });
      lc.insertChild(
        gemsLabel(I18n.textRef(def.name), { color: GemsTheme.textMuted }),
      );
      row.insertChild(lc);
      row.insertChild(
        gemsLabel(
          () => {
            const at = scene.world.get(Attributes, scene.ctrl.id);
            return at === undefined ? "" : String(at[def.id]);
          },
          { color: GemsTheme.text },
        ),
      );
      return row;
    };
    for (let i = 0; i < StatModel.ATTRS.length; i++) {
      page.insertChild(attrRow(StatModel.ATTRS[i]));
    }

    page.insertChild(gemsDivider());
    scene._invExtraHost = new UIElement({
      width: "100%",
      gap: GemsTheme.gapSm,
    });
    page.insertChild(scene._invExtraHost);
    return page;
  },

  // Quests: a live tracker bound to the global QuestLog (passed as the tracker's source).
  _buildQuestsTab(scene) {
    const page = new UIElement({ width: "100%", gap: GemsTheme.gapSm });
    page.insertChild(
      gemsQuestTracker({
        source: QuestLog,
        emptyText: I18n.text("INV_NO_QUESTS"),
      }),
    );
    return page;
  },

  // Settings: per-column visibility toggles, persisted via Settings. Toggling rebuilds
  // the Items table's column set (setColumns keeps the current sort by column key).
  _buildSettingsTab(scene) {
    const page = new UIElement({ width: "100%", gap: GemsTheme.gapSm });
    const title = new UIElement({ width: "100%", height: 22 });
    title.insertChild(
      gemsLabel(I18n.textRef("INV_SET_COLS"), { color: "#ffd166" }),
    );
    page.insertChild(title);
    // UICheckbox.onToggle is called with NO argument (it doesn't pass the new value),
    // so flip the setting ourselves off the live value — taking a `v` arg would always
    // be undefined, which made the toggles one-way (could disable but never re-enable).
    const toggle = (labelKey, settingKey) =>
      gemsCheckbox(
        I18n.textRef(labelKey),
        () => Settings.get(settingKey),
        () => {
          Settings.set(settingKey, !Settings.get(settingKey));
          Settings.save();
          RpgInventoryUI._applyColumns(scene);
        },
        { style: "switch" },
      );
    page.insertChild(toggle("INV_COL_RARITY", "invColRarity"));
    page.insertChild(toggle("INV_COL_TYPE", "invColType"));
    page.insertChild(toggle("INV_COL_WT", "invColWeight"));
    page.insertChild(toggle("INV_COL_VAL", "invColValue"));

    // Units: ambient-temperature display unit. The HUD reads Temperature.display() live,
    // so persisting the setting updates it next frame — no table/HUD rebuild needed.
    page.insertChild(gemsDivider());
    const unitsTitle = new UIElement({ width: "100%", height: 22 });
    unitsTitle.insertChild(
      gemsLabel(I18n.textRef("INV_SET_UNITS"), { color: "#ffd166" }),
    );
    page.insertChild(unitsTitle);
    const units = [
      { name: "K", value: "K" },
      { name: "°C", value: "C" },
      { name: "°F", value: "F" },
    ];
    let unitIdx = 0;
    for (let i = 0; i < units.length; i++)
      if (units[i].value === Settings.get("tempUnit")) unitIdx = i;
    page.insertChild(
      gemsRow(
        I18n.textRef("INV_SET_TEMP"),
        gemsSelectCustom(units, unitIdx, (_i, code) => {
          Settings.set("tempUnit", code);
          Settings.save();
        }),
      ),
    );

    // HUD: player-centered directional radar (RadarArrows, drawn live in sceneRpg.draw).
    // The draw reads the setting each frame, so the toggle takes effect next frame with
    // no rebuild — just flip + persist (no _applyColumns like the column toggles).
    page.insertChild(gemsDivider());
    const hudTitle = new UIElement({ width: "100%", height: 22 });
    hudTitle.insertChild(
      gemsLabel(I18n.textRef("INV_SET_HUD"), { color: "#ffd166" }),
    );
    page.insertChild(hudTitle);
    page.insertChild(
      gemsCheckbox(
        I18n.textRef("INV_RADAR"),
        () => Settings.get("rpgRadar"),
        () => {
          Settings.set("rpgRadar", !Settings.get("rpgRadar"));
          Settings.save();
        },
        { style: "switch" },
      ),
    );
    return page;
  },

  // Refresh the live data: swap the table rows (keeping sort/filter/scroll), re-map the
  // selection by itemId, and rebuild the equipment + extra sections. `opts`:
  //   { equipSlots: [{ slot, labelKey }], extraRows?(scene, host) }
  rebuild(scene, opts) {
    const rows = RpgInventoryUI._buildRows(scene);
    scene._invTable.setRows(rows);

    // Re-map the selection by uid (instances) / itemId (fungibles) so the highlight + action
    // button survive the swap (row models are fresh objects each refresh; the old _invSel ref
    // is stale).
    if (scene._invSel !== null) {
      let found = null;
      for (let i = 0; i < rows.length; i++) {
        if (RpgInventoryUI._sameRow(rows[i], scene._invSel)) {
          found = rows[i];
          break;
        }
      }
      scene._invSel = found;
      scene._invTable.selectRow(found);
    }

    // Equipment rows: clear children + re-add (a child-tree rebuild for the new contents).
    const eh = scene._invEquipHost;
    const ek = [...eh.children];
    for (let i = 0; i < ek.length; i++) ek[i].destroy();
    for (let i = 0; i < opts.equipSlots.length; i++)
      eh.insertChild(
        RpgInventoryUI._equipRow(
          scene,
          opts.equipSlots[i].slot,
          opts.equipSlots[i].labelKey,
        ),
      );

    // Genre extra rows (Profile records) into the Stats tab.
    const xh = scene._invExtraHost;
    const xk = [...xh.children];
    for (let i = 0; i < xk.length; i++) xk[i].destroy();
    if (opts.extraRows !== undefined) opts.extraRows(scene, xh);

    // Party roster: rebuilt here (not live) because which companions are present in the world
    // changes across maps — a "follow" one travels with you, a "wait" one only exists in its
    // home map. Per-row status/benefit + the Dismiss disabled-state are live off the Follower.
    const fh = scene._invFollowerHost;
    if (fh !== undefined) {
      const fk = [...fh.children];
      for (let i = 0; i < fk.length; i++) fk[i].destroy();
      RpgInventoryUI._buildFollowerRows(scene, fh);
    }
  },

  // Push the current Settings-driven column set onto the live table (a toggle changed).
  // The chest shares these column Settings, so keep its two tables in sync too (live,
  // for when both windows are open; StorageUI also re-applies them on open).
  _applyColumns(scene) {
    scene._invTable.setColumns(InvTable.columns({ worn: true, fav: true }));
    if (scene._storeBagTable !== undefined) StorageUI._applyColumns(scene);
  },

  // Build the row models from the live bag. `worn` marks the row whose INSTANCE uid is the one
  // equipped in its slot — exact, so with two of the same equippable only the worn instance lights
  // (no itemId dedup needed; uid is unique).
  _buildRows(scene) {
    const inv = scene.world.get(Inventory, scene.ctrl.id);
    const eq = scene.world.get(Equipment, scene.ctrl.id);
    const fav = scene.world.get(Favorites, scene.ctrl.id);
    const rows = [];
    for (let i = 0; i < inv.slots.length; i++) {
      const slot = inv.slots[i];
      const it = Item.get(slot.itemId);
      let worn = false;
      if (it !== undefined && it.hasComponent(Equippable)) {
        const eqp = it.getComponent(Equippable);
        if (slot.uid !== undefined && eq.slots[eqp.slot] === slot.uid)
          worn = true;
      }
      const favd = fav !== undefined && FavoritesSystem.has(fav, slot.itemId);
      rows.push({
        ...InvTable.rowModel(slot.itemId, slot.qty, slot.uid, slot.mods),
        worn,
        fav: favd,
      });
    }
    return rows;
  },

  // Compose the category select + the search box into ONE table predicate (UITable
  // takes a single filter fn). null when neither is active, so the table shows all.
  _applyFilter(scene) {
    const cat = scene._invCat;
    const q = scene._invSearch;
    if (cat === "" && q === "") {
      scene._invTable.setFilter(null);
      return;
    }
    // "fav" is a pseudo-category (matches the favorited flag, not the item type); the others
    // match r.cat. Both compose with the name search.
    scene._invTable.setFilter(
      (r) =>
        (cat === "" || (cat === "fav" ? r.fav : r.cat === cat)) &&
        (q === "" || r.search.indexOf(q) >= 0),
    );
  },

  // Click selects a row; a second click on the SAME row within 350ms uses/equips it
  // (double-click), matching the action button + gamepad confirm. Identity is the instance
  // uid when present (so a re-click on the same modded weapon double-clicks, not its twin),
  // else the itemId for fungibles.
  _onSelect(scene, row) {
    const now = current_time;
    if (
      scene._invSel !== null &&
      RpgInventoryUI._sameRow(scene._invSel, row) &&
      now - scene._invSelTime < 350
    ) {
      RpgInventoryUI._activate(scene, row);
      return;
    }
    scene._invSel = row;
    scene._invSelTime = now;
  },

  // Two row models refer to the same item: by instance uid when both have one, else by itemId.
  _sameRow(a, b) {
    if (a.uid !== undefined || b.uid !== undefined) return a.uid === b.uid;
    return a.itemId === b.itemId;
  },

  _activate(scene, row) {
    if (row === null || row === undefined) return;
    RpgInventoryUI.useItem(scene, row.itemId, row.worn, row.uid);
  },

  // The context action verb for the selected item ("-" when none / no action).
  _actionLabel(scene) {
    if (scene._invSel === null) return I18n.text("INV_NOACTION");
    const it = Item.get(scene._invSel.itemId);
    if (it !== undefined && it.hasComponent(Equippable))
      return scene._invSel.worn
        ? I18n.text("INV_UNEQUIP")
        : I18n.text("INV_EQUIP");
    if (it !== undefined && it.hasComponent(Consumable))
      return I18n.text("INV_USE");
    return I18n.text("INV_NOACTION");
  },

  // One equipment slot: a button (click unequips) when worn, else a muted label row. The slot
  // holds the equipped INSTANCE uid; resolve it to the live bag slot for the itemId + its mods.
  _equipRow(scene, slot, labelKey) {
    const eq = scene.world.get(Equipment, scene.ctrl.id);
    const uid = eq !== undefined ? eq.slots[slot] : "";
    if (uid !== undefined && uid !== "") {
      const inv = scene.world.get(Inventory, scene.ctrl.id);
      const inst =
        inv !== undefined ? InventorySystem.findByUid(inv, uid) : undefined;
      const itemId = inst !== undefined ? inst.itemId : "";
      const it = Item.get(itemId);
      const base = it !== undefined ? I18n.text(it.name) : itemId;
      // `mods` is the named-slot MAP { slotId -> attachmentItemId }; count its filled slots for "+N".
      let modCount = 0;
      if (inst !== undefined && inst.mods !== undefined)
        for (const slotId in inst.mods) modCount++;
      const nm = modCount > 0 ? base + " +" + modCount : base;
      return gemsButton(
        I18n.text(labelKey) + ": " + nm,
        () => {
          EquipmentSystem.unequip(scene.world, scene.ctrl.id, slot);
          scene._invDirty = true;
          Log.info(`unequipped ${itemId}`);
        },
        {
          height: 30,
          textColor: RpgWorldOverlay._rarityColor(itemId),
          icon: it !== undefined ? it.sprite : -1,
        },
      );
    }
    const row = new UIElement({ width: "100%", height: 26 });
    row.insertChild(
      gemsLabel(I18n.text(labelKey) + ": " + I18n.text("SLOT_EMPTY"), {
        color: GemsTheme.textDim,
      }),
    );
    return row;
  },

  // Act on an item: equippables toggle equip/unequip, consumables are used (one unit).
  // `wasWorn` is the row's displayed equipped-state — acting on it (not the shared itemId)
  // means that with two identical equippables only the row shown as equipped unequips.
  // `uid` (a table row's specific instance) equips exactly that one; without it (the hotbar,
  // which only knows an itemId) equipFirst picks the first owned instance.
  useItem(scene, itemId, wasWorn, uid) {
    const item = Item.get(itemId);
    if (item === undefined) return;
    if (item.hasComponent(Equippable)) {
      const eqp = item.getComponent(Equippable);
      if (wasWorn) {
        EquipmentSystem.unequip(scene.world, scene.ctrl.id, eqp.slot);
        Log.info(`unequipped ${itemId}`);
      } else {
        const ok =
          uid !== undefined
            ? EquipmentSystem.equip(scene.world, scene.ctrl.id, uid)
            : EquipmentSystem.equipFirst(scene.world, scene.ctrl.id, itemId);
        if (ok) Log.info(`equipped ${itemId}`);
      }
    } else if (item.hasComponent(Consumable)) {
      if (ConsumableSystem.use(scene.world, scene.ctrl.id, itemId)) {
        Log.info(`used ${itemId}`);
      }
    }
    scene._invDirty = true;
  },
};
