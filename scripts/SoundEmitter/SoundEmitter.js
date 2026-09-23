/**
 * Repeating spatial cue source (radio, alarm, drip). Not a GML audio emitter: each cue is a
 * one-shot at the entity's position, so there is no live handle to stop on despawn or map swap,
 * and the data round-trips as-is; hence `sound` is the asset name, resolved at fire time.
 * @typedef {Object} SoundEmitter
 * @property {string} sound  sound asset name
 * @property {number} every  seconds between cues (sim time)
 * @property {number} [gain=1]
 * @property {number} [timer]  countdown to the next cue; seeds to `every` on first update
 */
globalThis.SoundEmitter = "SoundEmitter";
