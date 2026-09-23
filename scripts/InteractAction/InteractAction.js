/**
 * Registry of interaction behaviors.
 *
 * An entity's `Interaction.kind` names a def here, so adding an interaction is a data entry, not
 * an engine edit.
 *
 * A def: { id, prompt, run(ctx), priority? }
 *   id        matches Interaction.kind
 *   prompt    an I18n key, "" for no prompt pill, or a function of ctx returning either,
 *             resolved each frame
 *   priority  rank among the entities in reach, default 0; ties go to the nearest
 *   run       ctx = { scene, entities, id, comp, playerId }, `id` the target entity and `comp` its
 *             Interaction data. A window action opens its page with `{ target: ctx.id }` so the
 *             window closes when the player leaves range.
 */
globalThis.InteractAction = {
  register(list) {
    Registry.register(InteractAction, list);
  },

  get(id) {
    return Registry.get(InteractAction, id);
  },
};
