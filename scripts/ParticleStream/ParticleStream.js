/**
 * The live particle system behind a ParticleEmitter — TRANSIENT: ParticleEmitterSystem mints it
 * with a release hook (Table.mint), so the stream is destroyed when the component goes (a
 * detach, the entity's removal, a level's teardown) and no save or transfer carries it. The
 * emitter's data is the ParticleEmitter; this is its handle, kept as a component so a component
 * holds it and no roster does.
 *
 * @typedef {Object} ParticleStream
 * @property {Id<"ParticleSystem">} sys  the live part_system
 */
globalThis.ParticleStream = "ParticleStream";
