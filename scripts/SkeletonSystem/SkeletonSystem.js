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
  /**
   * Playback rate that plays a set in the seconds Spine shows for it: a skeletal frame is 1/120 s
   * on the runtime whatever rate the rig was exported at — a 0.4 s set reports 48 frames, and
   * `skeleton_animation_set_frame(0, 24)` on it reads back `skeleton_animation_get_position` 0.5.
   */
  FPS: 120,

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
    if (held !== undefined) SkeletonSystem._play(held.inst, sk);
  },

  /**
   * Tint one slot of the rig, written to the component and onto the live puppet if there is one —
   * slot colour is per-instance (docs/GMRT.md), so a later mint replays the map. `color` is the
   * other axis: the two multiply. No-op for an entity carrying no Skeleton.
   */
  tint(entities, id, slot, color) {
    const sk = entities.get(id, Skeleton);
    if (sk === undefined) return;
    sk.tints[slot] = color;
    const held = entities.get(id, Instance);
    if (held !== undefined) held.inst.skeleton_slot_colour_set(slot, color, 1);
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

  /**
   * A sheet's `sprite_get_info` struct, read once per sprite (fixed for the build): the sound,
   * puppet-free read of a rig — `animation_names` (the one missing-name check: get_frames and
   * get_duration read 0 for a missing name AND for a single-key set), `bones` with the setup
   * pose, `slots` with their bone and setup attachment (docs/GMRT.md). Keyed by sprite name — a
   * Map keyed by an asset ref crashes (docs/GMRT.md).
   */
  _info: {},
  info(sprite) {
    const key = sprite_get_name(sprite);
    let info = SkeletonSystem._info[key];
    if (info === undefined) {
      // the struct's nested arrays reach JS opaque — a JSON round-trip lands plain data (docs/GMRT.md)
      info = JSON.parse(json_stringify(sprite_get_info(sprite)));
      SkeletonSystem._info[key] = info;
    }
    return info;
  },

  /**
   * Bind the puppet to `sk.anim`, refusing a set the sheet lacks — the runtime binds a missing
   * name silently (docs/GMRT.md), so the doll would pass as standing still. A single-key set (the
   * rigs' `down`) is a pose: it reads 0 frames, so update never advances it and it holds its
   * only frame.
   */
  _play(inst, sk) {
    if (SkeletonSystem.info(sk.sprite).animation_names.indexOf(sk.anim) < 0)
      throw new Error(
        `SkeletonSystem: ${sprite_get_name(sk.sprite)} has no animation "${sk.anim}"`,
      );
    inst.skeleton_animation_set(sk.anim, sk.loop);
  },

  /** The entity's first puppet — or the one a map transfer or a load left it without. */
  _mint(entities, id, sk) {
    const held = InstanceSystem.attach(entities, id);
    held.inst.sprite_index = sk.sprite;
    held.inst.image_speed = 0; // SkeletonSystem owns the clock (docs/GMRT.md)
    SkeletonSystem._play(held.inst, sk);
    // slot colours are per-instance like attachments (docs/GMRT.md): replayed on every mint
    const slots = Object.keys(sk.tints);
    for (let i = 0; i < slots.length; i++)
      held.inst.skeleton_slot_colour_set(slots[i], sk.tints[slots[i]], 1);
    // a fresh puppet wears nothing: attachments are per-instance (docs/GMRT.md), so a doll that
    // just crossed a map or came back from a save has to be re-dressed by its Appearance owner
    const ap = entities.get(id, Appearance);
    if (ap !== undefined) ap.dirty = true;
    return held;
  },
};
