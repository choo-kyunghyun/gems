/**
 * The on-demand verbs over a Sprite's playback, plus the puppet binding a per-frame scan drives. A
 * skeletal sheet is played by the runtime on the puppet's `image_index` under `image_speed` and
 * posed when the puppet draws (docs/SPINE.md), so a verb here runs on demand, never per entity
 * per frame; `pose` is the draw's.
 */
globalThis.Anim = {
  /** How far short of the frame count a played-out one-shot parks, on its last frame. */
  HOLD: 0.01,
  /** The sim rate every puppet's `image_speed` was last written under. */
  clock: 1,
  /** `sprite_get_info`'s `type` of a skeletal sheet. */
  SPINE: 2,
  _info: {},

  /**
   * Switch a skeletal body's set, restarting playback only on an actual change; throws on a
   * strip, which has no sets. No-op without a Sprite.
   */
  play(entities, id, anim, loop) {
    const spr = entities.get(id, Sprite);
    if (spr === undefined) return;
    if (spr.anim === undefined)
      throw new Error(`Anim: ${sprite_get_name(spr.sprite)} is a strip, with no "${anim}"`);
    if (spr.anim === anim) return;
    spr.anim = anim;
    spr.loop = loop ?? spr.loop;
    const held = entities.get(id, Instance);
    if (held !== undefined) Anim._play(held.inst, spr);
  },

  /** `image_speed` (1 = as authored, 0 = hold). No-op without a Sprite. */
  rate(entities, id, speed) {
    const spr = entities.get(id, Sprite);
    if (spr === undefined) return;
    if (spr.speed === speed) return;
    spr.speed = speed;
    const held = entities.get(id, Instance);
    if (held !== undefined && held.rigged) held.inst.image_speed = Anim.speed(held.inst, spr);
  },

  /**
   * Whether the current one-shot has played out. A looping sprite, a skeletal body not yet
   * bound, or no Sprite reads true, so a caller waiting "until finished" never waits on nothing.
   */
  finished(entities, id) {
    const spr = entities.get(id, Sprite);
    if (spr === undefined || spr.loop) return true;
    // twice HOLD: a skeletal park lands a float32 hair under the exact mark
    if (spr.anim === undefined)
      return spr.index >= sprite_get_number(spr.sprite) - 2 * Anim.HOLD;
    const held = entities.get(id, Instance);
    if (held === undefined) return true;
    return held.inst.image_index >= held.inst.image_number - 2 * Anim.HOLD;
  },

  /**
   * A sheet's `sprite_get_info` struct, read once per sprite. `animation_names` is the one sound
   * missing-set check, since the duration and frame reads give 0 for a single-key set too. Keyed
   * by sprite name, since an asset-ref key crashes (docs/GMRT.md).
   */
  info(sprite) {
    const key = sprite_get_name(sprite);
    let info = Anim._info[key];
    if (info === undefined) {
      // nested arrays reach JS opaque; a JSON round-trip lands plain data (docs/GMRT.md)
      info = JSON.parse(json_stringify(sprite_get_info(sprite)));
      Anim._info[key] = info;
    }
    return info;
  },

  skeletal(sprite) {
    return Anim.info(sprite).type === Anim.SPINE;
  },

  /** Bind a skeletal body to a puppet, as at spawn or after a map transfer or a load. */
  mint(entities, id, spr) {
    const held = PuppetSystem.attach(entities, id);
    held.rigged = true;
    held.inst.sprite_index = spr.sprite;
    Anim._play(held.inst, spr);
    held.inst.image_blend = spr.blend;
    held.inst.image_alpha = spr.alpha;
    // slot colours are per-instance: replayed on every mint
    const slots = Object.keys(spr.tints);
    for (let i = 0; i < slots.length; i++)
      held.inst.skeleton_slot_colour_set(slots[i], spr.tints[slots[i]], 1);
    // a fresh puppet wears nothing: attachments are per-instance, so it must be re-dressed
    const ap = entities.get(id, Appearance);
    if (ap !== undefined) ap.dirty = true;
    return held;
  },

  /**
   * The `image_speed` that plays the bound set at `spr.speed` under the sim clock. A single-key
   * set is a pose with no duration, so it holds its only frame.
   */
  speed(inst, spr) {
    if (inst.skeleton_animation_get_duration(spr.anim) === 0) return 0;
    // BUG: nested, not `&&` (docs/GMRT.md #15549)
    if (!spr.loop) {
      if (inst.image_index >= inst.image_number - 2 * Anim.HOLD) return 0; // parked
    }
    return spr.speed * Anim.clock;
  },

  /**
   * The world matrix that turns a bound puppet's `draw_self` into the Sprite's draw, up to the
   * placement at the feet: the puppet's own scale is its mask's, so the draw scale and angle ride
   * the matrix about the feet instead — T(-p) · S · R, which the caller follows with its placement
   * at `p` (matrix_build folds a scale into the rotation, so each is its own matrix).
   */
  pose(h, spr, rp) {
    let m = matrix_multiply(
      matrix_build(-rp.x, -rp.y, 0, 0, 0, 0, 1, 1, 1),
      matrix_build(0, 0, 0, 0, 0, 0, spr.xscale / h.sx, spr.yscale / h.sy, 1),
    );
    if (spr.angle !== 0)
      m = matrix_multiply(m, matrix_build(0, 0, 0, 0, 0, spr.angle, 1, 1, 1));
    return m;
  },

  /**
   * Bind the puppet to `spr.anim` from its first frame, throwing on a sheet that is no skeleton
   * or a set it lacks: the runtime binds a missing name silently.
   */
  _play(inst, spr) {
    const info = Anim.info(spr.sprite);
    if (info.type !== Anim.SPINE || info.animation_names.indexOf(spr.anim) < 0)
      throw new Error(`Anim: ${sprite_get_name(spr.sprite)} has no set "${spr.anim}"`);
    inst.skeleton_animation_set(spr.anim, spr.loop);
    inst.image_speed = Anim.speed(inst, spr);
  },
};
