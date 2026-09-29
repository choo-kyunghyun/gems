/**
 * @implements {UIComponent}
 * Radar over a level: every entity a rule matches shows as a blip in the rule's colour — a marker
 * over its head while it projects inside the element, an arrow on the element's edge pointing at
 * it while it projects outside. A rule is { has, where?, color }: it matches an entity carrying
 * the component `has` whose data `where(comp)`, when given, accepts. Rules run in priority order:
 * the first match claims an entity, and a higher rule's blips draw over a lower's. The level comes
 * from the `level()` hook each frame (null draws nothing), so a map swap needs no rebind. Ortho
 * views only: a perspective view draws nothing. Colours are GM colour ints.
 */
globalThis.UIRadar = class UIRadar {
  constructor(t = {}) {
    this.level = t.level ?? null;
    this.rules = t.rules ?? [];
    this.lift = t.lift ?? 0; // world px above the Position a marker points at
    this.margin = t.margin ?? 24; // GUI px from the element's edge to an arrow's centre
    this.marker = t.marker ?? 12; // GUI px
    this.arrow = t.arrow ?? 18; // GUI px, at the edge; smaller and fainter the farther past it
    this.fade = t.fade ?? 2400; // GUI px past the edge where an arrow bottoms out
    this.outline = t.outline ?? make_colour_rgb(10, 12, 16);
    // the frame's blips, lowest priority first: reused records, the first `count` live
    this.blips = [];
    this.count = 0;
  }

  onDraw(element) {
    const level = this.level !== null ? this.level() : null;
    if (level === null) return;
    const pos = element.getLayoutPosition();
    const n = this.place(
      level.entities,
      CameraSystem.view(level),
      pos.left,
      pos.top,
      pos.width,
      pos.height,
    );
    if (n === 0) return;
    const st = UIDraw.save();
    const blips = this.blips;
    for (let i = 0; i < n; i++) {
      const b = blips[i];
      if (b.edge) {
        const len = this.arrow * (1 - 0.35 * b.far);
        draw_set_alpha(1 - 0.35 * b.far);
        this._tri(b.x + (b.nx * len) / 2, b.y + (b.ny * len) / 2, b.nx, b.ny, len, len * 0.55, b.color);
      } else {
        draw_set_alpha(1);
        this._tri(b.x, b.y - 4, 0, 1, this.marker * 1.2, this.marker * 0.7, b.color);
      }
    }
    UIDraw.restore(st);
  }

  /**
   * Fills `blips` for the rect (GUI px) over `view` and returns their count: each a record
   * { x, y, nx, ny, far, edge, color } — the marker's head point, or the arrow's centre on the
   * rect inset by `margin` with (nx, ny) the unit direction to the entity and `far` its distance
   * past the edge over `fade`, 0..1.
   */
  place(entities, view, left, top, width, height) {
    this.count = 0;
    if (view.width === 0) return 0;
    if (view.projection !== CAMERA_PROJECTION.ORTHO) return 0;
    const kx = display_get_gui_width() / surface_get_width(application_surface);
    const ky = display_get_gui_height() / surface_get_height(application_surface);
    const cx = left + width / 2;
    const cy = top + height / 2;
    const hw = Math.max(0, width / 2 - this.margin);
    const hh = Math.max(0, height / 2 - this.margin);
    const lift = this.lift;
    const rules = this.rules;
    for (let r = rules.length - 1; r >= 0; r--) {
      const rule = rules[r];
      entities.forEach([rule.has, Position], (id, comp, p) => {
        if (rule.where !== undefined) if (!rule.where(comp)) return;
        if (this._claimed(entities, id, r)) return;
        const s = view.project(p.x, p.y, p.z - lift);
        const dx = s.x * kx - cx;
        const dy = s.y * ky - cy;
        if (Math.abs(dx) <= width / 2) {
          if (Math.abs(dy) <= height / 2) {
            this._push(cx + dx, cy + dy, 0, 0, 0, false, rule.color);
            return;
          }
        }
        // out of the rect: along the ray from its centre to where it meets the inset edge
        const len = Math.sqrt(dx * dx + dy * dy);
        const tx = dx !== 0 ? hw / Math.abs(dx) : Infinity;
        const ty = dy !== 0 ? hh / Math.abs(dy) : Infinity;
        const t = Math.min(tx, ty);
        const far = Math.min(1, (len * (1 - t)) / this.fade);
        this._push(cx + dx * t, cy + dy * t, dx / len, dy / len, far, true, rule.color);
      });
    }
    return this.count;
  }

  /** Whether a rule above `r` matches the entity, which then shows under that rule alone. */
  _claimed(entities, id, r) {
    const rules = this.rules;
    for (let k = 0; k < r; k++) {
      const rule = rules[k];
      const c = entities.get(id, rule.has);
      if (c === undefined) continue;
      if (rule.where === undefined ? true : rule.where(c)) return true;
    }
    return false;
  }

  _push(x, y, nx, ny, far, edge, color) {
    let b = this.blips[this.count];
    if (b === undefined) {
      b = { x: 0, y: 0, nx: 0, ny: 0, far: 0, edge: false, color: 0 };
      this.blips[this.count] = b;
    }
    b.x = x;
    b.y = y;
    b.nx = nx;
    b.ny = ny;
    b.far = far;
    b.edge = edge;
    b.color = color;
    this.count++;
  }

  /** A triangle with its tip at (tx, ty) pointing along unit (nx, ny), over a darker outline. */
  _tri(tx, ty, nx, ny, len, half, col) {
    UIRadar._fill(tx + nx * 2, ty + ny * 2, nx, ny, len + 4, half + 3, this.outline);
    UIRadar._fill(tx, ty, nx, ny, len, half, col);
  }

  static _fill(tx, ty, nx, ny, len, half, col) {
    const bx = tx - nx * len;
    const by = ty - ny * len;
    draw_triangle_color(
      tx,
      ty,
      bx - ny * half,
      by + nx * half,
      bx + ny * half,
      by - nx * half,
      col,
      col,
      col,
      false,
    );
  }
};
