// Core/Render, Camera, Scene and UI cases: the camera entity, the draw passes, the live text
// refs, the slot drag and the menu navigation. Every case references Core only.

Test.register(Test.CHECK, [
  {
    // The view's basis derives from the component, and project/unproject invert each other on
    // any world-z plane; a raised plane reads h·tan(pitch) nearer the eye — the correction that
    // puts a cursor covering a standing body back onto its footprint.
    id: "camera.unproject",
    setup(ctx) {
      const p = (42 * Math.PI) / 180;
      ctx.pitch = p;
      ctx.level = new Level({ id: "test", capacity: 4 });
      Cameras.create(ctx.level.entities, {
        x: 100,
        y: 200,
        pitch: p,
        dist: 2000,
      });
      CameraSystem.apply(ctx.level); // unassigned, so it derives the view and applies nothing
      ctx.camera = CameraSystem.view(ctx.level);
      ctx.flatLevel = new Level({ id: "flat", capacity: 4 });
      Cameras.create(ctx.flatLevel.entities); // top-down
      CameraSystem.apply(ctx.flatLevel);
      ctx.flat = CameraSystem.view(ctx.flatLevel);
    },
    verify(ctx, t) {
      const cam = ctx.camera;
      const p = ctx.pitch;
      t.near(cam.upY, Math.cos(p), 1e-9, "up swings out of the ground plane by the tilt");
      t.near(cam.upZ, Math.sin(p), 1e-9, "up lifts by the tilt");
      t.near(cam.fromY, 200 + Math.sin(p) * 2000, 1e-6, "the eye sits dist south of the look-at");
      t.near(cam.fromZ, -Math.cos(p) * 2000, 1e-6, "the eye sits dist above the ground");
      t.eq(ctx.flat.upY, 1, "a top-down view's up is map north");
      t.eq(ctx.flat.upZ, 0, "and lies in the ground plane");
      const h = 30; // world px up off the ground (up is −z)
      const foot = cam.project(140, 260);
      const g = cam.unproject(foot.x, foot.y);
      t.near(g.x, 140, 0.01, "ground round-trip x");
      t.near(g.y, 260, 0.01, "ground round-trip y");
      const head = cam.project(140, 260, -h);
      t.ok(head.y < foot.y, "a raised point draws further up the screen");
      const r = cam.unproject(head.x, head.y, -h);
      t.near(r.x, 140, 0.01, "raised round-trip x");
      t.near(r.y, 260, 0.01, "raised round-trip y");
      const aim = cam.unproject(foot.x, foot.y, -h);
      t.near(
        aim.y - g.y,
        h * Math.tan(p),
        0.01,
        "the raised plane reads h·tan(pitch) nearer the eye",
      );
      t.eq(aim.x, g.x, "the plane never moves x");
      t.eq(
        ctx.flat.unproject(foot.x, foot.y, -h).y,
        ctx.flat.unproject(foot.x, foot.y).y,
        "a top-down view has no plane to choose",
      );
    },
    teardown(ctx) {
      ctx.level.destroy();
      ctx.flatLevel.destroy();
    },
  },
  {
    // The follow policy: the look-at eases onto the focus carrier, resolved live, and clamps so
    // the ground rect never leaves `bounds`; the pitch follows the zoom curve. Input reads idle
    // here, so the zoom holds its target.
    id: "camera.follow",
    setup(ctx) {
      ctx.level = new Level({ id: "test", capacity: 4 });
      const s = ctx.level.entities;
      ctx.body = s.create();
      s.add(ctx.body, Position, { x: 500, y: 500, z: 0 });
      s.add(ctx.body, CameraFocus, {});
      ctx.cam = Cameras.create(s, { x: 0, y: 0, pitch: 0, zoom: 2 });
      s.add(
        ctx.cam,
        CameraFollow,
        {
          lerp: 1,
          zoomTarget: 2,
          zoomHome: 2,
          pitchLo: 42,
          pitchHi: 58,
          zoomLo: 1,
          zoomHi: 3,
          bounds: { x1: 0, y1: 0, x2: 4000, y2: 4000 },
        },
        { mint: true },
      );
    },
    verify(ctx, t) {
      const s = ctx.level.entities;
      CameraSystem.update(ctx.level);
      const pos = s.get(ctx.cam, Position);
      const cam = s.get(ctx.cam, Camera);
      t.eq(pos.x, 500, "the look-at lands on the focus (lerp 1)");
      t.eq(pos.y, 500, "the look-at lands on the focus (lerp 1)");
      t.near(cam.pitch, (50 * Math.PI) / 180, 1e-9, "the pitch reads the zoom curve at zoom 2");
      t.eq(cam.projection, CAMERA_PROJECTION.ORTHO, "the follow policy pins ortho");
      const bp = s.get(ctx.body, Position);
      bp.x = -1000;
      bp.y = -1000;
      CameraSystem.update(ctx.level);
      CameraSystem.apply(ctx.level);
      const v = CameraSystem.view(ctx.level);
      const r = v.groundRect();
      t.near(r.x1, 0, 1, "the west edge of the ground rect stops at the world's");
      t.near(r.y1, 0, 1, "the north edge of the ground rect stops at the world's");
      t.ok(
        pos.y > v.height / 2,
        "the tilt stretches the N-S reach, so the clamp holds the look-at further in",
      );
      s.remove(ctx.body);
      s.flush();
      const again = s.create();
      s.add(again, Position, { x: 2000, y: 2000, z: 0 });
      s.add(again, CameraFocus, {});
      CameraSystem.update(ctx.level);
      t.eq(pos.x, 2000, "the re-minted focus is tracked with no stored id");
      t.eq(pos.y, 2000, "the re-minted focus is tracked with no stored id");
    },
    teardown(ctx) {
      ctx.level.destroy();
    },
  },
  {
    // The fly policy shares the pose: taking over with no input leaves the look-at where it was,
    // and it overrides the follow policy while attached.
    id: "camera.fly",
    setup(ctx) {
      ctx.level = new Level({ id: "test", capacity: 4 });
      const s = ctx.level.entities;
      const body = s.create();
      s.add(body, Position, { x: 900, y: 900, z: 0 });
      s.add(body, CameraFocus, {});
      ctx.cam = Cameras.create(s, {
        x: 300,
        y: 400,
        pitch: (50 * Math.PI) / 180,
        dist: 2000,
      });
      s.add(ctx.cam, CameraFollow, { lerp: 1, pitch: 50 }, { mint: true });
      s.add(ctx.cam, CameraFly, {}, { mint: true });
    },
    verify(ctx, t) {
      const s = ctx.level.entities;
      const pos = s.get(ctx.cam, Position);
      const cam = s.get(ctx.cam, Camera);
      CameraSystem.update(ctx.level);
      t.eq(pos.x, 300, "the fly override skips the follow policy");
      CameraSystem.apply(ctx.level);
      t.near(pos.x, 300, 1e-6, "an idle fly tick leaves the look-at x");
      t.near(pos.y, 400, 1e-6, "an idle fly tick leaves the look-at y");
      t.near(pos.z, 0, 1e-6, "an idle fly tick leaves the look-at z");
      t.eq(
        cam.projection,
        CAMERA_PROJECTION.PERSPECTIVE_FOV,
        "the fly policy pins the perspective projection",
      );
      s.detach(ctx.cam, CameraFly);
      CameraSystem.update(ctx.level);
      t.eq(pos.x, 900, "handing back, the follow policy resumes on the focus");
      t.eq(cam.projection, CAMERA_PROJECTION.ORTHO, "and pins ortho again");
    },
    teardown(ctx) {
      ctx.level.destroy();
    },
  },
  {
    // A drawn body's box stands up, so the cursor reaching a given height on it moves with the
    // pitch, while a flat collider's box is its footprint under any view; a pick takes the
    // frontmost. The placeholder sprite keeps Game art out: the case tests the space, not the art.
    id: "render.silhouette",
    setup(ctx) {
      const s = new Table(8);
      ctx.entities = s;
      ctx.body = s.create();
      s.add(ctx.body, Position, { x: 100, y: 100, z: 0 });
      s.add(ctx.body, Sprite, { sprite: pixMissing, xscale: 2, yscale: 2 });
      // overlapping footprints, so one cursor sits on both
      ctx.near = s.create();
      s.add(ctx.near, Position, { x: 300, y: 310 });
      s.add(ctx.near, BBox, { x: -8, y: -8, width: 16, height: 16 });
      ctx.far = s.create();
      s.add(ctx.far, Position, { x: 300, y: 300 });
      s.add(ctx.far, BBox, { x: -8, y: -8, width: 16, height: 16 });
      ctx.bare = s.create(); // no shape to see
      s.add(ctx.bare, Position, { x: 500, y: 500 });
    },
    verify(ctx, t) {
      const s = ctx.entities;
      const pos = s.get(ctx.body, Position);
      const box = Silhouette.of(s, ctx.body);
      t.ok(box !== undefined, "a drawn body has a standing box");
      t.ok(box.top > box.bottom && box.right > box.left, "the box is a rect");
      // hit()'s mapping run backwards, which pins the two to one space.
      const at = (dx, a, pitch) => ({
        x: pos.x + dx,
        y: pos.y - a / Math.cos(pitch),
      });
      const p = Math.PI / 4;
      const midA = (box.top + box.bottom) / 2;
      const midX = (box.left + box.right) / 2;
      const hit = (c, pitch) =>
        Silhouette.hit(s, ctx.body, pos, c, pitch ?? p);
      t.ok(hit(at(midX, midA, p)), "the box centre hits");
      t.ok(!hit(at(midX, box.top + 1, p)), "a px over the top misses");
      t.ok(!hit(at(midX, box.bottom - 1, p)), "a px under the bottom misses");
      t.ok(!hit(at(box.left - 1, midA, p)), "a px left of the box misses");
      t.ok(!hit(at(box.right + 1, midA, p)), "a px right of the box misses");
      t.ok(hit(at(midX, midA, 0), 0), "the mapping inverts at pitch 0 too");
      // a foreshortened standing box reaches further across the ground.
      const past = { x: pos.x + midX, y: pos.y - box.bottom + 1 };
      t.ok(!hit(past, 0), "a px past the flat reach misses at pitch 0");
      t.ok(hit(past, p), "the same cursor is inside the box under the pitch");
      const onBox = { x: 300, y: 305 };
      const fpos = s.get(ctx.far, Position);
      t.ok(
        Silhouette.hit(s, ctx.far, fpos, onBox, 0) &&
          Silhouette.hit(s, ctx.far, fpos, onBox, p),
        "a footprint answers the same under any pitch",
      );
      t.ok(
        !Silhouette.hit(s, ctx.far, fpos, { x: 300, y: 291 }, p),
        "a cursor off the footprint misses",
      );
      t.eq(
        Silhouette.hit(s, ctx.bare, s.get(ctx.bare, Position), onBox, p),
        false,
        "an entity with no shape is never hit",
      );
      // the frontmost is the larger world y.
      t.eq(
        Silhouette.pick(s, onBox, p),
        ctx.near,
        "the pick is the frontmost hit",
      );
      t.eq(
        Silhouette.pick(s, onBox, p, { ignore: ctx.near }),
        ctx.far,
        "ignore drops it to the one behind",
      );
      t.eq(
        Silhouette.pick(s, onBox, p, { has: Sprite }),
        -1,
        "has joins the query — no drawn body under this cursor",
      );
      t.eq(
        Silhouette.pick(s, { x: 0, y: 0 }, p),
        -1,
        "a cursor on nothing picks nothing",
      );
    },
    teardown(ctx) {
      ctx.entities.destroy();
    },
  },
  {
    // A batch pins its texture page on the first frame read and refuses a frame off another
    // page. Two runtime sprites, each on a page of its own, stand in for a group that overflowed.
    id: "render.batch",
    setup(ctx) {
      const surf = surface_create(8, 8);
      surface_set_target(surf);
      draw_clear_alpha(c_white, 1);
      surface_reset_target();
      ctx.a = sprite_create_from_surface(surf, 0, 0, 8, 8, false, false, 0, 0);
      ctx.b = sprite_create_from_surface(surf, 0, 0, 8, 8, false, false, 0, 0);
      surface_free(surf);
      ctx.batch = new VertexBatch();
      ctx.other = new VertexBatch();
    },
    verify(ctx, t) {
      const b = ctx.batch.begin();
      t.eq(b.page, -1, "a fresh batch is unpinned");
      const uv = b.uvs(ctx.a, 0);
      t.eq(array_length(uv), 8, "uvs is sprite_get_uvs' 8-array");
      t.ok(b.page >= 0, "the first read pins the page");
      const page = b.page;
      b.addFrame(ctx.a, 0, 0, 0, 8, 8);
      t.eq(b.page, page, "a same-page frame keeps the pin");
      t.eq(b.count, 1, "addFrame counts one quad");
      const other = ctx.other.begin();
      other.uvs(ctx.b, 0);
      t.ok(other.page !== page, "two runtime sprites sit on pages of their own");
      let threw = false;
      try {
        b.uvs(ctx.b, 0);
      } catch (e) {
        threw = true;
      }
      t.ok(threw, "a frame off another page throws");
      t.eq(b.page, page, "the refused read leaves the pin");
      t.eq(b.count, 1, "the refused read adds no quad");
      b.end();
      other.end();
    },
    teardown(ctx) {
      ctx.batch.destroy();
      ctx.other.destroy();
      sprite_delete(ctx.a);
      sprite_delete(ctx.b);
    },
  },
  {
    // A tile pass rebakes on the draw after its layer's `edits` moves, and only then: an edit
    // needs no call into the pass. The level is one chunk, so a bake is the whole layer.
    id: "render.rebake",
    frames: 4,
    setup(ctx) {
      Object.assign(ctx, Test.level(4, 4));
      const surf = surface_create(8, 8);
      ctx.spr = sprite_create_from_surface(surf, 0, 0, 8, 8, false, false, 0, 0);
      surface_free(surf);
      ctx.type = new TileType({ id: 1, pathCost: 1 });
      ctx.pass = new RenderTileMap(ctx.layer, ctx.grid, ctx.spr);
      const bake = ctx.pass._bake.bind(ctx.pass);
      ctx.bakes = 0;
      ctx.pass._bake = (k) => {
        ctx.bakes++;
        bake(k);
      };
      ctx.seen = [];
    },
    frame(ctx, i) {
      if (i === 1) ctx.layer.set(1, 1, ctx.type);
    },
    draw(ctx) {
      ctx.pass.draw(ctx.entities);
      ctx.seen.push(ctx.bakes);
    },
    verify(ctx, t) {
      t.eq(ctx.seen.join(","), "1,2,2", "bakes after each draw: the first, the edit, none");
    },
    teardown(ctx) {
      ctx.pass.destroy();
      ctx.level.destroy();
      sprite_delete(ctx.spr);
    },
  },
  {
    // a write marks the chunks its cell and neighbours reach, and a view reaches only its own
    id: "render.chunks",
    setup(ctx) {
      Object.assign(ctx, Test.level(40, 40));
      Test.types(ctx);
      ctx.chunks = new Chunks(ctx.grid, ctx.layer);
    },
    verify(ctx, t) {
      const c = ctx.chunks;
      const layer = ctx.layer;
      const stale = () => {
        let n = 0;
        for (let k = 0; k < c.count; k++) n += c.dirty[k];
        return n;
      };
      t.eq(c.count, 9, "41 slots a side make 3x3 chunks of 16");
      c.sync();
      t.eq(stale(), 9, "the first sync marks every chunk");
      c.dirty.fill(0);
      c.sync();
      t.eq(stale(), 0, "an unmoved layer marks nothing");
      layer.set(5, 5, ctx.rock);
      c.sync();
      t.ok(stale() === 1 && c.dirty[0] === 1, "an interior write marks its own chunk");
      c.dirty.fill(0);
      layer.set(16, 16, ctx.rock);
      c.sync();
      t.ok(stale() === 4 && c.dirty[0] === 1 && c.dirty[4] === 1, "a write on a chunk edge marks every chunk its neighbours reach");
      c.dirty.fill(0);
      layer.set(39, 39, ctx.rock);
      c.sync();
      t.ok(stale() === 1 && c.dirty[8] === 1, "the far corner line has its chunk");
      const b = c.bounds(8, {});
      t.ok(b.x0 === 32 && b.x1 === 41 && b.y1 === 41, "the last chunk ends at the far corner line");
      c.dirty.fill(0);
      for (let i = 0; i < 300; i++) layer.set(i % 40, 20, ctx.rock);
      c.dirty.fill(0);
      c.sync();
      t.eq(stale(), 9, "a sync behind the log's reach marks every chunk");

      const view = { width: 64, groundRect: () => ({ x1: 0, y1: 0, x2: 64, y2: 64 }) };
      const w = c.window(view, {});
      t.ok(w.x0 === 0 && w.y0 === 0 && w.x1 === 1 && w.y1 === 1, "a view reaches only its chunks");
      const all = c.window(undefined, {});
      t.ok(all.x1 === 3 && all.y1 === 3, "no camera reaches every chunk");
    },
    teardown(ctx) {
      ctx.level.destroy();
    },
  },
  {
    // each param resolves on its own, so values and getters mix in any order
    id: "i18n.textRef",
    setup(ctx) {
      ctx.n = 1;
    },
    verify(ctx, t) {
      const key = "TEST_ABSENT {0} {1} {2}"; // an absent key renders as itself
      const mixed = I18n.textRef(key, "a", () => "n" + ctx.n, "c");
      const lead = I18n.textRef(key, () => "n" + ctx.n, "b", "c");
      t.eq(mixed(), "TEST_ABSENT a n1 c", "a value leading a getter");
      t.eq(lead(), "TEST_ABSENT n1 b c", "a getter leading values");
      ctx.n = 2;
      t.eq(mixed(), "TEST_ABSENT a n2 c", "a getter re-resolves");
      t.eq(
        I18n.textRef(key, "a", "b", "c")(),
        "TEST_ABSENT a b c",
        "values alone",
      );
    },
  },
  {
    // a drop hook owns the outcome, so the carried item goes home; without one the cells swap
    id: "ui.slotDrop",
    setup(ctx) {
      ctx.drops = [];
      ctx.a = new UISlots({ items: [{ id: "x" }, null] });
      ctx.b = new UISlots({ items: [{ id: "y" }, null] });
      ctx.hooked = new UISlots({
        items: [{ id: "z" }, null],
        onDrop: (src, from, to) => ctx.drops.push([src, from, to]),
      });
    },
    verify(ctx, t) {
      SlotDrag.begin(ctx.a, 0);
      SlotDrag.drop(ctx.hooked, 1);
      t.eq(ctx.drops.length, 1, "the hook fires once");
      const d = ctx.drops[0];
      t.ok(d[0] === ctx.a && d[1] === 0 && d[2] === 1, "the hook names source, from and to");
      t.eq(ctx.a.items[0].id, "x", "the carried item goes home");
      t.eq(ctx.hooked.items[1], null, "the hooked grid is left to its owner");
      t.ok(!SlotDrag.active, "the drag ends");

      SlotDrag.begin(ctx.a, 0);
      SlotDrag.drop(ctx.b, 0);
      t.ok(ctx.a.items[0].id === "y" && ctx.b.items[0].id === "x", "a hookless grid swaps");

      const passive = new UISlots({ items: [null], passive: true });
      t.eq(passive.onUpdate(undefined, false), false, "a passive grid never takes the pointer");
    },
    teardown(ctx) {
      SlotDrag.cancel();
    },
  },
  {
    // the nearest focusable along the axis wins, a full-width row hands Down to the first in
    // visual order, a disabled item is never collected, and past an edge nothing is picked
    id: "ui.navPick",
    setup(ctx) {
      Test.ui(ctx);
      const item = (w) =>
        new UIElement({ width: w, height: 40 }).addComponent(new UIButton());
      ctx.head = item(600);
      ctx.a = item(100);
      ctx.b = item(100);
      ctx.c = item(100);
      ctx.off = item(100);
      ctx.off.enabled = false;
      const row = new UIElement({ flexDirection: "row", gap: 20 });
      row.insertChild(ctx.a).insertChild(ctx.b).insertChild(ctx.c).insertChild(ctx.off);
      ctx.root = new UIElement({ width: 600, flexDirection: "column", gap: 20 });
      ctx.root.insertChild(ctx.head).insertChild(row);
      UI.insert(ctx.root);
    },
    verify(ctx, t) {
      const items = UINav._collect();
      t.eq(items.length, 4, "every enabled focusable is collected");
      t.eq(UINav._indexOf(items, ctx.off), -1, "a disabled item is never collected");
      const pick = (from, dx, dy) => {
        const j = UINav._pick(items, UINav._indexOf(items, from), dx, dy);
        return j === -1 ? null : items[j].el;
      };
      t.ok(pick(ctx.head, 0, 1) === ctx.a, "Down from a full-width row lands on its first");
      t.ok(pick(ctx.a, 1, 0) === ctx.b, "the nearest along the axis wins");
      t.ok(pick(ctx.c, 0, -1) === ctx.head, "Up reaches the row above");
      t.ok(pick(ctx.a, -1, 0) === null, "nothing past the left edge");
      t.ok(pick(ctx.head, 0, -1) === null, "nothing past the top edge");
    },
    teardown(ctx) {
      Test.uiRestore(ctx);
    },
  },
  {
    // an exclusive root hides every root beneath it from the nav until it is removed
    id: "ui.navModal",
    setup(ctx) {
      Test.ui(ctx);
      ctx.base = new UIElement({ width: 200, height: 40 }).addComponent(new UIButton());
      UI.insert(ctx.base);
      ctx.card = new UIElement({ width: 200, height: 40 }).addComponent(new UIButton());
      ctx.overlay = new UIElement({ width: "100%", height: "100%" });
      ctx.overlay.insertChild(ctx.card);
      ctx.modal = new UIModal({ root: ctx.overlay });
      ctx.overlay.addComponent(ctx.modal);
      UI.insert(ctx.overlay);
    },
    verify(ctx, t) {
      let items = UINav._collect();
      t.ok(items.length === 1 ? items[0].el === ctx.card : false, "only the modal is reachable");
      ctx.modal.remove();
      items = UINav._collect();
      t.ok(items.length === 1 ? items[0].el === ctx.base : false, "a removal hands the nav back");
    },
    teardown(ctx) {
      Test.uiRestore(ctx);
    },
  },
  {
    // Esc goes to its innermost owner, which spends it: a focused field blurs, then the modal
    // closes, and only then does the nav let go of its ring
    id: "ui.navCancel",
    setup(ctx) {
      Test.ui(ctx);
      Time.raw = 1; // longer than any fade, so a modal enters or exits within one frame
      ctx.base = new UIElement({ width: 200, height: 40 }).addComponent(new UIButton());
      UI.insert(ctx.base);
      ctx.cancelled = 0;
      ctx.field = new UIInput({
        onCancel: () => {
          ctx.cancelled += 1;
        },
      });
      const fieldEl = new UIElement({ width: 200, height: 40 }).addComponent(ctx.field);
      ctx.overlay = new UIElement({ width: "100%", height: "100%" });
      ctx.overlay.insertChild(fieldEl);
      ctx.closed = 0;
      ctx.modal = new UIModal({
        root: ctx.overlay,
        onClose: () => {
          ctx.closed += 1;
        },
      });
      ctx.overlay.addComponent(ctx.modal);
      UI.insert(ctx.overlay);
      ctx.field.focus(fieldEl);
      UINav.engaged = true;
    },
    verify(ctx, t) {
      Test.uiFrame(ctx, [vk_escape]);
      t.eq(ctx.cancelled, 1, "the first Esc ends the field's editing");
      t.ok(UINav.engaged, "the field's Esc never reaches the nav");
      Test.uiFrame(ctx, []);
      t.eq(ctx.closed, 0, "the field's Esc never reaches the modal");

      Test.uiFrame(ctx, [vk_escape]);
      t.ok(UINav.engaged, "the modal's Esc never reaches the nav");
      Test.uiFrame(ctx, []);
      t.eq(ctx.closed, 1, "the next Esc closes the modal");
      t.ok(UI.roots.indexOf(ctx.overlay) === -1, "a closed modal leaves the roots");

      Test.uiFrame(ctx, [vk_escape]);
      t.ok(!UINav.engaged, "the last Esc lets go of the ring");
    },
    teardown(ctx) {
      Test.uiRestore(ctx);
    },
  },
  {
    // an event climbs from the focused element through its ancestors until one takes it, and only
    // an untaken one moves the focus or lets go of the ring; a bare navAxis still answers
    id: "ui.navBubble",
    setup(ctx) {
      Test.ui(ctx);
      ctx.log = [];
      ctx.takes = {};
      const hook = (name, focusable) => ({
        focusable,
        onNav: (el, ev) => {
          ctx.log.push(name + ":" + ev.kind);
          return ctx.takes[name] === true;
        },
      });
      const item = (name) =>
        new UIElement({ width: 200, height: 40 }).addComponent(hook(name, true));
      ctx.a = item("a");
      ctx.b = item("b");
      ctx.select = new UISelect({ items: [{ name: "x" }, { name: "y" }, { name: "z" }] });
      ctx.sel = new UIElement({ width: 200, height: 40 }).addComponent(ctx.select);
      ctx.list = new UIElement({ width: 200, flexDirection: "column", gap: 20 });
      ctx.list.addComponent(hook("list", false));
      ctx.list.insertChild(ctx.a).insertChild(ctx.b).insertChild(ctx.sel);
      UI.insert(ctx.list);
      UINav.focused = ctx.a;
      UINav.engaged = true;
    },
    verify(ctx, t) {
      const step = (keys) => {
        ctx.log = [];
        Test.uiFrame(ctx, keys);
        return ctx.log.join(" ");
      };
      t.eq(UINav._indexOf(UINav._collect(), ctx.list), -1, "a hook alone is no focus stop");

      t.eq(step([vk_down]), "a:move list:move", "an untaken move climbs every ancestor");
      t.ok(UINav.focused === ctx.b, "then the nav moves the focus");

      ctx.takes.b = true;
      t.eq(step([vk_up]), "b:move", "a taken event stops where it is taken");
      t.ok(UINav.focused === ctx.b, "and the focus stays");
      ctx.takes.b = false;

      ctx.takes.list = true;
      t.eq(step([vk_escape]), "b:cancel list:cancel", "a cancel climbs too");
      t.ok(UINav.engaged, "a taken cancel keeps the ring");
      ctx.takes.list = false;
      step([vk_escape]);
      t.ok(!UINav.engaged, "an untaken cancel lets go of the ring");

      UINav.focused = ctx.sel;
      UINav.engaged = true;
      t.eq(step([vk_right]), "", "a navAxis answers on the focused element alone");
      t.eq(ctx.select.getIndex(), 1, "and adjusts rather than moves");
      step([vk_enter]);
      t.eq(ctx.select.getIndex(), 2, "a navActivate answers a confirm");
      t.ok(UINav.focused === ctx.sel, "neither moves the focus");
    },
    teardown(ctx) {
      Test.uiRestore(ctx);
    },
  },
  {
    // a confirm puts a grid or a table in browse mode, which takes every nav event until a cancel
    // or the pointer hands control back; the nav clicks on each confirm and stays silent on moves
    id: "ui.navBrowse",
    setup(ctx) {
      Test.ui(ctx);
      ctx.picked = [];
      ctx.used = [];
      ctx.slots = new UISlots({
        items: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }, null, { id: "f" }],
        cols: 3,
        onSelect: (i) => ctx.picked.push(i),
        onActivate: (i) => ctx.used.push(i),
      });
      ctx.grid = new UIElement({ width: 208, height: 136 }).addComponent(ctx.slots);
      ctx.rows = [{ n: 1 }, { n: 2 }, { n: 3 }];
      ctx.table = new UITable({
        columns: [{ label: "N", text: (r) => string(r.n), sortValue: (r) => r.n }],
        rows: ctx.rows,
        onSelect: (r) => ctx.picked.push("r" + r.n),
        onActivate: (r) => ctx.used.push("r" + r.n),
      });
      ctx.tableEl = new UIElement({ width: 300, height: 114 }).addComponent(ctx.table);
      const root = new UIElement({ flexDirection: "column", gap: 20 });
      root.insertChild(ctx.grid).insertChild(ctx.tableEl);
      UI.insert(root);
      UINav.focused = ctx.grid;
      UINav.engaged = true;
    },
    verify(ctx, t) {
      Test.uiFrame(ctx, [vk_enter]);
      t.eq(ctx.sounds, 1, "entering browse clicks");
      Test.uiFrame(ctx, [vk_right]);
      Test.uiFrame(ctx, [vk_down]);
      t.eq(ctx.picked.join(","), "1,4", "moves step the slot cursor, a row by the columns");
      t.ok(UINav.focused === ctx.grid, "browse keeps the focus");
      t.eq(ctx.sounds, 1, "a browse move is silent");
      Test.uiFrame(ctx, [vk_enter]);
      t.eq(ctx.used.join(","), "4", "a confirm activates the cursor slot");
      t.eq(ctx.sounds, 2, "and clicks");
      Test.uiFrame(ctx, [vk_escape]);
      t.ok(UINav.engaged, "the Esc that leaves browse keeps the ring");
      Test.uiFrame(ctx, [vk_down]);
      t.ok(UINav.focused === ctx.tableEl, "out of browse a move leaves the grid");

      ctx.picked = [];
      ctx.used = [];
      Test.uiFrame(ctx, [vk_enter]);
      Test.uiFrame(ctx, [vk_down]);
      t.eq(ctx.picked.join(","), "r2", "a table's move steps the row cursor");
      Test.uiFrame(ctx, [vk_enter]);
      t.eq(ctx.used.join(","), "r2", "a table's confirm activates the cursor row");

      Input.pointer.x += 1;
      Test.uiFrame(ctx, []);
      Test.uiFrame(ctx, [vk_up]);
      t.ok(UINav.focused === ctx.grid, "a pointer move hands the table back to the nav");
    },
    teardown(ctx) {
      Test.uiRestore(ctx);
    },
  },
  {
    // editing holds the nav focus: a confirm or a click starts it, the field then takes every nav
    // event — a pad confirm commits as Enter does — and a field that loses the focus stops
    id: "ui.navField",
    setup(ctx) {
      Test.ui(ctx);
      ctx.confirmed = 0;
      ctx.field = new UIInput({
        onConfirm: () => {
          ctx.confirmed += 1;
        },
      });
      ctx.fieldEl = new UIElement({ width: 200, height: 40 }).addComponent(ctx.field);
      ctx.after = new UIElement({ width: 200, height: 40 }).addComponent(new UIButton());
      const root = new UIElement({ flexDirection: "column", gap: 20 });
      root.insertChild(ctx.fieldEl).insertChild(ctx.after);
      UI.insert(root);
      UINav.focused = ctx.fieldEl;
      UINav.engaged = true;
    },
    verify(ctx, t) {
      Test.uiFrame(ctx, [vk_enter]);
      Test.uiFrame(ctx, [], [], "ab");
      t.eq(ctx.field.value, "ab", "a nav confirm starts editing");
      Test.uiFrame(ctx, [], [gp_padd]);
      t.ok(UINav.focused === ctx.fieldEl, "a pad move never leaves an editing field");
      Test.uiFrame(ctx, [], [gp_face1]);
      Test.uiFrame(ctx, [], [], "c");
      t.eq(ctx.confirmed, 1, "a pad confirm commits the field");
      t.eq(ctx.field.value, "ab", "and ends its editing");
      Test.uiFrame(ctx, [vk_down]);
      t.ok(UINav.focused === ctx.after, "out of editing a move leaves the field");

      const pos = ctx.fieldEl.getLayoutPosition();
      Input.pointer.x = pos.left + 4;
      Input.pointer.y = pos.top + 4;
      Input.pointer.left.pressed = true;
      Test.uiFrame(ctx, []);
      Input.pointer.left.pressed = false;
      Input.pointer.x = -100000;
      Input.pointer.y = -100000;
      t.ok(UINav.focused === ctx.fieldEl, "a click hands the field the focus");
      Test.uiFrame(ctx, [], [], "d");
      t.eq(ctx.field.value, "dab", "and starts editing at the caret");

      UINav.focused = ctx.after;
      Test.uiFrame(ctx, [], [], "e");
      t.eq(ctx.field.value, "dab", "a field that loses the focus stops editing");
    },
    teardown(ctx) {
      Test.uiRestore(ctx);
    },
  },
  {
    // a cancel finds its modal with no focus to start from; one the UI leaves falls to `back`,
    // which alone hears it while the nav is suspended, and only a taken cancel is spent
    id: "ui.navBack",
    setup(ctx) {
      Test.ui(ctx);
      Time.raw = 1; // longer than any fade, so a modal enters or exits within one frame
      ctx.closed = 0;
      ctx.openModal = () => {
        const overlay = new UIElement({ width: "100%", height: "100%" });
        ctx.card = new UIElement({ width: 200, height: 40 }).addComponent(new UIButton());
        overlay.insertChild(ctx.card);
        overlay.addComponent(
          new UIModal({
            root: overlay,
            onClose: () => {
              ctx.closed += 1;
            },
          }),
        );
        UI.insert(overlay);
      };
      UI.insert(new UIElement({ width: 200, height: 40 }).addComponent(new UIButton()));
    },
    verify(ctx, t) {
      ctx.openModal();
      Test.uiFrame(ctx, [vk_escape]);
      t.ok(!Input.keyPressed(vk_escape), "a cancel the UI takes is spent");
      Test.uiFrame(ctx, []);
      t.eq(ctx.closed, 1, "with no focus an Esc still closes the modal");
      t.eq(ctx.backs, 0, "and never reaches back");

      Test.uiFrame(ctx, [vk_escape]);
      t.eq(ctx.backs, 1, "a cancel the UI leaves falls to back");
      t.ok(Input.keyPressed(vk_escape), "and stays for later readers while back declines it");
      ctx.backTakes = true;
      Test.uiFrame(ctx, [vk_escape]);
      t.ok(!Input.keyPressed(vk_escape), "a cancel back takes is spent");
      ctx.backTakes = false;

      ctx.openModal();
      UINav.focused = ctx.card;
      UINav.engaged = true;
      Test.uiFrame(ctx, [], [gp_face2]);
      Test.uiFrame(ctx, []);
      t.eq(ctx.closed, 2, "a pad cancel closes the modal too");

      UINav.suspended = true;
      ctx.backs = 0;
      Test.uiFrame(ctx, [vk_escape]);
      t.eq(ctx.backs, 1, "a suspended nav still hands the cancel to back");
      ctx.backTakes = true;
      Test.uiFrame(ctx, [], [gp_face2]);
      t.ok(!Input.padPressed(gp_face2), "and spends what back takes");
    },
    teardown(ctx) {
      Test.uiRestore(ctx);
    },
  },
  {
    // an armed rebind row takes the Esc that disarms it before its modal can, and an open
    // dialogue shuts the nav out
    id: "ui.navCapture",
    setup(ctx) {
      Test.ui(ctx);
      Time.raw = 1; // longer than any fade, so a modal enters or exits within one frame
      ctx.closed = 0;
      ctx.row = new UIElement({ width: 200, height: 40 }).addComponent(
        new UIRebind({ actionKey: "test_absent" }),
      );
      ctx.overlay = new UIElement({ width: "100%", height: "100%" });
      ctx.overlay.insertChild(ctx.row);
      ctx.overlay.addComponent(
        new UIModal({
          root: ctx.overlay,
          onClose: () => {
            ctx.closed += 1;
          },
        }),
      );
      UI.insert(ctx.overlay);
      UINav.focused = ctx.row;
      UINav.engaged = true;
    },
    verify(ctx, t) {
      Test.uiFrame(ctx, [vk_enter]);
      Test.uiFrame(ctx, [vk_escape]);
      Test.uiFrame(ctx, []);
      t.eq(ctx.closed, 0, "an armed row takes the Esc that disarms it");
      Test.uiFrame(ctx, [vk_escape]);
      Test.uiFrame(ctx, []);
      t.eq(ctx.closed, 1, "a disarmed row leaves the next Esc to its modal");

      const a = new UIElement({ width: 200, height: 40 }).addComponent(new UIButton());
      const b = new UIElement({ width: 200, height: 40 }).addComponent(new UIButton());
      const col = new UIElement({ flexDirection: "column", gap: 20 });
      col.insertChild(a).insertChild(b);
      UI.insert(col);
      UINav.focused = a;
      UINav.engaged = true;
      Dialogue.start(["TEST_ABSENT"]);
      Test.uiFrame(ctx, [vk_down]);
      t.ok(UINav.focused === a, "an open dialogue keeps the moves from the nav");
      Test.uiFrame(ctx, [vk_escape]);
      t.ok(UINav.engaged ? ctx.backs === 0 : false, "and the cancel");
      Dialogue.clear();
      Test.uiFrame(ctx, [vk_down]);
      t.ok(UINav.focused === b, "a closed one hands them back");
    },
    teardown(ctx) {
      Dialogue.clear();
      Test.uiRestore(ctx);
    },
  },
]);
