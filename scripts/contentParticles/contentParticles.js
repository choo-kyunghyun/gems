/**
 * Particle system metadata declarations, registered once and idempotently.
 */
globalThis.contentParticles = {
  registered: false,

  register() {
    if (contentParticles.registered) return;
    contentParticles.registered = true;
    AssetMeta.register([
      // authored for a 32 px cell under the 128 px one
      { asset: psDrop, kind: "particle", density: 0.25 },
      { asset: psExplosion, kind: "particle", density: 0.25 },
      { asset: psMuzzle, kind: "particle", density: 0.25 },
    ]);
  },
};
