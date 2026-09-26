/**
 * A reader's place in a stack of tile layers' edit logs, so a mirror of the layers re-derives
 * only the cells written since it last looked. `poll` answers what changed and moves past it:
 *   0   nothing
 *   1   each layer's `log` from `from[i]` on
 *   -1  every cell — the first poll, a reader behind a log's reach, or a stack that changed
 * The logs are read after the poll, so the answer holds until the next write.
 */
globalThis.EditCursor = class EditCursor {
  constructor() {
    this.from = []; // per layer, where its replay starts in `log` after a poll answering 1
    this._layers = null; // the stack at the last poll; null = never polled
    this._seen = []; // per layer, its edit count at the last poll
  }

  poll(layers) {
    const held = this._layers;
    const seen = this._seen;
    const from = this.from;
    from.length = layers.length;
    let state = held === null || held.length !== layers.length ? -1 : 0;
    for (let i = 0; i < layers.length && state >= 0; i++) {
      const layer = layers[i];
      if (held[i] !== layer) {
        state = -1;
        break;
      }
      const at = layer.since(seen[i]);
      from[i] = at;
      if (layer.edits !== seen[i]) state = at < 0 ? -1 : 1;
    }
    if (state === 0) return 0;
    const stack = held === null ? (this._layers = []) : held;
    stack.length = layers.length;
    seen.length = layers.length;
    for (let i = 0; i < layers.length; i++) {
      stack[i] = layers[i];
      seen[i] = layers[i].edits;
    }
    return state;
  }
};
