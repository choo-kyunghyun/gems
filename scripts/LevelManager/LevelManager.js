/**
 * There is NO scene stack: every live scene sits in a FLAT collection with ONE active pointer, and
 * `switchTo()` is the single transition. Switching away either DESTROYS the scene (plain navigation —
 * lobby, quit) or FREEZES it as-is (`keep: true` — suspend() hides its UI; its entities/state stay
 * untouched) to be thawed by `back()` — the guest-minigame path (the RPG's arcade cabinet), which
 * also hands the guest's result() to the switch's onResult. One kept scene at a time (no nesting —
 * fail fast).
 *
 * REGISTRY: a flat mapId -> entry index of every RESIDENT map — THE map pool (no scene-side pool). An
 * entry is opaque to Core except for { entities, grid }: RpgMap registers a minimal pair at build and
 * overwrites it with its full park bundle at each suspend, so parked worlds live here. take/put/transfer
 * move a WHOLE entity (all components, via EntitySnapshot) between two resident maps' stores — the
 * portal-squad + wandering-trader path. Registry `reset()` drops the index (map-pool teardown; the
 * owner frees the stores first); it is INDEPENDENT of the scene collection (destroy() tears that down).
 */
globalThis.LevelManager = class LevelManager {
  constructor() {
    this._all = []; // every live scene entry { scene, factory, label } — active + frozen
    this._current = null; // the ACTIVE entry (stepped + drawn) — the pointer into _all
    this._returnTo = null; // the frozen entry back() thaws (set by a keep switch); null = none
    this._onResult = null; // the kept switch's result handler, fired by back()
    this._pending = null; // queued switch { factory, opts }, applied next update()
    // Sim pause + frame-step, driven by the Debug overlay's "Sim" section.
    this.paused = false;
    this._stepRequested = false; // one-shot: lets exactly one frame through
    // boot-wired seams (Core names no Game module):
    // pause menu, duck-typed { isOpen(), scale(), reset() } — Game wires
    // SystemMenu; null = no menu pause gating
    this.menu = null;
    // display-label resolver, (factory) => string | () => string | null — Game wires
    // SceneRegistry.labelOf; null = instance labels only
    this.resolveLabel = null;
    this._levels = {}; // mapId -> entry (at least { entities, grid }; parked maps store their full bundle)
    this._active = null; // the mapId currently stepped + drawn
  }

  get current() {
    return this._current !== null ? this._current.scene : null;
  }

  /** Boot scene: apply immediately (nothing to fade out from; caller runs SceneTransition.reveal). */
  start(factory) {
    this._apply(factory, {});
  }

  /**
   * THE transition: queue an active-scene switch, applied next frame (after UI.update, so the UI
   * tree isn't torn down mid-traversal). Default DESTROYS every live scene first (plain
   * navigation) and runs through the fade; `keep: true` instead FREEZES the current scene
   * (suspend(), entities intact, instant — no fade) and records it as back()'s return target, with
   * `onResult` fired when the guest returns. Ignored mid-fade so a spammed button can't stack
   * swaps. This is the `openScene` callback handed to every create().
   */
  switchTo(factory, opts = {}) {
    if (SceneTransition.isBusy()) return;
    this._pending = { factory, opts };
  }

  /** Returns false when nothing is kept. */
  back() {
    if (this._returnTo === null) return false;
    const guest = this._current;
    const result =
      guest.scene.result !== undefined ? guest.scene.result() : undefined;
    guest.scene.destroy();
    this._all.splice(this._all.indexOf(guest), 1);
    this._clearOverlays();
    this._current = this._returnTo;
    this._returnTo = null;
    if (this._current.scene.resume !== undefined) this._current.scene.resume();
    const onResult = this._onResult;
    this._onResult = null;
    if (onResult !== null) onResult(result);
    return true;
  }

  /**
   * Per-frame: flush a queued switch — a destroying swap goes through the fade (SceneTransition
   * .start runs _apply at full cover), a kept swap applies instantly (an in-world guest open) —
   * then advance the fade timer. Busy guard stops a second switchTo from stacking swaps.
   */
  update() {
    if (this._pending !== null && !SceneTransition.isBusy()) {
      const p = this._pending;
      this._pending = null;
      if (p.opts.keep === true || p.opts.fade === false)
        this._apply(p.factory, p.opts);
      else SceneTransition.start(() => this._apply(p.factory, p.opts));
    }
    SceneTransition.update();
  }

  /**
   * Apply a switch NOW. keep: freeze the current scene (ONE slot — no nested guests, fail fast)
   * and activate the new one in front. Otherwise: destroy every live scene (a quit from a guest
   * must also drop its frozen host), reset the cross-scene singletons, build the target fresh.
   */
  _apply(factory, opts) {
    if (opts.keep === true && this._current !== null) {
      if (this._returnTo !== null) {
        Log.warn("LevelManager: keep-switch while a scene is already kept");
        return;
      }
      if (this._current.scene.suspend !== undefined)
        this._current.scene.suspend();
      this._returnTo = this._current;
      this._onResult = opts.onResult ?? null;
      // host's world-space numbers/particles/dialogue must not bleed into the guest
      this._clearOverlays();
    } else {
      this._destroyAll();
      UINav.reset(); // drop focus held on the outgoing scene's UI
      if (this.menu !== null) this.menu.reset(); // close the pause overlay + restore time scale
      Dialogue.clear();
      FloatingText.clear(); // world coords are scene-local
      ParticleFx.clear(); // world coords are scene-local
      Audio.restart(); // one scene's BGM/SFX must not bleed into the next
    }
    const entry = this._make(factory);
    this._all.push(entry);
    this._current = entry;
    entry.scene.create((f, o) => this.switchTo(f, o));
  }

  _make(factory) {
    // A class scene's `label` field never sets (GMRT skips subclass field inits — #15067), so the
    // resolved label (localized) is the reliable source; built-ins fall back to their instance label.
    const scene = factory();
    scene.manager = this;
    const label =
      this.resolveLabel !== null ? this.resolveLabel(factory) : null;
    return { scene, factory, label };
  }

  /**
   * Lighter reset than _apply for a keep/back boundary: clears world-space singletons + drops nav
   * focus (so it can't point at a hidden host widget), but leaves the frozen host's menu state.
   */
  _clearOverlays() {
    UINav.reset();
    Dialogue.clear();
    FloatingText.clear();
    ParticleFx.clear();
  }

  /** Newest first (a guest before its frozen host). */
  _destroyAll() {
    for (let i = this._all.length - 1; i >= 0; i--)
      this._all[i].scene.destroy();
    this._all = [];
    this._current = null;
    this._returnTo = null;
    this._onResult = null;
  }

  /** Re-open the active scene from scratch (Debug "Restart Scene") — a destroying re-switch. */
  restart() {
    if (this._current !== null) this.switchTo(this._current.factory);
  }

  /**
   * Live theme swap: rebuild the active scene's UI in place (colors are baked at build, so a
   * palette change only shows after a rebuild). Delegates to the scene's optional retheme() —
   * a UI-only rebuild that never regenerates world/gameplay state, unlike restart(). A scene
   * that doesn't implement it keeps its old-palette UI until its next natural rebuild.
   */
  retheme() {
    const scene = this.current;
    if (scene !== null && scene.retheme !== undefined) scene.retheme();
  }

  label() {
    if (this._current === null) return "-";
    const lbl = this._current.label;
    if (lbl != null) return typeof lbl === "function" ? lbl() : lbl;
    const scene = this._current.scene;
    return scene.label != null && scene.label !== "" ? scene.label : "-";
  }

  /**
   * Per-frame sim tick, pause-gated two ways: the boot-wired menu overlay and the Debug "Pause"
   * toggle. While paused, scene.update() is skipped except for a one-frame advance via requestStep().
   */
  step() {
    const scene = this.current;
    if (scene === null) return;
    if (this.menu !== null && this.menu.isOpen()) {
      // Menu forces Time.scale = 0; a step must restore a non-zero delta (store.update advances off
      // Time.delta) then re-freeze.
      if (this._takeStep()) {
        Time.scale = this.menu.scale();
        Time.delta = Time.raw * Time.scale;
        scene.update();
        Time.delta = 0;
        Time.scale = 0;
      }
      return;
    }
    if (this.paused) {
      // Debug pause leaves Time.scale untouched (so it doesn't fight the Time panel's Scale slider)
      // and just gates the sim — a step lets one frame through at live delta.
      if (this._takeStep()) scene.update();
      return;
    }
    this._stepRequested = false; // don't carry a stale step into normal play
    scene.update();
  }

  /** Request a one-frame sim advance while paused (Debug "Step Frame"). */
  requestStep() {
    this._stepRequested = true;
  }

  _takeStep() {
    if (!this._stepRequested) return false;
    this._stepRequested = false;
    return true;
  }

  draw() {
    const scene = this.current;
    if (scene !== null) scene.draw();
  }

  /** Teardown: destroys every scene's UI roots, so Game must call this before UI.destroy(). */
  destroy() {
    this._destroyAll();
  }

  /**
   * Index a map under its id. `entry` must carry at least { entities, grid } — Core reads only
   * those two fields; everything else is the owner's business (the RPG's park bundle).
   * Overwrites: RpgMap.build stores a minimal { entities, grid }, each RpgMap.suspend replaces it
   * with the full park bundle. A resumed map's entry may retain stale bundle fields until its
   * next suspend — harmless, nothing reads them (entities/grid are the same live objects throughout).
   */
  register(mapId, entry) {
    this._levels[mapId] = entry;
  }

  entryOf(mapId) {
    const e = this._levels[mapId];
    return e !== undefined ? e : null;
  }

  ids() {
    return Object.keys(this._levels);
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
    const e = this._levels[mapId];
    return e !== undefined ? e.entities : null;
  }

  /**
   * Capture a WHOLE entity (all components) out of a resident map's store and remove it. Returns the
   * snapshot (the caller now owns it), or null if the map isn't resident. EntitySnapshot references
   * the component data objects, so they survive the remove/flush (see EntitySnapshot).
   */
  take(mapId, id) {
    const w = this.worldOf(mapId);
    if (w === null) return null;
    const snap = EntitySnapshot.capture(w, id); // no component list → every component
    w.remove(id);
    return snap;
  }

  /**
   * Restore a whole-entity snapshot into a resident map's store; `overrides` apply after (e.g. a
   * fresh Position for the destination). Returns the new id, or -1 if the map isn't resident.
   */
  put(mapId, snap, overrides) {
    const w = this.worldOf(mapId);
    if (w === null) return -1;
    return EntitySnapshot.restore(w, snap, overrides);
  }

  /**
   * Move a whole entity from one map to another. Destination resident → it lands there (new id); not
   * resident → the snapshot is returned for the caller to hold until it loads.
   */
  transfer(fromMapId, toMapId, id, overrides) {
    const snap = this.take(fromMapId, id);
    if (snap === null) return null;
    if (this.isResident(toMapId)) return this.put(toMapId, snap, overrides);
    return snap;
  }

  /**
   * New game / map-pool teardown — the pooled stores are freed by RpgMap, so just drop the index.
   * INDEPENDENT of the scene collection (destroy() tears that down).
   */
  reset() {
    this._levels = {};
    this._active = null;
  }
};
