/**
 * One-shot, fire-and-forget world-space particle bursts. A burst is reaped once its particles
 * die, so concurrent instances stay bounded. An effect that must live as long as an entity is
 * not a burst.
 *
 * update() runs once per frame from the scene's step, so bursts freeze on pause; clear() on a
 * map swap, since world coords are map-local. The stepper advances in whole frames, so update()
 * ticks per frame, not per Time.delta.
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
  _active: [],

  /** @param {BurstParams} params */
  burst(params) {
    const s = part_system_create(params.asset);
    part_system_automatic_draw(s, false);
    part_system_automatic_update(s, false); // ticked here, so it pauses with the scene
    if (params.angle !== undefined)
      part_system_angle(s, params.angle - (params.base ?? 90));
    // a baked burst fires on the first update, in asset space; the draw places and scales it
    const scale = AssetMeta.fit(params.asset, params.scale ?? 1);
    ParticleFx._active.push({ sys: s, x: params.x, y: params.y, scale: scale });
  },

  update() {
    const a = ParticleFx._active;
    const live = [];
    for (let i = 0; i < a.length; i++) {
      part_system_update(a[i].sys);
      if (part_particles_count(a[i].sys) > 0) live.push(a[i]);
      else part_system_destroy(a[i].sys);
    }
    ParticleFx._active = live;
  },

  /** World space, after the renderer. */
  draw() {
    const a = ParticleFx._active;
    for (let i = 0; i < a.length; i++) {
      const b = a[i];
      matrix_set(matrix_world, matrix_build(b.x, b.y, 0, 0, 0, 0, b.scale, b.scale, 1));
      part_system_drawit(b.sys);
    }
    matrix_set(matrix_world, matrix_build_identity());
  },

  clear() {
    const a = ParticleFx._active;
    for (let i = 0; i < a.length; i++) part_system_destroy(a[i].sys);
    ParticleFx._active = [];
  },

  /** Total live particles (diagnostic). */
  count() {
    const a = ParticleFx._active;
    let n = 0;
    for (let i = 0; i < a.length; i++) n += part_particles_count(a[i].sys);
    return n;
  },
};
