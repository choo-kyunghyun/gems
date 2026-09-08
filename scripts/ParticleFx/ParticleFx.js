/**
 * ParticleFx — plays IDE Particle System ASSETS as world-space effects, two ways. A singleton,
 * like FloatingText.
 *   ONE-SHOT  spawnAsset: positioned, aimable; parked in an active list that update() reaps once
 *             the particles die, so concurrent systems stay bounded (no leak — see CLAUDE.md). A
 *             baked BURST emitter fires on its first update, so position before that first update
 *             (spawnAsset does) and the burst lands right.
 *   HELD      hold(key): a STREAM that lives as long as its holder says (release/sweep/clear), keyed
 *             by whatever the holder owns — an entity id. The holder positions, tints and draws it
 *             (a held effect rides its owner's matrix), so draw() leaves the held ones alone.
 *
 * Wiring (mirrors FloatingText — world space, pause-aware): update() once per frame from step()
 * (so effects freeze when the scene pauses), draw() from draw() AFTER the renderer; clear() on
 * scene/map swap (world coords are map-local, must not bleed into the next).
 *
 * GMRT (see CLAUDE.md): renders via the MANUAL part_system_drawit path (auto-draw/update off).
 * Handles are OPAQUE STRUCT REFS — never `>= 0`-test them; use part_*_exists. The stepper advances
 * in whole frames, so update() ticks once per frame (not Time.delta) — pause = step() being skipped.
 */
globalThis.ParticleFx = {
  _active: [], // live one-shot instances; reaped when empty
  _heldKeys: [], // holder keys of the held instances, parallel to _held (a handful — linear scan)
  _held: [],

  // Spawn a one-shot instance at world (x, y), aimed at GM angle `angDeg` (0 = right, 90 = up).
  // Rotated by `angDeg - baseDeg`; editor default emission is up (90), so pass `baseDeg` if the
  // asset points elsewhere. Omit `angDeg` for no rotation.
  spawnAsset(asset, x, y, angDeg, baseDeg = 90) {
    const s = part_system_create(asset); // instances the asset's baked emitters/types
    part_system_automatic_draw(s, false); // the scene draws it (z-ordered over day/night)
    part_system_automatic_update(s, false); // we tick it (pause-aware via step())
    part_system_position(s, x, y); // before the first update → burst lands here
    if (angDeg !== undefined) part_system_angle(s, angDeg - baseDeg);
    ParticleFx._active.push(s);
    return s;
  },

  /**
   * The held instance for `key`, instancing `asset` on the first call. Created at the origin,
   * untinted: the holder places it (or draws it under its own matrix) and tints it.
   */
  hold(key, asset) {
    const keys = ParticleFx._heldKeys;
    for (let i = 0; i < keys.length; i++) {
      if (keys[i] === key) return ParticleFx._held[i];
    }
    const s = part_system_create(asset);
    part_system_automatic_draw(s, false); // the holder draws it
    part_system_automatic_update(s, false); // we tick it (pause-aware via step())
    keys.push(key);
    ParticleFx._held.push(s);
    return s;
  },

  /** Destroy the held instance for `key` (none is fine). */
  release(key) {
    const keys = ParticleFx._heldKeys;
    for (let i = 0; i < keys.length; i++) {
      if (keys[i] !== key) continue;
      part_system_destroy(ParticleFx._held[i]);
      keys.splice(i, 1);
      ParticleFx._held.splice(i, 1);
      return;
    }
  },

  /** Release every held instance whose key fails `keep(key)` — a holder's per-frame sync. */
  sweep(keep) {
    const keys = ParticleFx._heldKeys;
    for (let i = keys.length - 1; i >= 0; i--) {
      if (keep(keys[i])) continue;
      part_system_destroy(ParticleFx._held[i]);
      keys.splice(i, 1);
      ParticleFx._held.splice(i, 1);
    }
  },

  /** Advance every live instance one frame, reaping spent one-shots. Once per frame from step(). */
  update() {
    const a = ParticleFx._active;
    const live = [];
    for (let i = 0; i < a.length; i++) {
      part_system_update(a[i]); // first update fires a baked burst emitter
      if (part_particles_count(a[i]) > 0) live.push(a[i]);
      else part_system_destroy(a[i]); // spent → free it (emitters die with the system)
    }
    ParticleFx._active = live;
    const h = ParticleFx._held;
    for (let i = 0; i < h.length; i++) part_system_update(h[i]);
  },

  /** Draw every one-shot instance — from a scene's draw() in world space, after the renderer. */
  draw() {
    const a = ParticleFx._active;
    for (let i = 0; i < a.length; i++) part_system_drawit(a[i]);
  },

  /** Destroy every instance, held ones included. Call on scene/map swap (their world coords are map-local). */
  clear() {
    const a = ParticleFx._active;
    for (let i = 0; i < a.length; i++) part_system_destroy(a[i]);
    ParticleFx._active = [];
    const h = ParticleFx._held;
    for (let i = 0; i < h.length; i++) part_system_destroy(h[i]);
    ParticleFx._held = [];
    ParticleFx._heldKeys = [];
  },

  /** Total live particles across all instances (diagnostic). */
  count() {
    const a = ParticleFx._active;
    let n = 0;
    for (let i = 0; i < a.length; i++) n += part_particles_count(a[i]);
    const h = ParticleFx._held;
    for (let i = 0; i < h.length; i++) n += part_particles_count(h[i]);
    return n;
  },
};
