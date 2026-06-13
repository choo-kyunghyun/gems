// Shared draggable inventory/equipment/stats window for the RPG genre scenes. Both
// scenes had a byte-identical builder except for which equipment slots to show and a few
// trailing lines; that's all consolidated here so the (admittedly row-based, placeholder)
// inventory UI lives in ONE module — the single place to overhaul into a table/grid-based
// design later. Scenes keep only the open/close state.
//
// Contract: the scene owns `ui`, `world`, `ctrl` (with `.id`), `invOpen`, and the window
// fields this module sets/reads — `_invWin` (the gemsWindow), `_invScroll` (the item
// list, for scroll-offset preservation), `_invDirty` (rebuild-needed flag).
//
// Usage:
//   create():            RpgInventoryUI.build(scene)
//   step() (when dirty):  RpgInventoryUI.rebuild(scene, { equipSlots, extraRows? })
globalThis.RpgInventoryUI = {
  // Build the (hidden) draggable window and store it as scene._invWin; insert into ui.
  build(scene) {
    const gw = display_get_gui_width();
    const left = gw > 0 ? gw / 2 - 220 : 60;
    scene._invWin = gemsWindow(I18n.textRef("RPG_INVENTORY"), {
      left,
      top: 50,
      width: 440,
      onClose: () => {
        scene.invOpen = false;
        scene._invWin.enabled = false;
      },
    });
    scene._invWin.enabled = false;
    scene.ui.insertChild(scene._invWin);
  },

  // Repopulate the window body from the live Inventory/Equipment/Stats. Called only when
  // the bag changed (open + _invDirty), not per frame — child-tree edits are safe (it's
  // flexpanel *style* mutation that's unreliable on GMRT 0.19). `opts`:
  //   { equipSlots: [{ slot, labelKey }], extraRows?(scene, body) }
  // equipSlots = the equipment rows to show (genres differ on backpack); extraRows appends
  // genre-specific lines after the stats line (e.g. top-down's Profile records).
  rebuild(scene, opts) {
    const body = scene._invWin.body;
    // Preserve the item-list scroll offset across the rebuild — equipping/using an item
    // marks the bag dirty, and rebuilding the whole body would otherwise snap the list
    // back to the top on every click.
    let savedScroll = 0;
    if (scene._invScroll !== undefined) {
      const old = scene._invScroll.getComponent(UIScroll);
      if (old !== undefined) savedScroll = old.scroll;
    }
    const kids = [...body.children];
    for (let i = 0; i < kids.length; i++) kids[i].destroy();

    const world = scene.world;
    const inv = world.get(Inventory, scene.ctrl.id);

    // Slot / weight usage + a Sort button (tidy + order the bag).
    const top = new UIElement({
      width: "100%",
      height: 30,
      flexDirection: "row",
      alignItems: "center",
      gap: GemsTheme.gapSm,
    });
    const usageCell = new UIElement({ flexGrow: 1, flexBasis: 0 });
    usageCell.insertChild(
      gemsLabel(
        () => {
          const v = world.get(Inventory, scene.ctrl.id);
          let s =
            I18n.text("RPG_SLOTS") +
            " " +
            v.slots.length +
            "/" +
            v.capacity;
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
    top.insertChild(
      gemsButton(
        I18n.textRef("SORT"),
        () => {
          InventorySystem.sort(world.get(Inventory, scene.ctrl.id));
          scene._invDirty = true;
        },
        { width: 90, height: 28 },
      ),
    );
    body.insertChild(top);

    // Item rows (clickable: equip/unequip or use).
    const scroll = gemsScroll({ height: 180 });
    if (inv.slots.length === 0) {
      const r = new UIElement({ width: "100%", height: 24 });
      r.insertChild(
        gemsLabel(I18n.textRef("RPG_EMPTY"), { color: GemsTheme.textDim }),
      );
      scroll.scrollBody.insertChild(r);
    }
    // Equipment references items by id, so with two of the same equippable only ONE is
    // actually worn — let the first matching row claim the "(equipped)" marker.
    const wornClaimed = {};
    for (let i = 0; i < inv.slots.length; i++)
      scroll.scrollBody.insertChild(
        RpgInventoryUI._itemRow(scene, inv.slots[i], wornClaimed),
      );
    body.insertChild(scroll);
    scene._invScroll = scroll;
    const sc = scroll.getComponent(UIScroll);
    if (sc !== undefined) {
      sc.scroll = savedScroll; // clamped to the new content height on next update
      scroll.scrollY = savedScroll; // apply now so this frame doesn't flash to top
    }

    // Equipment (clickable rows unequip).
    body.insertChild(gemsDivider());
    const eqTitle = new UIElement({ width: "100%", height: 22 });
    eqTitle.insertChild(
      gemsLabel(I18n.textRef("RPG_EQUIPMENT"), { color: "#ffd166" }),
    );
    body.insertChild(eqTitle);
    for (let i = 0; i < opts.equipSlots.length; i++)
      body.insertChild(
        RpgInventoryUI._equipRow(
          scene,
          opts.equipSlots[i].slot,
          opts.equipSlots[i].labelKey,
        ),
      );

    // Stats (live).
    body.insertChild(gemsDivider());
    const stats = new UIElement({ width: "100%", height: 22 });
    stats.insertChild(
      gemsLabel(
        () => {
          const st = world.get(Stats, scene.ctrl.id);
          return (
            I18n.text("STAT_LEVEL") +
            ": " +
            st.level +
            "   " +
            I18n.text("STAT_ATK") +
            ": " +
            st.attack +
            "   " +
            I18n.text("STAT_DEF") +
            ": " +
            st.defense +
            "   " +
            I18n.text("STAT_SPD") +
            ": " +
            Math.round(st.speed)
          );
        },
        { color: GemsTheme.text },
      ),
    );
    body.insertChild(stats);

    // Genre-specific trailing rows (e.g. top-down's kills/items/quests records).
    if (opts.extraRows !== undefined) opts.extraRows(scene, body);
  },

  // One inventory row: a button labeled "name xN value [equipped]", tinted by rarity.
  // `wornClaimed` is a per-rebuild map so only the first row of a given equipped item
  // shows the marker (equipment is keyed by itemId, not by slot instance).
  _itemRow(scene, slot, wornClaimed) {
    const itemId = slot.itemId;
    const it = Item.get(itemId);
    const eq = scene.world.get(Equipment, scene.ctrl.id);
    let worn = false;
    if (it !== undefined && it.hasComponent(Equippable)) {
      const eqp = it.getComponent(Equippable);
      if (eq.slots[eqp.slot] === itemId && !wornClaimed[itemId]) {
        worn = true;
        wornClaimed[itemId] = true;
      }
    }
    const name = it !== undefined ? I18n.text(it.name) : itemId;
    const val =
      it !== undefined ? Math.round(Rarity.modify(it.rarity, it.value)) : 0;
    const label =
      name +
      "  x" +
      slot.qty +
      "  " +
      val +
      (worn ? "  " + I18n.text("RPG_EQUIPPED") : "");
    return gemsButton(
      label,
      () => RpgInventoryUI.useItem(scene, itemId, worn),
      {
        height: 32,
        textColor: RpgWorldOverlay._rarityColor(itemId),
      },
    );
  },

  // One equipment slot: a button (click unequips) when worn, else a muted label row.
  _equipRow(scene, slot, labelKey) {
    const eq = scene.world.get(Equipment, scene.ctrl.id);
    const itemId = eq !== undefined ? eq.slots[slot] : "";
    if (itemId !== undefined && itemId !== "") {
      const it = Item.get(itemId);
      const nm = it !== undefined ? I18n.text(it.name) : itemId;
      return gemsButton(
        I18n.text(labelKey) + ": " + nm,
        () => {
          EquipmentSystem.unequip(scene.world, scene.ctrl.id, slot);
          scene._invDirty = true;
          Log.info(`unequipped ${itemId}`);
        },
        { height: 30, textColor: RpgWorldOverlay._rarityColor(itemId) },
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

  // Click action on an inventory item: equippables toggle equip/unequip, consumables are
  // used (one unit). `wasWorn` is the row's displayed equipped-state — acting on it (not
  // on the shared itemId) means that with two identical equippables only the row shown as
  // equipped unequips; clicking the spare falls to equip(), which no-ops for an already-
  // equipped item rather than toggling the worn one off.
  useItem(scene, itemId, wasWorn) {
    const item = Item.get(itemId);
    if (item === undefined) return;
    if (item.hasComponent(Equippable)) {
      const eqp = item.getComponent(Equippable);
      if (wasWorn) {
        EquipmentSystem.unequip(scene.world, scene.ctrl.id, eqp.slot);
        Log.info(`unequipped ${itemId}`);
      } else if (EquipmentSystem.equip(scene.world, scene.ctrl.id, itemId)) {
        Log.info(`equipped ${itemId}`);
      }
    } else if (item.hasComponent(Consumable)) {
      if (ConsumableSystem.use(scene.world, scene.ctrl.id, itemId)) {
        Log.info(`used ${itemId}`);
      }
    }
    scene._invDirty = true;
  },
};
