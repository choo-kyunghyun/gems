/**
 * Owner of every ParticleEmitter's live stream, and the only caller of part_system_create for
 * one — the component's presence IS "a live stream exists", so a holder releases one by
 * detaching the component (or removing the entity) and the next update reaps it.
 *
 * There is no paired release call because there is nothing to pair with: EntityStore.flush()
 * frees ids with no destructor hook (InstanceSystem's reasoning), so update() reconciles — a
 * roster entry whose entity is gone or whose component was detached loses its stream. The roster
 * is the only record of a live one, and it is the one place that HOLDS entity ids across frames
 * (against the live-query rule, ARCHITECTURE.md): a reap has nothing to query FROM, and a held id
 * is safe here because it is only ever VALIDATED, never dereferenced.
 *
 * GMRT (docs/GMRT.md): the MANUAL part_system_drawit path (auto draw/update off) — the stepper
 * advances in whole frames, so update() ticks once per frame (not Time.delta), and a pause is
 * step() being skipped. Handles are opaque refs, so the roster is keyed by entity id, never by
 * the handle it carries.
 */
globalThis.ParticleEmitterSystem = {
  _ids: [], // entity ids of the live streams, parallel to _sys (a handful — linear scan)
  _sys: [],

  /**
   * Mint what is new, step every stream one frame, reap what is gone. Once per frame from the
   * scene's step() — a stream freezes and slows with the sim, like every world-space effect (the
   * clock split). An `asset` naming no particle system warns once and detaches the component
   * (fail fast, no per-frame spam).
   */
  update(entities) {
    const ids = ParticleEmitterSystem._ids;
    const sys = ParticleEmitterSystem._sys;
    entities.forEach([ParticleEmitter, Position], (id, em) => {
      if (ParticleEmitterSystem._find(id) >= 0) return;
      if (asset_get_type(em.asset) !== asset_particlesystem) {
        Log.warn(
          `ParticleEmitter: unknown particle system "${em.asset}" — detached`,
        );
        entities.detach(id, ParticleEmitter);
        return;
      }
      const s = part_system_create(asset_get_index(em.asset));
      part_system_automatic_draw(s, false); // draw() places it under the entity's matrix
      part_system_automatic_update(s, false); // stepped here (pause-aware via step())
      // a persistent blend, like image_blend on an instance — set once, not per draw
      if (em.color !== undefined) part_system_colour(s, em.color, 1);
      ids.push(id);
      sys.push(s);
    });
    let w = 0;
    for (let i = 0; i < ids.length; i++) {
      // nested, not `&&`: the short-circuit corrupts its left operand (docs/GMRT.md #15549)
      if (entities.isValid(ids[i])) {
        if (entities.has(ids[i], ParticleEmitter)) {
          part_system_update(sys[i]);
          ids[w] = ids[i];
          sys[w] = sys[i];
          w++;
          continue;
        }
      }
      part_system_destroy(sys[i]);
    }
    ids.length = w;
    sys.length = w;
  },

  /**
   * Draw every stream at its entity's Position. From the scene's draw() in world space AFTER the
   * renderer — the ground passes paint an opaque fill that would hide it. 2.5D: `pitchDeg` is the
   * live camera pitch in degrees (FloatingText.draw's convention), which stands each stream up on
   * a camera-facing plane so its drift rises on screen; a flat top-down camera (0) leaves it on
   * the ground. A stream minted later this frame draws from the next one.
   */
  draw(entities, pitchDeg = 0) {
    const tilt = -pitchDeg;
    entities.forEach([ParticleEmitter, Position], (id, em, p) => {
      const i = ParticleEmitterSystem._find(id);
      if (i < 0) return;
      const s = em.scale ?? 1;
      matrix_set(matrix_world, matrix_build(p.x, p.y, 0, tilt, 0, 0, s, s, 1));
      part_system_drawit(ParticleEmitterSystem._sys[i]);
    });
    matrix_set(matrix_world, matrix_build_identity());
  },

  /** Destroy every live stream. On scene/map swap — world coords are map-local. */
  clear() {
    const sys = ParticleEmitterSystem._sys;
    for (let i = 0; i < sys.length; i++) part_system_destroy(sys[i]);
    ParticleEmitterSystem._ids = [];
    ParticleEmitterSystem._sys = [];
  },

  /** Roster index of `id`'s stream, or -1. */
  _find(id) {
    const ids = ParticleEmitterSystem._ids;
    for (let i = 0; i < ids.length; i++) {
      if (ids[i] === id) return i;
    }
    return -1;
  },
};
