// Sound metadata DECLARATIONS — the SoundMeta defs, as code. Only a TIMED track needs a line: an
// ambient bed has no tempo and resolves to the default.
/**
 * One idempotent register into SoundMeta, called from Game's Create (beside contentSprites). Each
 * tempo is the one the track was synthesized at (tools/audio-kit/scratch). Def shape at the
 * SoundMeta declaration.
 */
globalThis.contentSounds = {
  registered: false,

  register() {
    if (this.registered) return;
    this.registered = true;
    SoundMeta.register([
      { sound: musHibernation, kind: "music", bpm: 60 },
      { sound: musOutpost, kind: "music", bpm: 90 },
      { sound: musRaid, kind: "music", bpm: 120 },
    ]);
  },
};
