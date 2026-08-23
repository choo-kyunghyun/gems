/**
 * The doll: derives a humanoid's Appearance from its Equipment (`rebuild`, called by
 * EquipmentSystem and after a carried sheet lands via EntitySnapshot.apply) and pushes any
 * Appearance onto that entity's Spine puppet (`update`, once per frame after SkeletonSystem has
 * minted). No-op for entities without an Appearance — opt-in, skeletal humanoids only.
 *
 * Everything about WHERE gear goes is read, never declared: the rig says which slots are
 * dressable (the ones its setup pose leaves empty) and which bone each rides, the bone's setup
 * rotation comes off the skeleton, and a garment sits with its own SPRITE ORIGIN on that bone —
 * so placing a piece is an origin edit in the sprite editor, and a new rig or slot is nothing here.
 *
 * An Equippable shows on the doll when its `worn` names an existing sprite, and the WEAPON slot
 * needs no worn art at all: an unset `worn` falls back to the item's own icon in the hand slot,
 * so every weapon gets a held visual with zero dedicated art.
 */
globalThis.AppearanceSystem = {
  // Equipment slot -> spineHuman slot. ONLY these are derived; every other dress slot is
  // authored by a preset and rebuild leaves it alone.
  SLOT: {
    weapon: "primary",
    armor: "outer",
    backpack: "backpack",
    trinket: "hat",
  },

  // a held ITEM icon is cell-sized art, not body-sized — halve it so it reads as carried
  HELD: { primary: 0.5, secondary: 0.5 },

  // setting a slot to an UNKNOWN attachment name clears it; setting "" does not (docs/GMRT.md)
  BARE: "__bare",

  // skeleton sprite name -> its dress slots (see _rig); rig data never changes within a run
  _rigs: {},

  /** Re-derive the equipment-owned slots. Authored outfits (no Equipment) are left untouched. */
  rebuild(entities, id) {
    const ap = entities.get(id, Appearance);
    if (ap === undefined) return;
    const eq = entities.get(id, Equipment);
    const inv = entities.get(id, Inventory);
    if (eq === undefined || inv === undefined) return;
    for (const gear in AppearanceSystem.SLOT) {
      const slot = AppearanceSystem.SLOT[gear];
      ap.slots[slot] = AppearanceSystem._worn(inv, eq.slots[gear], gear);
    }
    ap.dirty = true;
  },

  /** Dress every puppet whose map changed — or whose puppet was re-minted under it. */
  update(entities) {
    entities.forEach([Appearance, Instance], (id, ap, held) => {
      if (!ap.dirty) return;
      AppearanceSystem.apply(entities, id, held.inst);
    });
  },

  /**
   * Push the whole map onto one puppet. EVERY dress slot is written: a slot that lost its item
   * has to be cleared, and re-creating an attachment just redefines it.
   */
  apply(entities, id, inst) {
    const ap = entities.get(id, Appearance);
    if (ap === undefined) return;
    const rig = AppearanceSystem._rig(inst);
    for (let i = 0; i < rig.length; i++) {
      const slot = rig[i];
      const spr = ap.slots[slot.name];
      if (spr === undefined || !sprite_exists(spr)) {
        inst.skeleton_attachment_set(slot.name, AppearanceSystem.BARE);
        continue;
      }
      AppearanceSystem._attach(inst, slot, spr);
    }
    ap.dirty = false;
  },

  /**
   * The dress slots of the puppet's rig, read off the skeleton once per sprite: every slot the
   * setup pose leaves EMPTY (the body parts are authored and stay), with `rot` — minus the setup
   * world rotation of the bone it rides — which every attachment on that bone carries to draw
   * upright (docs/GMRT.md).
   *
   * @returns {{name: string, rot: number}[]}
   */
  _rig(inst) {
    const key = sprite_get_name(inst.sprite_index);
    let rig = AppearanceSystem._rigs[key];
    if (rig !== undefined) return rig;
    rig = [];
    const list = ds_list_create();
    inst.skeleton_slot_data(inst.sprite_index, list);
    for (let i = 0; i < ds_list_size(list); i++) {
      const m = ds_list_find_value(list, i);
      if (ds_map_find_value(m, "attachment") === "(none)") {
        const bone = ds_map_find_value(m, "bone");
        rig.push({ name: ds_map_find_value(m, "name"), rot: -AppearanceSystem._angle(inst, bone) });
      }
      ds_map_destroy(m); // the manual: the per-slot maps are the caller's to free
    }
    ds_list_destroy(list);
    AppearanceSystem._rigs[key] = rig;
    return rig;
  },

  /** A bone's setup world rotation: its local angle plus every ancestor's, up to the root. */
  _angle(inst, bone) {
    let sum = 0;
    const m = ds_map_create();
    while (bone !== undefined && bone !== "") {
      ds_map_clear(m); // the root writes no `parent` — a stale one would loop forever
      inst.skeleton_bone_data_get(bone, m);
      sum += ds_map_find_value(m, "angle");
      bone = ds_map_find_value(m, "parent");
    }
    ds_map_destroy(m);
    return sum;
  },

  /**
   * Mount one sprite on one slot, its origin on the slot's bone. The origin args are bone-local
   * Spine coordinates, and the runtime centres the packer-TRIMMED rect there after subtracting
   * the trim in that same frame (docs/GMRT.md) — so give the trim back, then move the trimmed
   * centre onto the sprite's origin: an image-space vector, y flipped and turned by `rot` into
   * the bone frame, shrunk with the art. Every term is read off the sprite, so the art's authored
   * framing and origin are what the doll shows, trimmed or not.
   */
  _attach(inst, slot, spr) {
    // one name per (slot, sprite): the definition behind it never changes, so a redefine is a
    // no-op we can skip rather than a correctness risk
    const name = "a_" + slot.name + "_" + sprite_get_name(spr);
    if (inst.skeleton_attachment_get(slot.name) === name) return;
    const k = AppearanceSystem.HELD[slot.name] ?? 1;
    const uv = sprite_get_uvs(spr, 0);
    const dx = (uv[4] + (sprite_get_width(spr) * uv[6]) / 2 - sprite_get_xoffset(spr)) * k;
    const dy = (uv[5] + (sprite_get_height(spr) * uv[7]) / 2 - sprite_get_yoffset(spr)) * k;
    const c = Math.cos((slot.rot * Math.PI) / 180);
    const s = Math.sin((slot.rot * Math.PI) / 180);
    try {
      inst.skeleton_attachment_create(
        name,
        spr,
        0,
        uv[4] + dx * c + dy * s,
        uv[5] + dx * s - dy * c,
        k,
        k,
        slot.rot,
      );
    } catch (e) {
      // re-creating an EXISTING attachment name faults (docs/GMRT.md) and the runtime offers no
      // way to ask whether one exists — the throw IS the "already defined" answer, and the
      // standing definition is identical, so the slot can just be pointed at it
    }
    inst.skeleton_attachment_set(slot.name, name);
  },

  /** The sprite an equipped uid shows in its slot — -1 when empty, missing, or invisible. */
  _worn(inv, uid, gear) {
    if (uid === undefined || uid === "") return -1;
    const s = InventorySystem.findByUid(inv, uid);
    if (s === undefined) return -1;
    const item = Item.get(s.itemId);
    if (item === undefined) return -1;
    const eqp = item.getComponent(Equippable);
    if (eqp === undefined) return -1;
    if (eqp.worn !== "") {
      // asset_get_index returns an opaque ref (not a number) — validate via sprite_exists
      const spr = asset_get_index(eqp.worn);
      return sprite_exists(spr) ? spr : -1;
    }
    // held-icon fallback (item.sprite is contentItems' pixItem<Id> auto-wire; -1 = none)
    if (gear === "weapon" && sprite_exists(item.sprite)) return item.sprite;
    return -1;
  },
};
