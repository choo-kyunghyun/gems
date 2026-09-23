/**
 * The entity's GameMaker-side scope: one Puppet instance, held so the instance-scoped half of
 * the API (`inst.draw_self()`, `inst.skeleton_animation_set(…)`, `inst.place_meeting(…)`) is
 * reachable from an id-keyed store without walking instances (testCore perf.layout).
 * SHARED, and that is the point — a second feature needing instance scope reuses this handle
 * rather than minting its own, so an entity never carries two puppets.
 *
 * The puppet holds no data: everything authoritative stays in columns (a built-in instance
 * variable costs 3-4.5x a column access — testCore perf.access; TODO the rule loosens when a
 * built-in reaches a user-defined property there), and `inst` is a live handle, so it neither
 * serializes nor transfers — a snapshot, load, or map transfer drops it and the feature system
 * re-attaches (Rig.mint).
 *
 * PuppetSystem alone mints (with the release hook that destroys the instance) — presence of this
 * component IS "a live puppet exists", so a consumer releases one by detaching the component
 * (or removing the entity) and the puppet goes with it.
 *
 * @typedef {Object} Instance
 * @property {Id<"Instance">} inst  the live Puppet (or Solid) instance
 * @property {boolean} rigged  Rig.mint has bound the entity's Skeleton to it
 * @property {boolean} shaped  PuppetSystem has sized, anchored and placed its mask
 * @property {boolean} still   a kinematic's — placed once, never synced
 * @property {boolean} solid   the Collision.solid the mask currently mirrors
 * @property {number} sx       the mask scale (BBox / PuppetSystem.MASK) — image_xscale's
 * @property {number} sy
 * @property {number} ox       the mask centre off Position
 * @property {number} oy
 */
globalThis.Instance = "Instance";
