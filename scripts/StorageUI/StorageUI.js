// Storage-chest transfer WINDOW for the genre templates (TopDown + Platformer). A
// "storage" station (a Station {kind:"storage"} entity carrying an Inventory) opens a
// two-column transfer window — left = the player's Bag, right = the Chest — where
// clicking an item moves that whole stack to the other side (capacity/weight-gated by
// InventorySystem.add). Manager-drawn UI on the GUI layer (Draw_75), built once and
// toggled.
//
// Proximity selection, the open/close keybind, the prompt, and the world highlight are
// owned by the shared `Interactable` module — this file only builds the window and
// reacts to open/close/refresh calls. All per-open state lives on the SCENE
// (namespaced `_store*`) so two scenes can't clobber each other and teardownScene
// (which destroys scene.ui) cleans up with no extra work.
//
// Scene contract: scene.world, scene.ctrl.id (player), scene.ui. Built once in create()
// via Interactable.build (after the player + ui exist); set scene._storeDirty = true if
// the player inventory changes from elsewhere while open.
globalThis.StorageUI = {
  _rarityColor(itemId) {
    const it = Item.get(itemId);
    const r = it !== undefined ? Rarity.get(it.rarity) : undefined;
    return r !== undefined ? r.color : c_white;
  },

  build(scene) {
    scene._storageId = -1;
    scene._storeOpen = false;
    scene._storeDirty = false;

    // Transfer window: Bag | Chest columns.
    const gw = display_get_gui_width();
    const left = gw > 0 ? gw / 2 - 280 : 80;
    const win = gemsWindow(I18n.textRef("STORAGE_TITLE"), {
      left,
      top: 80,
      width: 560,
      onClose: () => StorageUI.close(scene),
    });
    win.enabled = false;
    const cols = new UIElement({
      width: "100%",
      flexDirection: "row",
      gap: GemsTheme.gap,
    });
    const bag = StorageUI._column(I18n.textRef("STORAGE_BAG"), () => {
      InventorySystem.sort(scene.world.get(Inventory, scene.ctrl.id));
      scene._storeDirty = true;
      scene._invDirty = true; // bag also feeds the main inventory window
    });
    const box = StorageUI._column(I18n.textRef("STORAGE_BOX"), () => {
      const inv = scene.world.get(Inventory, scene._storageId);
      if (inv === undefined) return;
      InventorySystem.sort(inv);
      scene._storeDirty = true;
    });
    cols.insertChild(bag.col);
    cols.insertChild(box.col);
    win.body.insertChild(cols);
    scene._storeWin = win;
    scene._storeBagBody = bag.body;
    scene._storeBoxBody = box.body;
    scene.ui.insertChild(win);
  },

  // One titled column: a header (title + Sort button) over a fixed-height scroll.
  // Returns { col, body }.
  _column(titleRef, onSort) {
    const col = new UIElement({
      flexGrow: 1,
      flexBasis: 0,
      gap: GemsTheme.gapSm,
    });
    const header = new UIElement({
      width: "100%",
      height: 28,
      flexDirection: "row",
      alignItems: "center",
      gap: GemsTheme.gapSm,
    });
    const titleCell = new UIElement({ flexGrow: 1, flexBasis: 0 });
    titleCell.insertChild(gemsLabel(titleRef, { color: "#ffd166" }));
    header.insertChild(titleCell);
    header.insertChild(
      gemsButton(I18n.textRef("SORT"), onSort, { width: 72, height: 26 }),
    );
    const scroll = gemsScroll({ height: 240 });
    col.insertChild(header);
    col.insertChild(scroll);
    return { col, body: scroll.scrollBody };
  },

  // Called by Interactable when the player activates a storage station.
  open(scene, id) {
    scene._storageId = id;
    scene._storeOpen = true;
    scene._storeWin.enabled = true;
    scene._storeDirty = true;
  },

  close(scene) {
    scene._storeOpen = false;
    scene._storeWin.enabled = false;
    scene._storageId = -1;
  },

  refresh(scene) {
    const world = scene.world;
    const bagInv = world.get(Inventory, scene.ctrl.id);
    const boxInv = world.get(Inventory, scene._storageId);
    if (bagInv === undefined || boxInv === undefined) return;
    StorageUI._fill(scene, scene._storeBagBody, bagInv, boxInv); // click bag → store
    StorageUI._fill(scene, scene._storeBoxBody, boxInv, bagInv); // click chest → take
  },

  // Populate `body` with one clickable row per slot of `srcInv`; clicking moves that
  // stack into `dstInv`. Rebuilt fully on each transfer, so captured indices stay fresh.
  _fill(scene, body, srcInv, dstInv) {
    const kids = [...body.children];
    for (let i = 0; i < kids.length; i++) kids[i].destroy();

    if (srcInv.slots.length === 0) {
      const r = new UIElement({ width: "100%", height: 24 });
      r.insertChild(
        gemsLabel(I18n.textRef("STORAGE_EMPTY"), { color: GemsTheme.textDim }),
      );
      body.insertChild(r);
      return;
    }
    for (let i = 0; i < srcInv.slots.length; i++) {
      const idx = i;
      body.insertChild(
        StorageUI._itemRow(srcInv.slots[i], () =>
          StorageUI._transfer(scene, srcInv, dstInv, idx),
        ),
      );
    }
  },

  // Move slot `idx` of srcInv into dstInv (as much as fits), removing the moved amount
  // from that exact slot. Marks the window dirty so it repopulates next update().
  _transfer(scene, srcInv, dstInv, idx) {
    if (idx < 0 || idx >= srcInv.slots.length) return;
    const s = srcInv.slots[idx];
    const itemId = s.itemId;
    const leftover = InventorySystem.add(dstInv, itemId, s.qty);
    const moved = s.qty - leftover;
    if (moved <= 0) return; // destination full / weight-gated
    s.qty -= moved;
    if (s.qty <= 0) srcInv.slots.splice(idx, 1);

    // Storing an equipped item out of the player's own bag must unequip it once the
    // player no longer owns any copy — equipped items normally stay in the bag, so a
    // worn item moved to the chest would otherwise leave a dangling Equipment slot
    // (and its stat mods) referencing an item we no longer have.
    if (srcInv === scene.world.get(Inventory, scene.ctrl.id)) {
      const eq = scene.world.get(Equipment, scene.ctrl.id);
      if (eq !== undefined && !InventorySystem.has(srcInv, itemId, 1)) {
        for (const slot in eq.slots) {
          if (eq.slots[slot] === itemId) {
            EquipmentSystem.unequip(scene.world, scene.ctrl.id, slot);
            break;
          }
        }
      }
    }

    scene._storeDirty = true;
    scene._invDirty = true; // keep the main inventory window in sync if it's open
    Log.info(`transferred ${moved}x ${itemId}`);
  },

  _itemRow(slot, onClick) {
    const itemId = slot.itemId;
    const it = Item.get(itemId);
    const name = it !== undefined ? I18n.text(it.name) : itemId;
    const val =
      it !== undefined ? Math.round(Rarity.modify(it.rarity, it.value)) : 0;
    const label = name + "  x" + slot.qty + "  " + val;
    return gemsButton(label, onClick, {
      height: 30,
      textColor: StorageUI._rarityColor(itemId),
    });
  },
};
