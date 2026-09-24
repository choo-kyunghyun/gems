/**
 * Attached particle STREAM — a `ps*` system that runs for as long as the entity stands, drawn
 * camera-facing at its Position.
 *
 * `asset` is the system's NAME, never a ref, so the data round-trips through a save (an asset ref
 * reflects as `{}` — docs/GMRT.md). The live handle is not here: it is minted beside this,
 * transient.
 *
 * usage: entities.add(id, ParticleEmitter, { asset: "psDrop", color: c_orange })
 *
 * @typedef {Object} ParticleEmitter
 * @property {string} asset    particle system asset name ("ps*")
 * @property {number} scale    world scale of the stream
 * @property {number} [color]  color blend over the asset's own colors (omitted = untinted)
 */
globalThis.ParticleEmitter = "ParticleEmitter";
// any script may load first (docs/GMRT.md)
(globalThis.Blank ??= {})[ParticleEmitter] = { scale: 1 };
