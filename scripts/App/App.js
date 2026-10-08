/**
 * The run's one live scene and its switch.
 *
 * A scene is any object with create() / update() / draw() / destroy(), plus the optional
 * handleEscape() (first refusal on an Esc the UI left), retheme() (rebuilds its UI on a live theme
 * swap) and `gameplay` (opts into pause and gameplay navigation). It is live or gone, never
 * frozen: a switch destroys it, so it carries no state across one.
 *
 * A switch is queued, applied between frames at full fade cover so no UI tree is torn down
 * mid-traversal, and dropped while a fade runs, so a spammed button can't stack swaps. Applying
 * it destroys the live scene, restores every hook the scene wired through `hook`, runs `sweep` —
 * the one list of app members a scene can dirty — and builds the target, so a scene's destroy
 * frees only what it made itself.
 */
globalThis.App = {
  scene: null,
  background: c_black, // the backdrop each frame clears to
  sweep: () => {}, // resets every app member a scene can dirty, run between two scenes
  _pending: null, // the queued scene factory
  _quit: false,
  _hooks: [], // { owner, key, prev } the live scene wired, oldest first

  /** Build the first scene now, fading in from black. */
  start(factory) {
    App._apply(factory);
    SceneTransition.reveal();
  },

  /** Queue a switch to the scene `factory` makes. */
  open(factory) {
    if (SceneTransition.isBusy()) return;
    App._pending = factory;
  },

  /** Queue the end of the run, behind the fade a switch takes. */
  quit() {
    if (SceneTransition.isBusy()) return;
    App._quit = true;
  },

  /** Once per frame: start a queued switch or quit, then advance the fade. */
  step() {
    if (!SceneTransition.isBusy()) {
      if (App._quit) {
        App._quit = false;
        SceneTransition.start(() => game_end());
      } else if (App._pending !== null) {
        const factory = App._pending;
        App._pending = null;
        SceneTransition.start(() => App._apply(factory));
      }
    }
    SceneTransition.update();
  },

  /** Wire `owner[key]` for the live scene's life; the switch puts back what it held. */
  hook(owner, key, value) {
    App._hooks.push({ owner, key, prev: owner[key] });
    owner[key] = value;
  },

  /** Rebuild the live scene's UI in a new palette; a scene with no retheme() keeps its own. */
  retheme() {
    const s = App.scene;
    if (s === null) return;
    if (s.retheme !== undefined) s.retheme();
  },

  /** The run's end: the live scene goes, its hooks with it. */
  close() {
    App._drop();
  },

  _apply(factory) {
    App._drop();
    App.sweep();
    App.scene = factory();
    App.scene.create();
  },

  _drop() {
    if (App.scene !== null) App.scene.destroy();
    App.scene = null;
    const hooks = App._hooks;
    for (let i = hooks.length - 1; i >= 0; i--) hooks[i].owner[hooks[i].key] = hooks[i].prev;
    hooks.length = 0;
  },
};
