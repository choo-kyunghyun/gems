/**
 * Binds every Skeleton to its puppet: mints one on demand (InstanceSystem owns the lifetime),
 * sets the sheet and animation, and mirrors a component field onto the puppet when it changes —
 * the AnimationSystem of the SKELETAL category, minus the clock. Playback is the runtime's: a
 * skeletal sprite runs on the puppet's `image_index` under `image_speed` and is posed off it
 * when the puppet draws (docs/SPINE.md), so nothing here runs per entity per frame.
 *
 * `update` is the one per-frame call, a scan of the puppets for what only a frame can see: a
 * Skeleton with no puppet yet (a spawn, a load, a map transfer), a change of the sim clock
 * (Time.scale, Time.tempo) that every puppet's `image_speed` carries so animation pauses and
 * dilates with the world, and a one-shot about to wrap — the runtime replays it from its first
 * key whatever the set's loop flag (docs/SPINE.md), so the scan parks it on its last pose a
 * step ahead, here rather than in a Puppet event, whose order against the systems is unknown.
 */
globalThis.SkeletonSystem = {
  /**
   * A skeletal frame is 1/120 s on the runtime whatever rate the rig was exported at — a 0.4 s
   * set reports 48 frames — so a set's authored length is `frames / FPS` seconds.
   */
  FPS: 120,

  /** the sim rate (`Time.scale * Time.tempo`) the puppets' `image_speed` was last written under */
  _clock: 1,

  update(entities) {
    const clock = Time.scale * Time.tempo;
    const retime = clock !== SkeletonSystem._clock;
    SkeletonSystem._clock = clock;
    const fps = game_get_speed(gamespeed_fps);
    entities.forEach([Skeleton], (id, sk) => {
      const held = entities.get(id, Instance);
      if (held === undefined) {
        SkeletonSystem._mint(entities, id, sk);
        return;
      }
      const inst = held.inst;
      if (retime) inst.image_speed = SkeletonSystem._speed(inst, sk);
      if (sk.loop) return;
      if (inst.image_speed === 0) return; // parked, held, or paused
      // `image_index` advances after Step and before Draw: park a one-shot the step it would wrap
      const step = (inst.image_speed * sprite_get_speed(sk.sprite)) / fps;
      if (inst.image_index + step >= inst.image_number) {
        inst.image_speed = 0;
        inst.image_index = inst.image_number - SkeletonSystem.HOLD;
      }
    });
  },

  /**
   * Switch animation set, restarting playback only on an actual change — so a held key doesn't
   * restart it. No-op for an entity carrying no Skeleton.
   */
  set(entities, id, anim, loop) {
    const sk = entities.get(id, Skeleton);
    if (sk === undefined) return;
    if (sk.anim === anim) return;
    sk.anim = anim;
    sk.loop = loop ?? sk.loop;
    const held = entities.get(id, Instance);
    if (held !== undefined) SkeletonSystem._play(held.inst, sk);
  },

  /** Playback rate over authored time (1 = as authored, 0 = hold). No-op without a Skeleton. */
  rate(entities, id, speed) {
    const sk = entities.get(id, Skeleton);
    if (sk === undefined) return;
    if (sk.speed === speed) return;
    sk.speed = speed;
    const held = entities.get(id, Instance);
    if (held !== undefined)
      held.inst.image_speed = SkeletonSystem._speed(held.inst, sk);
  },

  /**
   * Tint one slot of the rig, written to the component and onto the live puppet if there is one —
   * slot colour is per-instance (docs/SPINE.md), so a later mint replays the map. `color` is the
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
   * Push the draw transform — `xscale`/`yscale`/`color`/`alpha` — onto the puppet, after a
   * writer changed one (a facing flip, a corpse's crumple). No-op without a Skeleton or puppet.
   */
  apply(entities, id) {
    const sk = entities.get(id, Skeleton);
    if (sk === undefined) return;
    const held = entities.get(id, Instance);
    if (held !== undefined) SkeletonSystem._transform(held.inst, sk);
  },

  /**
   * Whether the entity's current set has played out: a one-shot (`loop` false) that `update`
   * parked on its last pose. A looping set, a puppet not yet minted, or no Skeleton at all reads
   * true, so a caller holding a pose "until finished" never waits on nothing.
   */
  finished(entities, id) {
    const sk = entities.get(id, Skeleton);
    if (sk === undefined || sk.loop) return true;
    const held = entities.get(id, Instance);
    if (held === undefined) return true;
    // twice HOLD: the park lands a float32 hair under the exact mark
    return held.inst.image_index >= held.inst.image_number - 2 * SkeletonSystem.HOLD;
  },

  /** where a played-out one-shot parks `image_index`: this short of `image_number`, the last pose */
  HOLD: 0.01,

  /**
   * A sheet's `sprite_get_info` struct, read once per sprite (fixed for the build): the sound,
   * puppet-free read of a rig — `animation_names` (the one missing-name check: get_frames and
   * get_duration read 0 for a missing name AND for a single-key set), `bones` with the setup
   * pose, `slots` with their bone and setup attachment (docs/SPINE.md). Keyed by sprite name — a
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
   * Bind the puppet to `sk.anim` from its first frame, refusing a set the sheet lacks — the
   * runtime binds a missing name silently (docs/SPINE.md), so the doll would pass as standing
   * still. A single-key set (the rigs' `down`) is a pose: it reads 0 frames, so it plays at rate
   * 0 and holds its only frame.
   */
  _play(inst, sk) {
    if (SkeletonSystem.info(sk.sprite).animation_names.indexOf(sk.anim) < 0)
      throw new Error(
        `SkeletonSystem: ${sprite_get_name(sk.sprite)} has no animation "${sk.anim}"`,
      );
    inst.skeleton_animation_set(sk.anim, sk.loop);
    inst.image_index = 0;
    inst.image_speed = SkeletonSystem._speed(inst, sk);
  },

  /**
   * The `image_speed` that plays the bound set at `sk.speed` x authored time under the sim
   * clock: `image_number` is the set's length in image frames and the sheet's speed the rate
   * `image_speed` 1 runs them at (docs/SPINE.md), so one pass takes `image_number / speed`
   * seconds where the rig authored `frames / FPS`.
   */
  _speed(inst, sk) {
    const frames = inst.skeleton_animation_get_frames(sk.anim);
    if (frames === 0) return 0;
    // nested, not `&&`: the short-circuit corrupts its left operand (docs/GMRT.md #15549)
    if (!sk.loop) {
      if (inst.image_index >= inst.image_number - 2 * SkeletonSystem.HOLD) return 0; // parked
    }
    return (
      sk.speed *
      SkeletonSystem._clock *
      ((inst.image_number / sprite_get_speed(sk.sprite)) *
        (SkeletonSystem.FPS / frames))
    );
  },

  _transform(inst, sk) {
    inst.image_xscale = sk.xscale;
    inst.image_yscale = sk.yscale;
    inst.image_blend = sk.color;
    inst.image_alpha = sk.alpha;
  },

  /** The entity's first puppet — or the one a map transfer or a load left it without. */
  _mint(entities, id, sk) {
    const held = InstanceSystem.attach(entities, id);
    held.inst.sprite_index = sk.sprite;
    SkeletonSystem._play(held.inst, sk);
    SkeletonSystem._transform(held.inst, sk);
    // slot colours are per-instance like attachments (docs/SPINE.md): replayed on every mint
    const slots = Object.keys(sk.tints);
    for (let i = 0; i < slots.length; i++)
      held.inst.skeleton_slot_colour_set(slots[i], sk.tints[slots[i]], 1);
    // a fresh puppet wears nothing: attachments are per-instance (docs/SPINE.md), so a doll that
    // just crossed a map or came back from a save has to be re-dressed by its Appearance owner
    const ap = entities.get(id, Appearance);
    if (ap !== undefined) ap.dirty = true;
    return held;
  },
};
