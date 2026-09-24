/**
 * A built door: closed it is a solid slab that blocks bodies and pathing; open it is non-solid,
 * swung on its centre. State and yaw are component data, so a door round-trips map parking as-is.
 * The Mesh is presentation, so a look-less door still swings.
 */
globalThis.Door = {
  SWING: 80, // degrees

  /**
   * Returns "" when it moved, else the refusal's i18n key — closing would trap a body standing in
   * the frame.
   */
  toggle(level, id) {
    const entities = level.entities;
    const it = entities.require(id, Interaction);
    const col = entities.require(id, Collision);
    const mesh = entities.get(id, Mesh);
    if (it.open === 1) {
      if (Door._blocked(entities, id)) return "BUILD_DOOR_BLOCKED";
      it.open = 0;
      col.solid = true;
      if (mesh !== undefined) mesh.yaw -= Door.SWING;
    } else {
      it.open = 1;
      col.solid = false;
      if (mesh !== undefined) mesh.yaw += Door.SWING;
    }
    return "";
  },

  /** A solid non-kinematic body overlapping the frame, grown 4 px. */
  _blocked(entities, id) {
    const box = AABB.of(entities, id);
    const ids = Query.maskRect(entities, box.x1 - 4, box.y1 - 4, box.x2 + 4, box.y2 + 4, {
      has: Collision,
      ignore: id,
    });
    for (let i = 0; i < ids.length; i++) {
      if (entities.require(ids[i], Collision).kinematic === false) return true; // a non-solid body has no mask
    }
    return false;
  },
};
