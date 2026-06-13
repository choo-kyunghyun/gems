/**
 * @implements {UIComponent}
 * Minimap / radar — a top-down blip view of a World's entities around a target,
 * drawn directly in onDraw (the UISlots/UIQuestTracker immediate-mode pattern: reads
 * the World live each frame, no flexpanel children). gemsMinimap builds the framed
 * element (a UINineSlice behind this), so add this as the higher-index component.
 *
 * The target entity sits at the radar center; every other entity within `range` world
 * units is plotted at its scaled relative offset, colored by the first matching tag in
 * `rules` ([{ tag, color }]) — entities with no matching tag are skipped. The target is
 * drawn as a distinct marker with a facing notch (from its Direction, if any).
 *
 * GMRT: guard `!(pos.width > 0)` (NaN layout on the first post-transition frame). Blips
 * use draw_circle (draw_triangle_color / draw_line_width_color render nothing on 0.19,
 * so no triangles/width-lines — the facing notch is a small circle, like RpgWorldOverlay).
 * Tag membership is read via Set.has() (allowed — only for...of over a Set is banned).
 */
globalThis.UIMinimap = class UIMinimap {
  constructor(m = {}) {
    this.world = m.world ?? null;
    this.target = m.target ?? -1; // center entity id (also the player marker)
    this.range = m.range ?? 480; // world units from center to the radar edge
    this.rules = m.rules ?? []; // [{ tag, color }] — first match wins
    this.inset = m.inset ?? 8; // px between the frame and the radar circle
    this.blipSize = m.blipSize ?? 3;

    this.bgColor = m.bgColor ?? make_colour_rgb(16, 18, 24);
    this.bgAlpha = m.bgAlpha ?? 0.85;
    this.ringColor = m.ringColor ?? make_colour_rgb(60, 67, 80);
    this.playerColor = m.playerColor ?? c_white;
  }

  onDraw(element) {
    if (this.world === null) return;
    const pos = element.getLayoutPosition();
    if (!(pos.width > 0)) return; // unlaid-out (NaN) or zero-width
    const tp = this.world.get(Position, this.target);
    if (tp === undefined) return; // target gone — nothing to center on

    const color = draw_get_color();
    const a0 = draw_get_alpha();

    const cx = pos.left + pos.width * 0.5;
    const cy = pos.top + pos.height * 0.5;
    const radius = Math.min(pos.width, pos.height) * 0.5 - this.inset;
    if (!(radius > 0)) {
      draw_set_color(color);
      draw_set_alpha(a0);
      return;
    }
    const scale = radius / this.range;

    // Radar backdrop + rim.
    draw_set_alpha(this.bgAlpha);
    draw_set_color(this.bgColor);
    draw_circle(cx, cy, radius, false);
    draw_set_alpha(1);
    draw_set_color(this.ringColor);
    draw_circle(cx, cy, radius, true);

    // Blips: entities within range, colored by their first matching tag rule, clipped
    // to the radar circle (radial cull — keeps the dots inside the rim).
    const rSq = radius * radius;
    const ids = Query.inRadius(this.world, tp.x, tp.y, this.range);
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      if (id === this.target) continue;
      const c = this._color(id);
      if (c === null) continue;
      const p = this.world.get(Position, id);
      const dx = (p.x - tp.x) * scale;
      const dy = (p.y - tp.y) * scale;
      if (dx * dx + dy * dy > rSq) continue;
      draw_set_color(c);
      draw_circle(cx + dx, cy + dy, this.blipSize, false);
    }

    // Target marker + facing notch (a small dot in the heading direction).
    draw_set_color(this.playerColor);
    draw_circle(cx, cy, this.blipSize + 1, false);
    const dir = this.world.get(Direction, this.target);
    if (dir !== undefined && (dir.x !== 0 || dir.y !== 0)) {
      draw_circle(
        cx + dir.x * (this.blipSize + 4),
        cy + dir.y * (this.blipSize + 4),
        1.5,
        false,
      );
    }

    draw_set_color(color);
    draw_set_alpha(a0);
  }

  _color(id) {
    const tag = this.world.get(Tag, id);
    if (tag === undefined) return null;
    for (let r = 0; r < this.rules.length; r++) {
      if (tag.tags.has(this.rules[r].tag)) return this.rules[r].color;
    }
    return null;
  }
};
