// Core/Sprite cases: strip playback against the manual's `image_speed`, and the draw transform a
// skeletal body rides. Every case references Core only, over runtime-built sheets.

const SPRITE_FRAMES = 4;
const SPRITE_FPS = 10;

/** A blank `SPRITE_FRAMES`-frame sheet playing at `speed` of `type`. */
function _testSheet(speed, type) {
  const surf = surface_create(4, 4);
  const spr = sprite_create_from_surface(surf, 0, 0, 4, 4, false, false, 0, 0);
  for (let i = 1; i < SPRITE_FRAMES; i++)
    sprite_add_from_surface(spr, surf, 0, 0, 4, 4, false, false);
  surface_free(surf);
  sprite_set_speed(spr, speed, type);
  return spr;
}

Test.register(Test.CHECK, [
  {
    // One sim step of `dt` advances a strip by speed × the sheet's own rate, per second or per
    // game frame; a loop wraps, a one-shot holds its last frame, and a paused clock moves nothing.
    id: "sprite.strip",
    setup(ctx) {
      ctx.fps = _testSheet(SPRITE_FPS, spritespeed_framespersecond);
      ctx.pgf = _testSheet(0.5, spritespeed_framespergameframe);
      ctx.level = new Level({ id: "test", capacity: 16 });
      const s = ctx.level.entities;
      const make = (sheet, data) => {
        const id = s.create();
        s.add(id, Position, { x: 0, y: 0 });
        s.add(id, Sprite, { sprite: sheet, ...data });
        return id;
      };
      ctx.loop = make(ctx.fps, { index: 3 });
      ctx.once = make(ctx.fps, { index: 3, loop: false });
      ctx.early = make(ctx.fps, { loop: false });
      ctx.fast = make(ctx.fps, { speed: 2 });
      ctx.held = make(ctx.fps, { index: 2, speed: 0 });
      ctx.game = make(ctx.pgf, {});
      ctx.delta = Time.delta;
    },
    verify(ctx, t) {
      const s = ctx.level.entities;
      const at = (id) => s.get(id, Sprite).index;
      const dt = 0.25; // 2.5 frames at SPRITE_FPS
      Time.delta = dt;
      SpriteSystem.update(ctx.level);
      t.near(at(ctx.loop), 1.5, 1e-6, "a loop wraps past its last frame");
      t.near(at(ctx.once), SPRITE_FRAMES - Anim.HOLD, 1e-6, "a one-shot holds its last frame");
      t.ok(Anim.finished(s, ctx.once), "a held one-shot has finished");
      t.near(at(ctx.early), 2.5, 1e-6, "a one-shot short of its end plays on");
      t.ok(!Anim.finished(s, ctx.early), "and has not finished");
      t.ok(Anim.finished(s, ctx.loop), "a loop never waits");
      t.near(at(ctx.fast), 1, 1e-6, "speed multiplies the sheet's rate");
      t.eq(at(ctx.held), 2, "speed 0 holds the frame");
      const perGame = (0.5 * game_get_speed(gamespeed_fps) * dt) % SPRITE_FRAMES;
      t.near(at(ctx.game), perGame, 1e-6, "a per-game-frame sheet counts game frames");
      Time.delta = 0;
      SpriteSystem.update(ctx.level);
      t.near(at(ctx.loop), 1.5, 1e-6, "a paused clock moves nothing");
      Anim.rate(s, ctx.held, 1);
      t.eq(s.get(ctx.held, Sprite).speed, 1, "rate sets a strip's speed");
      let threw = false;
      try {
        Anim.play(s, ctx.loop, "walk", true);
      } catch (e) {
        threw = true;
      }
      t.ok(threw, "a strip has no set to play");
    },
    teardown(ctx) {
      Time.delta = ctx.delta;
      ctx.level.destroy();
      sprite_delete(ctx.fps);
      sprite_delete(ctx.pgf);
    },
  },
  {
    // A skeletal body's angle rides the world matrix, so its z-rotation must turn as
    // `image_angle` turns a sprite: counter-clockwise on screen, as `lengthdir` measures.
    id: "sprite.angle",
    setup(ctx) {},
    verify(ctx, t) {
      const v = matrix_transform_vertex(matrix_build(0, 0, 0, 0, 0, 90, 1, 1, 1), 1, 0, 0);
      t.near(v[0], lengthdir_x(1, 90), 1e-6, "x");
      t.near(v[1], lengthdir_y(1, 90), 1e-6, "y");
    },
  },
]);
