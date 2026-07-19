// 6DOF spectator "noclip" camera (debug). Layered onto an existing Camera — the follow camera
// delegates here while freeCam is on, seeding from the live follow view (no second handle).
// WASD+Space/Shift translate, Q/E roll, RMB+mouse yaw/pitch. Uses Time.raw so it works while sim is paused.

globalThis.CameraFly = {
  /**
   * Add fly state to a freshly-built Camera; the Debug Camera section toggles freeCam at runtime.
   * @param {any} camera @param {object} [opts] @param {number} [opts.flySpeed=300] @param {number} [opts.mouseSens=0.005]
   */
  install(camera, opts = {}) {
    camera.freeCam = false;
    camera._baseProjection = camera.projection; // restored on fly exit (fly forces perspective)
    camera._flyInit = false; // seed from live follow view on each (re)entry
    camera._lookActive = false;
    camera.flyX = 0;
    camera.flyY = 0;
    camera.flyZ = 0;
    camera.flyYaw = 0;
    camera.flyPitch = 0;
    camera.flyRoll = 0;
    camera.flySpeed = opts.flySpeed ?? 600;
    camera.mouseSens = opts.mouseSens ?? 0.005;
  },

  /**
   * Drive the fly camera one frame (from follow onUpdate while freeCam is on). Basis matches the
   * follow camera (worldUp +Z) so toggling in/out never flips. Reads realtime input directly — fine
   * here (debug-only, not edge-triggered).
   * @param {any} cam - the Camera holding the fly state (see install).
   */
  update(cam) {
    // first frame: seed pos + yaw/pitch from the follow view so there's no jump
    if (!cam._flyInit) {
      cam.flyX = cam.fromX;
      cam.flyY = cam.fromY;
      cam.flyZ = cam.fromZ;
      const dx = cam.toX - cam.fromX;
      const dy = cam.toY - cam.fromY;
      const dz = cam.toZ - cam.fromZ;
      cam.flyYaw = Math.atan2(dy, dx);
      cam.flyPitch = Math.atan2(dz, Math.sqrt(dx * dx + dy * dy));
      cam.flyRoll = 0;
      cam._flyInit = true;
      cam._lookActive = false;
    }
    cam.projection = CAMERA_PROJECTION.PERSPECTIVE_FOV; // true 3D while flying

    // mouse look while RMB held: recenter cursor each frame, apply the pixel delta
    if (mouse_check_button(mb_right)) {
      const cx = Math.floor(window_get_width() / 2);
      const cy = Math.floor(window_get_height() / 2);
      if (cam._lookActive) {
        cam.flyYaw += (window_mouse_get_x() - cx) * cam.mouseSens;
        cam.flyPitch += (window_mouse_get_y() - cy) * cam.mouseSens;
      }
      cam._lookActive = true; // first held frame just recenters (no delta jump)
      window_mouse_set(cx, cy);
    } else {
      cam._lookActive = false;
    }
    // clamp pitch shy of the poles so the basis stays well-defined
    if (cam.flyPitch > 1.55) cam.flyPitch = 1.55;
    if (cam.flyPitch < -1.55) cam.flyPitch = -1.55;

    const rollStep = 1.6 * Time.raw; // Q/E roll
    if (keyboard_check(ord("Q"))) cam.flyRoll -= rollStep;
    if (keyboard_check(ord("E"))) cam.flyRoll += rollStep;

    // forward from yaw+pitch; right + up from a +Z worldUp ref (matches follow camera)
    const cp = Math.cos(cam.flyPitch);
    const fx = cp * Math.cos(cam.flyYaw);
    const fy = cp * Math.sin(cam.flyYaw);
    const fz = Math.sin(cam.flyPitch);
    // right = normalize(worldUp(0,0,1) × forward) = normalize(-fy, fx, 0)
    let rx = -fy;
    let ry = fx;
    const rl = Math.sqrt(rx * rx + ry * ry) || 1;
    rx /= rl;
    ry /= rl;
    // up = forward × right
    const ux = -fz * ry;
    const uy = fz * rx;
    const uz = fx * ry - fy * rx;
    // roll: rotate up toward right about the forward axis (rz = 0)
    const cr = Math.cos(cam.flyRoll);
    const sr = Math.sin(cam.flyRoll);
    const upx = ux * cr + rx * sr;
    const upy = uy * cr + ry * sr;
    const upz = uz * cr;

    // translate (Time.raw → works while paused): WASD in camera plane, Space/Shift on world Z
    // (eye sits at -Z above ground, so Space = up = decreasing Z)
    const spd = cam.flySpeed * Time.raw;
    if (keyboard_check(ord("W"))) {
      cam.flyX += fx * spd;
      cam.flyY += fy * spd;
      cam.flyZ += fz * spd;
    }
    if (keyboard_check(ord("S"))) {
      cam.flyX -= fx * spd;
      cam.flyY -= fy * spd;
      cam.flyZ -= fz * spd;
    }
    if (keyboard_check(ord("D"))) {
      cam.flyX += rx * spd;
      cam.flyY += ry * spd;
    }
    if (keyboard_check(ord("A"))) {
      cam.flyX -= rx * spd;
      cam.flyY -= ry * spd;
    }
    if (keyboard_check(vk_space)) cam.flyZ -= spd;
    if (keyboard_check(vk_shift)) cam.flyZ += spd;

    cam.setFrom(cam.flyX, cam.flyY, cam.flyZ);
    cam.setTo(cam.flyX + fx, cam.flyY + fy, cam.flyZ + fz);
    cam.setUp(upx, upy, upz);
  },
};
