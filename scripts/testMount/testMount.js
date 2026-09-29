// Mount cases: seating and its refusals, the seat hold as the carrier moves, a hidden seat's
// overrides and their restore, the exit search against solids, and the rider set apart from
// separation. Every case references Core only.

/** A dynamic 16×16 body centred on its Position. */
function _testMountBody(entities, x, y) {
  const id = entities.create();
  entities.add(id, Position, { x, y, z: 0 });
  entities.add(id, BBox, { x: -8, y: -8, width: 16, height: 16 });
  entities.add(id, Collision, { solid: true });
  entities.add(id, Velocity, {});
  return id;
}

Test.register(Test.CHECK, [
  {
    id: "mount.seat",
    setup(ctx) {
      ctx.level = new Level({ id: "test", capacity: 8 });
      const s = ctx.level.entities;
      ctx.entities = s;
      ctx.car = _testMountBody(s, 100, 100);
      s.add(ctx.car, Mount, {
        seats: [
          { x: -6, y: 0, role: "drive", hidden: true },
          { x: 6, y: 0 },
        ],
      });
      ctx.a = _testMountBody(s, 40, 40);
      s.add(ctx.a, Sprite, { sprite: pixMaskUnit });
      ctx.b = _testMountBody(s, 60, 40);
      ctx.c = _testMountBody(s, 80, 40);
      ctx.step = Time.step;
      Time.step = 1 / 60;
    },
    verify(ctx, t) {
      const s = ctx.entities;
      t.ok(Ride.mount(s, ctx.a, ctx.car, 0), "a free seat seats");
      t.ok(!Ride.mount(s, ctx.b, ctx.car, 0), "a taken seat refuses");
      t.ok(!Ride.mount(s, ctx.a, ctx.car, 1), "a rider takes one seat");
      t.ok(!Ride.mount(s, ctx.b, ctx.car, 2), "an absent seat refuses");
      t.ok(!Ride.mount(s, ctx.car, ctx.b, 0), "a mountless target refuses");
      t.eq(Ride.vacant(s, ctx.car), 1, "the first free seat is offered");
      t.ok(Ride.mount(s, ctx.b, ctx.car, 1), "the other seat seats");
      t.eq(Ride.vacant(s, ctx.car), -1, "a full carrier offers none");
      t.ok(!Ride.mount(s, ctx.c, ctx.a, 0), "a rider carries nobody");
      t.eq(Ride.occupant(s, ctx.car, 1), ctx.b, "the occupant is found by its seat");
      t.eq(Ride.riders(s, ctx.car, []).length, 2, "both ride the carrier");

      t.eq(s.get(ctx.a, Collision).solid, false, "a hidden seat takes its rider out of collision");
      t.eq(s.get(ctx.a, Sprite).visible, false, "a hidden seat takes its rider out of sight");
      t.eq(s.get(ctx.b, Collision).solid, true, "an open seat leaves its rider solid");

      // the carrier moves, the riders keep their seats with no velocity of their own
      s.get(ctx.car, Velocity).x = 600;
      s.get(ctx.b, Velocity).x = 600;
      for (let k = 0; k < 10; k++) {
        PuppetSystem.update(ctx.level);
        SolidSystem.update(ctx.level);
        SeparationSystem.update(ctx.level);
        RideSystem.update(ctx.level);
      }
      const cp = s.get(ctx.car, Position);
      t.near(cp.x, 200, 1e-6, "the carrier drives on");
      t.eq(cp.y, 100, "separation never pushes the carrier off its riders");
      t.near(s.get(ctx.a, Position).x, cp.x - 6, 1e-6, "the hidden rider holds its seat");
      t.near(s.get(ctx.b, Position).x, cp.x + 6, 1e-6, "the open rider holds its seat");
      t.eq(s.get(ctx.b, Velocity).x, 0, "a rider has no velocity of its own");

      Ride.release(s, ctx.a);
      t.ok(!s.has(ctx.a, Rider), "a release steps it off");
      t.eq(s.get(ctx.a, Collision).solid, true, "the release restores its collision");
      t.eq(s.get(ctx.a, Sprite).visible, true, "the release restores its sight");
      t.eq(Ride.carrier(s, ctx.a), -1, "it rides nothing");
    },
    teardown(ctx) {
      Time.step = ctx.step;
      ctx.level.destroy();
    },
  },
  {
    id: "mount.exit",
    // a gun post: a kinematic carrier with an open seat north of it, walled on the west
    setup(ctx) {
      ctx.level = new Level({ id: "test", capacity: 8 });
      const s = ctx.level.entities;
      ctx.entities = s;
      ctx.gun = s.create();
      s.add(ctx.gun, Position, { x: 100, y: 100, z: 0 });
      s.add(ctx.gun, BBox, { x: -8, y: -8, width: 16, height: 16 });
      s.add(ctx.gun, Collision, { kinematic: true });
      s.add(ctx.gun, Mount, { seats: [{ x: 0, y: -14, exit: { x: 0, y: -30 } }] });
      ctx.wall = Test.box(s, 60, 60, 20, 80);
      ctx.body = _testMountBody(s, 100, 60);
    },
    verify(ctx, t) {
      const s = ctx.entities;
      const level = ctx.level;
      PuppetSystem.update(level); // the mirrors the exit test asks
      t.ok(Ride.mount(s, ctx.body, ctx.gun, 0), "the seat seats");
      const pos = s.get(ctx.body, Position);
      t.eq(pos.y, 86, "the rider stands at the seat point");

      t.ok(Ride.dismount(level, ctx.body), "a clear exit steps it off");
      t.eq(pos.y, 70, "at the seat's exit");

      // solids over the exit, the east and the south; the exit's also closes the north, the
      // wall the west
      ctx.block = Test.box(s, 92, 62, 16, 16);
      ctx.east = Test.box(s, 108, 80, 20, 40);
      ctx.south = Test.box(s, 80, 108, 40, 20);
      PuppetSystem.update(level);
      t.ok(Ride.mount(s, ctx.body, ctx.gun, 0), "it sits again");
      t.ok(!Ride.dismount(level, ctx.body), "every exit blocked keeps it on");
      t.ok(s.has(ctx.body, Rider), "a refused dismount changes nothing");

      s.remove(ctx.block);
      s.flush();
      PuppetSystem.update(level);
      t.ok(Ride.dismount(level, ctx.body), "a cleared exit steps it off");
      t.eq(pos.y, 70, "back at the seat's exit");

      s.remove(ctx.east);
      s.flush();
      ctx.block = Test.box(s, 92, 62, 16, 16);
      PuppetSystem.update(level);
      Ride.mount(s, ctx.body, ctx.gun, 0);
      t.ok(Ride.dismount(level, ctx.body), "the seat's exit blocked, a side is sought");
      t.eq(pos.x, 100 + 8 + 1 + 8, "beside the carrier's east face");
    },
    teardown(ctx) {
      ctx.level.destroy();
    },
  },
  {
    id: "mount.orphan",
    setup(ctx) {
      ctx.level = new Level({ id: "test", capacity: 8 });
      const s = ctx.level.entities;
      ctx.entities = s;
      ctx.car = _testMountBody(s, 100, 100);
      s.add(ctx.car, Mount, { seats: [{ x: 0, y: 0, hidden: true }] });
      ctx.body = _testMountBody(s, 40, 40);
    },
    verify(ctx, t) {
      const s = ctx.entities;
      Ride.mount(s, ctx.body, ctx.car, 0);
      s.remove(ctx.car);
      s.flush();
      RideSystem.update(ctx.level);
      t.ok(!s.has(ctx.body, Rider), "a rider whose carrier is gone steps off");
      t.eq(s.get(ctx.body, Collision).solid, true, "with its collision restored");
      t.eq(s.get(ctx.body, Position).x, 100, "where it stood");
    },
    teardown(ctx) {
      ctx.level.destroy();
    },
  },
]);
