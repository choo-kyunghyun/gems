// SettlementSystem — the entity↔settlement glue: resolves a settlement's residents (entities
// carrying Resident with a matching sid) by LIVE query, never a stored roster (mirrors
// FollowerSystem.members). Stateless namespace like ZoneSystem — no World tick. The Settlement
// module owns the LANDS (Zone) + capability data; this owns the INHABITANTS (World entities).
globalThis.SettlementSystem = {
  /** Every entity that is a resident of settlement `sid`. @returns {number[]} */
  residents(world, sid) {
    const out = [];
    const ids = world.query(Resident);
    for (let i = 0; i < ids.length; i++)
      if (world.get(Resident, ids[i]).settlementId === sid) out.push(ids[i]);
    return out;
  },

  /** @returns {number} how many residents settlement `sid` has (loaded in the World). */
  count(world, sid) {
    return SettlementSystem.residents(world, sid).length;
  },

  /**
   * The settlement's stockpile: its first resident carrying a storage Interaction (a chest) — the
   * deposit target for the future worker→resource loop. Reuses the chest's own Inventory; no
   * dedicated marker. @returns {number} the entity id, or -1 if the settlement has no stockpile.
   */
  storageOf(world, sid) {
    const ids = world.query(Resident);
    for (let i = 0; i < ids.length; i++) {
      if (world.get(Resident, ids[i]).settlementId !== sid) continue;
      const it = world.get(Interaction, ids[i]);
      if (it !== undefined && it.kind === "storage") return ids[i];
    }
    return -1;
  },

  /** Make `id` a resident of settlement `sid` (idempotent — overwrites any prior membership). */
  assign(world, id, sid) {
    world.add(id, Resident, { settlementId: sid });
  },

  /** Drop `id`'s settlement membership. */
  unassign(world, id) {
    world.detach(id, Resident);
  },
};
