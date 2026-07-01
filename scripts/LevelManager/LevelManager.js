// The level/scene lifecycle manager — a `World` sub-module, held as `World.levels`. Merges the old
// SceneManager (the active-scene STACK + faded transitions + sim pause) and Universe (the resident-
// level REGISTRY + whole-entity transfer between levels) into one coordinator, since both already
// tracked "which levels are live" from opposite ends.
//
// STACK (was SceneManager): a persistent base + transient guests pushed on top; only the TOP is
// stepped + drawn, one below is suspended (UI hidden, camera detached) so a minigame runs in front
// without the host losing context. push()/pop() drive that; request()/_apply() own the faded BASE
// swap (lobby navigation), collapsing guests first.
//
// REGISTRY (was Universe): a flat mapId -> { world, level } index of every RESIDENT level (active +
// the parked map pool). RpgMap registers on build/resume, unregisters on evict. take/put/transfer
// move a WHOLE entity (all components, via EntitySnapshot) between two resident levels' stores — the
// wandering-trader path. Registry `reset()` drops the index (map-pool teardown); it is INDEPENDENT of
// the scene stack (destroy() tears the stack down).
//
// Plain instance class (World.levels = new LevelManager()), not a static singleton: `current` is an
// instance getter over the stack top — instance get/set work on GMRT, only static computed getters
// miscompile.
globalThis.LevelManager = class LevelManager {
  constructor() {
    // ── scene/level stack ──
    // Stack of frames { scene, factory, label, onResult } — index 0 base, last live.
    this._stack = [];
    this._pending = null; // base-swap factory queued for next frame, awaiting a fade
    // Sim pause + frame-step, driven by the Debug overlay's "Sim" panel.
    this.paused = false; // gates scene.step() like the menu pause does
    this._stepRequested = false; // one-shot: lets exactly one frame through
    // ── resident-level registry (was Universe) ──
    this._levels = {}; // mapId -> { world, level } for every RESIDENT level (active + parked pool)
    this._active = null; // the mapId currently stepped + drawn
  }

  /** Live (top-of-stack) Scene, or null. */
  get current() {
    return this._stack.length > 0
      ? this._stack[this._stack.length - 1].scene
      : null;
  }

  /** 1 = lone base scene; >1 = a guest minigame is on top. */
  depth() {
    return this._stack.length;
  }

  /** Boot scene: apply immediately (nothing to fade out from; caller runs SceneTransition.reveal). @param {() => Scene} factory */
  start(factory) {
    this._apply(factory);
  }

  /**
   * Queue a BASE scene change, applied next frame (after UI.update, so the UI tree isn't torn down
   * mid-traversal) collapsing guests first. Ignored mid-fade so a spammed button can't stack swaps.
   * This is the `openScene` callback handed to every create(). @param {() => Scene} factory
   */
  request(factory) {
    if (SceneTransition.isBusy()) return;
    this._pending = factory;
  }

  /** Push a transient GUEST on top: suspend host, create guest, run until pop(). No fade. @param {() => Scene} factory @param {{ onResult?: (result:any) => void }} [opts] */
  push(factory, opts) {
    const host = this.current;
    if (host !== null && host.suspend !== undefined) host.suspend();
    this._clearOverlays(); // host's world-space numbers/particles/dialogue must not bleed into the guest
    const frame = this._make(factory);
    frame.onResult = opts !== undefined ? (opts.onResult ?? null) : null;
    this._stack.push(frame);
    frame.scene.create((s) => this.request(s));
  }

  /** Pop the live guest, resume the host, and hand its result() to the push() onResult. No-op at depth 1. */
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

  // Per-frame: flush a queued base swap through a fade (SceneTransition.start runs _apply at full
  // cover), then advance the fade timer. Busy guard stops a second openScene from stacking swaps.
  update() {
    if (this._pending !== null && !SceneTransition.isBusy()) {
      const factory = this._pending;
      this._pending = null;
      SceneTransition.start(() => this._apply(factory));
    }
    SceneTransition.update();
  }

  /** Base swap at full cover: collapse the stack, reset cross-scene singletons, build the new base. @param {() => Scene} factory */
  _apply(factory) {
    this._destroyAll();
    UINav.reset(); // drop focus held on the outgoing scene's UI
    SystemMenu.reset(); // close the overlay (+ its pause) + restore time scale
    Dialogue.clear();
    FloatingText.clear(); // world coords are scene-local
    ParticleFx.clear(); // world coords are scene-local
    Audio.reset(); // one scene's BGM/SFX must not bleed into the next
    const frame = this._make(factory);
    this._stack.push(frame);
    frame.scene.create((s) => this.request(s));
  }

  // Build a frame: create the scene, resolve its display label, back-reference the manager.
  _make(factory) {
    // GMRT doesn't run subclass field initializers, so a class scene's `label` field never sets —
    // the registry label (localized) is the reliable source; built-ins fall back to their instance
    // label. Lookup matches by factory ref, so a pushable scene must register with the same factory.
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

  // Lighter reset than _apply for a push/pop boundary: clears world-space singletons + drops nav
  // focus (so it can't point at a hidden host widget), but leaves the paused host's menu state.
  _clearOverlays() {
    UINav.reset();
    Dialogue.clear();
    FloatingText.clear();
    ParticleFx.clear();
  }

  // Tear down every frame top-down (guest before host).
  _destroyAll() {
    for (let i = this._stack.length - 1; i >= 0; i--)
      this._stack[i].scene.destroy();
    this._stack = [];
  }

  /** Re-open the live scene from scratch (SystemMenu "Restart Scene"); a re-request collapses the stack to a fresh base. */
  restart() {
    if (this._stack.length > 0) {
      this.request(this._stack[this._stack.length - 1].factory);
    }
  }

  /** Display label of the live frame: registry label, else instance label, else "-". @returns {string} */
  label() {
    if (this._stack.length === 0) return "-";
    const frame = this._stack[this._stack.length - 1];
    const lbl = frame.label;
    if (lbl != null) return typeof lbl === "function" ? lbl() : lbl;
    const scene = frame.scene;
    return scene.label != null && scene.label !== "" ? scene.label : "-";
  }

  // Per-frame sim tick, pause-gated two ways: the SystemMenu overlay and the Debug "Pause" toggle.
  // While paused, scene.step() is skipped except for a one-frame advance via requestStep().
  step() {
    const scene = this.current;
    if (scene === null) return;
    if (SystemMenu.isOpen()) {
      // Menu forces Time.scale = 0; a step must restore a non-zero delta (store.update advances off
      // Time.delta) then re-freeze.
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
      // Debug pause leaves Time.scale untouched (so it doesn't fight the Time panel's Scale slider)
      // and just gates the sim — a step lets one frame through at live delta.
      if (this._takeStep()) scene.step();
      return;
    }
    this._stepRequested = false; // don't carry a stale step into normal play
    scene.step();
  }

  /** Request a one-frame sim advance while paused (Debug "Step Frame"). */
  requestStep() {
    this._stepRequested = true;
  }

  // Consume the one-shot step flag (true at most once per requestStep).
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

  /** Teardown: destroys every scene's UI roots, so obj_game must call this before UI.destroy(). */
  destroy() {
    this._destroyAll();
  }

  // ── resident-level registry + whole-entity transfer (was Universe) ──

  // Index a level's store under its map id (idempotent — re-registering a resumed map overwrites with
  // the same live objects). Called by RpgMap on build/resume.
  register(mapId, world, level) {
    this._levels[mapId] = { world: world, level: level };
  }

  // Drop a level from the index (its store is about to be destroyed — evict / scene end).
  unregister(mapId) {
    delete this._levels[mapId];
  }

  setActive(mapId) {
    this._active = mapId;
  }

  activeId() {
    return this._active;
  }

  isResident(mapId) {
    return this._levels[mapId] !== undefined;
  }

  worldOf(mapId) {
    const l = this._levels[mapId];
    return l !== undefined ? l.world : null;
  }

  levelOf(mapId) {
    const l = this._levels[mapId];
    return l !== undefined ? l.level : null;
  }

  // Capture a WHOLE entity (all components) out of a resident level's store and remove it. Returns the
  // snapshot (the caller now owns it), or null if the level isn't resident. EntitySnapshot references
  // the component data objects, so they survive the remove/flush (see EntitySnapshot).
  take(mapId, id) {
    const w = this.worldOf(mapId);
    if (w === null) return null;
    const snap = EntitySnapshot.capture(w, id); // no component list → every component
    w.remove(id);
    return snap;
  }

  // Restore a whole-entity snapshot into a resident level's store; `overrides` apply after (e.g. a
  // fresh Position for the destination). Returns the new id, or -1 if the level isn't resident.
  put(mapId, snap, overrides) {
    const w = this.worldOf(mapId);
    if (w === null) return -1;
    return EntitySnapshot.restore(w, snap, overrides);
  }

  // Move a whole entity from one level to another. Destination resident → it lands there (new id); not
  // resident → the snapshot is returned for the caller to hold until it loads.
  transfer(fromMapId, toMapId, id, overrides) {
    const snap = this.take(fromMapId, id);
    if (snap === null) return null;
    if (this.isResident(toMapId)) return this.put(toMapId, snap, overrides);
    return snap;
  }

  // New game / map-pool teardown — the pooled stores are freed by RpgMap, so just drop the index.
  // INDEPENDENT of the scene stack (destroy() tears that down).
  reset() {
    this._levels = {};
    this._active = null;
  }
};
