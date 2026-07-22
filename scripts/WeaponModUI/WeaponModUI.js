// Weapon-attachment PANEL — the install/remove view of the WORKBENCH (the Toolkit module). owns no
// window: CraftingUI builds the master-detail hosts and calls buildPanel()/refresh(). master-detail
// over the player's WEAPON INSTANCES (each a unique slot with a uid + inline `mods` MAP
// { slotId -> attachmentItemId }, plus, for a gun, a loaded `ammo` itemId + `rounds`):
//   • LEFT  — owned weapon instances; click to select (by uid). "+N" = filled slots, "[E]" = equipped.
//   • RIGHT — composed stats (composeWeapon), an AMMO section for a gun (loaded type + clip + Reload +
//             a Load picker), the weapon's named attachment slots (installed + Remove, or "(empty)"),
//             and compatible owned attachments to Install.
// install/remove re-derive Stats (an attachment may grant them) via StatModel.recompute and mark the
// workbench dirty. ammo Load/Reload act on the SELECTED instance's slot (may not be equipped), via *Slot.
// state on level: _modSel, _modList / _modDetail. columns are PLAIN (no gpu_set_scissor clip —
// unreliable in a master-detail row on GMRT 0.20; see CraftingUI's comment).
globalThis.WeaponModUI = {
  // record the hosts CraftingUI built + init selection (the workbench owns open/close).
  buildPanel(level, listHost, detailHost) {
    level._modSel = ""; // selected weapon instance uid (defaulted to the first on refresh)
    level._modList = listHost;
    level._modDetail = detailHost;
  },

  // rebuild both panels, ensuring a valid selection (default to the first weapon; reset if the
  // selected uid is no longer owned).
  refresh(level) {
    const inv = level.entities.get(Inventory, level.playerId);
    const weapons = WeaponModUI._weaponInstances(inv);
    if (weapons.length > 0 && !WeaponModUI._hasUid(weapons, level._modSel))
      level._modSel = weapons[0].uid;
    WeaponModUI._fillList(level, inv, weapons);
    WeaponModUI._fillDetail(level, inv, weapons);
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

  // filled attachment slots on an instance (its `mods` MAP). for...in is GMRT-safe.
  _modCount(slot) {
    let n = 0;
    if (slot.mods !== undefined) for (const slotId in slot.mods) n++;
    return n;
  },

  // ensure a slot's `mods` is a MAP (tolerate a {} or a stale pre-overhaul array).
  _ensureMap(slot) {
    if (slot.mods === undefined) slot.mods = {};
    else if (slot.mods.length !== undefined) slot.mods = {}; // old array → reset to a map
  },

  // Left: one selectable button per weapon instance (name "+N", "[E]" when equipped),
  // refilled via the shared gemsFillList.
  _fillList(level, inv, weapons) {
    const eq = level.entities.get(Equipment, level.playerId);
    const equippedUid = eq !== undefined ? eq.slots.weapon : "";
    const entries = [];
    for (let i = 0; i < weapons.length; i++) {
      const slot = weapons[i];
      const uid = slot.uid;
      const it = Item.get(slot.itemId);
      const base = it !== undefined ? I18n.text(it.name) : slot.itemId;
      const n = WeaponModUI._modCount(slot);
      let label = n > 0 ? base + " +" + n : base;
      if (uid === equippedUid) label += "  [E]";
      entries.push({
        label,
        onPick: () => {
          level._modSel = uid;
          level._craftDirty = true; // workbench repopulates the panel
        },
        selected: () => level._modSel === uid,
        textColor: RpgWorldOverlay._rarityColor(slot.itemId),
        icon: it !== undefined ? it.sprite : -1,
      });
    }
    gemsFillList(level._modList, entries, I18n.textRef("MOD_EMPTY"));
  },

  // Right: composed stats, ammo (gun), named attachment slots, install picker. PLAIN (no clip);
  // the panel stacks within the near-fullscreen workbench card (ample room for a fully-stuffed gun).
  _fillDetail(level, inv, weapons) {
    const host = level._modDetail;
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
      if (weapons[i].uid === level._modSel) slot = weapons[i];
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
    // maker line: company name in brand color (unbranded weapons have none)
    const maker = it !== undefined ? Manufacturer.get(it.maker) : undefined;
    if (maker !== undefined)
      host.insertChild(
        gemsLabel(I18n.textRef(maker.name), {
          font: "description",
          color: maker.color,
        }),
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
    if (gun !== undefined) WeaponModUI._fillAmmo(level, inv, slot, gun, prof);

    // Named attachment slots — one row each.
    host.insertChild(
      gemsLabel(I18n.textRef("MOD_SLOTS"), { color: GemsTheme.textMuted }),
    );
    for (let i = 0; i < wpn.slots.length; i++)
      host.insertChild(WeaponModUI._slotRow(level, slot, wpn.slots[i]));
    host.insertChild(gemsDivider());

    // owned compatible attachments, each Install into the first matching empty slot.
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
          WeaponModUI._availableRow(level, inv, slot, wpn, owned[i]),
        );
    }
  },

  // gun ammo block: loaded type + clip, a Reload button, a Load picker of compatible ammo.
  _fillAmmo(level, inv, slot, gun, prof) {
    const host = level._modDetail;
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
          level._craftDirty = true;
          level._invDirty = true;
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
        host.insertChild(WeaponModUI._ammoRow(level, inv, slot, ammo[i]));
    }
    host.insertChild(gemsDivider());
  },

  // owned-ammo row: name x count + Load (loads/tops up the selected gun's magazine).
  _ammoRow(level, inv, slot, ammoId) {
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
          level._craftDirty = true;
          level._invDirty = true;
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

  // named-slot row: "[Category]: AttachmentName" + Remove, or "[Category]: (empty)".
  _slotRow(level, slot, slotDef) {
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
          () => WeaponModUI._removeFrom(level, slot, slotDef.id),
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

  // available-attachment row: name x count + Install (into the first matching empty slot).
  _availableRow(level, inv, slot, wpn, modId) {
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
        () => WeaponModUI._installFirst(level, slot, wpn, modId),
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

  // first empty slot id that accepts this attachment's category, or undefined.
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

  // install modId into the first matching empty slot: consume one, record it, re-derive Stats.
  _installFirst(level, slot, wpn, modId) {
    const slotId = WeaponModUI._targetSlot(wpn, slot, modId);
    if (slotId === undefined) return; // no matching empty slot
    const inv = level.entities.get(Inventory, level.playerId);
    if (InventorySystem.remove(inv, modId, 1) < 1) return; // not owned
    slot.mods[slotId] = modId;
    StatModel.recompute(level.entities, level.playerId); // an attachment may grant Stats
    level._craftDirty = true;
    level._invDirty = true;
    Log.info(`installed ${modId} into ${slotId} on ${slot.itemId}`);
  },

  // remove the attachment in slot id: refund it, re-derive Stats.
  _removeFrom(level, slot, slotId) {
    const modId = slot.mods[slotId];
    if (modId === undefined) return;
    delete slot.mods[slotId];
    const inv = level.entities.get(Inventory, level.playerId);
    InventorySystem.add(inv, modId, 1); // refund
    StatModel.recompute(level.entities, level.playerId);
    level._craftDirty = true;
    level._invDirty = true;
    Log.info(`removed ${modId} from ${slotId} on ${slot.itemId}`);
  },

  // distinct itemIds of owned Ammo items of `caliber` (in slot order).
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

  // distinct itemIds of owned WeaponMod items whose category fits one of this weapon's slots.
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

  // small layout helpers
  _row(h) {
    return new UIElement({
      width: "100%",
      height: h,
      flexDirection: "row",
      alignItems: "center",
      gap: GemsTheme.gapSm,
    });
  },

  // row of two label:value stat cells (rk null → only the left cell).
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

  // one label:value CELL (two pack side-by-side per _statRow2) — gemsKeyValueRow grow mode.
  _statCell(labelKey, value) {
    return gemsKeyValueRow(
      I18n.textRef(labelKey),
      string(value === undefined ? "-" : value),
      { grow: true, labelColor: GemsTheme.text },
    );
  },

  // label:value row with a literal left string (e.g. a loaded-ammo name) + its color.
  _kvRow(left, right, leftColor) {
    return gemsKeyValueRow(left, string(right), {
      height: 20,
      gap: GemsTheme.gapSm,
      labelColor: leftColor === undefined ? GemsTheme.text : leftColor,
    });
  },
};
