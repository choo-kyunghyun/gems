/**
 * The camera as ECS: the entity carrying `Camera` (+ `Position`, its look-at) is the level's
 * view, and this ticker turns it into the frame's matrices. Projection is never data — the
 * component holds what decides it and the matrices are derived each frame into the level's
 * derived View, so no matrix or handle ever sits in the store (a GML array is opaque to the
 * store's dump — docs/GMRT.md).
 *
 * Policy = component presence: `CameraFollow`, `CameraPan` or `CameraFly` on the camera entity
 * drives it, with all state in the component. Follow and pan run on the sim clock; fly runs on
 * `Time.raw` from the draw, so it keeps flying while the sim is paused, and overrides the sim
 * policies while attached. The pose is the one shared component, so switching policy never
 * jumps the view.
 *
 * Basis: at yaw 0 the eye sits due south of the look-at, lifted by the ground tilt — pitch 0 is
 * straight overhead with up = +Y (map north), so there is no flat case to special-case; yaw turns
 * about world z, roll about the view axis.
 */
globalThis.CameraSystem = {
  KEY: "camera", // the View's derived token on the level's own entity

  /** The level's View, seeded with a fresh native handle and no viewport. */
  view(level) {
    return level.entities.derive(level.self, CameraSystem.KEY, CameraSystem._seed);
  },

  _seed() {
    return new View();
  },

  /** The sim-clock policies; skipped while fly is attached. */
  update(level) {
    const entities = level.entities;
    const id = entities.first(Camera);
    if (id === -1) return;
    if (entities.has(id, CameraFly)) return;
    const cam = entities.require(id, Camera);
    const pos = entities.require(id, Position);
    const f = entities.get(id, CameraFollow);
    if (f !== undefined) CameraSystem._follow(entities, cam, pos, f, level);
    const p = entities.get(id, CameraPan);
    if (p !== undefined) CameraSystem._pan(cam, pos, p);
  },

  /** The raw-clock policy, then the frame's matrices. Runs from the draw, before rendering. */
  apply(level) {
    const entities = level.entities;
    const id = entities.first(Camera);
    if (id === -1) return;
    const cam = entities.require(id, Camera);
    const pos = entities.require(id, Position);
    const v = CameraSystem.view(level);
    const fl = entities.get(id, CameraFly);
    if (fl !== undefined) CameraSystem._fly(cam, pos, fl, v);
    CameraSystem._derive(cam, pos, v);

    const view = matrix_build_lookat(
      v.fromX,
      v.fromY,
      v.fromZ,
      v.toX,
      v.toY,
      v.toZ,
      v.upX,
      v.upY,
      v.upZ,
    );
    let proj = null;
    switch (cam.projection) {
      case CAMERA_PROJECTION.ORTHO:
        proj = matrix_build_projection_ortho(
          v.width,
          v.height,
          cam.znear,
          cam.zfar,
        );
        break;
      case CAMERA_PROJECTION.PERSPECTIVE:
        proj = matrix_build_projection_perspective(
          v.width,
          v.height,
          cam.znear,
          cam.zfar,
        );
        break;
      case CAMERA_PROJECTION.PERSPECTIVE_FOV:
        proj = matrix_build_projection_perspective_fov(
          cam.fov,
          v.width / v.height,
          cam.znear,
          cam.zfar,
        );
        break;
    }
    camera_set_view_mat(v.id, view);
    if (proj !== null) camera_set_proj_mat(v.id, proj);
    if (v.viewport !== -1) camera_apply(v.id);
  },

  /** Writes the header's basis into `v`; the extent is the surface over `zoom`. */
  _derive(cam, pos, v) {
    const sp = Math.sin(cam.pitch);
    const cp = Math.cos(cam.pitch);
    const sy = Math.sin(cam.yaw);
    const cy = Math.cos(cam.yaw);
    // forward (eye → look-at): (0, −sin p, cos p) at yaw 0, turned about z
    const fx = sp * sy;
    const fy = -sp * cy;
    const fz = cp;
    let ux = -sy * cp;
    let uy = cy * cp;
    let uz = sp;
    if (cam.roll !== 0) {
      // right = up × forward; roll rotates up toward it about the view axis
      const rx = uy * fz - uz * fy;
      const ry = uz * fx - ux * fz;
      const rz = ux * fy - uy * fx;
      const cr = Math.cos(cam.roll);
      const sr = Math.sin(cam.roll);
      ux = ux * cr + rx * sr;
      uy = uy * cr + ry * sr;
      uz = uz * cr + rz * sr;
    }
    const d = cam.dist;
    v.toX = pos.x;
    v.toY = pos.y;
    v.toZ = pos.z;
    v.fromX = pos.x - fx * d;
    v.fromY = pos.y - fy * d;
    v.fromZ = pos.z - fz * d;
    v.upX = ux;
    v.upY = uy;
    v.upZ = uz;
    v.width = surface_get_width(application_surface) / cam.zoom;
    v.height = surface_get_height(application_surface) / cam.zoom;
    v.pitch = cam.pitch;
    v.projection = cam.projection;
    return v;
  },

  /**
   * Zoom, then tilt, then place — each feeds the next: the zoom decides the pitch, and the pitch
   * decides how far the ground rect reaches, which the edge clamp measures against.
   */
  _follow(entities, cam, pos, f, level) {
    const wheel = Input.wheel();
    if (wheel < 0) f.zoomTarget = CameraSystem._stepTo(f, 1);
    if (wheel > 0) f.zoomTarget = CameraSystem._stepTo(f, -1);
    if (Input.pointerPressed(f.zoomButton)) f.zoomTarget = f.zoomHome;
    // cap zoom-out to the renderable world width, off the live surface so a stale size can't
    // zoom past the map
    if (f.viewCap !== undefined) {
      const floor = surface_get_width(application_surface) / f.viewCap;
      if (f.zoomTarget < floor) f.zoomTarget = floor;
    }
    cam.zoom = lerp(cam.zoom, f.zoomTarget, f.zoomLerp);

    // pitch-by-zoom (upright-sprite 2.5D): zoomed out = shallower, zoomed in = steeper
    if (f.zoomLo !== undefined)
      f.pitch =
        f.pitchLo +
        (f.pitchHi - f.pitchLo) *
          clamp((cam.zoom - f.zoomLo) / (f.zoomHi - f.zoomLo), 0, 1);
    cam.pitch = (f.pitch * Math.PI) / 180;
    cam.yaw = 0;
    cam.roll = 0;
    cam.projection = CAMERA_PROJECTION.ORTHO;

    // resolved live (docs/ARCHITECTURE.md), so no stored id dangles across a map transfer
    const focus = entities.first(CameraFocus);
    const tp = focus !== -1 ? entities.get(focus, Position) : undefined;
    if (tp === undefined) return;
    let x = lerp(pos.x, tp.x, f.lerp);
    let y = lerp(pos.y, tp.y, f.lerp);

    // keep the view inside the world bounds, centring when the world is smaller than the view
    const b = f.bounds;
    if (b !== undefined) {
      const v = CameraSystem._derive(cam, pos, CameraSystem.view(level));
      const r = v.groundRect();
      const halfW = (r.x2 - r.x1) / 2;
      const halfH = (r.y2 - r.y1) / 2;
      x =
        b.x2 - b.x1 > v.width
          ? clamp(x, b.x1 + halfW, b.x2 - halfW)
          : (b.x1 + b.x2) / 2;
      y =
        b.y2 - b.y1 > 2 * halfH
          ? clamp(y, b.y1 + halfH, b.y2 - halfH)
          : (b.y1 + b.y2) / 2;
    }
    // pixel-snap the look-at — a fractional centre shimmers tile seams under an ortho pixel view
    pos.x = Math.round(x);
    pos.y = Math.round(y);
    pos.z = 0;
  },

  /**
   * The next zoom in `dir` (+1 in, -1 out): the next `zoomSteps` stop, else the `zoomStep`
   * ratio, clamped to [zoomMin, zoomMax]. The last stop holds.
   */
  _stepTo(f, dir) {
    const s = f.zoomSteps;
    let z = f.zoomTarget;
    if (s === undefined) z = z * (1 + dir * f.zoomStep);
    else if (dir > 0) {
      let i = 0;
      while (i < s.length) {
        if (s[i] > f.zoomTarget + 1e-6) break;
        i++;
      }
      if (i < s.length) z = s[i];
    } else {
      let i = s.length - 1;
      while (i >= 0) {
        if (s[i] < f.zoomTarget - 1e-6) break;
        i--;
      }
      if (i >= 0) z = s[i];
    }
    return clamp(z, f.zoomMin, f.zoomMax);
  },

  /**
   * Drag-to-pan in surface px; the wheel zooms about the world point under the cursor.
   */
  _pan(cam, pos, p) {
    const sw = surface_get_width(application_surface);
    const sh = surface_get_height(application_surface);
    const m = View.mouseSurface();

    if (Input.pointerPressed(p.button)) {
      p.dragging = true;
      p.mx = m.x;
      p.my = m.y;
    }
    if (p.dragging) {
      if (Input.pointerDown(p.button)) {
        pos.x -= (m.x - p.mx) / cam.zoom;
        pos.y -= (m.y - p.my) / cam.zoom;
        p.mx = m.x;
        p.my = m.y;
      } else {
        p.dragging = false;
      }
    }

    const wheel = Input.wheel();
    let next = cam.zoom;
    if (wheel < 0) next = Math.min(p.zoomMax, cam.zoom * (1 + p.zoomStep));
    if (wheel > 0) next = Math.max(p.zoomMin, cam.zoom * (1 - p.zoomStep));
    if (next !== cam.zoom) {
      pos.x += (m.x - sw * 0.5) * (1 / cam.zoom - 1 / next);
      pos.y += (m.y - sh * 0.5) * (1 / cam.zoom - 1 / next);
      cam.zoom = next;
    }

    pos.z = 0;
    cam.pitch = 0;
    cam.yaw = 0;
    cam.roll = 0;
    cam.projection = CAMERA_PROJECTION.ORTHO;
  },

  /**
   * Debug free-fly on `Time.raw`: RMB mouse-look, Q/E roll, WASD in the view plane, Space/Shift
   * on world z (the eye sits at −z above the ground, so up = decreasing z); the look-at is
   * written back `dist` ahead of the eye.
   */
  _fly(cam, pos, fl, v) {
    const d = cam.dist;
    CameraSystem._derive(cam, pos, v);
    let ex = v.fromX;
    let ey = v.fromY;
    let ez = v.fromZ;

    // recentre the cursor each frame and apply the pixel delta
    if (Input.pointerDown(mb_right)) {
      const cx = Math.floor(window_get_width() / 2);
      const cy = Math.floor(window_get_height() / 2);
      if (fl.looking) {
        // not Time-scaled: a mouse delta is already a distance, so scaling it would tie look
        // speed to framerate
        const s = fl.sens * Input.sensitivity;
        cam.yaw += (Input.pointer.winX - cx) * s;
        cam.pitch -= (Input.pointer.winY - cy) * s;
      }
      fl.looking = true; // the first held frame only recentres (no delta jump)
      window_mouse_set(cx, cy);
    } else {
      fl.looking = false;
    }
    // the pole clamp that keeps the basis well-defined: 1.55 rad either side of level
    const lo = Math.PI / 2 - 1.55;
    const hi = Math.PI / 2 + 1.55;
    if (cam.pitch < lo) cam.pitch = lo;
    if (cam.pitch > hi) cam.pitch = hi;
    const rollStep = 1.6 * Time.raw;
    if (Input.keyDown(ord("Q"))) cam.roll -= rollStep;
    if (Input.keyDown(ord("E"))) cam.roll += rollStep;

    CameraSystem._derive(cam, pos, v);
    const fx = (v.toX - v.fromX) / d;
    const fy = (v.toY - v.fromY) / d;
    const fz = (v.toZ - v.fromZ) / d;
    let rx = -fy;
    let ry = fx;
    // BUG: an explicit test, not `|| 1` — a `||` left operand is corrupted (docs/GMRT.md)
    let rl = Math.sqrt(rx * rx + ry * ry);
    if (rl === 0) rl = 1;
    rx /= rl;
    ry /= rl;

    const spd = fl.speed * Time.raw;
    if (Input.keyDown(ord("W"))) {
      ex += fx * spd;
      ey += fy * spd;
      ez += fz * spd;
    }
    if (Input.keyDown(ord("S"))) {
      ex -= fx * spd;
      ey -= fy * spd;
      ez -= fz * spd;
    }
    if (Input.keyDown(ord("D"))) {
      ex += rx * spd;
      ey += ry * spd;
    }
    if (Input.keyDown(ord("A"))) {
      ex -= rx * spd;
      ey -= ry * spd;
    }
    if (Input.keyDown(vk_space)) ez -= spd;
    if (Input.keyDown(vk_shift)) ez += spd;

    pos.x = ex + fx * d;
    pos.y = ey + fy * d;
    pos.z = ez + fz * d;
    cam.projection = CAMERA_PROJECTION.PERSPECTIVE_FOV;
  },
};
