/**
 * Production entity renderer: draws every entity with `Visual` + `Position` via
 * `draw_sprite_ext`, advancing looped sprite playback and interpolating position
 * through `InterpolationSystem.lerp`.
 * @implements {RenderPass}
 */
globalThis.RenderEntity = class RenderEntity {
  constructor() {
    this.enabled = true;
    this._rp = { x: 0, y: 0 }; // reused interp scratch (no per-entity alloc)
  }

  destroy() {}

  draw(world) {
    const entities = world.query(Visual, Position);
    for (const entity of entities) {
      const visual = world.get(Visual, entity);
      const rp = InterpolationSystem.lerp(world, entity, this._rp);
      const rx = rp.x;
      const ry = rp.y;
      if (visual.speed !== 0) {
        visual.time += visual.speed * Time.raw;
        visual.subimg =
          Math.floor(visual.time) % sprite_get_number(visual.sprite);
      }
      draw_sprite_ext(
        visual.sprite,
        visual.subimg,
        rx,
        ry,
        visual.xscale,
        visual.yscale,
        visual.rot,
        visual.color,
        visual.alpha,
      );
    }
  }
};

// ─── 2.5D billboard spike (EXPERIMENTAL) ────────────────────────────────────────
// Stands each foot-anchored sprite UP in 3D via a world matrix, so front-view art reads
// correctly under a pitched follow camera (cameraFollow2d `pitch`), and the depth buffer —
// gpu_set_ztestenable + gpu_set_alphatestenable, both on in obj_game Create_0 — sorts
// overlapping bodies PER-PIXEL (nearer foot wins), retiring the manual Y-sort. Drop-in
// alternative to RenderEntity (same Visual/Position query, interp, anim advance); only the
// draw is matrixed: matrix_set(matrix_world, matrix_build(...)) → draw_sprite_ext at the
// local origin (the sprite's foot) → reset to identity. `tiltDeg` leans the sprite plane
// about X to face the camera (tune against the camera pitch). Needs HARD-alpha sprites
// (soft edges break z-buffer order). Spike — promote to its own asset if it sticks.
globalThis.RenderBillboard = class RenderBillboard {
  constructor(opt) {
    opt = opt ?? {};
    this.enabled = true;
    // X-rotation that stands the sprite up FACING the camera = the NEGATIVE of the camera's
    // pitch (verified by an in-engine rotation sweep). Pass the same pitch the follow camera uses.
    this.tiltDeg = -(opt.pitchDeg ?? 0);
    this._rp = { x: 0, y: 0 };
  }

  destroy() {}

  draw(world) {
    const ident = matrix_build_identity();
    for (const entity of world.query(Visual, Position)) {
      const visual = world.get(Visual, entity);
      const rp = InterpolationSystem.lerp(world, entity, this._rp);
      if (visual.speed !== 0) {
        visual.time += visual.speed * Time.raw;
        visual.subimg =
          Math.floor(visual.time) % sprite_get_number(visual.sprite);
      }
      // Foot at (rp.x, rp.y, 0); the X tilt stands the sprite up toward the pitched camera.
      const m = matrix_build(rp.x, rp.y, 0, this.tiltDeg, 0, 0, 1, 1, 1);
      matrix_set(matrix_world, m);
      draw_sprite_ext(
        visual.sprite,
        visual.subimg,
        0,
        0,
        visual.xscale,
        visual.yscale,
        0,
        visual.color,
        visual.alpha,
      );
      matrix_set(matrix_world, ident);
    }
    matrix_set(matrix_world, ident);
  }
};
