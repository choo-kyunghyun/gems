/**
 * Owner of every Puppet's lifetime, and the ONLY caller of instance_create/instance_destroy —
 * which is what lets two features share one instance per entity instead of each minting its own.
 * `attach` mints the entity's Instance as a TRANSIENT component with a release hook
 * (Table.mint), so the puppet goes when the component does — a detach, the entity's removal
 * at flush, a whole-entity transfer, a level's teardown — and nothing holds an id across frames
 * to reap it. A level parked in the World pool keeps its puppets with its entities, deactivated
 * (PuppetSystem.park). The object is the query filter: a kinematic collider is a `Solid`,
 * `Puppet`'s child, so `Puppet` names every mirror and `Solid` the statics alone.
 */
globalThis.Puppets = {
  /**
   * The entity's puppet, minted on first call. Returns the Instance component data so a caller
   * that just attached reads `inst` without a second `get`; the mirror fields (Instance) start
   * unshaped, for PuppetSystem to fill.
   */
  attach(entities, id) {
    const held = entities.get(id, Instance);
    if (held !== undefined) return held;
    const col = entities.get(id, Collision);
    const obj = col !== undefined && col.kinematic === true ? Solid : Puppet;
    const data = {
      inst: instance_create_depth(0, 0, 0, obj),
      rigged: false,
      shaped: false,
      still: false,
      solid: false,
      sx: 1,
      sy: 1,
      ox: 0,
      oy: 0,
    };
    entities.mint(id, Instance, data, Puppets._release);
    return data;
  },

  /**
   * The parked instance a query runs in — a collision built-in needs an instance self — off
   * every level with the empty mask, made on first use and kept for the run.
   */
  probe() {
    if (Puppets._probe === null) {
      const p = instance_create_depth(-4096, -4096, 0, Puppet);
      p.mask_index = pixMaskNone;
      Puppets._probe = p;
    }
    return Puppets._probe;
  },
  _probe: null,

  /** The release hook: the component left its slot, so the puppet goes with it — activated
   *  first, since a parked level's are deactivated (GMS2 would refuse the destroy otherwise). */
  _release(data) {
    instance_activate_object(data.inst);
    instance_destroy(data.inst);
  },
};
