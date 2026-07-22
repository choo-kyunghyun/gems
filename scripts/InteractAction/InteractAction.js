// Registry of interaction behaviors — the data-driven generalization of the old hardcoded Station
// `kind` switch. Genre-agnostic (concrete defs are content; the RPG's set is RpgInteractions).
/**
 * An entity's `Interaction.kind` names a def here; the Demo/UI `Interactable` engine looks it up on E
 * and calls def.run(ctx). This holds only the registry — adding an interaction is a data entry, not an
 * engine edit.
 *
 * A def: { id, prompt, run(ctx) }
 *   id      unique action key (matches Interaction.kind)
 *   prompt  proximity-pill label — an I18n key
 *   run     invoked on E. ctx = { level, entities, id, comp, playerId } (id = the station entity, comp
 *           = its Interaction data, playerId = the interacting player). An INSTANT action acts and
 *           returns; a WINDOW action opens its UI and sets level._interOpenId = ctx.id so the engine
 *           range-closes / refreshes it.
 */
globalThis.InteractAction = {
  _defs: {},

  register(list) {
    for (let i = 0; i < list.length; i++) this._defs[list[i].id] = list[i];
  },

  get(id) {
    return this._defs[id];
  },

  has(id) {
    return this._defs[id] !== undefined;
  },
};
