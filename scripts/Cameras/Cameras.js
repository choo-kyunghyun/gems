/**
 * The camera entities. A policy is minted onto a camera by its installer: it is tuning, not the
 * level's data, so no save carries it.
 */
globalThis.Cameras = {
  /** Position is the look-at; an `opt` field left out takes its blank. Returns the id. */
  create(entities, opt = {}) {
    const id = entities.create();
    entities.add(id, Position, { x: opt.x, y: opt.y, z: opt.z });
    entities.add(id, Camera, {
      projection: opt.projection,
      pitch: opt.pitch,
      yaw: opt.yaw,
      roll: opt.roll,
      dist: opt.dist,
      zoom: opt.zoom,
      znear: opt.znear,
      zfar: opt.zfar,
      fov: opt.fov,
    });
    return id;
  },
};
