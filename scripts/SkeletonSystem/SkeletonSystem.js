/**
 * The per-frame scan of the puppets for what only a frame can see: a Skeleton not yet bound to
 * its puppet (a spawn, a load, a map transfer — or a puppet PuppetSystem minted for the
 * collider first) is minted its binding, a change of the sim clock (Time.scale,
 * Time.tempo) that every puppet's `image_speed` carries retimes them all so animation pauses
 * and dilates with the world, and a one-shot about to wrap is parked on its last pose a step
 * ahead — the runtime replays it from its first key whatever the set's loop flag (on either
 * runtime), here rather than in a Puppet event, whose order against the systems is unknown.
 * The verbs over a Skeleton (set/rate/apply/finished/info) and the puppet binding are Rig's.
 */
globalThis.SkeletonSystem = {
  update(level) {
    const entities = level.entities;
    const clock = Time.scale * Time.tempo;
    const retime = clock !== Rig.clock;
    Rig.clock = clock;
    const fps = game_get_speed(gamespeed_fps);
    entities.forEach([Skeleton], (id, sk) => {
      const held = entities.get(id, Instance);
      if (held === undefined || !held.rigged) {
        Rig.mint(entities, id, sk);
        return;
      }
      const inst = held.inst;
      if (retime) inst.image_speed = Rig.speed(inst, sk);
      if (sk.loop) return;
      if (inst.image_speed === 0) return; // parked, held, or paused
      // `image_index` advances after Step and before Draw: park a one-shot the step it would wrap
      const step = (inst.image_speed * sprite_get_speed(sk.sprite)) / fps;
      if (inst.image_index + step >= inst.image_number) {
        inst.image_speed = 0;
        inst.image_index = inst.image_number - Rig.HOLD;
      }
    });
  },
};
