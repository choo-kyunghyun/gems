/**
 * @typedef {Object} StateSchema
 * @property {function(number): void} [enter]
 * @property {function(number): void} [update]
 * @property {function(number): void} [finish]
 */

globalThis.StateSystem = {
  change(world, id, schema, force = false) {
    const state = world.get(State, id);
    if (state === undefined) return;
    if (state.current === schema && !force) return;
    state.next = schema;
  },

  update(world) {
    const ids = world.query(State);
    for (const id of ids) {
      const state = world.get(State, id);

      if (state.next !== undefined) {
        if (state.current && state.current.finish) state.current.finish(id);
        state.current = state.next;
        state.next = undefined;
        if (state.current && state.current.enter) state.current.enter(id);
      }

      if (state.current && state.current.update) state.current.update(id);
    }
  },
};
