// Weapon-MODIFICATION window for the RPG scene. A "modbench" station (Station {kind:"modbench"} —
// an Anvil) opens this. A master-detail panel over the player's WEAPON INSTANCES (the
// definition-vs-instance split: each weapon is a unique inventory slot with a uid + an inline
// `mods` list of installed mod itemIds):
//   • LEFT  — a list of owned weapon instances; click one to select it (by uid). Shows its mod
//             count "+N" and an "[E]" marker when it's the equipped weapon.
//   • RIGHT — the selected weapon's composed attack stats (base + installed mods, via
//             EquipmentSystem.composeWeapon), sockets used/total, the installed mods (each with a
//             Remove button that refunds the mod item), and the owned WeaponMod items available to
//             Install (gated live by free sockets + ownership).
// Installing consumes one mod item and pushes its itemId onto the instance's `mods`; removing pops
// it and refunds the item. Both re-derive the wearer's Stats (a mod can also grant Stats) via
// StatModel.recompute and mark the bag dirty.
//
// Manager-drawn UI on the GUI layer (Draw_75), built once and toggled. Selection + open/close are
// owned by the shared Interactable module. All per-open state lives on the SCENE (namespaced
// `_mod*`) so two scenes can't clobber each other and teardownScene cleans up. Like CraftingUI the
// columns are PLAIN (no gpu_set_scissor clip — unreliable in a master-detail row on GMRT 0.20; see
// CraftingUI's long comment), sized to fit via LIST_H.
//
// Scene contract: scene.world, scene.ctrl.id (player), scene.ui.
globalThis.WeaponModUI = {
  LIST_H: 460, // list/panel height (px) — fits ~12 weapon rows without a scroll
  WRAP: 300, // description/text wrap width for the detail column

  build(scene) {
    scene._modOpen = false;
    scene._modDirty = false;
    scene._modSel = ""; // selected weapon instance uid (defaulted to the first on refresh)

    const win = gemsWindow(I18n.textRef("MOD_TITLE"), {
      top: 80,
      width: 600,
      resizable: false, // fixed master-detail panel (stable text wrap), like CraftingUI
      onClose: () => WeaponModUI.close(scene),
    });
    win.enabled = false;

    const row = new UIElement({
      width: "100%",
      height: WeaponModUI.LIST_H,
      flexShrink: 0,
      flexDirection: "row",
      gap: GemsTheme.gap,
    });

    const left = new UIElement({
      width: 210,
      height: "100%",
      flexShrink: 0,
      gap: GemsTheme.gapSm,
    });
    scene._modList = left;
    row.insertChild(left);

    const detail = new UIElement({
      flexGrow: 1,
      flexBasis: 0,
      height: "100%",
      gap: GemsTheme.gapSm,
    });
    scene._modDetail = detail;
    row.insertChild(detail);

    win.body.insertChild(row);
    scene._modWin = win;
    scene.ui.insertChild(win);
  },

  open(scene, stationId) {
    scene._modOpen = true;
    scene._modWin.enabled = true;
    scene._modDirty = true;
  },

  close(scene) {
    scene._modOpen = false;
    scene._modWin.enabled = false;
  },

  // Rebuild both panels. Ensures a valid selection first (default to the first weapon; reset if the
  // selected uid is no longer owned — e.g. it was sold/stored elsewhere).
  refresh(scene) {
    const inv = scene.world.get(Inventory, scene.ctrl.id);
    const weapons = WeaponModUI._weaponInstances(inv);
    if (weapons.length > 0 && !WeaponModUI._hasUid(weapons, scene._modSel))
      scene._modSel = weapons[0].uid;
    WeaponModUI._fillList(scene, inv, weapons);
    WeaponModUI._fillDetail(scene, inv, weapons);
  },

  // Owned weapon instances (slots with a uid whose item has a Weapon component).
  _weaponInstances(inv) {
    const out = [];
    if (inv === undefined) return out;
    for (let i = 0; i < inv.slots.length; i++) {
      const s = inv.slots[i];
      if (s.uid === undefined) continue;
      const it = Item.get(s.itemId);
      if (it !== undefined && it.hasComponent(Weapon)) out.push(s);
    }
    return out;
  },

  _hasUid(weapons, uid) {
    for (let i = 0; i < weapons.length; i++)
      if (weapons[i].uid === uid) return true;
    return false;
  },

  // Left: one selectable button per weapon instance (name "+N", "[E]" when equipped).
  _fillList(scene, inv, weapons) {
    const body = scene._modList;
    const kids = [...body.children];
    for (let i = 0; i < kids.length; i++) kids[i].destroy();

    if (weapons.length === 0) {
      body.insertChild(
        gemsLabel(I18n.textRef("MOD_EMPTY"), { color: GemsTheme.textDim }),
      );
      return;
    }
    const eq = scene.world.get(Equipment, scene.ctrl.id);
    const equippedUid = eq !== undefined ? eq.slots.weapon : "";
    for (let i = 0; i < weapons.length; i++) {
      body.insertChild(WeaponModUI._listButton(scene, weapons[i], equippedUid));
    }
  },

  _listButton(scene, slot, equippedUid) {
    const uid = slot.uid;
    const it = Item.get(slot.itemId);
    const base = it !== undefined ? I18n.text(it.name) : slot.itemId;
    const n = slot.mods !== undefined ? slot.mods.length : 0;
    let label = n > 0 ? base + " +" + n : base;
    if (uid === equippedUid) label += "  [E]";
    return gemsButton(
      label,
      () => {
        scene._modSel = uid;
        scene._modDirty = true;
      },
      {
        height: 32,
        selected: () => scene._modSel === uid,
        textColor: RpgWorldOverlay._rarityColor(slot.itemId),
      },
    );
  },

  // Right: the selected weapon's composed stats, sockets, installed mods, and the install picker.
  _fillDetail(scene, inv, weapons) {
    const host = scene._modDetail;
    const kids = [...host.children];
    for (let i = 0; i < kids.length; i++) kids[i].destroy();

    if (weapons.length === 0) {
      host.insertChild(
        gemsLabel(I18n.textRef("MOD_SELECT"), { color: GemsTheme.textDim }),
      );
      return;
    }
    let slot;
    for (let i = 0; i < weapons.length; i++)
      if (weapons[i].uid === scene._modSel) slot = weapons[i];
    if (slot === undefined) return;
    if (slot.mods === undefined) slot.mods = []; // defensive

    const it = Item.get(slot.itemId);
    const wpn = it !== undefined ? it.getComponent(Weapon) : undefined;
    const name = it !== undefined ? I18n.text(it.name) : slot.itemId;
    const sockets = wpn !== undefined ? wpn.sockets : 0;

    host.insertChild(
      gemsLabel(name, {
        font: "header",
        color: RpgWorldOverlay._rarityColor(slot.itemId),
      }),
    );
    host.insertChild(gemsDivider());

    // Composed attack stats (base + installed mods) — only the fields the base declares.
    if (wpn !== undefined) {
      const prof = EquipmentSystem.composeWeapon(wpn, slot.mods);
      host.insertChild(WeaponModUI._statLine("MOD_DMG", prof.damage));
      if (prof.fireCd !== undefined)
        host.insertChild(WeaponModUI._statLine("MOD_FIRECD", prof.fireCd));
      if (prof.reach !== undefined)
        host.insertChild(WeaponModUI._statLine("MOD_REACH", prof.reach));
      if (prof.bulletSpeed !== undefined)
        host.insertChild(WeaponModUI._statLine("MOD_SPEED", prof.bulletSpeed));
    }

    // Sockets used / total.
    host.insertChild(
      gemsLabel(
        () => I18n.text("MOD_SOCKETS") + " " + slot.mods.length + "/" + sockets,
        { color: GemsTheme.textMuted },
      ),
    );
    host.insertChild(gemsDivider());

    // Installed mods, each removable (refunds the mod item).
    host.insertChild(
      gemsLabel(I18n.textRef("MOD_INSTALLED"), { color: GemsTheme.textMuted }),
    );
    if (slot.mods.length === 0) {
      host.insertChild(
        gemsLabel(I18n.textRef("MOD_NONE"), { color: GemsTheme.textDim }),
      );
    } else {
      for (let i = 0; i < slot.mods.length; i++) {
        host.insertChild(WeaponModUI._installedRow(scene, slot, i));
      }
    }
    host.insertChild(gemsDivider());

    // Available mods to install (owned WeaponMod items), gated by free sockets + ownership.
    host.insertChild(
      gemsLabel(I18n.textRef("MOD_AVAILABLE"), { color: GemsTheme.textMuted }),
    );
    const owned = WeaponModUI._ownedMods(inv);
    if (owned.length === 0) {
      host.insertChild(
        gemsLabel(I18n.textRef("MOD_NOMODS"), { color: GemsTheme.textDim }),
      );
    } else {
      for (let i = 0; i < owned.length; i++) {
        host.insertChild(
          WeaponModUI._availableRow(scene, inv, slot, owned[i], sockets),
        );
      }
    }
  },

  _statLine(labelKey, value) {
    const row = new UIElement({
      width: "100%",
      height: 20,
      flexDirection: "row",
      alignItems: "center",
    });
    const nameCell = new UIElement({ flexGrow: 1, flexBasis: 0 });
    nameCell.insertChild(
      gemsLabel(I18n.textRef(labelKey), { color: GemsTheme.text }),
    );
    row.insertChild(nameCell);
    row.insertChild(gemsLabel(string(value), { color: GemsTheme.text }));
    return row;
  },

  // One installed-mod row: name + a Remove button that refunds the mod item.
  _installedRow(scene, slot, idx) {
    const modId = slot.mods[idx];
    const m = Item.get(modId);
    const nm = m !== undefined ? I18n.text(m.name) : modId;
    const row = new UIElement({
      width: "100%",
      height: 28,
      flexDirection: "row",
      alignItems: "center",
      gap: GemsTheme.gapSm,
    });
    const nameCell = new UIElement({ flexGrow: 1, flexBasis: 0 });
    nameCell.insertChild(
      gemsLabel(nm, { color: RpgWorldOverlay._rarityColor(modId) }),
    );
    row.insertChild(nameCell);
    row.insertChild(
      gemsButton(
        I18n.textRef("MOD_REMOVE"),
        () => WeaponModUI._remove(scene, slot, modId),
        {
          width: 90,
          height: 24,
        },
      ),
    );
    return row;
  },

  // One available-mod row: name x count + an Install button (disabled when no free socket / unowned).
  _availableRow(scene, inv, slot, modId, sockets) {
    const m = Item.get(modId);
    const nm = m !== undefined ? I18n.text(m.name) : modId;
    const count = InventorySystem.count(inv, modId);
    const row = new UIElement({
      width: "100%",
      height: 28,
      flexDirection: "row",
      alignItems: "center",
      gap: GemsTheme.gapSm,
    });
    const nameCell = new UIElement({ flexGrow: 1, flexBasis: 0 });
    nameCell.insertChild(
      gemsLabel(nm + " x" + count, {
        color: RpgWorldOverlay._rarityColor(modId),
      }),
    );
    row.insertChild(nameCell);
    row.insertChild(
      gemsButton(
        I18n.textRef("MOD_INSTALL"),
        () => WeaponModUI._install(scene, slot, modId),
        {
          width: 90,
          height: 24,
          primary: true,
          // Live gate: no free socket, or the player no longer owns one to install.
          disabled: () =>
            slot.mods.length >= sockets || !InventorySystem.has(inv, modId, 1),
        },
      ),
    );
    return row;
  },

  // Distinct itemIds of owned WeaponMod items (in slot order; counts read live in the row).
  _ownedMods(inv) {
    const out = [];
    const seen = {};
    if (inv === undefined) return out;
    for (let i = 0; i < inv.slots.length; i++) {
      const id = inv.slots[i].itemId;
      if (seen[id]) continue;
      const it = Item.get(id);
      if (it !== undefined && it.hasComponent(WeaponMod)) {
        seen[id] = true;
        out.push(id);
      }
    }
    return out;
  },

  // Install modId into the weapon instance: consume one mod item, record it, re-derive Stats.
  _install(scene, slot, modId) {
    const inv = scene.world.get(Inventory, scene.ctrl.id);
    const it = Item.get(slot.itemId);
    const wpn = it !== undefined ? it.getComponent(Weapon) : undefined;
    const sockets = wpn !== undefined ? wpn.sockets : 0;
    if (slot.mods.length >= sockets) return; // no free socket
    if (InventorySystem.remove(inv, modId, 1) < 1) return; // not owned
    slot.mods.push(modId);
    StatModel.recompute(scene.world, scene.ctrl.id); // a mod may grant Stats
    scene._modDirty = true;
    scene._invDirty = true; // weapon's "+N" / stats changed — sync the bag window if open
    Log.info(`installed ${modId} on ${slot.itemId}`);
  },

  // Remove modId from the weapon instance: refund the mod item, re-derive Stats.
  _remove(scene, slot, modId) {
    const i = slot.mods.indexOf(modId);
    if (i < 0) return;
    slot.mods.splice(i, 1);
    const inv = scene.world.get(Inventory, scene.ctrl.id);
    InventorySystem.add(inv, modId, 1); // refund
    StatModel.recompute(scene.world, scene.ctrl.id);
    scene._modDirty = true;
    scene._invDirty = true;
    Log.info(`removed ${modId} from ${slot.itemId}`);
  },
};
