/**
 * 6DOF spectator "noclip" camera (debug) — a Camera CONTROL (the contract is Camera's JSDoc).
 * WASD/Space/Shift move, Q/E roll, RMB yaw/pitch. Install it with `camera.setControl(fly)` and hand
 * back with `camera.setControl(follow)`; enter() seeds the pose from the live view either way, so a
 * swap never jumps. Reads realtime input directly — fine here (debug-only, nothing edge-triggered).
 *
 * `raw` is true: it runs on `Time.raw` so it keeps flying while the sim is paused, which is the
 * point of a debug spectator. It leaves the camera's ground `pitch` alone — that angle describes an
 * ortho 2.5D framing and means nothing under this control's perspective projection, so the last
 * follow value stands until the follow control resumes.
 *
 * opt: `speed` (world px/sec), `sens` (base radians per mouse pixel).
 */
globalThis.CameraFly = class CameraFly {
  constructor(opt = {}) {
    this.raw = true; // Time.raw control — flies while the sim is paused (Camera contract)

    this.x = 0;
    this.y = 0;
    this.z = 0;
    /** Look angles in radians. `pitch` is the EYE's up/down — not the camera's ground tilt. */
    this.yaw = 0;
    this.pitch = 0;
    this.roll = 0;

    this.speed = opt.speed ?? 600;
    // BASE radians per mouse pixel, which Input.sensitivity scales live in _look() (the FPS split:
    // engine base × user multiplier). Calibrated so the shipped sensitivity 2.5 lands on 0.005.
    this.sens = opt.sens ?? 0.002;
    this.looking = false;
  }

  /** Seed the pose from the live view so taking over never jumps; switch to true 3D. */
  enter(camera) {
    this.x = camera.fromX;
    this.y = camera.fromY;
    this.z = camera.fromZ;

    const dx = camera.toX - camera.fromX;
    const dy = camera.toY - camera.fromY;
    const dz = camera.toZ - camera.fromZ;
    this.yaw = Math.atan2(dy, dx);
    this.pitch = Math.atan2(dz, Math.sqrt(dx * dx + dy * dy));
    this.roll = 0;
    this.looking = false;

    camera.projection = CAMERA_PROJECTION.PERSPECTIVE_FOV;
  }

  update(camera) {
    this._look();

    // forward from yaw+pitch; right + up from a +Z worldUp ref — the same basis the follow camera
    // builds, so swapping in and out never flips the view
    const cp = Math.cos(this.pitch);
    const fx = cp * Math.cos(this.yaw);
    const fy = cp * Math.sin(this.yaw);
    const fz = Math.sin(this.pitch);

    // right = normalize(worldUp(0,0,1) × forward) = normalize(-fy, fx, 0)
    let rx = -fy;
    let ry = fx;
    // guard the degenerate straight-up/down case with an explicit test — GMRT corrupts a `||`
    // left operand (see GMRT.md), so the `|| 1` idiom is off the table
    let rl = Math.sqrt(rx * rx + ry * ry);
    if (rl === 0) rl = 1;
    rx /= rl;
    ry /= rl;

    // up = forward × right
    const ux = -fz * ry;
    const uy = fz * rx;
    const uz = fx * ry - fy * rx;
    // roll: rotate up toward right about the forward axis (rz = 0)
    const cr = Math.cos(this.roll);
    const sr = Math.sin(this.roll);

    this._move(fx, fy, fz, rx, ry);

    camera
      .setFrom(this.x, this.y, this.z)
      .setTo(this.x + fx, this.y + fy, this.z + fz)
      .setUp(ux * cr + rx * sr, uy * cr + ry * sr, uz * cr);
  }

  /** RMB mouse-look + Q/E roll, and the pole clamp that keeps the basis well-defined. */
  _look() {
    // mouse look while RMB held: recenter the cursor each frame, apply the pixel delta
    if (mouse_check_button(mb_right)) {
      const cx = Math.floor(window_get_width() / 2);
      const cy = Math.floor(window_get_height() / 2);
      if (this.looking) {
        // radians = pixels × base × user multiplier, read live so a sensitivity change lands the
        // same frame. NOT Time-scaled (unlike move/roll): a mouse delta is already a distance
        // moved, so scaling it by frame time would make look speed depend on framerate.
        const s = this.sens * Input.sensitivity;
        this.yaw += (window_mouse_get_x() - cx) * s;
        this.pitch += (window_mouse_get_y() - cy) * s;
      }
      this.looking = true; // the first held frame only recenters (no delta jump)
      window_mouse_set(cx, cy);
    } else {
      this.looking = false;
    }

    if (this.pitch > 1.55) this.pitch = 1.55;
    if (this.pitch < -1.55) this.pitch = -1.55;

    const rollStep = 1.6 * Time.raw;
    if (keyboard_check(ord("Q"))) this.roll -= rollStep;
    if (keyboard_check(ord("E"))) this.roll += rollStep;
  }

  /**
   * Translate on Time.raw (the clock split): WASD in the camera plane, Space/Shift on world Z —
   * the eye sits at -Z above the ground, so Space = up = decreasing Z.
   */
  _move(fx, fy, fz, rx, ry) {
    const spd = this.speed * Time.raw;

    if (keyboard_check(ord("W"))) {
      this.x += fx * spd;
      this.y += fy * spd;
      this.z += fz * spd;
    }
    if (keyboard_check(ord("S"))) {
      this.x -= fx * spd;
      this.y -= fy * spd;
      this.z -= fz * spd;
    }
    if (keyboard_check(ord("D"))) {
      this.x += rx * spd;
      this.y += ry * spd;
    }
    if (keyboard_check(ord("A"))) {
      this.x -= rx * spd;
      this.y -= ry * spd;
    }
    if (keyboard_check(vk_space)) this.z -= spd;
    if (keyboard_check(vk_shift)) this.z += spd;
  }
};
