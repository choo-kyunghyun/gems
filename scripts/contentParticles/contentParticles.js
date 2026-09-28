/**
 * Particle system metadata declarations, registered once and idempotently.
 */
globalThis.contentParticles = {
  registered: false,

  register() {
    if (contentParticles.registered) return;
    contentParticles.registered = true;
    AssetMeta.register([
      { asset: psDrop, kind: "particle" },
      { asset: psExplosion, kind: "particle" },
      { asset: psGone, kind: "particle" },
      { asset: psMuzzle, kind: "particle" },
    ]);
  },
};
