/**
 * Owner of every Puppet's lifetime, and the ONLY caller of instance_create/instance_destroy —
 * which is what lets two features share one instance per entity instead of each minting its own.
 *
 * There is no paired release call because there is nothing to pair with: EntityStore.flush()
 * clears columns and frees ids with no destructor hook, so a puppet released that way would leak
 * on every death. `update` reconciles instead — a roster entry whose entity is gone, whose
 * Instance component was detached, or whose whole store was destroyed loses its puppet.
 *
 * The roster is therefore the only record of a live puppet, and it deliberately spans stores: a
 * level parked in the World pool keeps its puppets (its entities are still valid), a destroyed
 * one's are reaped on the next call. It is also the one place that HOLDS an entity id across
 * frames, against the live-query rule (ARCHITECTURE.md): a reap has nothing to query FROM — the
 * component is already gone — and a held id is safe here precisely because it is only ever
 * VALIDATED, never dereferenced, and a generational id makes a stale one detectable.
 */
globalThis.InstanceSystem = {
  /** @type {{entities: EntityStore, id: number, inst: Id.Instance}[]} */
  _roster: [],

  /**
   * The entity's puppet, minted on first call. Returns the Instance component data so a caller
   * that just attached reads `inst` without a second `get`.
   */
  attach(entities, id) {
    const held = entities.get(id, Instance);
    if (held !== undefined) return held;
    const data = { inst: instance_create_depth(0, 0, 0, Puppet) };
    entities.add(id, Instance, data);
    InstanceSystem._roster.push({ entities, id, inst: data.inst });
    return data;
  },

  /** Reap orphaned puppets. Once per frame after the feature systems, and on scene teardown. */
  update() {
    const roster = InstanceSystem._roster;
    let w = 0;
    for (let i = 0; i < roster.length; i++) {
      const e = roster[i];
      // nested, not `&&`: the short-circuit corrupts its left operand (docs/GMRT.md #15549)
      if (e.entities.isValid(e.id)) {
        if (e.entities.has(e.id, Instance)) {
          roster[w++] = e;
          continue;
        }
      }
      instance_destroy(e.inst);
    }
    roster.length = w;
  },
};
