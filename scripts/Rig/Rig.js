/**
 * The on-demand verbs over a Skeleton and its puppet, plus the puppet binding a per-frame scan
 * drives. Playback is the runtime's: a skeletal sprite runs on the puppet's `image_index` under
 * `image_speed` and is posed when the puppet draws (docs/SPINE.md), so no verb here runs per
 * entity per frame.
 */
globalThis.Rig = {
  /** How far short of `image_number` a played-out one-shot parks, on its last pose. */
  HOLD: 0.01,
  /** The sim rate every puppet's `image_speed` was last written under. */
  clock: 1,
  _info: {},

  /** Switch animation set, restarting playback only on an actual change. No-op without a Skeleton. */
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
   * Push a changed draw tint (`color`/`alpha`) onto the puppet; scale needs no push, being read
   * off the Skeleton each draw. No-op without a Skeleton or puppet.
   */
  apply(entities, id) {
    const sk = entities.get(id, Skeleton);
    if (sk === undefined) return;
    const held = entities.get(id, Instance);
    if (held !== undefined) Rig._transform(held.inst, sk);
  },

  /**
   * Whether the current one-shot set has played out. A looping set, a puppet not yet minted, or
   * no Skeleton reads true, so a caller waiting "until finished" never waits on nothing.
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
   * A sheet's `sprite_get_info` struct, read once per sprite: the puppet-free read of a rig.
   * `animation_names` is the one sound missing-name check, since the duration and frame reads
   * give 0 for a single-key set too. Keyed by sprite name, since an asset-ref key crashes
   * (docs/GMRT.md).
   */
  info(sprite) {
    const key = sprite_get_name(sprite);
    let info = Rig._info[key];
    if (info === undefined) {
      // nested arrays reach JS opaque; a JSON round-trip lands plain data (docs/GMRT.md)
      info = JSON.parse(json_stringify(sprite_get_info(sprite)));
      Rig._info[key] = info;
    }
    return info;
  },

  /** Mint a puppet for a Skeleton without one, as after a map transfer or a load. */
  mint(entities, id, sk) {
    const held = PuppetSystem.attach(entities, id);
    held.rigged = true;
    held.inst.sprite_index = sk.sprite;
    Rig._play(held.inst, sk);
    Rig._transform(held.inst, sk);
    // slot colours are per-instance: replayed on every mint
    const slots = Object.keys(sk.tints);
    for (let i = 0; i < slots.length; i++)
      held.inst.skeleton_slot_colour_set(slots[i], sk.tints[slots[i]], 1);
    // a fresh puppet wears nothing: attachments are per-instance, so it must be re-dressed
    const ap = entities.get(id, Appearance);
    if (ap !== undefined) ap.dirty = true;
    return held;
  },

  /** The `image_speed` that plays the bound set at `sk.speed` x authored time under the sim clock. */
  speed(inst, sk) {
    const duration = inst.skeleton_animation_get_duration(sk.anim);
    if (duration === 0) return 0;
    // BUG: nested, not `&&` (docs/GMRT.md #15549)
    if (!sk.loop) {
      if (inst.image_index >= inst.image_number - 2 * Rig.HOLD) return 0; // parked
    }
    return (
      (sk.speed * Rig.clock * inst.image_number) /
      (duration * sprite_get_speed(sk.sprite))
    );
  },

  /**
   * Bind the puppet to `sk.anim` from its first frame, throwing on a set the sheet lacks: the
   * runtime binds a missing name silently. A single-key set is a pose with no duration, so it
   * plays at rate 0 and holds its only frame.
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
    inst.image_blend = sk.color;
    inst.image_alpha = sk.alpha;
  },
};
