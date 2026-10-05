/**
 * The particle streams and one-shot bursts in world space, each stood up on a camera-facing
 * plane. Inserted after the opaque ground, which would hide them.
 * @implements {RenderPass}
 */
globalThis.RenderParticles = class RenderParticles {
  constructor(opt = {}) {
    this.enabled = true;
    this.camera = opt.camera;
  }

  destroy() {}

  draw(entities) {
    const pitchDeg = (this.camera.pitch * 180) / Math.PI;
    ParticleEmitterSystem.draw(entities, pitchDeg);
    ParticleFx.draw(pitchDeg);
  }
};
