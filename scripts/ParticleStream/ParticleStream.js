/**
 * The live particle system behind a ParticleEmitter — TRANSIENT: minted with a release hook, so
 * the stream is destroyed when the component goes by any path and no save or transfer carries
 * it. The emitter's data is the ParticleEmitter; this is its handle, kept as a component so no
 * roster holds it.
 *
 * @typedef {Object} ParticleStream
 * @property {Id<"ParticleSystem">} sys  the live part_system
 * @property {number} unit  world px per asset px, off the asset's declared density
 */
globalThis.ParticleStream = "ParticleStream";
