/**
 * The entity's GameMaker-side scope: one puppet instance, so the instance-scoped half of the
 * API is reachable from an id-keyed store without walking instances. Shared: a second feature
 * needing instance scope reuses this handle, so an entity never carries two puppets.
 *
 * The puppet holds no data: everything authoritative stays in columns, since a built-in
 * instance variable costs several times a column access (TODO: revisit when a built-in reaches
 * a user-defined property as cheaply). `inst` is a live handle, so it neither serializes nor
 * transfers; a snapshot, load or map transfer drops it and it is re-attached.
 *
 * Presence of this component means a live puppet exists; detaching it releases the puppet.
 *
 * @typedef {Object} Instance
 * @property {Id<"Instance">} inst  the live instance
 * @property {boolean} rigged  the entity's Skeleton is bound to it
 * @property {boolean} shaped  its mask is sized, anchored and placed
 * @property {boolean} still   a kinematic's — placed once, never synced
 * @property {boolean} solid   the Collision.solid the mask currently mirrors
 * @property {number} sx       the mask scale
 * @property {number} sy
 * @property {number} ox       the mask centre off Position
 * @property {number} oy
 */
globalThis.Instance = "Instance";
// any script may load first (docs/GMRT.md)
(globalThis.Blank ??= {})[Instance] = {
  rigged: false,
  shaped: false,
  still: false,
  solid: false,
  sx: 1,
  sy: 1,
  ox: 0,
  oy: 0,
};
