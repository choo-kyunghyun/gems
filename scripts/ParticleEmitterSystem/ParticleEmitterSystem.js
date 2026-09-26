/**
 * Owner of every ParticleEmitter's live stream. A stream is a transient component with a release
 * hook, so it is destroyed whenever the component goes and nothing holds an id across frames to
 * reap it; a stream whose emitter was detached is detached too.
 *
 * The stepper advances in whole frames, so update() ticks per frame, not per Time.delta, and a
 * pause is update() being skipped.
 */
globalThis.ParticleEmitterSystem = {
  /**
   * Once per frame on the sim clock, so a stream freezes and slows with the sim. An `asset`
   * naming no particle system warns once and detaches the emitter.
   */
  update(level) {
    const entities = level.entities;
    const streams = entities.column(ParticleStream);
    const emitters = entities.column(ParticleEmitter);
    const slots = Handle.SLOTS;
    entities.forEach([ParticleEmitter, Position], (id, em) => {
      if (streams[id % slots] !== undefined) return;
      if (asset_get_type(em.asset) !== asset_particlesystem) {
        Log.warn(
          `ParticleEmitter: unknown particle system "${em.asset}" — detached`,
        );
        entities.detach(id, ParticleEmitter);
        return;
      }
      const s = part_system_create(asset_get_index(em.asset));
      part_system_automatic_draw(s, false);
      part_system_automatic_update(s, false);
      // a persistent blend, set once, not per draw
      if (em.color !== undefined) part_system_colour(s, em.color, 1);
      entities.add(
        id,
        ParticleStream,
        { sys: s },
        { mint: true, destroy: ParticleEmitterSystem._release },
      );
    });
    entities.forEach([ParticleStream], (id, st) => {
      if (emitters[id % slots] === undefined) {
        entities.detach(id, ParticleStream);
        return;
      }
      part_system_update(st.sys);
    });
  },

  /**
   * World space, after the renderer, whose opaque ground would hide it. `pitchDeg` (the camera
   * pitch) stands each stream up on a camera-facing plane so its drift rises on screen.
   */
  draw(entities, pitchDeg = 0) {
    const tilt = -pitchDeg;
    entities.forEach(
      [ParticleStream, ParticleEmitter, Position],
      (id, st, em, p) => {
        const s = em.scale;
        matrix_set(matrix_world, matrix_build(p.x, p.y, 0, tilt, 0, 0, s, s, 1));
        part_system_drawit(st.sys);
      },
    );
    matrix_set(matrix_world, matrix_build_identity());
  },

  _release(st) {
    part_system_destroy(st.sys);
  },
};
