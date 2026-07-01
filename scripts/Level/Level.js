// A LEVEL — the per-instance coordinator layer, one per screen the LevelManager runs. The bottom of
// the two-layer model (World singleton on top). Was the `Scene` base class, renamed: "Scene is
// integrated into Level". A Level COMPOSES its sub-modules (none are on this base — GMRT doesn't run
// subclass field initializers, so each concrete Level sets what it needs in create()):
//   • ecs       — the ECS entity store (component data + id alloc)   — gameplay levels
//   • grid      — LevelGrid: tile layers / nav / zone channels        — levels with terrain (this.level for now)
//   • systems   — the per-tick update Pipeline                        — gameplay levels
//   • renderer / camera — the world view                             — levels that draw a world
//   • ui        — the UI root                                        — every level (menus are UI-only)
// A menu (lobby / UI kit) is just a Level with only `ui` set — every sub-module is optional.
//
// Thin base by design: only the lifecycle below. Concrete levels override create/step/draw/destroy and
// wire their own sub-modules; the LevelManager stack drives them (only the TOP level is stepped +
// drawn, one below is suspended). Fields set in create(), NOT as class-field initializers — a subclass
// field never runs on GMRT (so `label` here is a base default; a genre level re-sets it in create()).
globalThis.Level = class Level {
  label = "";

  /** @param {(factory:Function) => void} openScene queue a navigation to another level */
  create(openScene) {}
  /** Advance one frame. */
  step() {}
  /** Render the world view. */
  draw() {}
  /** Tear down UI roots + resources. */
  destroy() {}

  // Stack pause/resume hooks: suspend when a guest runs in front, resume when it pops. Defaults fit one
  // UI root + one camera; a level with extra state overrides them (the RPG re-binds its keymap on
  // resume). GMRT doesn't reliably inherit non-overridden methods, so a host defines its own hooks.
  /** Hide this level while a guest runs in front. */
  suspend() {
    if (this.ui) UI.setEnabled(this.ui, false);
  }
  /** Re-show + re-claim viewport 0 after a guest pops. */
  resume() {
    if (this.ui) UI.setEnabled(this.ui, true);
    if (this.camera) this.camera.assign(0);
  }
};
