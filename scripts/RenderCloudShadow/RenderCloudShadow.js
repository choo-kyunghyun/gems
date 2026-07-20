// Drifting cloud shadows (Demo) — soft dark patches sliding over the ground. Coverage follows the
// current Weather condition (each _COND carries a `cloud` fraction, cross-faded by Weather.blend()
// like RenderWeather's layers) and is scaled by daylight (WorldClock.tint alpha — no sun, no
// shadows, so the pass is gone by nightfall and the night tint never double-darkens).
//
// Clouds live on a fixed world-aligned grid in CLOUD SPACE (world + wind*time, so the field drifts
// over the world): at most one CLOUD per cell — a cumulus CLUSTER of 3–5 overlapping lobes strung
// along a wind-ish axis (fat middle, tapered ends), everything hashed from the cell index with
// Rand's MINSTD integer-float math (a chained xorshift collapses on GMRT — see CLAUDE.md).
// Lobe overlap is deliberate: the multiplicative blend compounds where lobes cross, so each cloud
// darkens toward its core (per-lobe darkness is halved in multiplier space to compensate — the
// overlapped core hits `darkness`, a lone fringe about half). Coverage gates each cell against its
// hash with a ramp, so a weather change fades individual clouds in/out rather than popping the field.
//
// Drawn SCREEN-space like RenderLighting's composite (each blob center projected via
// camera.project — a world-rect draw would foreshorten under the pitched 2.5D camera): view/
// projection reset to surface-pixel ortho (up +1 + NEGATIVE ortho height, probed on 0.20 — see
// CLAUDE.md), depth test off, blobs MULTIPLIED onto the scene via gpu_set_blendmode_ext(
// bm_dest_colour, bm_zero) as gray-center → white-edge circles (white = no change, so the soft edge
// costs nothing where clouds overlap). Drift scrolls on Weather.time() — cumulative SIM seconds —
// so clouds freeze on pause and race under Time.scale (bed fast-forward), like the rain.
//
// Inserted just BEFORE RenderWeather in RpgMap.build (outdoor maps only — meta.indoor skips it).
//
// @implements {RenderPass}
globalThis.RenderCloudShadow = class RenderCloudShadow {
  constructor(opt = {}) {
    this.enabled = true;
    this.camera = opt.camera; // a Camera instance; assigned by RpgMap.build
    this.cell = opt.cell ?? 280; // cloud-grid cell in world px (≤ one blob per cell)
    this.darkness = opt.darkness ?? 0.38; // core darkening at full coverage + full sun
    this.windX = opt.windX ?? -22; // drift, world px/s — leftward like the rain's slant
    this.windY = opt.windY ?? 8;
    this.seed = opt.seed ?? 1337; // cloud-field layout seed (fixed — the DRIFT animates, not the field)
    this._s = 1; // per-cell LCG scratch (see _rand)
  }

  destroy() {}

  draw(_world) {
    if (this.camera === undefined) return;

    // strength: weather coverage (cross-faded) × daylight. tint alpha is 0 in full daylight and
    // ≥ 0.5 from nightfall, so shadows are fully faded out before the night tint lands.
    const blend = Weather.blend();
    const cover =
      Weather.previous().cloud * (1 - blend) + Weather.current().cloud * blend;
    const sun = 1 - Math.min(1, WorldClock.tint().alpha * 2);
    const strength = this.darkness * sun;
    if (cover <= 0 || strength <= 0.02) return;

    const w = surface_get_width(application_surface);
    const h = surface_get_height(application_surface);
    if (!(w > 0)) return; // NaN-safe (NaN > 0 is false)

    const prevColor = draw_get_color();
    const prevAlpha = draw_get_alpha();
    const sv = matrix_get(matrix_view);
    const sp = matrix_get(matrix_projection);
    // up +1, NEGATIVE ortho height — the screen-space overlay orientation contract (RenderLighting).
    matrix_set(
      matrix_view,
      matrix_build_lookat(w / 2, h / 2, -1, w / 2, h / 2, 0, 0, 1, 0),
    );
    matrix_set(matrix_projection, matrix_build_projection_ortho(w, -h, 0, 2));
    // depth test off: entities wrote near depth in the world projection — with the test on, the
    // shadow would be rejected over every opaque sprite pixel instead of falling on it.
    gpu_set_ztestenable(false);
    gpu_set_blendmode_ext(bm_dest_colour, bm_zero);
    draw_set_alpha(1);

    const t = Weather.time(); // cumulative SIM seconds (a clock, not a per-frame delta)
    const dx = this.windX * t; // cloudX = worldX + dx → the field slides at -windX world px/s
    const dy = this.windY * t;
    const ang0 = Math.atan2(this.windY, this.windX); // cluster main axis ≈ wind direction
    const C = this.cell;
    const zx = w / this.camera.width; // world→screen scale for the blob radius
    // Cells covering the view rect in cloud space. The pitched camera sees more ground vertically
    // than the ortho height, so pad generously — misses are discarded by the screen cull below.
    const halfW = this.camera.width / 2;
    const halfH = this.camera.height / 2;
    const i0 = Math.floor((this.camera.toX - halfW - C + dx) / C);
    const i1 = Math.floor((this.camera.toX + halfW + C + dx) / C);
    const j0 = Math.floor((this.camera.toY - halfH * 1.6 - C + dy) / C);
    const j1 = Math.floor((this.camera.toY + halfH * 1.6 + C + dy) / C);

    let i = i0;
    while (i <= i1) {
      let j = j0;
      while (j <= j1) {
        this._seedCell(i, j);
        // coverage gate with a ramp: cells hash-below `cover` bear a cloud, easing in near the
        // threshold — the weather cross-fade animates `cover`, so clouds fade individually.
        const a = Math.min(1, (cover - this._rand()) * 3);
        if (a > 0) {
          const R = C * (0.26 + 0.2 * this._rand()); // cloud base radius, world px
          const bx = (i + 0.5) * C + (this._rand() - 0.5) * 0.5 * C - dx;
          const by = (j + 0.5) * C + (this._rand() - 0.5) * 0.5 * C - dy;
          const depth = 0.75 + 0.25 * this._rand(); // per-cloud heaviness
          // cumulus cluster: 3–5 lobes strung along a wind-ish axis, fat middle / tapered
          // ends. The lobes deliberately OVERLAP: the multiplicative blend compounds where
          // they do, so the cluster core reads denser than its fringe — the "volume".
          const n = 3 + Math.floor(this._rand() * 3);
          const ang = ang0 + (this._rand() - 0.5) * 0.9;
          const ca = Math.cos(ang);
          const sa = Math.sin(ang);
          // per-lobe darkening: half the cloud's target in MULTIPLIER space, so the
          // double-overlapped core lands at ~`darkness` (a triple runs a bit deeper) while a
          // lone fringe lobe stays at about half.
          const dl = 1 - Math.sqrt(1 - Math.min(0.95, strength * a * depth));
          const lobe = Color.merge(c_white, c_black, dl);
          let k = 0;
          while (k < n) {
            // u: -1..1 along the axis (NOT `t` — shadowing the outer time const invites the
            // GMRT local-clobber family of bugs)
            const u = (k / (n - 1)) * 2 - 1;
            const lr =
              R * (0.95 - 0.45 * Math.abs(u)) * (0.85 + 0.3 * this._rand());
            const along = u * R * 0.9;
            const side = (this._rand() - 0.5) * R * 0.5;
            const s = this.camera.project(
              bx + ca * along - sa * side,
              by + sa * along + ca * side,
              0,
            );
            const rs = lr * zx;
            if (s.x + rs > 0 && s.x - rs < w && s.y + rs > 0 && s.y - rs < h)
              draw_circle_color(s.x, s.y, rs, lobe, c_white, false);
            k++;
          }
        }
        j++;
      }
      i++;
    }

    gpu_set_blendmode(bm_normal);
    gpu_set_ztestenable(true);
    matrix_set(matrix_view, sv);
    matrix_set(matrix_projection, sp);
    draw_set_color(prevColor);
    draw_set_alpha(prevAlpha);
  }

  // Reseed the inline stream for one cloud-grid cell (Rand's MINSTD — state kept in a field, not
  // a Rand.lcg closure: this reseeds per cell per frame, and a closure each time would be churn).
  _seedCell(ix, iy) {
    this._s = Rand.seed2(ix, iy, this.seed);
  }

  // next float in [0, 1) for the seeded cell
  _rand() {
    this._s = Rand.step(this._s);
    return Rand.norm(this._s);
  }
};
