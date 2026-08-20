/**
 * The entity's GameMaker-side scope: one Puppet instance, held so the instance-scoped half of
 * the API (`inst.draw_self()`, `inst.skeleton_animation_set(…)`, `inst.place_meeting(…)`) is
 * reachable from an id-keyed store without walking instances (docs/PERF.md → Data Layout).
 * SHARED, and that is the point — a second feature needing instance scope reuses this handle
 * rather than minting its own, so an entity never carries two puppets.
 *
 * The puppet holds no data: everything authoritative stays in columns (a built-in instance
 * variable costs 3-4.5x a column access — PERF.md → Member Access), and `inst` is a live handle,
 * so it neither serializes nor transfers — a snapshot, load, or map transfer drops it and the
 * feature system re-attaches (SkeletonSystem._mint).
 *
 * InstanceSystem alone mints and destroys; presence of this component IS "a live puppet exists",
 * so a consumer releases one by detaching the component (or removing the entity) and the next
 * reap destroys it.
 *
 * @typedef {Object} Instance
 * @property {Id.Instance} inst  the live Puppet instance
 */
globalThis.Instance = "Instance";
