/**
 * ParticleFx — one-shot world-space BURSTS off IDE Particle System assets (a muzzle flash, an
 * explosion). A singleton, like FloatingText.
 *
 * A burst is fire-and-forget, the way an Audio.play cue is: positioned and aimed at the call,
 * then parked in an active list that update() reaps once its particles die, so concurrent
 * instances stay bounded (no leak). A baked BURST emitter fires on its first update, so burst()
 * positions before that first update and the burst lands right. It returns nothing — there is
 * nothing a caller could do with the handle (an opaque ref, GMRT below).
 *
 * An effect that must live as long as an ENTITY is not a burst: that is the ParticleEmitter
 * component, whose streams ParticleEmitterSystem owns and draws.
 *
 * Wiring (mirrors FloatingText — world space, pause-aware): update() once per frame from step()
 * (so bursts freeze when the scene pauses), draw() from draw() AFTER the renderer; clear() on
 * scene/map swap (world coords are map-local, must not bleed into the next).
 *
 * GMRT (docs/GMRT.md): renders via the MANUAL part_system_drawit path (auto-draw/update off).
 * Handles are OPAQUE REFS — never `>= 0`-test them; use part_*_exists. The stepper advances in
 * whole frames, so update() ticks once per frame (not Time.delta) — pause = step() being skipped.
 */

/**
 * @typedef {Object} BurstParams
 * @property {GMParticleSystem} asset  the `ps*` system to instance
 * @property {number} x                world x
 * @property {number} y                world y
 * @property {number} [angle]          GM angle to aim the burst at (0 = right, 90 = up); omitted
 *                                     = no rotation
 * @property {number} [base=90]        the asset's AUTHORED emission angle, rotated out of `angle`
 *                                     — the editor default is up (90), so pass it only for an
 *                                     asset that points elsewhere
 */
globalThis.ParticleFx = {
  _active: [], // live burst instances; reaped when spent

  /** Fire one burst. `params`: BurstParams. */
  burst(params) {
    const s = part_system_create(params.asset); // instances the asset's baked emitters/types
    part_system_automatic_draw(s, false); // the scene draws it (z-ordered over day/night)
    part_system_automatic_update(s, false); // we tick it (pause-aware via step())
    part_system_position(s, params.x, params.y); // before the first update → the burst lands here
    if (params.angle !== undefined)
      part_system_angle(s, params.angle - (params.base ?? 90));
    ParticleFx._active.push(s);
  },

  /** Advance every live burst one frame, reaping the spent. Once per frame from step(). */
  update() {
    const a = ParticleFx._active;
    const live = [];
    for (let i = 0; i < a.length; i++) {
      part_system_update(a[i]); // the first update fires a baked burst emitter
      if (part_particles_count(a[i]) > 0) live.push(a[i]);
      else part_system_destroy(a[i]); // spent → free it (emitters die with the system)
    }
    ParticleFx._active = live;
  },

  /** Draw every live burst — from a scene's draw() in world space, after the renderer. */
  draw() {
    const a = ParticleFx._active;
    for (let i = 0; i < a.length; i++) part_system_drawit(a[i]);
  },

  /** Destroy every burst. Call on scene/map swap (their world coords are map-local). */
  clear() {
    const a = ParticleFx._active;
    for (let i = 0; i < a.length; i++) part_system_destroy(a[i]);
    ParticleFx._active = [];
  },

  /** Total live particles across every burst (diagnostic). */
  count() {
    const a = ParticleFx._active;
    let n = 0;
    for (let i = 0; i < a.length; i++) n += part_particles_count(a[i]);
    return n;
  },
};
