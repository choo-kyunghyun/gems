// Sound metadata DECLARATIONS — the SoundMeta defs, as code. Every BGM track has a line: its name
// puts it on the Radio dial (in this order), and a TIMED one carries the tempo it was synthesized
// at (tools/audio-kit/scratch); an ambient bed has no tempo and resolves to the default.
/**
 * One idempotent register into SoundMeta, called from Game's Create (beside contentSprites).
 * Def shape at the SoundMeta declaration.
 */
globalThis.contentSounds = {
  registered: false,

  register() {
    if (contentSounds.registered) return;
    contentSounds.registered = true;
    SoundMeta.register([
      // the timed pieces first — the dial's tempo choices, slowest to fastest
      { sound: musHibernation, kind: "music", bpm: 60, name: "MUS_HIBERNATION" },
      { sound: musOutpost, kind: "music", bpm: 90, name: "MUS_OUTPOST" },
      { sound: musRaid, kind: "music", bpm: 120, name: "MUS_RAID" },
      // the ambient beds — the map cues (cozy indoors, tense outdoors) and the rest
      { sound: musAmbientCozy, kind: "music", name: "MUS_AMBIENT_COZY" },
      { sound: musAmbientTense, kind: "music", name: "MUS_AMBIENT_TENSE" },
      { sound: musAmbientDanger, kind: "music", name: "MUS_AMBIENT_DANGER" },
      { sound: musAmbientEmergency, kind: "music", name: "MUS_AMBIENT_EMERGENCY" },
      { sound: musAmbientDust, kind: "music", name: "MUS_AMBIENT_DUST" },
      { sound: musAmbientStorm, kind: "music", name: "MUS_AMBIENT_STORM" },
      { sound: musAmbientRuin, kind: "music", name: "MUS_AMBIENT_RUIN" },
      { sound: musAmbientHollow, kind: "music", name: "MUS_AMBIENT_HOLLOW" },
      { sound: musAmbientReactor, kind: "music", name: "MUS_AMBIENT_REACTOR" },
      { sound: musAmbientOrbit, kind: "music", name: "MUS_AMBIENT_ORBIT" },
      { sound: musAmbientPerimeter, kind: "music", name: "MUS_AMBIENT_PERIMETER" },
    ]);
  },
};
