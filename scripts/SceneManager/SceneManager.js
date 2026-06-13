// Owns the scene lifecycle for the app: the live scene, a queued swap, and the
// fade-coordinated transition between them. `obj_game` (the unified controller) holds one
// as `this.scenes` and delegates update/step/draw/destroy to it each event; SystemMenu
// reads the live scene and restarts/quits THROUGH this interface (scenes.current /
// label() / restart() / request()) instead of reaching into obj_game's private fields.
//
// A plain instance class, not a static singleton — there is exactly one, owned by the
// single obj_game controller, and GMRT 0.19 doesn't fire static getters, so the lifecycle
// state stays as plain instance fields read directly (e.g. SystemMenu reads `.current`).
globalThis.SceneManager = class SceneManager {
  constructor() {
    this.current = null; // the live Scene instance, or null
    this._pending = null; // a factory queued for the next frame, awaiting a fade
    this._factory = null; // factory of the live scene (so it can be restarted)
    this._label = null; // registry label of the live scene (string or () => string)
  }

  // Boot / first scene: apply immediately (there's nothing to fade out from). The caller
  // (obj_game Create) runs SceneTransition.reveal() so the first scene fades in from black.
  start(factory) {
    this._apply(factory);
  }

  // Queue a scene change — applied next frame via update() (after UI.update()) so the UI
  // tree isn't torn down mid-traversal. Ignored while a fade is already running: during
  // the fade-out the outgoing scene's buttons are still live, so without this guard spamming
  // one re-queues _pending and a second fade fires once the first finishes. This is the
  // `openScene` callback handed to every scene's create().
  request(factory) {
    if (SceneTransition.isBusy()) return;
    this._pending = factory;
  }

  // Per-frame (Step_0): flush a queued swap through a fade, then advance the fade timer.
  // Route the swap through SceneTransition.start (it runs _apply at full cover); the busy
  // guard stops a second openScene mid-fade from stacking two swaps.
  update() {
    if (this._pending !== null && !SceneTransition.isBusy()) {
      const factory = this._pending;
      this._pending = null;
      SceneTransition.start(() => this._apply(factory));
    }
    SceneTransition.update();
  }

  // Swap at full cover: destroy the old scene, reset cross-scene singletons, build the new
  // one (which rebuilds its UI hidden under the fade cover).
  _apply(factory) {
    if (this.current !== null) this.current.destroy();
    UINav.reset(); // drop focus held on the outgoing scene's UI
    SystemMenu.reset(); // close the system overlay (+ its pause) + restore time scale
    Dialogue.clear(); // a dialogue must not survive into the next scene
    FloatingText.clear(); // drop floating combat numbers (world coords are scene-local)
    this._factory = factory; // remembered so the SystemMenu can restart the scene
    // Resolve a display label for the SystemMenu readout. Class-based scenes (extends Scene)
    // never get their `label` field — GMRT doesn't run subclass field initializers — so the
    // registry label is the reliable (and localized) source; built-ins fall back to the
    // instance label they set via Object.assign (resolved live in label()).
    const entry = SceneRegistry._entries.find((e) => e.factory === factory);
    this._label = entry != null ? entry.label : null;
    this.current = factory();
    this.current.create((s) => this.request(s));
  }

  // Re-open the live scene from scratch (SystemMenu's "Restart Scene").
  restart() {
    if (this._factory !== null) this.request(this._factory);
  }

  // Display label for readouts: the registry label (a string or () => string textRef) if
  // set, else the built-in scene's instance label, else "-".
  label() {
    if (this.current === null) return "-";
    const lbl = this._label;
    if (lbl != null) return typeof lbl === "function" ? lbl() : lbl;
    return this.current.label != null && this.current.label !== ""
      ? this.current.label
      : "-";
  }

  // Per-frame sim tick (Step_0), pause-gated by the SystemMenu overlay: while it's open all
  // sim freezes (scene.step() skipped) except a single-frame advance from its Step button.
  step() {
    if (this.current === null) return;
    if (!SystemMenu.isOpen()) {
      this.current.step();
    } else if (SystemMenu.consumeStep()) {
      // One frame of sim at the chosen speed, then re-freeze (SystemMenu.update re-zeros
      // Time next frame; world.update() runs off Time.delta, so it must be non-zero here).
      Time.scale = SystemMenu.scale();
      Time.delta = Time.raw * Time.scale;
      this.current.step();
      Time.delta = 0;
      Time.scale = 0;
    }
  }

  draw() {
    if (this.current !== null) this.current.draw();
  }

  // Teardown (CleanUp): destroys the live scene's UI roots, so obj_game must call this
  // before UI.destroy().
  destroy() {
    if (this.current !== null) this.current.destroy();
  }
};
