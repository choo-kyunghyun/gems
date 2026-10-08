/**
 * One-shot, fire-and-forget world-space particle bursts. A burst is reaped once its particles
 * die, so concurrent instances stay bounded. An effect that must live as long as an entity is
 * not a burst.
 *
 * A burst lives on its level, in its coordinates: update() runs once per frame over the live
 * level, so bursts freeze on pause and on a parked map, and a freed level destroys its own. The
 * stepper advances in whole frames, so update() ticks per frame, not per Time.delta.
 */

/**
 * @typedef {Object} BurstParams
 * @property {GMParticleSystem} asset
 * @property {number} x
 * @property {number} y
 * @property {number} [angle]          GM angle to aim at; omitted = no rotation
 * @property {number} [base=90]        the asset's authored emission angle, rotated out of `angle`
 * @property {number} [scale=1]        design scale; the asset's declared density divides it
 */
globalThis.ParticleFx = {
  KEY: "particle_fx", // the bursts' derived token on the level's own entity

  /** The level's live bursts, `{ sys, x, y, scale }` each. */
  bursts(level) {
    return level.entities.derive(level.self, ParticleFx.KEY, ParticleFx._seed).list;
  },

  _seed() {
    const list = [];
    return {
      list,
      destroy: () => {
        for (let i = 0; i < list.length; i++) part_system_destroy(list[i].sys);
        list.length = 0;
      },
    };
  },

  /** @param {BurstParams} params */
  burst(level, params) {
    const s = part_system_create(params.asset);
    part_system_automatic_draw(s, false);
    part_system_automatic_update(s, false); // ticked here, so it pauses with the scene
    if (params.angle !== undefined)
      part_system_angle(s, params.angle - (params.base ?? 90));
    // a baked burst fires on the first update, in asset space; the draw places and scales it
    const scale = AssetMeta.fit(params.asset, params.scale ?? 1);
    ParticleFx.bursts(level).push({ sys: s, x: params.x, y: params.y, scale: scale });
  },

  update(level) {
    const a = ParticleFx.bursts(level);
    let w = 0;
    for (let i = 0; i < a.length; i++) {
      part_system_update(a[i].sys);
      if (part_particles_count(a[i].sys) > 0) a[w++] = a[i];
      else part_system_destroy(a[i].sys);
    }
    a.length = w;
  },

  /**
   * World space, after the renderer. `pitchDeg` (the camera pitch) stands each burst up on a
   * camera-facing plane, so it keeps its authored shape on screen.
   */
  draw(level, pitchDeg = 0) {
    const tilt = -pitchDeg;
    const a = ParticleFx.bursts(level);
    for (let i = 0; i < a.length; i++) {
      const b = a[i];
      const s = b.scale;
      matrix_set(matrix_world, matrix_build(b.x, b.y, 0, tilt, 0, 0, s, s, s));
      part_system_drawit(b.sys);
    }
    matrix_set(matrix_world, matrix_build_identity());
  },

  /** Total live particles on the level (diagnostic). */
  count(level) {
    const a = ParticleFx.bursts(level);
    let n = 0;
    for (let i = 0; i < a.length; i++) n += part_particles_count(a[i].sys);
    return n;
  },
};
