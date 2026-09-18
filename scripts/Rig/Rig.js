/**
 * The on-demand verbs over a Skeleton and its puppet — bind a set (`set`), its playback rate
 * (`rate`), the draw transform (`apply`), whether a one-shot has played out (`finished`), a
 * sheet's rig info (`info`) — and the puppet binding SkeletonSystem's per-frame scan drives:
 * `mint` a puppet for a Skeleton without one, `speed` the `image_speed` a bound set plays at
 * under the sim clock. `clock` is the sim rate (`Time.scale * Time.tempo`) every puppet's
 * image_speed was last written under — SkeletonSystem writes it on a change and retimes them.
 * Playback is the runtime's: a skeletal sprite runs on the puppet's `image_index` under
 * `image_speed` and is posed off it when the puppet draws (docs/SPINE.md), so no verb here
 * runs per entity per frame.
 */
globalThis.Rig = {
  /** where a played-out one-shot parks `image_index`: this short of `image_number`, the last pose */
  HOLD: 0.01,
  /** the sim rate the puppets' `image_speed` was last written under (SkeletonSystem) */
  clock: 1,
  /** sheet name -> its `sprite_get_info` record (see `info`) */
  _info: {},

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
    if (held !== undefined) Rig._play(held.inst, sk);
  },

  /** Playback rate over authored time (1 = as authored, 0 = hold). No-op without a Skeleton. */
  rate(entities, id, speed) {
    const sk = entities.get(id, Skeleton);
    if (sk === undefined) return;
    if (sk.speed === speed) return;
    sk.speed = speed;
    const held = entities.get(id, Instance);
    if (held !== undefined) held.inst.image_speed = Rig.speed(held.inst, sk);
  },

  /**
   * Push the draw transform — `xscale`/`yscale`/`color`/`alpha` — onto the puppet, after a
   * writer changed one (a facing flip, a corpse's crumple). No-op without a Skeleton or puppet.
   */
  apply(entities, id) {
    const sk = entities.get(id, Skeleton);
    if (sk === undefined) return;
    const held = entities.get(id, Instance);
    if (held !== undefined) Rig._transform(held.inst, sk);
  },

  /**
   * Whether the entity's current set has played out: a one-shot (`loop` false) that
   * SkeletonSystem parked on its last pose. A looping set, a puppet not yet minted, or no
   * Skeleton at all reads true, so a caller holding a pose "until finished" never waits on nothing.
   */
  finished(entities, id) {
    const sk = entities.get(id, Skeleton);
    if (sk === undefined || sk.loop) return true;
    const held = entities.get(id, Instance);
    if (held === undefined) return true;
    // twice HOLD: the park lands a float32 hair under the exact mark
    return held.inst.image_index >= held.inst.image_number - 2 * Rig.HOLD;
  },

  /**
   * A sheet's `sprite_get_info` struct, read once per sprite (fixed for the build): the sound,
   * puppet-free read of a rig — `animation_names` (the one missing-name check: get_frames and
   * get_duration read 0 for a missing name AND for a single-key set), `bones` with the setup
   * pose, `slots` with their bone and setup attachment (the manual's sprite_get_info). Keyed by sprite name — a
   * Map keyed by an asset ref crashes (docs/GMRT.md).
   */
  info(sprite) {
    const key = sprite_get_name(sprite);
    let info = Rig._info[key];
    if (info === undefined) {
      // the struct's nested arrays reach JS opaque — a JSON round-trip lands plain data (docs/GMRT.md)
      info = JSON.parse(json_stringify(sprite_get_info(sprite)));
      Rig._info[key] = info;
    }
    return info;
  },

  /** The entity's first puppet — or the one a map transfer or a load left it without. */
  mint(entities, id, sk) {
    const held = InstanceSystem.attach(entities, id);
    held.inst.sprite_index = sk.sprite;
    Rig._play(held.inst, sk);
    Rig._transform(held.inst, sk);
    // slot colours are per-instance like attachments: replayed on every mint
    const slots = Object.keys(sk.tints);
    for (let i = 0; i < slots.length; i++)
      held.inst.skeleton_slot_colour_set(slots[i], sk.tints[slots[i]], 1);
    // a fresh puppet wears nothing: attachments are per-instance, so a doll that
    // just crossed a map or came back from a save has to be re-dressed by its Appearance owner
    const ap = entities.get(id, Appearance);
    if (ap !== undefined) ap.dirty = true;
    return held;
  },

  /**
   * The `image_speed` that plays the bound set at `sk.speed` x authored time under the sim
   * clock: `image_number` is the set's length in image frames, the sheet's speed the rate
   * `image_speed` 1 runs them at (the manual's image_speed), and the set's authored length is
   * `skeleton_animation_get_duration` seconds.
   */
  speed(inst, sk) {
    const duration = inst.skeleton_animation_get_duration(sk.anim);
    if (duration === 0) return 0;
    // nested, not `&&`: the short-circuit corrupts its left operand (docs/GMRT.md #15549)
    if (!sk.loop) {
      if (inst.image_index >= inst.image_number - 2 * Rig.HOLD) return 0; // parked
    }
    return (
      (sk.speed * Rig.clock * inst.image_number) /
      (duration * sprite_get_speed(sk.sprite))
    );
  },

  /**
   * Bind the puppet to `sk.anim` from its first frame (the set resets `image_index` itself),
   * refusing a set the sheet lacks — the runtime binds a missing name silently (a stderr line
   * only), so the doll would pass as standing still. A single-key set (the rigs' `down`) is a
   * pose: it has no duration, so it plays at rate 0 and holds its only frame.
   */
  _play(inst, sk) {
    if (Rig.info(sk.sprite).animation_names.indexOf(sk.anim) < 0)
      throw new Error(
        `Rig: ${sprite_get_name(sk.sprite)} has no animation "${sk.anim}"`,
      );
    inst.skeleton_animation_set(sk.anim, sk.loop);
    inst.image_speed = Rig.speed(inst, sk);
  },

  _transform(inst, sk) {
    inst.image_xscale = sk.xscale;
    inst.image_yscale = sk.yscale;
    inst.image_blend = sk.color;
    inst.image_alpha = sk.alpha;
  },
};
