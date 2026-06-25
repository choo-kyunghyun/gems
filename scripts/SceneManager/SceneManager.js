// Owns the scene lifecycle for the app: a STACK of scenes (a persistent base + transient
// guests pushed on top), a queued base swap, and the fade-coordinated transition. `obj_game`
// (the unified controller) holds one as `this.scenes` and delegates update/step/draw/destroy to
// it each event; SystemMenu reads the live scene and restarts/quits THROUGH this interface
// (scenes.current / label() / restart() / request()) instead of reaching into obj_game's fields.
//
// The stack is asymmetric: only the TOP scene is stepped + drawn; a scene below it is suspended
// (its UI hidden, camera detached) so a minigame can run in front of the RPG without the RPG
// losing its context. push()/pop() drive that; request()/_apply() still own the faded BASE swap
// (lobby navigation), collapsing any guests first.
//
// A plain instance class, not a static singleton — there is exactly one, owned by the single
// obj_game controller, so the lifecycle state stays as plain instance fields read directly
// (a static get wouldn't fire reliably on GMRT anyway). `current` is an instance getter over the
// stack top (instance get/set always work on GMRT; only static computed getters miscompile).
globalThis.SceneManager = class SceneManager {
  constructor() {
    // Stack of frames { scene, factory, label, onResult } — index 0 is the base, last is live.
    this._stack = [];
    this._pending = null; // a base-swap factory queued for the next frame, awaiting a fade
    // Sim pause + frame-step, driven by the Debug overlay (Debug "Sim" panel: Pause toggle +
    // Step Frame button) — relocated here from SystemMenu so the dev controls live in Debug.
    this.paused = false; // Debug "Pause" — gates scene.step() like the menu pause does
    this._stepRequested = false; // one-shot: Step Frame lets exactly one frame through
  }

  /** The live (top-of-stack) Scene instance, or null. Read widely (SystemMenu/Debug). */
  get current() {
    return this._stack.length > 0
      ? this._stack[this._stack.length - 1].scene
      : null;
  }

  /** Stack depth — 1 is a lone base scene, >1 means a guest minigame is on top. */
  depth() {
    return this._stack.length;
  }

  /**
   * Boot / first scene: apply immediately (nothing to fade out from). The caller (obj_game
   * Create) runs SceneTransition.reveal() so the first scene fades in from black.
   * @param {() => Scene} factory
   */
  start(factory) {
    this._apply(factory);
  }

  /**
   * Queue a BASE scene change — applied next frame via update() (after UI.update()) so the UI tree
   * isn't torn down mid-traversal, and collapsing any guests first. Ignored while a fade is already
   * running, so spamming an outgoing scene's (still-live) button can't stack a second swap. This is
   * the `openScene` callback handed to every scene's create().
   * @param {() => Scene} factory
   */
  request(factory) {
    if (SceneTransition.isBusy()) return;
    this._pending = factory;
  }

  /**
   * Push a transient GUEST scene on top of the live one (a minigame): suspend the host, build +
   * create the guest, and run it in front until pop(). No fade — it's an instant in-world switch.
   * @param {() => Scene} factory @param {{ onResult?: (result:any) => void }} [opts]
   */
  push(factory, opts) {
    const host = this.current;
    if (host !== null && host.suspend !== undefined) host.suspend();
    this._clearOverlays(); // host's world-space numbers/particles/dialogue must not bleed in
    const frame = this._make(factory);
    frame.onResult = opts !== undefined ? (opts.onResult ?? null) : null;
    this._stack.push(frame);
    frame.scene.create((s) => this.request(s));
  }

  /**
   * Pop the live guest, resume the scene beneath it, and hand that guest's optional result() back
   * to the onResult callback recorded at push(). No-op on the base (depth 1 can't be popped).
   */
  pop() {
    if (this._stack.length <= 1) return;
    const frame = this._stack[this._stack.length - 1];
    const scene = frame.scene;
    const result = scene.result !== undefined ? scene.result() : undefined;
    scene.destroy();
    this._stack.pop();
    this._clearOverlays();
    const host = this.current;
    if (host !== null && host.resume !== undefined) host.resume();
    if (frame.onResult !== null) frame.onResult(result);
  }

  // Per-frame (Step_0): flush a queued base swap through a fade, then advance the fade timer.
  // SceneTransition.start runs _apply at full cover; the busy guard stops a second openScene
  // mid-fade from stacking two swaps.
  update() {
    if (this._pending !== null && !SceneTransition.isBusy()) {
      const factory = this._pending;
      this._pending = null;
      SceneTransition.start(() => this._apply(factory));
    }
    SceneTransition.update();
  }

  /**
   * Base swap at full cover: collapse the whole stack (guests + base, top-down), reset cross-scene
   * singletons, build the new base (which rebuilds its UI hidden under the fade cover).
   * @param {() => Scene} factory
   */
  _apply(factory) {
    this._destroyAll();
    UINav.reset(); // drop focus held on the outgoing scene's UI
    SystemMenu.reset(); // close the system overlay (+ its pause) + restore time scale
    Dialogue.clear(); // a dialogue must not survive into the next scene
    FloatingText.clear(); // drop floating combat numbers (world coords are scene-local)
    ParticleFx.clear(); // drop live particles (world coords are scene-local)
    Audio.reset(); // stop the looping BGM + all SFX so one scene's audio can't bleed into the next
    const frame = this._make(factory);
    this._stack.push(frame);
    frame.scene.create((s) => this.request(s));
  }

  // Build a frame for a factory: resolve its display label + back-reference the manager (so the
  // scene can push() guests), without creating it. Shared by _apply (base) and push (guest).
  _make(factory) {
    // Resolve a display label for the SystemMenu readout. Class-based scenes (extends Scene) never
    // get their `label` field — GMRT doesn't run subclass field initializers — so the registry
    // label is the reliable (and localized) source; built-ins fall back to the instance label they
    // set via Object.assign (resolved live in label()). Registry lookup matches by factory ref, so
    // a pushable scene should register with the SAME global factory it is pushed by.
    const entry = SceneRegistry._entries.find((e) => e.factory === factory);
    const scene = factory();
    scene.manager = this;
    return {
      scene,
      factory,
      label: entry != null ? entry.label : null,
      onResult: null,
    };
  }

  // Drop the world-space cross-scene singletons across a push/pop boundary (a lighter reset than
  // _apply's full one — the menu/nav state of the paused host is left intact under the guest, but
  // focus is dropped so nav can't point at a hidden host widget).
  _clearOverlays() {
    UINav.reset();
    Dialogue.clear();
    FloatingText.clear();
    ParticleFx.clear();
  }

  // Tear down every frame, top-down (a guest is destroyed before its host).
  _destroyAll() {
    for (let i = this._stack.length - 1; i >= 0; i--)
      this._stack[i].scene.destroy();
    this._stack = [];
  }

  /** Re-open the live scene from scratch (SystemMenu's "Restart Scene"). A guest re-request
   * collapses the stack to a fresh base — restarting a minigame standalone is an edge case. */
  restart() {
    if (this._stack.length > 0) {
      this.request(this._stack[this._stack.length - 1].factory);
    }
  }

  /**
   * Display label for readouts: the registry label (string or () => string textRef) of the live
   * frame if set, else the built-in scene's instance label, else "-". @returns {string}
   */
  label() {
    if (this._stack.length === 0) return "-";
    const frame = this._stack[this._stack.length - 1];
    const lbl = frame.label;
    if (lbl != null) return typeof lbl === "function" ? lbl() : lbl;
    const scene = frame.scene;
    return scene.label != null && scene.label !== "" ? scene.label : "-";
  }

  // Per-frame sim tick (Step_0). The sim is pause-gated two ways: the player's SystemMenu
  // overlay, and the Debug overlay's "Pause" toggle (this.paused). While paused, scene.step()
  // is skipped except for a single-frame advance requested via requestStep() (the Debug
  // "Step Frame" button — relocated here from the SystemMenu).
  step() {
    const scene = this.current;
    if (scene === null) return;
    if (SystemMenu.isOpen()) {
      // The menu forces Time.scale = 0, so a step must restore a non-zero delta for the one
      // scene.step (world.update advances off Time.delta), then re-freeze.
      if (this._takeStep()) {
        Time.scale = SystemMenu.scale();
        Time.delta = Time.raw * Time.scale;
        scene.step();
        Time.delta = 0;
        Time.scale = 0;
      }
      return;
    }
    if (this.paused) {
      // Debug pause leaves Time.scale untouched (so the Debug Time panel's Scale slider isn't
      // fought) and just gates the sim — a step lets exactly one frame through at live delta.
      if (this._takeStep()) scene.step();
      return;
    }
    this._stepRequested = false; // don't carry a stale step into normal play
    scene.step();
  }

  /** Request a one-frame sim advance while paused (the Debug "Step Frame" button). */
  requestStep() {
    this._stepRequested = true;
  }

  // Consume the one-shot frame-step flag (true at most once per requestStep).
  _takeStep() {
    if (!this._stepRequested) return false;
    this._stepRequested = false;
    return true;
  }

  /** Render the live scene. */
  draw() {
    const scene = this.current;
    if (scene !== null) scene.draw();
  }

  /** Teardown (CleanUp): destroys every scene's UI roots, so obj_game must call this before
   * UI.destroy(). */
  destroy() {
    this._destroyAll();
  }
};
