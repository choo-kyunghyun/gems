// Radar — top-down blip view of a World around a target, immediate-mode (reads World live).
// Entities within `range` colored by first matching tag in `rules`; target gets a facing notch.
// GMRT: NaN-width guard (first post-transition frame); Set.has() is fine — only for...of over a Set is banned.
/** @implements {UIComponent} */
globalThis.UIMinimap = class UIMinimap {
  /** @param {Object} [m] { world, target, range, rules: {tag,color}[], inset, blipSize, bgColor, bgAlpha, ringColor, playerColor } */
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

  /** @param {UIElement} element */
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

    draw_set_alpha(this.bgAlpha);
    draw_set_color(this.bgColor);
    draw_circle(cx, cy, radius, false);
    draw_set_alpha(1);
    draw_set_color(this.ringColor);
    draw_circle(cx, cy, radius, true);

    // blips clipped to the rim (radial cull keeps dots inside the circle).
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

    // target marker + facing notch (dot in the heading direction).
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

  /** @param {number} id @returns {number|null} the first matching rule color, or null if untagged */
  _color(id) {
    const tag = this.world.get(Tag, id);
    if (tag === undefined) return null;
    for (let r = 0; r < this.rules.length; r++) {
      if (tag.tags.has(this.rules[r].tag)) return this.rules[r].color;
    }
    return null;
  }
};
