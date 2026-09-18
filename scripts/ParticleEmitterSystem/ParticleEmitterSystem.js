/**
 * Owner of every ParticleEmitter's live stream, and the only caller of part_system_create for
 * one: an emitter without a stream is minted one — a ParticleStream, TRANSIENT with a release
 * hook (EntityStore.mint), so the stream is destroyed when the component goes (a detach, the
 * entity's removal, a level's teardown) and nothing holds an id across frames to reap it — every
 * stream steps one frame, and a stream whose emitter was detached is detached too.
 *
 * GMRT (docs/GMRT.md): the MANUAL part_system_drawit path (auto draw/update off) — the stepper
 * advances in whole frames, so update() ticks once per frame (not Time.delta), and a pause is
 * update() being skipped.
 */
globalThis.ParticleEmitterSystem = {
  /**
   * Mint what is new, step every stream one frame, drop what lost its emitter. Once per frame
   * from the scene's update — a stream freezes and slows with the sim, like every world-space
   * effect (the clock split). An `asset` naming no particle system warns once and detaches the
   * emitter (fail fast, no per-frame spam).
   */
  update(level) {
    const entities = level.entities;
    entities.forEach([ParticleEmitter, Position], (id, em) => {
      if (entities.has(id, ParticleStream)) return;
      if (asset_get_type(em.asset) !== asset_particlesystem) {
        Log.warn(
          `ParticleEmitter: unknown particle system "${em.asset}" — detached`,
        );
        entities.detach(id, ParticleEmitter);
        return;
      }
      const s = part_system_create(asset_get_index(em.asset));
      part_system_automatic_draw(s, false); // draw() places it under the entity's matrix
      part_system_automatic_update(s, false); // stepped here (pause-aware)
      // a persistent blend, like image_blend on an instance — set once, not per draw
      if (em.color !== undefined) part_system_colour(s, em.color, 1);
      entities.mint(id, ParticleStream, { sys: s }, ParticleEmitterSystem._release);
    });
    entities.forEach([ParticleStream], (id, st) => {
      if (!entities.has(id, ParticleEmitter)) {
        entities.detach(id, ParticleStream); // the emitter went: the release hook frees the stream
        return;
      }
      part_system_update(st.sys);
    });
  },

  /**
   * Draw every stream at its entity's Position. From the scene's draw() in world space AFTER the
   * renderer — the ground passes paint an opaque fill that would hide it. 2.5D: `pitchDeg` is the
   * live camera pitch in degrees (FloatingText.draw's convention), which stands each stream up on
   * a camera-facing plane so its drift rises on screen; a flat top-down camera (0) leaves it on
   * the ground.
   */
  draw(entities, pitchDeg = 0) {
    const tilt = -pitchDeg;
    entities.forEach(
      [ParticleStream, ParticleEmitter, Position],
      (id, st, em, p) => {
        const s = em.scale ?? 1;
        matrix_set(matrix_world, matrix_build(p.x, p.y, 0, tilt, 0, 0, s, s, 1));
        part_system_drawit(st.sys);
      },
    );
    matrix_set(matrix_world, matrix_build_identity());
  },

  /** The release hook: the component left its slot, so the stream goes with it. */
  _release(st) {
    part_system_destroy(st.sys);
  },
};
