/**
 * Sprite playback, once per frame on sim time, so a sprite pauses and dilates with the world. A
 * strip advances `index` as GameMaker advances `image_index`: `speed` times the sheet's own speed,
 * in frames per second or per game frame. A skeletal sheet plays on its puppet: this binds one not
 * yet bound, carries its tint across each frame, retimes every puppet on a change of the
 * sim clock, and parks a one-shot a step before it would wrap (docs/SPINE.md). Done here rather
 * than in an instance event, whose order against the systems is unknown.
 */
globalThis.SpriteSystem = {
  update(level) {
    const entities = level.entities;
    const held = entities.column(Instance); // one index read per sprite, not a get
    const slots = Handle.SLOTS;
    const clock = Time.scale * Time.tempo;
    const retime = clock !== Anim.clock;
    Anim.clock = clock;
    const fps = game_get_speed(gamespeed_fps);
    const dt = Time.delta;
    entities.forEach([Sprite], (id, spr) => {
      const h = held[id % slots];
      if (h !== undefined && h.rigged) {
        SpriteSystem._rig(h.inst, spr, retime, fps);
        return;
      }
      if (spr.anim !== undefined) {
        Anim.mint(entities, id, spr);
        return;
      }
      if (spr.speed === 0) return;
      SpriteSystem._strip(spr, dt, fps);
    });
  },

  _strip(spr, dt, fps) {
    const sheet = spr.sprite;
    if (!sprite_exists(sheet)) return;
    const n = sprite_get_number(sheet);
    if (n < 1) return;
    let rate = sprite_get_speed(sheet);
    if (sprite_get_speed_type(sheet) === spritespeed_framespergameframe) rate *= fps;
    let i = spr.index + spr.speed * rate * dt;
    if (spr.loop) {
      i %= n;
      if (i < 0) i += n;
    } else if (i >= n) i = n - Anim.HOLD;
    else if (i < 0) i = 0;
    spr.index = i;
  },

  _rig(inst, spr, retime, fps) {
    inst.image_blend = spr.blend;
    inst.image_alpha = spr.alpha;
    if (retime) inst.image_speed = Anim.speed(inst, spr);
    if (spr.loop) return;
    if (inst.image_speed === 0) return; // parked, held, or paused
    // image_index advances after Step and before Draw: park the step it would wrap
    const step = (inst.image_speed * sprite_get_speed(spr.sprite)) / fps;
    if (inst.image_index + step >= inst.image_number) {
      inst.image_speed = 0;
      inst.image_index = inst.image_number - Anim.HOLD;
    }
  },
};
