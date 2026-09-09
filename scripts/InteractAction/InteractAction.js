// Registry of interaction behaviors — the data-driven generalization of the old hardcoded Station
// `kind` switch. Genre-agnostic (concrete defs are content; the colony's set is contentInteractions).
/**
 * An entity's `Interaction.kind` names a def here; the Game/UI `Interactable` engine looks it up on E
 * and calls def.run(ctx). This holds only the registry — adding an interaction is a data entry, not an
 * engine edit.
 *
 * A def: { id, prompt, run(ctx), priority? }
 *   id        unique action key (matches Interaction.kind)
 *   prompt    proximity-pill label — an I18n key, or "" for no pill (the target prompts through
 *             its own UI: an NPC's dialogue panel); or a function of ctx returning either,
 *             resolved each frame (a companion's wait/follow flip)
 *   priority  proximity-pick rank, default 0: among the entities in reach the highest wins, then
 *             the nearest; the cursor overrides both (Interactable._pick). A companion is -1.
 *   run     invoked on E. ctx = { scene, entities, id, comp, playerId } (id = the station entity, comp
 *           = its Interaction data, playerId = the interacting player). An INSTANT action acts and
 *           returns; a WINDOW action opens its page through the scene's Window with the target
 *           (`scene.window.open(id, { target: ctx.id })`) so the engine range-closes it.
 */
globalThis.InteractAction = {
  // ── Registry facade (Registry owns the store's contract) ──
  _defs: new Map(),
  _order: [],

  register(list) {
    Registry.register(InteractAction, list);
  },

  get(id) {
    return Registry.get(InteractAction, id);
  },

  has(id) {
    return Registry.has(InteractAction, id);
  },
};
