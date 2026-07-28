/**
 * Repeating spatial cue source (radio, alarm, drip). Not a GML audio emitter: each cue is a
 * one-shot spatial Audio.play at the entity's Position (SoundEmitterSystem), so there is no
 * live handle to stop on despawn or map swap, and the data snapshot-round-trips as-is —
 * which is why `sound` is the asset NAME, resolved at fire time, never a ref.
 * @typedef {Object} SoundEmitter
 * @property {string} sound  sound asset name ("snd_*")
 * @property {number} every  seconds between cues (sim time)
 * @property {number} [gain=1]
 * @property {number} [timer]  countdown to the next cue; seeds to `every` on first update
 */
globalThis.SoundEmitter = "SoundEmitter";
