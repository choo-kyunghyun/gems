const SUMMON_GAP = 1; // world px a summoned vehicle keeps off its summoner's box
const SUMMON_STEP = 16; // world px each further try moves out
const SUMMON_TRIES = 4; // tries per side

/**
 * The colony's rules for a vehicle key. A key instance's uid names one vehicle, which carries it
 * as `Vehicle.key`: a use stows the vehicle carrying it, wherever in the world it stands, and
 * summons one only while none does, so no two vehicles ever carry one uid and a key reaches only
 * its own. A vehicle stows only while nobody rides it, and arrives beside its summoner — east,
 * west, south, then north of its box, each tried a step further out while none is clear — at the
 * first spot clear of every collider, with no blocking cell between it and the summoner. A
 * refusal comes back as an i18n key.
 */
globalThis.Garage = {
  _riders: [], // stow's collector

  /**
   * Use `id`'s key of item `itemId` on `level`: instance `uid`, or with none given the first one
   * its bag holds.
   */
  use(level, id, itemId, uid) {
    const inv = level.entities.require(id, Inventory);
    const slot = uid !== undefined ? Bag.findByUid(inv, uid) : Garage._first(inv, itemId);
    if (slot === undefined) return "INV_NOT_OWNED";
    const at = Garage.find(slot.uid);
    if (at !== null) return Garage._stow(level, at.level, at.id);
    const preset = Item.get(itemId).getComponent(VehicleKey).preset;
    return Garage._summon(level, id, preset, slot.uid);
  },

  /** Where the vehicle key `uid` names stands, as `{ level, id }`, or null while it is stowed. */
  find(uid) {
    const world = World.active;
    const maps = world.ids();
    for (let i = 0; i < maps.length; i++) {
      const lv = world.get(maps[i]);
      let found = -1;
      lv.entities.forEach([Vehicle], (vid, v) => {
        if (v.key === uid) found = vid;
      });
      if (found !== -1) return { level: lv, id: found };
    }
    return null;
  },

  /** Spawn preset `presetId` at (x, y) as the vehicle key `uid` names; returns its id. */
  spawn(entities, presetId, uid, x, y) {
    return EntityPreset.spawn(entities, presetId, x, y, 0, {
      components: { [Vehicle]: { key: uid } },
    });
  },

  _first(inv, itemId) {
    for (let i = 0; i < inv.slots.length; i++)
      if (inv.slots[i].itemId === itemId) return inv.slots[i];
    return undefined;
  },

  /**
   * The vehicle drops its key at once, so no use before the removal lands reaches it; a map
   * other than `here` runs no flush of its own, so it takes the removal now.
   */
  _stow(here, level, id) {
    const entities = level.entities;
    if (Ride.riders(entities, id, Garage._riders).length > 0) return "MOUNT_OCCUPIED";
    entities.require(id, Vehicle).key = "";
    entities.remove(id);
    if (level !== here) entities.flush();
    return "";
  },

  _summon(level, id, presetId, uid) {
    const entities = level.entities;
    const pos = entities.require(id, Position);
    const box = entities.get(id, BBox);
    const x1 = pos.x + (box !== undefined ? box.x : 0);
    const y1 = pos.y + (box !== undefined ? box.y : 0);
    const x2 = x1 + (box !== undefined ? box.width : 0);
    const y2 = y1 + (box !== undefined ? box.height : 0);
    // the vehicle's box off its Position, as its preset spawns it
    const def = EntityPreset.get(presetId);
    const k = def.scale ?? 1;
    const vb = def.components[BBox];
    const bx = vb !== undefined ? vb.x * k : 0;
    const by = vb !== undefined ? vb.y * k : 0;
    const bw = vb !== undefined ? vb.width * k : 0;
    const bh = vb !== undefined ? vb.height * k : 0;
    // each side's touching spot and the way out from it
    const xs = [x2 + SUMMON_GAP - bx, x1 - SUMMON_GAP - bx - bw, pos.x, pos.x];
    const ys = [pos.y, pos.y, y2 + SUMMON_GAP - by, y1 - SUMMON_GAP - by - bh];
    const dx = [1, -1, 0, 0];
    const dy = [0, 0, 1, -1];
    const map = SolidSystem.tiles(level).map;
    const all = map !== undefined ? [Puppet, map] : Puppet;
    for (let t = 0; t < SUMMON_TRIES; t++) {
      for (let i = 0; i < xs.length; i++) {
        const x = xs[i] + dx[i] * t * SUMMON_STEP;
        const y = ys[i] + dy[i] * t * SUMMON_STEP;
        if (!Garage._clear(x + bx, y + by, x + bx + bw, y + by + bh, all)) continue;
        // the strip from the touching spot out to this one, so no wall is skipped
        if (t > 0 && map !== undefined) {
          const sx = Math.min(xs[i], x) + bx;
          const sy = Math.min(ys[i], y) + by;
          const ex = Math.max(xs[i], x) + bx + bw;
          const ey = Math.max(ys[i], y) + by + bh;
          if (!Garage._clear(sx, sy, ex, ey, map)) continue;
        }
        Garage.spawn(entities, presetId, uid, x, y);
        return "";
      }
    }
    return "MOUNT_NO_ROOM";
  },

  /** Whether the rect meets nothing of `against` — `Puppet`, a tile map, or an array of them. */
  _clear(x1, y1, x2, y2, against) {
    const list = PuppetSystem.list();
    return PuppetSystem.probe().collision_rectangle_list(x1, y1, x2, y2, against, false, true, list, false) === 0;
  },
};
