// SettlementSystem — the entity↔settlement glue: resolves a settlement's residents (Resident with a
// matching sid) by LIVE query, never a stored roster. Settlement owns the lands; this owns the inhabitants.
globalThis.SettlementSystem = {
  residents(entities, sid) {
    const out = [];
    const ids = entities.query(Resident);
    for (let i = 0; i < ids.length; i++)
      if (entities.get(ids[i], Resident).settlementId === sid) out.push(ids[i]);
    return out;
  },

  /** Counts only residents loaded in the store. */
  count(entities, sid) {
    return SettlementSystem.residents(entities, sid).length;
  },

  /**
   * The settlement's stockpile: its first resident carrying a storage Interaction (a chest) — the
   * deposit target for the future worker→resource loop. Reuses the chest's own Inventory; no
   * dedicated marker. Returns the entity id, or -1 if the settlement has no stockpile.
   */
  storageOf(entities, sid) {
    const ids = entities.query(Resident);
    for (let i = 0; i < ids.length; i++) {
      if (entities.get(ids[i], Resident).settlementId !== sid) continue;
      const it = entities.get(ids[i], Interaction);
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
