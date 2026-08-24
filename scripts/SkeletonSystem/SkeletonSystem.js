/**
 * Drives every Skeleton's puppet: mints one on demand (InstanceSystem owns the lifetime), binds
 * the sheet and animation, advances playback, and pushes the draw transform onto the instance —
 * the AnimationSystem of the SKELETAL category. Run once per frame after state selection, and on
 * Time.delta for the same reason: animation is world motion, so it pauses and dilates with the sim.
 *
 * The clock is ours because the runtime never advances a skeletal one, and the frame count comes
 * from skeleton_animation_get_frames, the one piece of frame metadata a skeletal sprite reports
 * correctly (docs/GMRT.md).
 */
globalThis.SkeletonSystem = {
  update(entities) {
    entities.forEach([Skeleton], (id, sk) => {
      let held = entities.get(id, Instance);
      if (held === undefined) held = SkeletonSystem._mint(entities, id, sk);
      const inst = held.inst;

      if (sk.fps !== 0) {
        const frames = inst.skeleton_animation_get_frames(sk.anim);
        if (frames > 0) {
          sk.frame += sk.fps * Time.delta;
          if (sk.frame >= frames)
            sk.frame = sk.loop ? sk.frame % frames : frames - 1;
        }
      }
      inst.skeleton_animation_set_frame(0, sk.frame); // one track per puppet
      inst.image_xscale = sk.xscale;
      inst.image_yscale = sk.yscale;
      inst.image_blend = sk.color;
      inst.image_alpha = sk.alpha;
    });
  },

  /**
   * Switch animation set, resetting playback only on an actual change — so a held key doesn't
   * restart it. No-op for an entity carrying no Skeleton.
   */
  set(entities, id, anim, loop) {
    const sk = entities.get(id, Skeleton);
    if (sk === undefined) return;
    if (sk.anim === anim) return;
    sk.anim = anim;
    sk.loop = loop ?? sk.loop;
    sk.frame = 0;
    const held = entities.get(id, Instance);
    if (held !== undefined) held.inst.skeleton_animation_set(anim, sk.loop);
  },

  /**
   * Whether the entity's current set has played out: a one-shot (`loop` false) that reached its
   * last frame. A looping set, a puppet not yet minted, or no Skeleton at all reads true, so a
   * caller holding a pose "until finished" never waits on nothing.
   */
  finished(entities, id) {
    const sk = entities.get(id, Skeleton);
    if (sk === undefined || sk.loop) return true;
    const held = entities.get(id, Instance);
    if (held === undefined) return true;
    return sk.frame >= held.inst.skeleton_animation_get_frames(sk.anim) - 1;
  },

  /** The entity's first puppet — or the one a map transfer or a load left it without. */
  _mint(entities, id, sk) {
    const held = InstanceSystem.attach(entities, id);
    held.inst.sprite_index = sk.sprite;
    held.inst.image_speed = 0; // SkeletonSystem owns the clock (docs/GMRT.md)
    held.inst.skeleton_animation_set(sk.anim, sk.loop);
    // a fresh puppet wears nothing: attachments are per-instance (docs/GMRT.md), so a doll that
    // just crossed a map or came back from a save has to be re-dressed by its Appearance owner
    const ap = entities.get(id, Appearance);
    if (ap !== undefined) ap.dirty = true;
    return held;
  },
};
