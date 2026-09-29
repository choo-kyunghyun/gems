const EXIT_GAP = 1; // world px an exit beside the carrier keeps off its box

/**
 * The on-demand verbs over riding a carrier's Mount. The link lives on the rider alone, so a
 * seat's occupant is found by walking the riders. A rider steps off at the first clear exit — its
 * seat's, then beside the carrier's box on each side — where its box meets no static solid but
 * the carrier and no blocking cell; with none clear it stays on.
 */
globalThis.Ride = {
  /** The carrier `id` rides, or -1. */
  carrier(entities, id) {
    const r = entities.get(id, Rider);
    if (r === undefined) return -1;
    return entities.isValid(r.carrier) ? r.carrier : -1;
  },

  /** The seat `id` rides, or undefined. */
  seat(entities, id) {
    const carrier = Ride.carrier(entities, id);
    if (carrier === -1) return undefined;
    const m = entities.get(carrier, Mount);
    return m !== undefined ? m.seats[entities.get(id, Rider).seat] : undefined;
  },

  /** The rider on `carrier`'s seat `seat`, or -1. */
  occupant(entities, carrier, seat) {
    let found = -1;
    entities.forEach([Rider], (id, r) => {
      if (r.carrier === carrier && r.seat === seat) found = id;
    });
    return found;
  },

  /** `carrier`'s riders into `out`, which it returns. */
  riders(entities, carrier, out) {
    let w = 0;
    entities.forEach([Rider], (id, r) => {
      if (r.carrier === carrier) out[w++] = id;
    });
    out.length = w;
    return out;
  },

  /** `carrier`'s first free seat, or -1. */
  vacant(entities, carrier) {
    const m = entities.get(carrier, Mount);
    if (m === undefined) return -1;
    for (let i = 0; i < m.seats.length; i++)
      if (Ride.occupant(entities, carrier, i) === -1) return i;
    return -1;
  },

  /**
   * Seat `id` on `carrier`'s seat `seat` at once. False, changing nothing, when the seat is absent
   * or taken, or either end already rides — a carrier never rides, so no chain forms.
   */
  mount(entities, id, carrier, seat) {
    if (id === carrier) return false;
    if (!entities.isValid(carrier)) return false;
    if (entities.has(id, Rider)) return false;
    if (entities.has(carrier, Rider)) return false;
    const m = entities.get(carrier, Mount);
    if (m === undefined) return false;
    const s = m.seats[seat];
    if (s === undefined) return false;
    if (Ride.occupant(entities, carrier, seat) !== -1) return false;
    const col = entities.get(id, Collision);
    const spr = entities.get(id, Sprite);
    entities.add(id, Rider, {
      carrier,
      seat,
      solid: col !== undefined ? col.solid : true,
      visible: spr !== undefined ? spr.visible : true,
    });
    if (s.hidden === true) {
      if (col !== undefined) col.solid = false;
      if (spr !== undefined) spr.visible = false;
    }
    const pos = entities.get(id, Position);
    const cp = entities.get(carrier, Position);
    if (pos === undefined || cp === undefined) return true;
    pos.x = cp.x + s.x;
    pos.y = cp.y + s.y;
    return true;
  },

  /**
   * Step `id` off at its first clear exit; false, changing nothing, when none is clear or it rides
   * nothing. A rider whose carrier is gone steps off where it stands.
   */
  dismount(level, id) {
    const entities = level.entities;
    const r = entities.get(id, Rider);
    if (r === undefined) return false;
    const carrier = r.carrier;
    const m = entities.isValid(carrier) ? entities.get(carrier, Mount) : undefined;
    const s = m !== undefined ? m.seats[r.seat] : undefined;
    const cp = s !== undefined ? entities.get(carrier, Position) : undefined;
    if (cp === undefined) {
      Ride.release(entities, id);
      return true;
    }
    const box = entities.get(id, BBox);
    const bx = box !== undefined ? box.x : 0;
    const by = box !== undefined ? box.y : 0;
    const bw = box !== undefined ? box.width : 0;
    const bh = box !== undefined ? box.height : 0;
    // exits as offsets off the carrier: the seat's, then left, right, south and north of its box
    const xs = [s.exit !== undefined ? s.exit.x : s.x];
    const ys = [s.exit !== undefined ? s.exit.y : s.y];
    const cb = entities.get(carrier, BBox);
    if (cb !== undefined) {
      xs.push(cb.x - EXIT_GAP - bx - bw, cb.x + cb.width + EXIT_GAP - bx, s.x, s.x);
      ys.push(s.y, s.y, cb.y + cb.height + EXIT_GAP - by, cb.y - EXIT_GAP - by - bh);
    }
    for (let i = 0; i < xs.length; i++) {
      const x = cp.x + xs[i];
      const y = cp.y + ys[i];
      if (!Ride._clear(level, carrier, x + bx, y + by, x + bx + bw, y + by + bh)) continue;
      const pos = entities.get(id, Position);
      pos.x = x;
      pos.y = y;
      Ride.release(entities, id);
      return true;
    }
    return false;
  },

  /** Step `id` off where it stands, with no exit sought. */
  release(entities, id) {
    const r = entities.get(id, Rider);
    if (r === undefined) return;
    const col = entities.get(id, Collision);
    if (col !== undefined) col.solid = r.solid;
    const spr = entities.get(id, Sprite);
    if (spr !== undefined) spr.visible = r.visible;
    entities.detach(id, Rider);
  },

  /**
   * Whether the rect meets no static solid but `carrier` and no blocking cell. A listed tile map
   * is told from an instance before any field is read (docs/GMRT.md).
   */
  _clear(level, carrier, x1, y1, x2, y2) {
    const list = PuppetSystem.list();
    const against = SolidSystem.tiles(level).against;
    const n = PuppetSystem.probe().collision_rectangle_list(x1, y1, x2, y2, against, false, true, list, false);
    for (let k = 0; k < n; k++) {
      const o = ds_list_find_value(list, k);
      if (!instance_exists(o)) return false;
      if (o.eid !== carrier) return false;
    }
    return true;
  },
};
