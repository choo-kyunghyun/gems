/**
 * Attached particle STREAM — a `ps*` system that runs for as long as the entity stands (an item
 * drop's sparkle, a site beacon's rise). ParticleEmitterSystem owns the live instance and draws
 * it on a camera-facing plane at the entity's Position; a one-shot effect is ParticleFx.burst
 * instead, which outlives no entity.
 *
 * `asset` is the system's NAME, resolved at mint time, never a ref: the data snapshot-round-trips
 * as-is that way (an asset ref reflects as `{}` through a save — docs/GMRT.md), and a prop
 * descriptor can author one. The live handle is NOT here — a component is pure data, so the
 * roster holds it.
 *
 * usage: entities.add(id, ParticleEmitter, { asset: "psDrop", color: c_orange })
 *
 * @typedef {Object} ParticleEmitter
 * @property {string} asset    particle system asset name ("ps*")
 * @property {number} [scale]  world scale of the stream (default 1) — an emitter region authored
 *                             over a wider frame than the body it rises from divides here
 * @property {number} [color]  GM color blend over the asset's own colors (omitted = untinted)
 */
globalThis.ParticleEmitter = "ParticleEmitter";
