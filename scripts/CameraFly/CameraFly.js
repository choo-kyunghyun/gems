// CameraFly — the 6DOF spectator "noclip" free camera (debug). A behavior layered onto an existing
// Camera rather than a standalone factory like CameraFollow/CameraPan: a follow camera flips its
// `freeCam` flag (the Debug "Camera" panel checkbox) and delegates its per-frame update here, so the
// fly view seeds from — and on toggle-off returns to — the live follow view seamlessly (one camera,
// one viewport; no second handle to assign/destroy). CameraFollow.create install()s the state in its build
// and update()s here while freeCam is on.
//
// Controls: WASD + Space/Shift translate (camera-relative XY plane + world Z), Q/E roll, and the
// mouse — while the RIGHT button is held — yaws/pitches via a window_mouse_set recenter + delta
// (editor convention, so the cursor stays free for the ImGui panel when RMB is up). Switches to a
// PERSPECTIVE projection so moving forward genuinely flies into the scene. All motion is on Time.raw,
// so it flies even while the Sim panel PAUSES the sim (sceneRpg runs camera.update() in draw() then).

globalThis.CameraFly = {
  /**
   * Attach the fly state fields onto a freshly-built Camera (called once from _cameraFollowBuild).
   * Leaves the camera in follow mode (freeCam false); the Debug panel toggles it on at runtime.
   * @param {any} camera - A Camera instance (already constructed with its base projection).
   * @param {object} [opts]
   * @param {number} [opts.flySpeed=300] - Move speed in world px/s.
   * @param {number} [opts.mouseSens=0.005] - Radians of look per mouse pixel.
   */
  install(camera, opts = {}) {
    camera.freeCam = false;
    camera._baseProjection = camera.projection; // restore this when leaving fly (fly forces perspective)
    camera._flyInit = false; // re-seed pos/orientation from the live view on each (re)entry
    camera._lookActive = false;
    camera.flyX = 0; // fly position
    camera.flyY = 0;
    camera.flyZ = 0;
    camera.flyYaw = 0; // radians
    camera.flyPitch = 0;
    camera.flyRoll = 0;
    camera.flySpeed = opts.flySpeed ?? 300;
    camera.mouseSens = opts.mouseSens ?? 0.005;
  },

  /**
   * Drive the 6DOF fly camera for one frame (called from the follow onUpdate while freeCam is on).
   * The basis matches the follow camera (worldUp ref +Z, right = worldUp × forward, up = forward ×
   * right), so toggling in/out is seamless and never flipped. Letters via ord() (as the controllers
   * bind keys). Reads realtime mouse/keyboard queries directly — fine here (the fly cam is debug-only
   * and these aren't edge-triggered).
   * @param {any} cam - The Camera holding the fly state (see install).
   */
  update(cam) {
    // First fly frame: seed position + yaw/pitch from the current (follow) view so there's no jump.
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

    // Mouse look while RMB held: recenter the cursor each frame and apply the pixel delta.
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
    // Clamp pitch shy of the poles so the basis stays well-defined (roll is applied separately below).
    if (cam.flyPitch > 1.55) cam.flyPitch = 1.55;
    if (cam.flyPitch < -1.55) cam.flyPitch = -1.55;

    // Roll (Q/E), on Time.raw.
    const rollStep = 1.6 * Time.raw;
    if (keyboard_check(ord("Q"))) cam.flyRoll -= rollStep;
    if (keyboard_check(ord("E"))) cam.flyRoll += rollStep;

    // Forward from yaw + pitch; right + up from a +Z worldUp reference (matches the follow camera).
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
    // Roll: rotate the up vector toward right around the forward axis (rz = 0).
    const cr = Math.cos(cam.flyRoll);
    const sr = Math.sin(cam.flyRoll);
    const upx = ux * cr + rx * sr;
    const upy = uy * cr + ry * sr;
    const upz = uz * cr;

    // Translate (Time.raw → works while paused). WASD in the camera plane, Space/Shift on world Z
    // (the eye sits at -Z above the ground, so Space = up = decreasing Z).
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
