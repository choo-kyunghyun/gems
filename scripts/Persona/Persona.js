// Demographic facts about a PERSON — opt-in, carried only by human entities (player, raider, npc,
// follower; never a creature or a prop). Its presence IS the "is a person" query, which is why the
// display name stays in the separate Name component that props carry too.
// Authored at spawn and never recomputed: `age` is a static number, NOT derived from WorldClock —
// a 28-day in-game year would age a colonist every ~2 real minutes.
// Traits, relationships and backstory are their own components when they arrive; this stays the
// narrow "who this person is" bag.
/**
 * @typedef {Object} Persona
 * @property {"male"|"female"} sex
 * @property {number} age  years at spawn
 */
globalThis.Persona = "Persona";
