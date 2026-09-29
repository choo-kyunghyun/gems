/**
 * Holds every rider to its seat once the carriers have moved: it stands at the seat's point with
 * no velocity of its own, and one whose carrier or seat is gone steps off where it stands.
 */
globalThis.RideSystem = {
  update(level) {
    const entities = level.entities;
    entities.forEach([Rider, Position], (id, r, pos) => {
      const carrier = r.carrier;
      if (!entities.isValid(carrier)) {
        Ride.release(entities, id);
        return;
      }
      const m = entities.get(carrier, Mount);
      const cp = entities.get(carrier, Position);
      const s = m !== undefined ? m.seats[r.seat] : undefined;
      if (s === undefined || cp === undefined) {
        Ride.release(entities, id);
        return;
      }
      pos.x = cp.x + s.x;
      pos.y = cp.y + s.y;
      const vel = entities.get(id, Velocity);
      if (vel === undefined) return;
      vel.x = 0;
      vel.y = 0;
    });
  },
};
