/**
 * Owner of every Puppet's lifetime, and the ONLY caller of instance_create/instance_destroy —
 * which is what lets two features share one instance per entity instead of each minting its own.
 * `attach` mints the entity's Instance as a TRANSIENT component with a release hook
 * (EntityStore.mint), so the puppet goes when the component does — a detach, the entity's removal
 * at flush, a whole-entity transfer, a level's teardown — and nothing holds an id across frames
 * to reap it. A level parked in the World pool keeps its puppets with its entities.
 */
globalThis.Puppets = {
  /**
   * The entity's puppet, minted on first call. Returns the Instance component data so a caller
   * that just attached reads `inst` without a second `get`.
   */
  attach(entities, id) {
    const held = entities.get(id, Instance);
    if (held !== undefined) return held;
    const data = { inst: instance_create_depth(0, 0, 0, Puppet) };
    entities.mint(id, Instance, data, Puppets._release);
    return data;
  },

  /** The release hook: the component left its slot, so the puppet goes with it. */
  _release(data) {
    instance_destroy(data.inst);
  },
};
