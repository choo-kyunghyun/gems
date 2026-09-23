/**
 * Sound metadata declarations.
 *
 * One idempotent register into AssetMeta, called from Game's Create (beside contentSprites).
 * Def shape at the AssetMeta declaration.
 */
globalThis.contentSounds = {
  registered: false,

  register() {
    if (contentSounds.registered) return;
    contentSounds.registered = true;
    AssetMeta.register([
      // the timed pieces first — the dial's tempo choices, slowest to fastest
      { asset: musHibernation, kind: "music", bpm: 60, name: "MUS_HIBERNATION" },
      { asset: musOutpost, kind: "music", bpm: 90, name: "MUS_OUTPOST" },
      { asset: musRaid, kind: "music", bpm: 120, name: "MUS_RAID" },
      // the ambient beds — the map cues (cozy indoors, tense outdoors) and the rest
      { asset: musAmbientCozy, kind: "music", name: "MUS_AMBIENT_COZY" },
      { asset: musAmbientTense, kind: "music", name: "MUS_AMBIENT_TENSE" },
      { asset: musAmbientDanger, kind: "music", name: "MUS_AMBIENT_DANGER" },
      { asset: musAmbientEmergency, kind: "music", name: "MUS_AMBIENT_EMERGENCY" },
      { asset: musAmbientDust, kind: "music", name: "MUS_AMBIENT_DUST" },
      { asset: musAmbientStorm, kind: "music", name: "MUS_AMBIENT_STORM" },
      { asset: musAmbientRuin, kind: "music", name: "MUS_AMBIENT_RUIN" },
      { asset: musAmbientHollow, kind: "music", name: "MUS_AMBIENT_HOLLOW" },
      { asset: musAmbientReactor, kind: "music", name: "MUS_AMBIENT_REACTOR" },
      { asset: musAmbientOrbit, kind: "music", name: "MUS_AMBIENT_ORBIT" },
      { asset: musAmbientPerimeter, kind: "music", name: "MUS_AMBIENT_PERIMETER" },
    ]);
  },
};
