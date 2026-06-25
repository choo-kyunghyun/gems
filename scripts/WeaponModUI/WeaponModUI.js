// Weapon-ATTACHMENT PANEL — the install/remove view of the WORKBENCH (the Toolkit module switches the
// bench into this mode; there is no standalone Anvil). It does NOT own a window: CraftingUI (the
// workbench window) creates the master-detail hosts and calls buildPanel()/refresh(). A master-detail
// over the player's WEAPON INSTANCES (the definition-vs-instance split: each weapon is a unique
// inventory slot with a uid + an inline `mods` MAP { slotId -> attachmentItemId } of installed
// attachments, plus, for a gun, a loaded `ammo` itemId + `rounds`):
//   • LEFT  — a list of owned weapon instances; click one to select it (by uid). Shows "+N" (filled
//             attachment slots) and an "[E]" marker when it's the equipped weapon.
//   • RIGHT — the selected weapon's COMPOSED stats (EquipmentSystem.composeWeapon): a melee weapon
//             shows damage/reach/fireCd; a GUN shows power/velocity/mass/penetration/fireCd/magazine
//             plus an AMMO section (loaded type + clip rounds/magazine + Reload + a Load picker of
//             owned caliber-compatible Ammo). Then the weapon's NAMED attachment slots (one row each —
//             the installed attachment + Remove, or "(empty)"), and the owned attachments compatible
//             with this weapon, each Install into the first matching empty slot.
// Installing consumes one attachment item and records it under a slot id; removing refunds it. Both
// re-derive the wearer's Stats (an attachment can grant Stats) via StatModel.recompute and mark the
// WORKBENCH dirty (scene._craftDirty) so the panel repopulates. Ammo Load/Reload operate on the
// SELECTED instance's slot directly (it may not be the equipped one), via the *Slot helpers.
//
// State on the SCENE: _modSel (selected weapon uid), _modList / _modDetail (the hosts CraftingUI
// gives it). Like CraftingUI the columns are PLAIN (no gpu_set_scissor clip — unreliable in a
// master-detail row on GMRT 0.20; see CraftingUI's long comment), so overrun is revealed by resizing.
//
// Scene contract: scene.world, scene.ctrl.id (player), scene._craftDirty, scene._invDirty.
globalThis.WeaponModUI = {
  // Record the host elements CraftingUI built for the attachment panel + init selection. No window of
  // its own — the workbench owns open/close (it toggles this panel's enabled state by module).
  buildPanel(scene, listHost, detailHost) {
    scene._modSel = ""; // selected weapon instance uid (defaulted to the first on refresh)
    scene._modList = listHost;
    scene._modDetail = detailHost;
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

  // Number of filled attachment slots on an instance (its `mods` MAP). for...in is GMRT-safe.
  _modCount(slot) {
    let n = 0;
    if (slot.mods !== undefined) for (const slotId in slot.mods) n++;
    return n;
  },

  // Defensive: ensure a slot's `mods` is a MAP (tolerate a freshly-minted {} or a stale pre-overhaul
  // array). Accessing `.length` is guarded behind an undefined check (undefined.length would throw).
  _ensureMap(slot) {
    if (slot.mods === undefined) slot.mods = {};
    else if (slot.mods.length !== undefined) slot.mods = {}; // old array → reset to a map
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
    const n = WeaponModUI._modCount(slot);
    let label = n > 0 ? base + " +" + n : base;
    if (uid === equippedUid) label += "  [E]";
    return gemsButton(
      label,
      () => {
        scene._modSel = uid;
        scene._craftDirty = true; // the workbench repopulates the active (attachment) panel
      },
      {
        height: 32,
        selected: () => scene._modSel === uid,
        textColor: RpgWorldOverlay._rarityColor(slot.itemId),
        icon: it !== undefined ? it.sprite : -1,
      },
    );
  },

  // Right: the selected weapon's composed stats, ammo (gun), named attachment slots, and the install
  // picker. PLAIN (no clip), so overrun is revealed by resizing — CraftingUI.LIST_H is sized to fit a
  // fully-stuffed gun.
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
    WeaponModUI._ensureMap(slot);

    const it = Item.get(slot.itemId);
    const wpn = it !== undefined ? it.getComponent(Weapon) : undefined;
    const gun = it !== undefined ? it.getComponent(Gun) : undefined;
    if (wpn === undefined) return;
    const prof = EquipmentSystem.composeWeapon(slot);

    host.insertChild(
      gemsRichText(
        RpgWorldOverlay.iconTag(slot.itemId) +
          (it !== undefined ? I18n.text(it.name) : slot.itemId),
        {
          font: "header",
          color: RpgWorldOverlay._rarityColor(slot.itemId),
        },
      ),
    );
    host.insertChild(gemsDivider());

    // Composed stats, laid out 2-up to stay compact.
    if (gun !== undefined) {
      host.insertChild(
        WeaponModUI._statRow2(
          "MOD_POWER",
          Math.round(prof.power),
          "MOD_VELOCITY",
          Math.round(prof.velocity),
        ),
      );
      host.insertChild(
        WeaponModUI._statRow2(
          "MOD_MASS",
          Math.round(prof.mass),
          "MOD_PEN",
          prof.penetration,
        ),
      );
      host.insertChild(
        WeaponModUI._statRow2(
          "MOD_FIRECD",
          prof.fireCd,
          "MOD_MAG",
          prof.magazine,
        ),
      );
    } else {
      host.insertChild(
        WeaponModUI._statRow2(
          "MOD_DMG",
          Math.round(prof.damage),
          "MOD_FIRECD",
          prof.fireCd,
        ),
      );
      host.insertChild(WeaponModUI._statRow2("MOD_REACH", prof.reach, null, 0));
    }
    host.insertChild(gemsDivider());

    // Ammo section (gun only).
    if (gun !== undefined) WeaponModUI._fillAmmo(scene, inv, slot, gun, prof);

    // Named attachment slots — one row each.
    host.insertChild(
      gemsLabel(I18n.textRef("MOD_SLOTS"), { color: GemsTheme.textMuted }),
    );
    for (let i = 0; i < wpn.slots.length; i++)
      host.insertChild(WeaponModUI._slotRow(scene, slot, wpn.slots[i]));
    host.insertChild(gemsDivider());

    // Owned attachments compatible with THIS weapon's slots, each Install into the first matching
    // empty slot (gated live by a free matching slot + ownership).
    host.insertChild(
      gemsLabel(I18n.textRef("MOD_AVAILABLE"), { color: GemsTheme.textMuted }),
    );
    const owned = WeaponModUI._compatibleMods(inv, wpn);
    if (owned.length === 0) {
      host.insertChild(
        gemsLabel(I18n.textRef("MOD_NOMODS"), { color: GemsTheme.textDim }),
      );
    } else {
      for (let i = 0; i < owned.length; i++)
        host.insertChild(
          WeaponModUI._availableRow(scene, inv, slot, wpn, owned[i]),
        );
    }
  },

  // The gun ammo block: loaded type + clip, a Reload button, and a Load picker of compatible ammo.
  _fillAmmo(scene, inv, slot, gun, prof) {
    const host = scene._modDetail;
    host.insertChild(
      gemsLabel(I18n.textRef("MOD_AMMO"), { color: GemsTheme.textMuted }),
    );
    if (prof.noAmmo) {
      host.insertChild(
        gemsLabel(I18n.textRef("MOD_UNLOADED"), { color: GemsTheme.textDim }),
      );
    } else {
      const ammoIt = Item.get(slot.ammo);
      const nm = ammoIt !== undefined ? I18n.text(ammoIt.name) : slot.ammo;
      host.insertChild(
        WeaponModUI._kvRow(
          nm,
          slot.rounds + "/" + prof.magazine,
          RpgWorldOverlay._rarityColor(slot.ammo),
        ),
      );
    }
    host.insertChild(
      gemsButton(
        I18n.textRef("MOD_RELOAD"),
        () => {
          EquipmentSystem.reloadSlot(inv, slot);
          scene._craftDirty = true;
          scene._invDirty = true;
        },
        {
          height: 26,
          // live: nothing loaded, clip already full, or no reserve of the loaded ammo
          disabled: () =>
            prof.noAmmo ||
            slot.rounds >= prof.magazine ||
            !InventorySystem.has(inv, slot.ammo, 1),
        },
      ),
    );
    const ammo = WeaponModUI._ownedAmmo(inv, gun.caliber);
    if (ammo.length === 0) {
      host.insertChild(
        gemsLabel(I18n.textRef("MOD_NO_AMMO"), { color: GemsTheme.textDim }),
      );
    } else {
      for (let i = 0; i < ammo.length; i++)
        host.insertChild(WeaponModUI._ammoRow(scene, inv, slot, ammo[i]));
    }
    host.insertChild(gemsDivider());
  },

  // One owned-ammo row: name x count + a Load button (loads/tops up the selected gun's magazine).
  _ammoRow(scene, inv, slot, ammoId) {
    const it = Item.get(ammoId);
    const nm = it !== undefined ? I18n.text(it.name) : ammoId;
    const count = InventorySystem.count(inv, ammoId);
    const row = WeaponModUI._row(28);
    const cell = new UIElement({ flexGrow: 1, flexBasis: 0 });
    cell.insertChild(
      gemsRichText(RpgWorldOverlay.iconTag(ammoId) + nm + " x" + count, {
        color: RpgWorldOverlay._rarityColor(ammoId),
      }),
    );
    row.insertChild(cell);
    row.insertChild(
      gemsButton(
        I18n.textRef("MOD_LOAD"),
        () => {
          EquipmentSystem.loadAmmoSlot(inv, slot, ammoId);
          scene._craftDirty = true;
          scene._invDirty = true;
        },
        {
          width: 90,
          height: 24,
          primary: true,
          selected: () => slot.ammo === ammoId,
          // can't load a type you no longer own (but a top-up of the current type is always allowed)
          disabled: () =>
            slot.ammo !== ammoId && !InventorySystem.has(inv, ammoId, 1),
        },
      ),
    );
    return row;
  },

  // One named-slot row: "[Category]: AttachmentName" + Remove, or "[Category]: (empty)".
  _slotRow(scene, slot, slotDef) {
    const installed = slot.mods[slotDef.id]; // attachment itemId, or undefined when empty
    const catLabel = I18n.text(WeaponModUI._slotLabelKey(slotDef.accepts));
    const row = WeaponModUI._row(28);
    const cell = new UIElement({ flexGrow: 1, flexBasis: 0 });
    if (installed !== undefined) {
      const it = Item.get(installed);
      const nm = it !== undefined ? I18n.text(it.name) : installed;
      cell.insertChild(
        gemsRichText(
          RpgWorldOverlay.iconTag(installed) + catLabel + ": " + nm,
          {
            color: RpgWorldOverlay._rarityColor(installed),
          },
        ),
      );
      row.insertChild(cell);
      row.insertChild(
        gemsButton(
          I18n.textRef("MOD_REMOVE"),
          () => WeaponModUI._removeFrom(scene, slot, slotDef.id),
          { width: 90, height: 24 },
        ),
      );
    } else {
      cell.insertChild(
        gemsLabel(catLabel + ": " + I18n.text("MOD_EMPTY_SLOT"), {
          color: GemsTheme.textDim,
        }),
      );
      row.insertChild(cell);
    }
    return row;
  },

  // One available-attachment row: name x count + Install (into the first matching empty slot).
  _availableRow(scene, inv, slot, wpn, modId) {
    const it = Item.get(modId);
    const nm = it !== undefined ? I18n.text(it.name) : modId;
    const count = InventorySystem.count(inv, modId);
    const row = WeaponModUI._row(28);
    const cell = new UIElement({ flexGrow: 1, flexBasis: 0 });
    cell.insertChild(
      gemsRichText(RpgWorldOverlay.iconTag(modId) + nm + " x" + count, {
        color: RpgWorldOverlay._rarityColor(modId),
      }),
    );
    row.insertChild(cell);
    row.insertChild(
      gemsButton(
        I18n.textRef("MOD_INSTALL"),
        () => WeaponModUI._installFirst(scene, slot, wpn, modId),
        {
          width: 90,
          height: 24,
          primary: true,
          // live: no matching empty slot left, or the player no longer owns one to install
          disabled: () =>
            WeaponModUI._targetSlot(wpn, slot, modId) === undefined ||
            !InventorySystem.has(inv, modId, 1),
        },
      ),
    );
    return row;
  },

  // The first declared slot id that's empty AND accepts this attachment's category, or undefined.
  _targetSlot(wpn, slot, modId) {
    const it = Item.get(modId);
    const wm = it !== undefined ? it.getComponent(WeaponMod) : undefined;
    if (wm === undefined) return undefined;
    for (let i = 0; i < wpn.slots.length; i++) {
      const sd = wpn.slots[i];
      if (slot.mods[sd.id] !== undefined) continue; // occupied
      if (sd.accepts === wm.slot || sd.accepts === "*") return sd.id;
    }
    return undefined;
  },

  // Install modId into the first matching empty slot: consume one, record it, re-derive Stats.
  _installFirst(scene, slot, wpn, modId) {
    const slotId = WeaponModUI._targetSlot(wpn, slot, modId);
    if (slotId === undefined) return; // no matching empty slot
    const inv = scene.world.get(Inventory, scene.ctrl.id);
    if (InventorySystem.remove(inv, modId, 1) < 1) return; // not owned
    slot.mods[slotId] = modId;
    StatModel.recompute(scene.world, scene.ctrl.id); // an attachment may grant Stats
    scene._craftDirty = true;
    scene._invDirty = true;
    Log.info(`installed ${modId} into ${slotId} on ${slot.itemId}`);
  },

  // Remove the attachment in slot id: refund it, re-derive Stats.
  _removeFrom(scene, slot, slotId) {
    const modId = slot.mods[slotId];
    if (modId === undefined) return;
    delete slot.mods[slotId];
    const inv = scene.world.get(Inventory, scene.ctrl.id);
    InventorySystem.add(inv, modId, 1); // refund
    StatModel.recompute(scene.world, scene.ctrl.id);
    scene._craftDirty = true;
    scene._invDirty = true;
    Log.info(`removed ${modId} from ${slotId} on ${slot.itemId}`);
  },

  // Distinct itemIds of owned Ammo items of `caliber` (in slot order; counts read live in the row).
  _ownedAmmo(inv, caliber) {
    const out = [];
    const seen = {};
    if (inv === undefined) return out;
    for (let i = 0; i < inv.slots.length; i++) {
      const id = inv.slots[i].itemId;
      if (seen[id]) continue;
      const it = Item.get(id);
      const am = it !== undefined ? it.getComponent(Ammo) : undefined;
      if (am !== undefined && am.caliber === caliber) {
        seen[id] = true;
        out.push(id);
      }
    }
    return out;
  },

  // Distinct itemIds of owned WeaponMod items whose category fits one of THIS weapon's slots.
  _compatibleMods(inv, wpn) {
    const out = [];
    const seen = {};
    if (inv === undefined) return out;
    for (let i = 0; i < inv.slots.length; i++) {
      const id = inv.slots[i].itemId;
      if (seen[id]) continue;
      const it = Item.get(id);
      const wm = it !== undefined ? it.getComponent(WeaponMod) : undefined;
      if (wm === undefined) continue;
      if (!WeaponModUI._weaponAccepts(wpn, wm.slot)) continue;
      seen[id] = true;
      out.push(id);
    }
    return out;
  },

  _weaponAccepts(wpn, category) {
    for (let i = 0; i < wpn.slots.length; i++)
      if (wpn.slots[i].accepts === category || wpn.slots[i].accepts === "*")
        return true;
    return false;
  },

  _slotLabelKey(cat) {
    if (cat === "scope") return "MOD_SLOT_SCOPE";
    if (cat === "barrel") return "MOD_SLOT_BARREL";
    if (cat === "magazine") return "MOD_SLOT_MAGAZINE";
    if (cat === "grip") return "MOD_SLOT_GRIP";
    if (cat === "muzzle") return "MOD_SLOT_MUZZLE";
    if (cat === "edge") return "MOD_SLOT_EDGE";
    if (cat === "pommel") return "MOD_SLOT_POMMEL";
    return "MOD_SLOT_GENERIC";
  },

  // ── small layout helpers ──
  _row(h) {
    return new UIElement({
      width: "100%",
      height: h,
      flexDirection: "row",
      alignItems: "center",
      gap: GemsTheme.gapSm,
    });
  },

  // A row of two label:value stat cells (rk null → only the left cell, right side blank).
  _statRow2(lk, lv, rk, rv) {
    const row = new UIElement({
      width: "100%",
      height: 20,
      flexDirection: "row",
      alignItems: "center",
      gap: GemsTheme.gap,
    });
    row.insertChild(WeaponModUI._statCell(lk, lv));
    row.insertChild(
      rk !== null
        ? WeaponModUI._statCell(rk, rv)
        : new UIElement({ flexGrow: 1, flexBasis: 0 }),
    );
    return row;
  },

  _statCell(labelKey, value) {
    const cell = new UIElement({
      flexGrow: 1,
      flexBasis: 0,
      flexDirection: "row",
      alignItems: "center",
    });
    const nameCell = new UIElement({ flexGrow: 1, flexBasis: 0 });
    nameCell.insertChild(
      gemsLabel(I18n.textRef(labelKey), { color: GemsTheme.text }),
    );
    cell.insertChild(nameCell);
    cell.insertChild(
      gemsLabel(string(value === undefined ? "-" : value), {
        color: GemsTheme.text,
      }),
    );
    return cell;
  },

  // A label:value row with a literal left string (e.g. a loaded-ammo name) + its color.
  _kvRow(left, right, leftColor) {
    const row = WeaponModUI._row(20);
    const cell = new UIElement({ flexGrow: 1, flexBasis: 0 });
    cell.insertChild(
      gemsLabel(left, {
        color: leftColor === undefined ? GemsTheme.text : leftColor,
      }),
    );
    row.insertChild(cell);
    row.insertChild(gemsLabel(string(right), { color: GemsTheme.text }));
    return row;
  },
};
