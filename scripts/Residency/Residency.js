// The entity↔settlement glue: a settlement's residents resolve by live query, never a stored
// roster. This owns the inhabitants, not the settlement record.
globalThis.Residency = {
  residents(entities, sid) {
    const out = [];
    entities.forEach([Resident], (id, r) => {
      if (r.settlementId === sid) out.push(id);
    });
    return out;
  },

  /** Counts only residents loaded in the store. */
  count(entities, sid) {
    return Residency.residents(entities, sid).length;
  },

  /**
   * The stockpile is the first resident carrying a storage Interaction, with no dedicated marker.
   * -1 when the settlement has none.
   */
  storageOf(entities, sid) {
    let found = -1;
    entities.forEach([Resident, Interaction], (id, r, it) => {
      if (found !== -1) return; // forEach has no break
      if (r.settlementId !== sid) return;
      if (it.kind === "storage") found = id;
    });
    return found;
  },

  /** Overwrites any prior membership. */
  assign(entities, id, sid) {
    entities.add(id, Resident, { settlementId: sid });
  },

  unassign(entities, id) {
    entities.detach(id, Resident);
  },
};
