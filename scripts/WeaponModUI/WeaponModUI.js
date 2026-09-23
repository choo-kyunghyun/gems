/**
 * Weapon-attachment panel of the workbench: a master-detail over the player's weapon instances
 * (each a unique slot with a uid, a `mods` map { slotId -> attachmentItemId } and, for a gun, a
 * loaded `ammo` itemId + `rounds`). Install/remove re-derive Stats, since an attachment may grant
 * them, and every edit marks the window dirty to repopulate. Ammo actions target the selected
 * instance, which need not be equipped.
 */
globalThis.WeaponModUI = {
  /** The page that hosts the panel owns open/close. */
  buildPanel(listHost, detailHost) {
    return {
      sel: "", // selected weapon instance uid (defaulted to the first on refresh)
      list: listHost,
      detail: detailHost,
    };
  },

  /** Rebuild both panes; a selection no longer owned falls back to the first weapon. */
  refresh(scene, panel) {
    const inv = scene.level.entities.get(scene.playerId, Inventory);
    const weapons = WeaponModUI._weaponInstances(inv);
    if (weapons.length > 0 && !WeaponModUI._hasUid(weapons, panel.sel))
      panel.sel = weapons[0].uid;
    WeaponModUI._fillList(scene, panel, inv, weapons);
    WeaponModUI._fillDetail(scene, panel, inv, weapons);
  },

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

  _modCount(slot) {
    let n = 0;
    if (slot.mods !== undefined) for (const slotId in slot.mods) n++;
    return n;
  },

  /** An array-shaped `mods` is discarded. */
  _ensureMap(slot) {
    if (slot.mods === undefined) slot.mods = {};
    else if (slot.mods.length !== undefined) slot.mods = {};
  },

  /** "+N" counts filled slots; "[E]" marks the equipped instance. */
  _fillList(scene, panel, inv, weapons) {
    const equippedUid = scene.level.entities.require(scene.playerId, Equipment).slots.weapon;
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
          panel.sel = uid;
          scene.window.dirty = true;
        },
        selected: () => panel.sel === uid,
        textColor: InvTable.rarityColor(slot.itemId),
        icon: it !== undefined ? it.sprite : -1,
      });
    }
    facetFillList(panel.list, entries, I18n.textRef("MOD_EMPTY"));
  },

  /** Unclipped: the host card has room for a fully-stuffed gun. */
  _fillDetail(scene, panel, inv, weapons) {
    const host = panel.detail;
    facetClear(host);

    if (weapons.length === 0) {
      host.insertChild(
        facetLabel(I18n.textRef("MOD_SELECT"), { color: FacetTheme.textDim }),
      );
      return;
    }
    let slot;
    for (let i = 0; i < weapons.length; i++)
      if (weapons[i].uid === panel.sel) slot = weapons[i];
    if (slot === undefined) return;
    WeaponModUI._ensureMap(slot);

    const it = Item.get(slot.itemId);
    const wpn = it !== undefined ? it.getComponent(Weapon) : undefined;
    const gun = it !== undefined ? it.getComponent(Gun) : undefined;
    if (wpn === undefined) return;
    const prof = Loadout.composeWeapon(slot);

    host.insertChild(
      facetRichText(
        WorldOverlay.iconTag(slot.itemId) +
          (it !== undefined ? I18n.text(it.name) : slot.itemId),
        {
          font: "header",
          color: InvTable.rarityColor(slot.itemId),
        },
      ),
    );
    const maker = it !== undefined ? Manufacturer.get(it.maker) : undefined;
    if (maker !== undefined)
      host.insertChild(
        facetLabel(I18n.textRef(maker.name), {
          font: "description",
          color: maker.color,
        }),
      );
    host.insertChild(facetDivider());

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
      if (prof.hitbox !== undefined)
        host.insertChild(
          WeaponModUI._statRow2("MOD_REACH", Melee.reach(prof.hitbox), null, 0),
        );
    }
    host.insertChild(facetDivider());

    if (gun !== undefined)
      WeaponModUI._fillAmmo(scene, panel, inv, slot, gun, prof);

    host.insertChild(
      facetLabel(I18n.textRef("MOD_SLOTS"), { color: FacetTheme.textMuted }),
    );
    for (let i = 0; i < wpn.slots.length; i++)
      host.insertChild(WeaponModUI._slotRow(scene, slot, wpn.slots[i]));
    host.insertChild(facetDivider());

    host.insertChild(
      facetLabel(I18n.textRef("MOD_AVAILABLE"), {
        color: FacetTheme.textMuted,
      }),
    );
    const owned = WeaponModUI._compatibleMods(inv, wpn);
    if (owned.length === 0) {
      host.insertChild(
        facetLabel(I18n.textRef("MOD_NOMODS"), { color: FacetTheme.textDim }),
      );
    } else {
      for (let i = 0; i < owned.length; i++)
        host.insertChild(
          WeaponModUI._availableRow(scene, inv, slot, wpn, owned[i]),
        );
    }
  },

  _fillAmmo(scene, panel, inv, slot, gun, prof) {
    const host = panel.detail;
    host.insertChild(
      facetLabel(I18n.textRef("MOD_AMMO"), { color: FacetTheme.textMuted }),
    );
    if (prof.noAmmo) {
      host.insertChild(
        facetLabel(I18n.textRef("MOD_UNLOADED"), { color: FacetTheme.textDim }),
      );
    } else {
      const ammoIt = Item.get(slot.ammo);
      const nm = ammoIt !== undefined ? I18n.text(ammoIt.name) : slot.ammo;
      host.insertChild(
        WeaponModUI._kvRow(
          nm,
          slot.rounds + "/" + prof.magazine,
          InvTable.rarityColor(slot.ammo),
        ),
      );
    }
    host.insertChild(
      facetButton(
        I18n.textRef("MOD_RELOAD"),
        () => {
          Loadout.reloadSlot(inv, slot);
          scene.window.dirty = true;
        },
        {
          height: 26,
          disabled: () =>
            prof.noAmmo ||
            slot.rounds >= prof.magazine ||
            !Bag.has(inv, slot.ammo, 1),
        },
      ),
    );
    const ammo = WeaponModUI._ownedAmmo(inv, gun.caliber);
    if (ammo.length === 0) {
      host.insertChild(
        facetLabel(I18n.textRef("MOD_NO_AMMO"), { color: FacetTheme.textDim }),
      );
    } else {
      for (let i = 0; i < ammo.length; i++)
        host.insertChild(WeaponModUI._ammoRow(scene, inv, slot, ammo[i]));
    }
    host.insertChild(facetDivider());
  },

  _ammoRow(scene, inv, slot, ammoId) {
    const it = Item.get(ammoId);
    const nm = it !== undefined ? I18n.text(it.name) : ammoId;
    const count = Bag.count(inv, ammoId);
    const row = WeaponModUI._row(28);
    const cell = new UIElement({ flexGrow: 1, flexBasis: 0 });
    cell.insertChild(
      facetRichText(WorldOverlay.iconTag(ammoId) + nm + " x" + count, {
        color: InvTable.rarityColor(ammoId),
      }),
    );
    row.insertChild(cell);
    row.insertChild(
      facetButton(
        I18n.textRef("MOD_LOAD"),
        () => {
          Loadout.loadAmmoSlot(inv, slot, ammoId);
          scene.window.dirty = true;
        },
        {
          width: 90,
          height: 24,
          primary: true,
          selected: () => slot.ammo === ammoId,
          // A top-up of the loaded type stays allowed with no reserve.
          disabled: () =>
            slot.ammo !== ammoId && !Bag.has(inv, ammoId, 1),
        },
      ),
    );
    return row;
  },

  _slotRow(scene, slot, slotDef) {
    const installed = slot.mods[slotDef.id];
    const catLabel = I18n.text(WeaponModUI._slotLabelKey(slotDef.accepts));
    const row = WeaponModUI._row(28);
    const cell = new UIElement({ flexGrow: 1, flexBasis: 0 });
    if (installed !== undefined) {
      const it = Item.get(installed);
      const nm = it !== undefined ? I18n.text(it.name) : installed;
      cell.insertChild(
        facetRichText(WorldOverlay.iconTag(installed) + catLabel + ": " + nm, {
          color: InvTable.rarityColor(installed),
        }),
      );
      row.insertChild(cell);
      row.insertChild(
        facetButton(
          I18n.textRef("COMMON_REMOVE"),
          () => WeaponModUI._removeFrom(scene, slot, slotDef.id),
          { width: 90, height: 24 },
        ),
      );
    } else {
      cell.insertChild(
        facetLabel(catLabel + ": " + I18n.text("COMMON_EMPTY"), {
          color: FacetTheme.textDim,
        }),
      );
      row.insertChild(cell);
    }
    return row;
  },

  _availableRow(scene, inv, slot, wpn, modId) {
    const it = Item.get(modId);
    const nm = it !== undefined ? I18n.text(it.name) : modId;
    const count = Bag.count(inv, modId);
    const row = WeaponModUI._row(28);
    const cell = new UIElement({ flexGrow: 1, flexBasis: 0 });
    cell.insertChild(
      facetRichText(WorldOverlay.iconTag(modId) + nm + " x" + count, {
        color: InvTable.rarityColor(modId),
      }),
    );
    row.insertChild(cell);
    row.insertChild(
      facetButton(
        I18n.textRef("COMMON_INSTALL"),
        () => WeaponModUI._installFirst(scene, slot, wpn, modId),
        {
          width: 90,
          height: 24,
          primary: true,
          disabled: () =>
            WeaponModUI._targetSlot(wpn, slot, modId) === undefined ||
            !Bag.has(inv, modId, 1),
        },
      ),
    );
    return row;
  },

  /** The first empty slot id accepting the attachment's category, or undefined. */
  _targetSlot(wpn, slot, modId) {
    const it = Item.get(modId);
    const wm = it !== undefined ? it.getComponent(WeaponMod) : undefined;
    if (wm === undefined) return undefined;
    for (let i = 0; i < wpn.slots.length; i++) {
      const sd = wpn.slots[i];
      if (slot.mods[sd.id] !== undefined) continue;
      if (sd.accepts === wm.slot || sd.accepts === "*") return sd.id;
    }
    return undefined;
  },

  /** Consumes one owned attachment. */
  _installFirst(scene, slot, wpn, modId) {
    const slotId = WeaponModUI._targetSlot(wpn, slot, modId);
    if (slotId === undefined) return;
    const inv = scene.level.entities.get(scene.playerId, Inventory);
    if (Bag.remove(inv, modId, 1) < 1) return;
    slot.mods[slotId] = modId;
    StatModel.recompute(scene.level.entities, scene.playerId);
    scene.window.dirty = true;
    Log.info(`installed ${modId} into ${slotId} on ${slot.itemId}`);
  },

  /** Refunds the attachment to the inventory. */
  _removeFrom(scene, slot, slotId) {
    const modId = slot.mods[slotId];
    if (modId === undefined) return;
    delete slot.mods[slotId];
    const inv = scene.level.entities.get(scene.playerId, Inventory);
    Bag.add(inv, modId, 1);
    StatModel.recompute(scene.level.entities, scene.playerId);
    scene.window.dirty = true;
    Log.info(`removed ${modId} from ${slotId} on ${slot.itemId}`);
  },

  /** Distinct owned ammo itemIds of `caliber`, in slot order. */
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

  /** Distinct owned attachment itemIds that fit one of the weapon's slots. */
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

  _row(h) {
    return new UIElement({
      width: "100%",
      height: h,
      flexDirection: "row",
      alignItems: "center",
      gap: FacetTheme.gapSm,
    });
  },

  /** `rk` null leaves the right cell blank. */
  _statRow2(lk, lv, rk, rv) {
    const row = new UIElement({
      width: "100%",
      height: 20,
      flexDirection: "row",
      alignItems: "center",
      gap: FacetTheme.gap,
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
    return facetKeyValueRow(
      I18n.textRef(labelKey),
      string(value === undefined ? "-" : value),
      { grow: true, labelColor: FacetTheme.text },
    );
  },

  /** `left` is literal text, not an i18n key. */
  _kvRow(left, right, leftColor) {
    return facetKeyValueRow(left, string(right), {
      height: 20,
      gap: FacetTheme.gapSm,
      labelColor: leftColor === undefined ? FacetTheme.text : leftColor,
    });
  },
};
