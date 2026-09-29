/**
 * The colony's rules for riding, by seat role: "drive" steers the carrier's Vehicle, "gun" fires
 * its Armament, "ride" only rides, and on any seat the rider's own weapon and throw are idle. A
 * player who takes the wheel brings its following squad aboard, and they leave with it. A refusal
 * comes back as an i18n key.
 */
globalThis.Boarding = {
  _riders: [], // leave's collector

  /** The role of the seat `id` rides; "" when it rides nothing. */
  role(entities, id) {
    const s = Ride.seat(entities, id);
    if (s === undefined) return "";
    return s.role ?? "ride";
  },

  /** The live slot `id` fires — its gun seat's Armament, else its own weapon — or null. */
  weaponSlot(entities, id) {
    const role = Boarding.role(entities, id);
    if (role === "") return Loadout.weaponSlot(entities, id);
    if (role !== "gun") return null;
    const arm = entities.get(Ride.carrier(entities, id), Armament);
    return arm !== undefined ? arm : null;
  },

  /** The role of the seat `carrier` would offer next; "" when it is full. */
  offer(entities, carrier) {
    const seat = Ride.vacant(entities, carrier);
    if (seat === -1) return "";
    return entities.require(carrier, Mount).seats[seat].role ?? "ride";
  },

  /** Seat `id` on `carrier`'s first free seat. */
  board(level, id, carrier) {
    const entities = level.entities;
    if (!Ride.mount(entities, id, carrier, Ride.vacant(entities, carrier))) return "MOUNT_FULL";
    if (Boarding.role(entities, id) === "drive") Boarding._crew(entities, id, carrier);
    return "";
  },

  /** Step `id` off; a driver's companions step off with it, where they sit if no exit is clear. */
  leave(level, id) {
    const entities = level.entities;
    const carrier = Ride.carrier(entities, id);
    const drove = Boarding.role(entities, id) === "drive";
    if (!Ride.dismount(level, id)) return "MOUNT_BLOCKED";
    if (!drove) return "";
    const riders = Ride.riders(entities, carrier, Boarding._riders);
    for (let i = 0; i < riders.length; i++) {
      if (!entities.has(riders[i], Follower)) continue;
      if (!Ride.dismount(level, riders[i])) Ride.release(entities, riders[i]);
    }
    return "";
  },

  /** `id`'s following, standing squad takes the free seats. */
  _crew(entities, id, carrier) {
    const sq = entities.get(id, Squad);
    if (sq === undefined) return;
    const members = Companions.members(entities, sq.id, id);
    for (let i = 0; i < members.length; i++) {
      const m = members[i];
      if (m === id) continue;
      const f = entities.get(m, Follower);
      if (f === undefined || f.state !== "follow") continue;
      if (entities.has(m, Downed)) continue;
      const seat = Ride.vacant(entities, carrier);
      if (seat === -1) return;
      Ride.mount(entities, m, carrier, seat);
    }
  },
};
