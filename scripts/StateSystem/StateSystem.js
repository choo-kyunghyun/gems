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
        // state.current?.finish?.(id);
        state.current.finish(id);
        state.current = state.next;
        state.next = undefined;
        // state.current?.enter?.(id);
        state.current.enter(id);
      }

      // state.current?.update?.(id);
      state.current.update(id);
    }
  },
};
