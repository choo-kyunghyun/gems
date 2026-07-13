// The level lifecycle manager — a `World` sub-module, held as `World.levels`. There is NO scene
// stack: every live level sits in a FLAT collection with ONE active pointer, and `switchTo()` is
// the single transition. Switching away from a level either DESTROYS it (plain navigation —
// lobby, quit) or FREEZES it as-is (`keep: true` — suspend() hides its UI; its world/state stay
// untouched in the collection) to be thawed by `back()` — the guest-minigame path (the RPG's
// arcade cabinet), which also hands the guest's result() to the switch's onResult. One kept
// level at a time (no nesting — fail fast), which is all the demo ever needed from the stack.
//
// REGISTRY (was Universe): a flat mapId -> entry index of every RESIDENT map — THE map pool
// (there is no scene-side pool anymore). An entry is opaque to Core except for { world, level }:
// RpgMap registers a minimal pair at build and overwrites it with its full park bundle at each
// suspend, so parked worlds live here. take/put/transfer move a WHOLE entity (all components,
// via EntitySnapshot) between two resident maps' stores — the portal-squad + wandering-trader
// path. Registry `reset()` drops the index (map-pool teardown; the owner frees the stores
// first); it is INDEPENDENT of the level collection (destroy() tears that down).
//
// Plain instance class (World.levels = new LevelManager()), not a static singleton: `current` is
// an instance getter — instance get/set work on GMRT, only static computed getters miscompile.
globalThis.LevelManager = class LevelManager {
  constructor() {
    // ── flat level collection ──
    this._all = []; // every live level entry { level, factory, label } — active + frozen
    this._current = null; // the ACTIVE entry (stepped + drawn) — the pointer into _all
    this._returnTo = null; // the frozen entry back() thaws (set by a keep switch); null = none
    this._onResult = null; // the kept switch's result handler, fired by back()
    this._pending = null; // queued switch { factory, opts }, applied next update()
    // Sim pause + frame-step, driven by the Debug overlay's "Sim" panel.
    this.paused = false; // gates level.step() like the menu pause does
    this._stepRequested = false; // one-shot: lets exactly one frame through
    // ── resident-map registry (was Universe) ──
    this._levels = {}; // mapId -> entry (at least { world, level }; parked maps store their full bundle)
    this._active = null; // the mapId currently stepped + drawn
  }

  /** Active Level instance, or null. */
  get current() {
    return this._current !== null ? this._current.level : null;
  }

  /** Boot level: apply immediately (nothing to fade out from; caller runs SceneTransition.reveal). @param {() => Level} factory */
  start(factory) {
    this._apply(factory, {});
  }

  /**
   * THE transition: queue an active-level switch, applied next frame (after UI.update, so the UI
   * tree isn't torn down mid-traversal). Default DESTROYS every live level first (plain
   * navigation) and runs through the fade; `keep: true` instead FREEZES the current level
   * (suspend(), world intact, instant — no fade) and records it as back()'s return target, with
   * `onResult` fired when the guest returns. Ignored mid-fade so a spammed button can't stack
   * swaps. This is the `openScene` callback handed to every create().
   * @param {() => Level} factory
   * @param {{ keep?: boolean, fade?: boolean, onResult?: (result:any) => void }} [opts]
   */
  switchTo(factory, opts = {}) {
    if (SceneTransition.isBusy()) return;
    this._pending = { factory, opts };
  }

  /**
   * Return from a kept switch: destroy the active guest, thaw the kept level, and hand the
   * guest's result() to the switch's onResult. @returns {boolean} false when nothing is kept.
   */
  back() {
    if (this._returnTo === null) return false;
    const guest = this._current;
    const result =
      guest.level.result !== undefined ? guest.level.result() : undefined;
    guest.level.destroy();
    this._all.splice(this._all.indexOf(guest), 1);
    this._clearOverlays();
    this._current = this._returnTo;
    this._returnTo = null;
    if (this._current.level.resume !== undefined) this._current.level.resume();
    const onResult = this._onResult;
    this._onResult = null;
    if (onResult !== null) onResult(result);
    return true;
  }

  // Per-frame: flush a queued switch — a destroying swap goes through the fade (SceneTransition
  // .start runs _apply at full cover), a kept swap applies instantly (an in-world guest open) —
  // then advance the fade timer. Busy guard stops a second switchTo from stacking swaps.
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

  // Apply a switch NOW. keep: freeze the current level (ONE slot — no nested guests, fail fast)
  // and activate the new one in front. Otherwise: destroy every live level (a quit from a guest
  // must also drop its frozen host), reset the cross-level singletons, build the target fresh.
  _apply(factory, opts) {
    if (opts.keep === true && this._current !== null) {
      if (this._returnTo !== null) {
        Log.warn("LevelManager: keep-switch while a level is already kept");
        return;
      }
      if (this._current.level.suspend !== undefined)
        this._current.level.suspend();
      this._returnTo = this._current;
      this._onResult = opts.onResult ?? null;
      // host's world-space numbers/particles/dialogue must not bleed into the guest
      this._clearOverlays();
    } else {
      this._destroyAll();
      UINav.reset(); // drop focus held on the outgoing level's UI
      SystemMenu.reset(); // close the overlay (+ its pause) + restore time scale
      Dialogue.clear();
      FloatingText.clear(); // world coords are level-local
      ParticleFx.clear(); // world coords are level-local
      Audio.reset(); // one level's BGM/SFX must not bleed into the next
    }
    const entry = this._make(factory);
    this._all.push(entry);
    this._current = entry;
    entry.level.create((s) => this.switchTo(s));
  }

  // Build an entry: create the level, resolve its display label, back-reference the manager.
  _make(factory) {
    // GMRT doesn't run subclass field initializers, so a class level's `label` field never sets —
    // the registry label (localized) is the reliable source; built-ins fall back to their instance
    // label. Lookup matches by factory ref, so a guest level must register with the same factory.
    const entry = SceneRegistry._entries.find((e) => e.factory === factory);
    const level = factory();
    level.manager = this;
    return { level, factory, label: entry != null ? entry.label : null };
  }

  // Lighter reset than _apply for a keep/back boundary: clears world-space singletons + drops nav
  // focus (so it can't point at a hidden host widget), but leaves the frozen host's menu state.
  _clearOverlays() {
    UINav.reset();
    Dialogue.clear();
    FloatingText.clear();
    ParticleFx.clear();
  }

  // Tear down every live level, newest first (a guest before its frozen host).
  _destroyAll() {
    for (let i = this._all.length - 1; i >= 0; i--)
      this._all[i].level.destroy();
    this._all = [];
    this._current = null;
    this._returnTo = null;
    this._onResult = null;
  }

  /** Re-open the active level from scratch (Debug "Restart Scene") — a destroying re-switch. */
  restart() {
    if (this._current !== null) this.switchTo(this._current.factory);
  }

  /**
   * Live theme swap: rebuild the active level's UI in place (colors are baked at build, so a
   * palette change only shows after a rebuild). Delegates to the level's optional retheme() —
   * a UI-only rebuild that never regenerates world/gameplay state, unlike restart(). A level
   * that doesn't implement it keeps its old-palette UI until its next natural rebuild.
   */
  retheme() {
    const level = this.current;
    if (level !== null && level.retheme !== undefined) level.retheme();
  }

  /** Display label of the active level: registry label, else instance label, else "-". @returns {string} */
  label() {
    if (this._current === null) return "-";
    const lbl = this._current.label;
    if (lbl != null) return typeof lbl === "function" ? lbl() : lbl;
    const level = this._current.level;
    return level.label != null && level.label !== "" ? level.label : "-";
  }

  // Per-frame sim tick, pause-gated two ways: the SystemMenu overlay and the Debug "Pause" toggle.
  // While paused, level.step() is skipped except for a one-frame advance via requestStep().
  step() {
    const level = this.current;
    if (level === null) return;
    if (SystemMenu.isOpen()) {
      // Menu forces Time.scale = 0; a step must restore a non-zero delta (store.update advances off
      // Time.delta) then re-freeze.
      if (this._takeStep()) {
        Time.scale = SystemMenu.scale();
        Time.delta = Time.raw * Time.scale;
        level.step();
        Time.delta = 0;
        Time.scale = 0;
      }
      return;
    }
    if (this.paused) {
      // Debug pause leaves Time.scale untouched (so it doesn't fight the Time panel's Scale slider)
      // and just gates the sim — a step lets one frame through at live delta.
      if (this._takeStep()) level.step();
      return;
    }
    this._stepRequested = false; // don't carry a stale step into normal play
    level.step();
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

  /** Render the active level. */
  draw() {
    const level = this.current;
    if (level !== null) level.draw();
  }

  /** Teardown: destroys every level's UI roots, so obj_game must call this before UI.destroy(). */
  destroy() {
    this._destroyAll();
  }

  // ── resident-map registry + whole-entity transfer (was Universe) ──

  // Index a map under its id. `entry` must carry at least { world, level } — Core reads only
  // those two fields; everything else is the owner's business (the RPG's park bundle).
  // Overwrites: RpgMap.build stores a minimal { world, level }, each RpgMap.suspend replaces it
  // with the full park bundle. A resumed map's entry may retain stale bundle fields until its
  // next suspend — harmless, nothing reads them (world/level are the same live objects throughout).
  register(mapId, entry) {
    this._levels[mapId] = entry;
  }

  /** @returns {Object|null} the registered entry (a park bundle, or the minimal { world, level }) */
  entryOf(mapId) {
    const e = this._levels[mapId];
    return e !== undefined ? e : null;
  }

  /** @returns {string[]} every resident map id (teardown walks) */
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
    return e !== undefined ? e.world : null;
  }

  // Capture a WHOLE entity (all components) out of a resident map's store and remove it. Returns the
  // snapshot (the caller now owns it), or null if the map isn't resident. EntitySnapshot references
  // the component data objects, so they survive the remove/flush (see EntitySnapshot).
  take(mapId, id) {
    const w = this.worldOf(mapId);
    if (w === null) return null;
    const snap = EntitySnapshot.capture(w, id); // no component list → every component
    w.remove(id);
    return snap;
  }

  // Restore a whole-entity snapshot into a resident map's store; `overrides` apply after (e.g. a
  // fresh Position for the destination). Returns the new id, or -1 if the map isn't resident.
  put(mapId, snap, overrides) {
    const w = this.worldOf(mapId);
    if (w === null) return -1;
    return EntitySnapshot.restore(w, snap, overrides);
  }

  // Move a whole entity from one map to another. Destination resident → it lands there (new id); not
  // resident → the snapshot is returned for the caller to hold until it loads.
  transfer(fromMapId, toMapId, id, overrides) {
    const snap = this.take(fromMapId, id);
    if (snap === null) return null;
    if (this.isResident(toMapId)) return this.put(toMapId, snap, overrides);
    return snap;
  }

  // New game / map-pool teardown — the pooled stores are freed by RpgMap, so just drop the index.
  // INDEPENDENT of the level collection (destroy() tears that down).
  reset() {
    this._levels = {};
    this._active = null;
  }
};
