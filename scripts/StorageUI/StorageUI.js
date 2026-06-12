// Shared storage-chest UI for the genre templates (TopDown + Platformer). A "storage"
// entity is any entity tagged "storage" carrying an Inventory; walk near it and press
// `interact` (E) to open a two-column transfer window — left = the player's Bag, right
// = the Chest — where clicking an item moves that whole stack to the other side
// (capacity/weight-gated by InventorySystem.add). Manager-drawn UI on the GUI layer
// (Draw_75), built once and toggled; the window is a draggable gemsWindow.
//
// All per-open state lives on the SCENE (namespaced `_store*`), never on this static
// module, so two scenes can't clobber each other and teardownScene (which destroys
// scene.ui) cleans up the window/prompt with no extra work.
//
// Scene contract: scene.world, scene.ctrl.id (player), scene.ui. Build it once in
// create() (after the player + ui exist), call update() each frame, and set
// scene._storeDirty = true if the player inventory changes from elsewhere while open.
globalThis.StorageUI = {
  RADIUS: 72, // interact range (px) to a chest

  _rarityColor(itemId) {
    const it = Item.get(itemId);
    const r = it !== undefined ? Rarity.get(it.rarity) : undefined;
    return r !== undefined ? r.color : c_white;
  },

  build(scene) {
    scene._storageId = -1;
    scene._storeOpen = false;
    scene._storeDirty = false;

    // Proximity prompt: a compact centered card near the bottom, shown only while the
    // player is near a chest and the window is closed.
    const prompt = new UIElement({
      positionType: "absolute",
      left: 0,
      right: 0,
      bottom: 84,
      alignItems: "center",
    });
    const pill = new UIElement({
      width: 240,
      height: 42,
      justifyContent: "center",
      alignItems: "center",
    });
    pill.addComponent(
      new UIPanel({
        color: gemsColor(GemsTheme.panel),
        color2: gemsColor(GemsTheme.panelLo),
        rad: GemsTheme.radius,
        border: 1,
        borderColor: gemsColor(GemsTheme.border),
        shadow: 8,
        highlight: 1,
      }),
    );
    pill.insertChild(
      gemsLabel(I18n.textRef("STORAGE_PROMPT"), {
        halign: fa_center,
        color: GemsTheme.text,
      }),
    );
    prompt.insertChild(pill);
    prompt.enabled = false;
    scene._storePrompt = prompt;
    scene.ui.insertChild(prompt);

    // Transfer window: Bag | Chest columns.
    const gw = display_get_gui_width();
    const left = gw > 0 ? gw / 2 - 280 : 80;
    const win = gemsWindow(I18n.textRef("STORAGE_TITLE"), {
      left,
      top: 80,
      width: 560,
      onClose: () => StorageUI._close(scene),
    });
    win.enabled = false;
    const cols = new UIElement({
      width: "100%",
      flexDirection: "row",
      gap: GemsTheme.gap,
    });
    const bag = StorageUI._column(I18n.textRef("STORAGE_BAG"));
    const box = StorageUI._column(I18n.textRef("STORAGE_BOX"));
    cols.insertChild(bag.col);
    cols.insertChild(box.col);
    win.body.insertChild(cols);
    scene._storeWin = win;
    scene._storeBagBody = bag.body;
    scene._storeBoxBody = box.body;
    scene.ui.insertChild(win);
  },

  // One titled column: header label over a fixed-height scroll. Returns { col, body }.
  _column(titleRef) {
    const col = new UIElement({
      flexGrow: 1,
      flexBasis: 0,
      gap: GemsTheme.gapSm,
    });
    const title = new UIElement({ width: "100%", height: 22 });
    title.insertChild(gemsLabel(titleRef, { color: "#ffd166" }));
    const scroll = gemsScroll({ height: 240 });
    col.insertChild(title);
    col.insertChild(scroll);
    return { col, body: scroll.scrollBody };
  },

  // Per-frame: track the nearest chest, toggle on interact, manage prompt + rebuild.
  update(scene) {
    const near = StorageUI._findNear(scene);

    if (near !== -1 && Input.get("interact").pressed()) {
      if (scene._storeOpen) StorageUI._close(scene);
      else StorageUI._open(scene, near);
    }
    // Walked out of range while open → close (chest is left behind).
    if (scene._storeOpen && near === -1) StorageUI._close(scene);

    scene._storePrompt.enabled = near !== -1 && !scene._storeOpen;

    if (scene._storeOpen && scene._storeDirty) {
      StorageUI._rebuild(scene);
      scene._storeDirty = false;
    }
  },

  _findNear(scene) {
    const p = scene.world.get(Position, scene.ctrl.id);
    if (p === undefined) return -1;
    return Query.nearest(scene.world, p.x, p.y, {
      tag: "storage",
      maxDist: StorageUI.RADIUS,
    });
  },

  _open(scene, id) {
    scene._storageId = id;
    scene._storeOpen = true;
    scene._storeWin.enabled = true;
    scene._storeDirty = true;
  },

  _close(scene) {
    scene._storeOpen = false;
    scene._storeWin.enabled = false;
    scene._storageId = -1;
  },

  _rebuild(scene) {
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
      if (
        eq !== undefined &&
        !InventorySystem.has(srcInv, itemId, 1)
      ) {
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
