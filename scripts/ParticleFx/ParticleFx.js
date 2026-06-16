/**
 * ParticleFx — plays IDE Particle System ASSETS (made in the Particle System Editor) as
 * one-shot, positioned, aimable world-space effects. Standalone static singleton, like
 * FloatingText. Author the look in the IDE (e.g. ps_muzzle); gameplay code just spawns it:
 *
 *   ParticleFx.spawnAsset(ps_muzzle, x, y, angDeg);  // fire it at (x,y), aimed at angDeg
 *
 * Each call instances the asset (with its baked emitters), positions + rotates it, and parks
 * it in an active list; ParticleFx.update() ticks every instance once per frame and destroys
 * one as soon as its particles die, so concurrent systems stay bounded (no leak — see the
 * memory note in CLAUDE.md). A baked BURST emitter fires once on its first update (probe-
 * verified on 0.20), which is exactly a one-shot effect — position before that first update
 * (spawnAsset does) and the burst lands in the right place.
 *
 * Wiring (mirrors FloatingText — world space, pause-aware):
 *   - a scene calls ParticleFx.update() ONCE per frame from step() (so effects freeze while
 *     the SystemMenu pauses the scene, like WorldClock/Weather), and ParticleFx.draw() from
 *     its draw() AFTER the renderer (world space, over the day/night tint);
 *   - SceneManager._apply + RpgMap.load call ParticleFx.clear() on scene/map swap (live
 *     systems' world coords are scene-local and must not bleed into the next).
 *
 * GMRT notes (verified on 0.20): the native particle system renders to the application surface
 * via the MANUAL part_system_drawit path (auto-draw/update off); see CLAUDE.md. Particle
 * handles are OPAQUE STRUCT REFS, not numeric indices — never `>= 0`-test them. The native
 * stepper advances in whole frames, so update() ticks once per frame (it doesn't scale by
 * Time.delta) — pause comes from step() being skipped, which is enough here.
 */
globalThis.ParticleFx = class ParticleFx {
  static _active = []; // live one-shot asset-system instances; reaped when empty

  // Spawn a one-shot instance of an IDE Particle System ASSET at world (x, y), aimed at GM
  // angle `angDeg` (0 = right, 90 = up; use point_direction). The editor's default emission
  // points up (90), so the whole system is rotated by `angDeg - baseDeg` to face the aim;
  // pass `baseDeg` if the asset was authored pointing elsewhere. Omit `angDeg` for no rotation.
  static spawnAsset(asset, x, y, angDeg, baseDeg = 90) {
    const s = part_system_create(asset); // instances the asset's baked emitters/types
    part_system_automatic_draw(s, false); // the scene draws it (z-ordered over day/night)
    part_system_automatic_update(s, false); // we tick it (pause-aware via step())
    part_system_position(s, x, y); // before the first update → burst lands here
    if (angDeg !== undefined) part_system_angle(s, angDeg - baseDeg);
    ParticleFx._active.push(s);
    return s;
  }

  // Advance every live instance one frame, destroying any whose particles have all died.
  // Call once per frame from a scene's step() (skipped while paused → effects freeze).
  static update() {
    const a = ParticleFx._active;
    const live = [];
    for (let i = 0; i < a.length; i++) {
      part_system_update(a[i]); // first update fires a baked burst emitter
      if (part_particles_count(a[i]) > 0) live.push(a[i]);
      else part_system_destroy(a[i]); // spent → free it (emitters die with the system)
    }
    ParticleFx._active = live;
  }

  // Draw every live instance. Call from a scene's draw() in world space (inside the camera
  // view), after the renderer so effects sit over the day/night tint.
  static draw() {
    const a = ParticleFx._active;
    for (let i = 0; i < a.length; i++) part_system_drawit(a[i]);
  }

  // Destroy all live instances. Call on scene/map swap (their world coords are scene-local).
  static clear() {
    const a = ParticleFx._active;
    for (let i = 0; i < a.length; i++) part_system_destroy(a[i]);
    ParticleFx._active = [];
  }

  // Total live particles across all instances (diagnostic).
  static count() {
    const a = ParticleFx._active;
    let n = 0;
    for (let i = 0; i < a.length; i++) n += part_particles_count(a[i]);
    return n;
  }
};
