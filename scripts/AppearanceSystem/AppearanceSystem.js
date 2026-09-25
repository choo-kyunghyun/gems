/**
 * The doll: derives a humanoid's gear overlay from its Equipment and dresses its Spine puppet
 * with it. Opt-in: an entity without an Appearance is untouched.
 *
 * Two layers compose per dress slot: the authored base, which rebuild never touches, under the
 * gear overlay it re-derives wholesale from the equipped items, so a slot whose claim goes away
 * falls back to the base with no memory. An item names the slots it claims (`worn` as an
 * object); a plain string lands on its gear slot's default.
 *
 * Where gear goes is read, never declared: a rig's dress slots are those its setup pose leaves
 * empty, and a garment sits with its own sprite origin on the slot's bone, so placing a piece is
 * an origin edit and a new rig or slot needs nothing here. A weapon with no worn art shows its
 * item icon in the hand.
 */
globalThis.AppearanceSystem = {
  // Equipment slot -> the dress slot a plain-string `worn` lands on. Declaration order is the
  // merge order: on a claim conflict the later gear slot wins.
  SLOT: {
    weapon: "primary",
    armor: "outer",
    backpack: "backpack",
    trinket: "hat",
  },

  // skeleton sprite name -> its dress slots; rig data never changes within a run
  _rigs: {},

  rebuild(entities, id) {
    const ap = entities.get(id, Appearance);
    if (ap === undefined) return;
    const eq = entities.get(id, Equipment);
    const inv = entities.get(id, Inventory);
    if (eq === undefined || inv === undefined) return;
    ap.gear = {};
    for (const gear in AppearanceSystem.SLOT) {
      AppearanceSystem._claims(inv, eq.slots[gear], gear, ap.gear);
    }
    ap.dirty = true;
  },

  /** Dresses every puppet whose look changed or that was re-minted. */
  update(level) {
    const entities = level.entities;
    entities.forEach([Appearance, Instance], (id, ap, held) => {
      if (!ap.dirty) return;
      AppearanceSystem.apply(entities, id, held.inst);
    });
  },

  /**
   * Writes every dress slot: a slot that lost its claim has to fall back to base art or bare.
   */
  apply(entities, id, inst) {
    const ap = entities.get(id, Appearance);
    if (ap === undefined) return;
    const rig = AppearanceSystem._rig(inst.sprite_index);
    const gear = ap.gear ?? {}; // an authored doll carries no overlay
    for (let i = 0; i < rig.length; i++) {
      const slot = rig[i];
      let spr = gear[slot.name];
      if (spr === undefined) spr = ap.slots[slot.name]; // unclaimed: the base layer shows
      if (spr === undefined || !sprite_exists(spr)) {
        inst.skeleton_attachment_set(slot.name, -1); // the manual's clear; "" is not one
        continue;
      }
      AppearanceSystem._attach(inst, slot, spr);
    }
    ap.dirty = false;
  },

  /**
   * Every slot the setup pose leaves empty, cached per sprite. `rot` undoes the bone's setup
   * world rotation, so an attachment on it draws upright.
   *
   * @returns {{name: string, rot: number}[]}
   */
  _rig(sprite) {
    const key = sprite_get_name(sprite);
    let rig = AppearanceSystem._rigs[key];
    if (rig !== undefined) return rig;
    rig = [];
    const info = Anim.info(sprite);
    for (let i = 0; i < info.slots.length; i++) {
      const slot = info.slots[i];
      if (slot.attachment !== "") continue;
      rig.push({ name: slot.name, rot: -AppearanceSystem._angle(info, slot.bone) });
    }
    AppearanceSystem._rigs[key] = rig;
    return rig;
  },

  /** A bone's setup world rotation. */
  _angle(info, bone) {
    let sum = 0;
    while (bone != null) {
      // the root's parent reads null
      const b = AppearanceSystem._bone(info, bone);
      sum += b.rotation;
      bone = b.parent;
    }
    return sum;
  },

  _bone(info, name) {
    for (let i = 0; i < info.bones.length; i++)
      if (info.bones[i].name === name) return info.bones[i];
    throw new Error(`AppearanceSystem: ${info.name} has no bone "${name}"`);
  },

  /**
   * Mounts a sprite with its own origin on the slot's bone. The runtime centres the trimmed
   * rect at bone-local coordinates (docs/SPINE.md), so the offset gives the trim back and moves
   * that centre onto the sprite origin; the doll shows the art's authored framing, trimmed or
   * not.
   */
  _attach(inst, slot, spr) {
    // one name per (slot, sprite): its definition never changes, so a repeat is skipped
    const name = "a_" + slot.name + "_" + sprite_get_name(spr);
    if (inst.skeleton_attachment_get(slot.name) === name) return;
    // attachment scale is rig-pixel space, so the density RATIO keeps the art's world size:
    // a denser rig would otherwise shrink every worn piece with it
    const k = AssetMeta.density(inst.sprite_index) / AssetMeta.density(spr);
    const uv = sprite_get_uvs(spr, 0);
    const dx = (uv[4] + (sprite_get_width(spr) * uv[6]) / 2 - sprite_get_xoffset(spr)) * k;
    const dy = (uv[5] + (sprite_get_height(spr) * uv[7]) / 2 - sprite_get_yoffset(spr)) * k;
    const c = Math.cos((slot.rot * Math.PI) / 180);
    const s = Math.sin((slot.rot * Math.PI) / 180);
    // a standing definition is identical, so it is only pointed at; re-creating it would throw
    if (!inst.skeleton_attachment_exists(name))
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
    inst.skeleton_attachment_set(slot.name, name);
  },

  /**
   * Merges one equipped uid's claims into `out` (dress slot -> sprite, -1 = occupied bare).
   * Claiming a slot the rig lacks is harmless: apply reads back only the rig's own slots.
   */
  _claims(inv, uid, gear, out) {
    if (uid === undefined || uid === "") return;
    const s = Bag.findByUid(inv, uid);
    if (s === undefined) return;
    const item = Item.get(s.itemId);
    if (item === undefined) return;
    const eqp = item.getComponent(Equippable);
    if (eqp === undefined) return;
    const worn = eqp.worn;
    // a slot map, not a sprite — an asset ref is typeof "object" too (docs/GMRT.md)
    if (worn !== undefined && worn.constructor === Object) {
      for (const slot in worn) out[slot] = AppearanceSystem._sprite(worn[slot]);
      return;
    }
    if (worn !== undefined) {
      out[AppearanceSystem.SLOT[gear]] = worn;
      return;
    }
    if (gear === "weapon" && sprite_exists(item.sprite))
      out[AppearanceSystem.SLOT[gear]] = item.sprite;
  },

  /** null in a slot map means occupied bare (-1). */
  _sprite(spr) {
    return spr === null ? -1 : spr;
  },
};
