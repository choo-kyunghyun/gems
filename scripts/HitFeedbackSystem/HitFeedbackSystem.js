const POP_Y = 14; // world px a number pops above the body's foot

/**
 * Each combatant's hp change since last tick, popped as a floating number with its hit sound.
 * The baseline is the entity's own PrevHealth, so a store swap needs no bookkeeping. Run after the
 * damage of the frame and before deaths resolve, so the killing blow still pops.
 */
globalThis.HitFeedbackSystem = {
  update(level) {
    const entities = level.entities;
    const playerId = ColonyPlayer.id(entities);
    HitFeedbackSystem._diff(entities, playerId, true);
    // Faction joins the query: hostility needs one on both sides, so this skips the
    // factionless majority (docs/ARCHITECTURE.md).
    entities.forEach([Health, Faction], (id) => {
      if (Diplomacy.hostile(entities, playerId, id))
        HitFeedbackSystem._diff(entities, id, false);
    });
    entities.forEach([Follower], (id) => {
      HitFeedbackSystem._diff(entities, id, true);
    });
    // Built structures are otherwise untracked; a double-diffed id is harmless.
    entities.forEach([Health, Mesh], (id) => {
      HitFeedbackSystem._diff(entities, id, true);
    });
  },

  _diff(entities, id, isAlly) {
    if (!entities.isValid(id)) return;
    const hp = entities.get(id, Health);
    if (hp === undefined) return;
    const base = entities.get(id, PrevHealth);
    if (base === undefined) {
      // first sight seeds, pops nothing
      entities.add(id, PrevHealth, { hp: hp.hp }, { mint: true });
      return;
    }
    const prev = base.hp;
    if (hp.hp !== prev) {
      const pos = entities.get(id, Position);
      if (pos !== undefined) {
        const d = hp.hp - prev;
        if (d < 0) {
          FloatingText.push(pos.x, pos.y - POP_Y, -d, {
            type: isAlly ? "hurt" : "damage",
          });
          // An enemy's killing blow is left to the death's own sound.
          const at = { x: pos.x, y: pos.y };
          if (entities.has(id, Mesh))
            Audio.play({ sound: sndHitsoundMetal, position: at });
          else if (isAlly)
            Audio.play({ sound: sndHitsoundArmor, position: at });
          else if (hp.hp > 0)
            Audio.play({ sound: sndHitsoundFlesh, position: at });
        } else {
          FloatingText.push(pos.x, pos.y - POP_Y, "+" + d, { type: "heal" });
        }
      }
    }
    base.hp = hp.hp;
  },
};
