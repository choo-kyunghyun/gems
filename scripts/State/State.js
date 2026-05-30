/**
 * @typedef {Object} StateConfig
 * @property {function(number): void} [enter]
 * @property {function(number): void} [update]
 * @property {function(number): void} [finish]
 */

globalThis.State = class State {
  static states = {};
  static data = new Array(MAX_ENTITIES).fill(undefined);

  static addState(name, state) {
    this.states[name] = state;
  }

  static set(id, initialState) {
    this.data[IdPool.getIndex(id)] = {
      id,
      current: undefined,
      next: initialState,
      force: false,
    };
  }

  static fromDef(id, def) {
    this.set(id, def);
  }

  static change(id, name, force = false) {
    const sm = this.data[IdPool.getIndex(id)];
    if (sm === undefined) return;
    sm.next = name;
    sm.force = force;
  }

  static update() {
    for (let i = 0; i < this.data.length; i++) {
      const sm = this.data[i];
      if (sm === undefined) continue;

      if (sm.next !== undefined) {
        if (sm.current !== sm.next || sm.force) {
          const prev = this.states[sm.current];
          if (prev !== undefined && prev.finish !== undefined)
            prev.finish(sm.id);
          sm.current = sm.next;
          const next = this.states[sm.current];
          if (next !== undefined && next.enter !== undefined) next.enter(sm.id);
        }
        sm.next = undefined;
        sm.force = false;
      }

      const cur = this.states[sm.current];
      if (cur !== undefined && cur.update !== undefined) cur.update(sm.id);
    }
  }

  static delete(i) { this.data[i] = undefined; }

  static export() {
    const entries = [];
    for (let i = 0; i < this.data.length; i++) {
      if (this.data[i] !== undefined) entries.push([i, this.data[i]]);
    }
    return entries;
  }

  static import(data) {
    this.data.fill(undefined);
    for (const [i, v] of data) this.data[i] = v;
  }
};
