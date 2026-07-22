/**
 * ParticleFx — plays IDE Particle System ASSETS as one-shot, positioned, aimable world-space
 * effects. A singleton, like FloatingText. Each spawnAsset instances the asset + parks it in
 * an active list; update() reaps an instance once its particles die so concurrent systems stay
 * bounded (no leak — see CLAUDE.md). A baked BURST emitter fires on its first update (verified
 * 0.20), so position before that first update (spawnAsset does) and the burst lands right.
 *
 * Wiring (mirrors FloatingText — world space, pause-aware): update() once per frame from step()
 * (so effects freeze when the level pauses), draw() from draw() AFTER the renderer; clear() on
 * level/map swap (world coords are level-local, must not bleed into the next).
 *
 * GMRT (see CLAUDE.md): renders via the MANUAL part_system_drawit path (auto-draw/update off).
 * Handles are OPAQUE STRUCT REFS — never `>= 0`-test them; use part_*_exists. The stepper advances
 * in whole frames, so update() ticks once per frame (not Time.delta) — pause = step() being skipped.
 */
globalThis.ParticleFx = {
  _active: [], // live one-shot instances; reaped when empty

  // Spawn a one-shot instance at world (x, y), aimed at GM angle `angDeg` (0 = right, 90 = up).
  // Rotated by `angDeg - baseDeg`; editor default emission is up (90), so pass `baseDeg` if the
  // asset points elsewhere. Omit `angDeg` for no rotation.
  spawnAsset(asset, x, y, angDeg, baseDeg = 90) {
    const s = part_system_create(asset); // instances the asset's baked emitters/types
    part_system_automatic_draw(s, false); // the level draws it (z-ordered over day/night)
    part_system_automatic_update(s, false); // we tick it (pause-aware via step())
    part_system_position(s, x, y); // before the first update → burst lands here
    if (angDeg !== undefined) part_system_angle(s, angDeg - baseDeg);
    ParticleFx._active.push(s);
    return s;
  },

  // Advance every live instance one frame, reaping spent ones. Once per frame from step().
  update() {
    const a = ParticleFx._active;
    const live = [];
    for (let i = 0; i < a.length; i++) {
      part_system_update(a[i]); // first update fires a baked burst emitter
      if (part_particles_count(a[i]) > 0) live.push(a[i]);
      else part_system_destroy(a[i]); // spent → free it (emitters die with the system)
    }
    ParticleFx._active = live;
  },

  // Draw every live instance — from a level's draw() in world space, after the renderer.
  draw() {
    const a = ParticleFx._active;
    for (let i = 0; i < a.length; i++) part_system_drawit(a[i]);
  },

  // Destroy all live instances. Call on level/map swap (their world coords are level-local).
  clear() {
    const a = ParticleFx._active;
    for (let i = 0; i < a.length; i++) part_system_destroy(a[i]);
    ParticleFx._active = [];
  },

  // Total live particles across all instances (diagnostic).
  count() {
    const a = ParticleFx._active;
    let n = 0;
    for (let i = 0; i < a.length; i++) n += part_particles_count(a[i]);
    return n;
  },
};
