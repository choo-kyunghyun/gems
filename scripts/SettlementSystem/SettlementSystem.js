// SettlementSystem — the entity↔settlement glue: resolves a settlement's residents (entities
// carrying Resident with a matching sid) by LIVE query, never a stored roster (mirrors
// FollowerSystem.members). Stateless namespace like ZoneSystem — no World tick. The Settlement
// module owns the LANDS (Zone) + capability data; this owns the INHABITANTS (store entities).
globalThis.SettlementSystem = {
  /** Every entity that is a resident of settlement `sid`. @returns {number[]} */
  residents(entities, sid) {
    const out = [];
    const ids = entities.query(Resident);
    for (let i = 0; i < ids.length; i++)
      if (entities.get(Resident, ids[i]).settlementId === sid) out.push(ids[i]);
    return out;
  },

  /** @returns {number} how many residents settlement `sid` has (loaded in the store). */
  count(entities, sid) {
    return SettlementSystem.residents(entities, sid).length;
  },

  /**
   * The settlement's stockpile: its first resident carrying a storage Interaction (a chest) — the
   * deposit target for the future worker→resource loop. Reuses the chest's own Inventory; no
   * dedicated marker. @returns {number} the entity id, or -1 if the settlement has no stockpile.
   */
  storageOf(entities, sid) {
    const ids = entities.query(Resident);
    for (let i = 0; i < ids.length; i++) {
      if (entities.get(Resident, ids[i]).settlementId !== sid) continue;
      const it = entities.get(Interaction, ids[i]);
      if (it !== undefined && it.kind === "storage") return ids[i];
    }
    return -1;
  },

  /** Make `id` a resident of settlement `sid` (idempotent — overwrites any prior membership). */
  assign(entities, id, sid) {
    entities.add(id, Resident, { settlementId: sid });
  },

  /** Drop `id`'s settlement membership. */
  unassign(entities, id) {
    entities.detach(id, Resident);
  },
};
