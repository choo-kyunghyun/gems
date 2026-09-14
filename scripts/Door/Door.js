// The built door's rule (the woodenDoor prop, Interaction kind "door"): a solid slab that swings
// open. contentInteractions' `door` def is one call here; showing a refusal is the view's.
/**
 * Closed = a solid slab (blocks bodies AND pathing — NavGrid rasterizes the kinematic collider
 * live); open = non-solid with the slab swung SWING° on its centre. State (`open`) + yaw are
 * component data, so a door round-trips map parking/EntitySnapshot as-is. A door carries
 * Interaction + Collision; its Mesh is presentation, so a look-less door still swings.
 */
globalThis.Door = {
  SWING: 80, // degrees the slab turns on its centre when it opens

  /**
   * Flip `id`'s leaf. Returns "" when it moved, else the refusal's i18n key: BUILD_DOOR_BLOCKED —
   * a standing body in the frame would be trapped inside the closed collider.
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
      if (mesh !== undefined) mesh.yaw = (mesh.yaw ?? 0) - Door.SWING;
    } else {
      it.open = 1;
      col.solid = false;
      if (mesh !== undefined) mesh.yaw = (mesh.yaw ?? 0) + Door.SWING;
    }
    // solid flipped in place on a kinematic collider — the id-set fingerprint cannot see it
    SolidSystem.invalidate(level);
    return "";
  },

  /** a solid BODY (non-kinematic) overlapping the frame, grown 4 px — what a closing leaf would trap */
  _blocked(entities, id) {
    const box = AABB.of(entities, id);
    const ids = Query.inRect(
      entities,
      box.x1 - 4,
      box.y1 - 4,
      box.x2 + 4,
      box.y2 + 4,
      { has: Collision },
    );
    for (let i = 0; i < ids.length; i++) {
      if (ids[i] === id) continue;
      const c = entities.require(ids[i], Collision);
      if (c.solid === true && c.kinematic === false) return true;
    }
    return false;
  },
};
