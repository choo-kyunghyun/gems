/**
 * Pixel-snapped orthographic follow camera — a Camera CONTROL (the contract is Camera's JSDoc).
 * Each update it eases the wheel zoom, re-derives the view extent from the live surface, tilts the
 * view, then eases the look-at onto the tracked entity and clamps it inside the map.
 *
 * The three steps run in that order because each feeds the next: the extent decides the pitch
 * (`pitchCurve` reads zoom), and the pitch decides how far the ground rect reaches, which is what
 * the edge clamp measures against.
 *
 * opt: `entities` + `target` (the tracked store and its raw-id fallback — see targetId),
 * `lerp` (look-at smoothing 0..1), `eyeDist` (ortho eye distance from the ground plane),
 * `pitch` (degrees, frame-0 seed) with optional `pitchCurve` (zoom) => degrees,
 * `bounds` { x1, y1, x2, y2 } world-px look-at clamp, `viewCap` (max view width in world px),
 * and the zoom bag `zoom`/`zoomMin`/`zoomMax`/`zoomStep`/`zoomLerp`/`zoomButton`.
 */
globalThis.CameraFollow = class CameraFollow {
  constructor(opt = {}) {
    this.raw = false; // sim-clock control (Camera contract)

    this.entities = opt.entities;
    this.target = opt.target ?? -1;
    this.lerp = opt.lerp ?? 0.1;
    // eye distance from the ground plane, always taken as a magnitude: the eye sits at -Z above
    // the ground, and pitch swings it out of the plane from there
    this.eyeDist = Math.abs(opt.eyeDist ?? 100);

    /**
     * Authored tilt in DEGREES — this control's config and Debug-slider unit. `pitchCurve`
     * overwrites it every update when installed (so the slider is inert until the curve is
     * cleared), and _tilt converts it into the camera's radian `pitch`, which is what the render
     * culls and overlays read.
     */
    this.pitchDeg = opt.pitch ?? 0;
    this.pitchCurve = opt.pitchCurve;

    this.bounds = opt.bounds;
    this.viewCap = opt.viewCap;

    this.zoom = opt.zoom ?? 1; // current, eased
    this.zoomTarget = this.zoom; // wheel destination
    this.zoomHome = this.zoom; // zoomButton reset destination
    this.zoomMin = opt.zoomMin ?? 0.5;
    this.zoomMax = opt.zoomMax ?? 4;
    this.zoomStep = opt.zoomStep ?? 0.1;
    this.zoomLerp = opt.zoomLerp ?? 0.2;
    this.zoomButton = opt.zoomButton ?? mb_middle;
  }

  /**
   * Pin the projection this control draws under — the one thing worth seeding. The look-at is
   * deliberately NOT snapped: taking over eases in from wherever the view sits, which is what
   * makes handing back from the free-fly camera pan home instead of cutting.
   */
  enter(camera) {
    camera.projection = CAMERA_PROJECTION.ORTHO;
  }

  update(camera) {
    this._zoom(camera);
    this._tilt(camera);
    this._place(camera);
  }

  /**
   * The tracked entity, resolved LIVE (the live-query rule — ARCHITECTURE): an entity carrying
   * `CameraFocus` wins, else the raw `target` id fallback for stores that don't use the marker.
   * So the camera can never dangle a stored id — a portal transfer re-mints the player's entity
   * id, but the marker rides the EntitySnapshot into the new level and the query just finds it.
   * Public because the Debug "recenter" button needs the same answer this control uses.
   */
  targetId() {
    if (this.entities === undefined) return -1;
    const foci = this.entities.query(CameraFocus);
    return foci.length > 0 ? foci[0] : this.target;
  }

  /** Wheel/reset input → eased zoom → the view extent, tracked off the live surface. */
  _zoom(camera) {
    // zoom input yields to the UI: a wheel over a hovered list scrolls it, never the world
    if (!UI.captured) {
      if (mouse_wheel_up())
        this.zoomTarget = Math.min(
          this.zoomMax,
          this.zoomTarget * (1 + this.zoomStep),
        );
      if (mouse_wheel_down())
        this.zoomTarget = Math.max(
          this.zoomMin,
          this.zoomTarget * (1 - this.zoomStep),
        );
      if (mouse_check_button_pressed(this.zoomButton))
        this.zoomTarget = this.zoomHome;
    }

    const sw = surface_get_width(application_surface);
    // cap zoom-out to the renderable world width — derived live from the current surface so a
    // stale build-time size can't let the view zoom past the map into dark unloaded area
    if (this.viewCap !== undefined) {
      const floor = sw / this.viewCap;
      if (this.zoomTarget < floor) this.zoomTarget = floor;
    }
    this.zoom = lerp(this.zoom, this.zoomTarget, this.zoomLerp);

    // re-derive the extent every frame so a resolution change rebuilds it (the view is
    // matrix-driven, so GM's 2D view-size API never sees it)
    camera.setSize(
      sw / this.zoom,
      surface_get_height(application_surface) / this.zoom,
    );
  }

  /** Authored degrees (or the zoom curve) → the camera's radian ground tilt. */
  _tilt(camera) {
    // pitch-by-zoom (upright-sprite 2.5D): zoomed out = shallower, zoomed in = steeper
    if (this.pitchCurve !== undefined)
      this.pitchDeg = this.pitchCurve(this.zoom);
    camera.pitch = (this.pitchDeg * Math.PI) / 180;
  }

  /** Ease the look-at onto the target, clamp it inside the map, then place the tilted eye. */
  _place(camera) {
    const pos =
      this.entities === undefined
        ? undefined
        : this.entities.get(this.targetId(), Position);
    if (pos === undefined) return;

    let x = lerp(camera.toX, pos.x, this.lerp);
    let y = lerp(camera.toY, pos.y, this.lerp);

    // clamp the look-at to world bounds so the view never shows past a map edge; half-extents come
    // from Camera.groundRect (which owns the pitch stretch), and the view centers when the world
    // is smaller than it
    const b = this.bounds;
    if (b !== undefined) {
      const view = camera.groundRect();
      const halfW = (view.x2 - view.x1) / 2;
      const halfH = (view.y2 - view.y1) / 2;
      x =
        b.x2 - b.x1 > camera.width
          ? clamp(x, b.x1 + halfW, b.x2 - halfW)
          : (b.x1 + b.x2) / 2;
      y =
        b.y2 - b.y1 > 2 * halfH
          ? clamp(y, b.y1 + halfH, b.y2 - halfH)
          : (b.y1 + b.y2) / 2;
    }
    // pixel-snap the look-at — a fractional center shimmers tile seams under an ortho pixel view
    x = Math.round(x);
    y = Math.round(y);

    // 2.5D: pitch swings the ortho eye out of the ground plane for billboard rendering. At pitch 0
    // this reduces to the top-down eye directly overhead with up = +Y, so there is no flat case to
    // special-case.
    const p = camera.pitch;
    const d = this.eyeDist;
    camera
      .setFrom(x, y + Math.sin(p) * d, -Math.cos(p) * d)
      .setTo(x, y, 0)
      .setUp(0, Math.cos(p), Math.sin(p));
  }
};
