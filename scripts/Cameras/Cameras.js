/**
 * The camera entities and their policy data: `create` mints the entity carrying `Camera` (+
 * `Position`, its look-at), and `follow`/`pan`/`fly` build the data of the policy components an
 * installer mints onto it (`entities.mint` — a policy is the installer's tuning, not the level's
 * data, so no save carries it). What the policies DO each frame is CameraSystem's; what the
 * derived view is, View's.
 */
globalThis.Cameras = {
  /**
   * A camera entity: Position (its look-at — opt `x`/`y`/`z`) + Camera with the defaults of an
   * overhead ortho view (opt: every Camera field). Returns the id.
   */
  create(entities, opt = {}) {
    const id = entities.create();
    entities.add(id, Position, { x: opt.x ?? 0, y: opt.y ?? 0, z: opt.z ?? 0 });
    entities.add(id, Camera, {
      projection: opt.projection ?? CAMERA_PROJECTION.ORTHO,
      pitch: opt.pitch ?? 0,
      yaw: opt.yaw ?? 0,
      roll: opt.roll ?? 0,
      dist: opt.dist ?? 100,
      zoom: opt.zoom ?? 1,
      znear: opt.znear ?? 1,
      zfar: opt.zfar ?? 32000,
      fov: opt.fov ?? 70,
    });
    return id;
  },

  /** CameraFollow data from its opt (each field of the typedef; `zoom` seeds the targets). */
  follow(opt = {}) {
    const zoom = opt.zoom ?? 1;
    return {
      lerp: opt.lerp ?? 0.1,
      pitch: opt.pitch ?? 0,
      pitchLo: opt.pitchLo,
      pitchHi: opt.pitchHi,
      zoomLo: opt.zoomLo,
      zoomHi: opt.zoomHi,
      bounds: opt.bounds,
      viewCap: opt.viewCap,
      zoomTarget: zoom,
      zoomHome: opt.zoomHome ?? zoom,
      zoomMin: opt.zoomMin ?? 0.5,
      zoomMax: opt.zoomMax ?? 4,
      zoomStep: opt.zoomStep ?? 0.1,
      zoomSteps: opt.zoomSteps,
      zoomLerp: opt.zoomLerp ?? 0.2,
      zoomButton: opt.zoomButton ?? mb_middle,
    };
  },

  /** CameraPan data from its opt. */
  pan(opt = {}) {
    return {
      zoomMin: opt.zoomMin ?? 0.25,
      zoomMax: opt.zoomMax ?? 8,
      zoomStep: opt.zoomStep ?? 0.15,
      button: opt.button ?? mb_middle,
      dragging: false,
      mx: 0,
      my: 0,
    };
  },

  /** CameraFly data from its opt. `sens` is calibrated so the shipped sensitivity 2.5 lands on 0.005. */
  fly(opt = {}) {
    return {
      speed: opt.speed ?? 600,
      sens: opt.sens ?? 0.002,
      looking: false,
    };
  },
};
