/**
 * BBox-outline debug overlay (lime), one linelist draw call for the whole world.
 * Insert it *after* `RenderDebugBox` so the outlines sit on top of the colored
 * boxes (it draws only outlines — boxes are `RenderDebugBox`, names `RenderDebugName`).
 * @implements {RenderPass}
 */
globalThis.RenderDebugEntity = class RenderDebugEntity {
  constructor() {
    // `Renderer.draw` skips a pass while `enabled` is false; the SystemMenu Debug tab toggles
    // this live. A scene using it as a pure overlay inserts it disabled (see scenePlatformer/
    // sceneRpg); RTS keeps it enabled since it's that scene's only entity renderer.
    this.enabled = true;
    this._rp = { x: 0, y: 0 }; // reused interp scratch (no per-entity alloc)
  }

  destroy() {}

  draw(world) {
    const color = draw_get_color();
    const alpha = draw_get_alpha();

    draw_set_alpha(1);

    const ids = world.query(Position);

    // All BBox outlines in one linelist draw call instead of N draw_rectangle calls.
    draw_set_color(c_lime);
    draw_primitive_begin(pr_linelist);
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const bbox = world.get(BBox, id);
      if (bbox === undefined) continue;
      const e = AABB.edges(InterpolationSystem.lerp(world, id, this._rp), bbox);
      draw_vertex(e.x1, e.y1);
      draw_vertex(e.x2, e.y1);
      draw_vertex(e.x2, e.y1);
      draw_vertex(e.x2, e.y2);
      draw_vertex(e.x1, e.y2);
      draw_vertex(e.x2, e.y2);
      draw_vertex(e.x1, e.y1);
      draw_vertex(e.x1, e.y2);
    }
    draw_primitive_end();

    draw_set_color(color);
    draw_set_alpha(alpha);
  }
};
