// The shape the PLAYER sees an entity as, and the cursor tests over it — the pick half of the
// art projection contract RenderBillboard draws (AABB owns the sim half, the ground footprint).
/**
 * A pitched view splits an entity's shape in two: the sim's footprint lies on the ground, while
 * a body is DRAWN standing off it (RenderBillboard's STANDING pass), so the two cover different
 * screen pixels and only the drawn one is what a click means.
 *
 * Both live here as ONE box in SILHOUETTE SPACE — `{left, right, bottom, top}` measured from the
 * entity's foot (Position): left/right along world x, bottom/top as height UP the silhouette.
 * That space is the screen with the perspective divided out: world x reaches it untouched, and
 * a ground cursor `c` sits at height `a = (pos.y − c.y)·cos(pitch)` over the foot — the inverse
 * of the standing pass's own projection (RenderBillboard.tall), so a box built from the drawn
 * sprite and a box built from the flat footprint are directly comparable. One rect, two sources:
 *   STANDING   a Visual or Skeleton sprite — its drawn extent, origin at the foot
 *   GROUND     no sprite (a Mesh prop, a bare collider) — its BBox, flattened by cos(pitch)
 *
 * `of`/`ofInto` answer the standing box alone (undefined where there is none — a caller that
 * DRAWS must know which plane it got); `hit` tests the shape the player sees, either source.
 * Cursors here are GROUND-plane points (Camera.cursorWorld with no argument), never the aim
 * plane: the height IS the answer this reads.
 */
globalThis.Silhouette = {
  // hit()'s own box, reused per test (docs/ARCHITECTURE.md → Hot-path idioms) — a caller that
  // keeps a box past the call passes its own (Silhouette.box)
  _box: { left: 0, right: 0, bottom: 0, top: 0 },

  /** A zeroed box, for the `*Into` calls — one owner for the shape. */
  box() {
    return { left: 0, right: 0, bottom: 0, top: 0 };
  },

  /** The standing box of a drawn body, or undefined — `ofInto` into a fresh box. */
  of(entities, id) {
    return Silhouette.ofInto(entities, id, Silhouette.box());
  },

  /**
   * The STANDING box of a drawn body into `out`, or undefined when the entity draws no sprite.
   * The sprite's own frame and origin are the silhouette (a Spine sheet reports both soundly —
   * only its FRAME metadata is garbage, docs/SPINE.md), scaled by the draw scale, whose x sign
   * is facing — so the extents come out of a min/max, not an abs, and a rig drawn off-centre
   * (spineRat) keeps its longer side ahead.
   */
  ofInto(entities, id, out) {
    let sprite;
    let xscale;
    let yscale;
    const vis = entities.get(id, Visual);
    if (vis !== undefined) {
      sprite = vis.sprite;
      xscale = vis.xscale;
      yscale = vis.yscale;
    } else {
      const sk = entities.get(id, Skeleton);
      if (sk === undefined) return undefined;
      sprite = sk.sprite;
      xscale = sk.xscale;
      yscale = sk.yscale;
    }
    if (!sprite_exists(sprite)) return undefined;
    const ox = sprite_get_xoffset(sprite);
    const oy = sprite_get_yoffset(sprite);
    const x0 = -ox * xscale;
    const x1 = (sprite_get_width(sprite) - ox) * xscale;
    // sprite y runs DOWN from the top while silhouette height runs up, so the origin row sits
    // as high as every row above it is tall
    const y0 = oy * yscale;
    const y1 = (oy - sprite_get_height(sprite)) * yscale;
    out.left = x0 < x1 ? x0 : x1;
    out.right = x0 < x1 ? x1 : x0;
    out.bottom = y0 < y1 ? y0 : y1;
    out.top = y0 < y1 ? y1 : y0;
    return out;
  },

  /**
   * Is the ground cursor `c` on the shape the player sees — the standing silhouette, else the
   * BBox lying flat (foreshortened by the pitch)? False for an entity with neither.
   */
  hit(entities, id, pos, c, pitch) {
    const box = Silhouette.ofInto(entities, id, Silhouette._box);
    const cos = Math.cos(pitch);
    const dx = c.x - pos.x;
    const a = (pos.y - c.y) * cos;
    if (box === undefined) {
      const bb = entities.get(id, BBox);
      if (bb === undefined) return false;
      if (!(bb.width > 0) || !(bb.height > 0)) return false; // unlaid / NaN box
      return (
        dx >= bb.x &&
        dx <= bb.x + bb.width &&
        a >= -(bb.y + bb.height) * cos &&
        a <= -bb.y * cos
      );
    }
    return dx >= box.left && dx <= box.right && a >= box.bottom && a <= box.top;
  },

  /**
   * THE entity the cursor is on, or -1: the FRONTMOST hit, front being the larger world y (the
   * eye sits north of its target, so that is also what the depth buffer kept and the player
   * therefore sees). `opts`: { has? require this component's token — it LEADS the walk, so the
   * scan gates on the rarest column first; ignore? skip this id }.
   */
  pick(entities, c, pitch, opts = {}) {
    let bestId = -1;
    let bestY = -Infinity;
    const ignore = opts.ignore;
    const each = (id, pos) => {
      if (id === ignore) return;
      if (pos.y <= bestY) return; // a nearer hit already stands — no need to test this one
      if (!Silhouette.hit(entities, id, pos, c, pitch)) return;
      bestY = pos.y;
      bestId = id;
    };
    const extra = opts.has;
    if (extra !== undefined) {
      entities.forEach([extra, Position], (id, _e, pos) => each(id, pos));
      return bestId;
    }
    entities.forEach([Position], (id, pos) => each(id, pos));
    return bestId;
  },
};
