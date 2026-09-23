// Core/Data cases: the id-keyed store — entity lifecycle, walks, the codecs and the snapshot —
// the file and JSON round trips, the def and asset registries, and perf.layout, a walk's cost per
// lead carrier. Every case here references Core only.

const ENTITIES = 500; // the perf.layout store, at a colony's size

Test.register(Test.CHECK, [
  {
    id: "entity.generation",
    setup(ctx) {
      ctx.entities = new Table(8);
    },
    verify(ctx, t) {
      const s = ctx.entities;
      const a = s.create();
      s.add(a, Position, { x: 1, y: 2, z: 0 });
      s.remove(a);
      s.flush();
      t.ok(!s.isValid(a), "a freed id reads invalid");
      t.eq(s.count(), 0, "count after flush");
      const b = s.create();
      t.eq(
        Handle.index(b),
        Handle.index(a),
        "the freed index is recycled",
      );
      t.ok(b !== a, "the recycled id carries a new generation");
      t.eq(
        Handle.generation(b),
        Handle.generation(a) + 1,
        "generation bumps by one",
      );
      t.ok(s.isValid(b), "the new owner is valid");
      t.ok(!s.isValid(a), "the stale id stays invalid after recycling");
      t.eq(
        s.get(b, Position),
        undefined,
        "a recycled slot carries no old component",
      );
      const live = s.query();
      t.eq(live.length, 1, "token-less query lists every live id");
      t.eq(live[0], b, "the live id is the new owner");
    },
    teardown(ctx) {
      ctx.entities.destroy();
    },
  },
  {
    id: "entity.flush",
    setup(ctx) {
      ctx.entities = new Table(8);
    },
    verify(ctx, t) {
      const s = ctx.entities;
      const id = s.create();
      s.add(id, Position, { x: 0, y: 0, z: 0 });
      s.remove(id);
      t.ok(s.isValid(id), "a queued removal is still valid before flush");
      t.eq(s.count(), 1, "a queued removal still counts");
      t.eq(s.query(Position).length, 1, "a queued removal still matches");
      s.flush();
      t.ok(!s.isValid(id), "flushed id is invalid");
      t.eq(s.query(Position).length, 0, "flushed id no longer matches");
      t.eq(s.has(id, Position), false, "flushed slot is cleared");
    },
    teardown(ctx) {
      ctx.entities.destroy();
    },
  },
  {
    id: "entity.forEach",
    setup(ctx) {
      const s = new Table(8);
      ctx.entities = s;
      ctx.a = s.create();
      s.add(ctx.a, Position, { x: 1, y: 0, z: 0 });
      s.add(ctx.a, Velocity, { x: 10, y: 0, z: 0 });
      ctx.b = s.create();
      s.add(ctx.b, Position, { x: 2, y: 0, z: 0 });
      ctx.c = s.create();
      s.add(ctx.c, Position, { x: 3, y: 0, z: 0 });
      s.add(ctx.c, Velocity, { x: 30, y: 0, z: 0 });
    },
    verify(ctx, t) {
      const s = ctx.entities;
      let visits = 0;
      let sumVel = 0;
      let sumPos = 0;
      s.forEach([Velocity, Position], (id, vel, pos) => {
        visits += 1;
        sumVel += vel.x;
        sumPos += pos.x;
      });
      t.eq(visits, 2, "forEach visits the join");
      t.eq(sumVel, 40, "data arrives in token order (Velocity first)");
      t.eq(sumPos, 4, "data arrives in token order (Position second)");
      t.eq(s.first(Velocity), ctx.a, "first() is the earliest carrier");
      t.eq(
        s.first("TestNoSuch"),
        -1,
        "first() on an unregistered token is -1",
      );
      t.eq(s.query(Position).length, 3, "query counts every carrier");
      t.eq(
        s.query("TestNoSuch").length,
        0,
        "query on an unregistered token is empty",
      );
      s.detach(ctx.a, Velocity);
      t.eq(s.first(Velocity), ctx.c, "detach drops the entity from the join");
    },
    teardown(ctx) {
      ctx.entities.destroy();
    },
  },
  {
    id: "entity.walk",
    setup(ctx) {
      const s = new Table(16);
      ctx.entities = s;
      ctx.ids = [];
      for (let k = 0; k < 6; k++) {
        const id = s.create();
        s.add(id, "TestWalk", { k });
        ctx.ids.push(id);
      }
    },
    verify(ctx, t) {
      const s = ctx.entities;
      const ids = ctx.ids;
      const set = s.components._byToken.get("TestWalk");
      // self-detach of the lead: every carrier visited once, the list compacted at the end
      let visits = 0;
      let seen = 0;
      s.forEach(["TestWalk"], (id, w) => {
        visits += 1;
        seen |= 1 << w.k;
        s.detach(id, "TestWalk");
        t.eq(
          s.has(id, "TestWalk"),
          false,
          "a detach reads absent inside the walk",
        );
        t.eq(
          set.dense.length,
          6,
          "the swap-remove waits for the walk to end",
        );
      });
      t.eq(visits, 6, "self-detach visits every carrier once");
      t.eq(seen, 63, "self-detach visits each carrier");
      t.eq(set.dense.length, 0, "the walk's end compacts the list");
      t.eq(s.query("TestWalk").length, 0, "nothing is left carrying it");
      for (let k = 0; k < 6; k++) s.add(ids[k], "TestWalk", { k });
      // another carrier detached mid-walk is skipped, a re-add keeps its carrier, and a
      // mid-walk add waits for the next walk
      visits = 0;
      seen = 0;
      s.forEach(["TestWalk"], (id, w) => {
        visits += 1;
        seen |= 1 << w.k;
        if (w.k === 0) {
          s.detach(ids[5], "TestWalk"); // the last carrier, still ahead of the walk
          s.detach(ids[2], "TestWalk");
          s.detach(id, "TestWalk");
          s.add(id, "TestWalk", w);
          s.add(s.create(), "TestWalk", { k: 6 });
        }
      });
      t.eq(visits, 4, "a carrier detached ahead of the walk is skipped");
      t.eq(
        seen,
        1 | 2 | 8 | 16,
        "the skipped carriers are the detached ones",
      );
      t.eq(
        s.has(ids[0], "TestWalk"),
        true,
        "a re-add during the walk keeps its carrier",
      );
      t.eq(
        s.query("TestWalk").length,
        5,
        "the survivors plus the mid-walk add remain",
      );
      visits = 0;
      s.forEach(["TestWalk"], () => {
        visits += 1;
      });
      t.eq(
        visits,
        5,
        "a carrier added mid-walk is visited from the next walk",
      );
      t.eq(set.dense.length, 5, "the dense list matches the query");
      // nested walks on one lead: the inner detach compacts when the OUTER walk ends
      visits = 0;
      s.forEach(["TestWalk"], (id) => {
        s.forEach(["TestWalk"], (oid) => {
          if (oid === id) s.detach(oid, "TestWalk");
        });
        visits += 1;
        t.eq(
          set.dense.length,
          5,
          "an inner detach compacts at the outer walk's end",
        );
      });
      t.eq(visits, 5, "the outer walk visits every carrier");
      t.eq(set.dense.length, 0, "the outer walk's end compacts");
      t.eq(set.walking, 0, "the walk depth returns to zero");
      // order: a removal swap-fills its hole from the tail, and the rest keep their places
      for (let k = 0; k < 3; k++) s.add(ids[k], "TestOrder", { k });
      s.detach(ids[0], "TestOrder");
      const q = s.query("TestOrder");
      t.eq(q[0], ids[2], "the last carrier takes the hole");
      t.eq(q[1], ids[1], "the rest keep their positions");
      t.eq(s.first("TestOrder"), ids[2], "first() reads the dense order");
    },
    teardown(ctx) {
      ctx.entities.destroy();
    },
  },
  {
    id: "entity.snapshot",
    setup(ctx) {
      const s = new Table(8);
      ctx.src = s;
      ctx.dst = new Table(8);
      const gone = s.create();
      ctx.a = s.create();
      s.add(ctx.a, Position, { x: 5, y: 6, z: 7 });
      s.add(ctx.a, Velocity, { x: 1, y: 0, z: 0 });
      s.remove(gone);
      s.flush();
      ctx.gone = gone;
    },
    verify(ctx, t) {
      const snap = ctx.src.export();
      ctx.dst.import(snap);
      const d = ctx.dst;
      t.eq(d.count(), 1, "count survives the round trip");
      t.ok(d.isValid(ctx.a), "a live id survives with its generation");
      t.ok(!d.isValid(ctx.gone), "a freed id stays invalid");
      const pos = d.get(ctx.a, Position);
      t.ok(pos !== undefined, "component data restored");
      if (pos !== undefined) t.eq(pos.z, 7, "component fields restored");
      t.eq(d.query(Velocity).length, 1, "every column restored");
      let visits = 0;
      d.forEach([Position], () => {
        visits += 1;
      });
      t.eq(visits, 1, "a walk after import runs the rebuilt list");
      const again = d.create();
      t.eq(
        Handle.index(again),
        Handle.index(ctx.gone),
        "the free list survives",
      );
    },
    teardown(ctx) {
      ctx.src.destroy();
      ctx.dst.destroy();
    },
  },
  {
    id: "entity.mint",
    setup(ctx) {
      const s = new Table(8);
      ctx.src = s;
      ctx.dst = new Table(8);
      ctx.a = s.create();
      s.add(ctx.a, Position, { x: 1, y: 2, z: 3 });
      s.mint(ctx.a, PathResponse, { path: [], index: 0 });
      s.add(ctx.a, PathResponse, { path: [], index: 1 }); // a later add keeps the token minted
    },
    verify(ctx, t) {
      const s = ctx.src;
      t.ok(
        s.get(ctx.a, PathResponse) !== undefined,
        "a minted component reads like any other",
      );
      const exp = s.export();
      t.ok(
        exp.components[Position] !== undefined,
        "export carries the added token",
      );
      t.eq(
        exp.components[PathResponse],
        undefined,
        "export skips the minted token",
      );
      const whole = s.persistentOf(ctx.a);
      t.ok(whole[Position] !== undefined, "persistentOf carries the added token");
      t.eq(whole[PathResponse], undefined, "persistentOf skips the minted token");
      t.ok(
        s.componentsOf(ctx.a)[PathResponse] !== undefined,
        "componentsOf still lists the minted token",
      );
      ctx.dst.import(exp);
      t.eq(
        ctx.dst.get(ctx.a, PathResponse),
        undefined,
        "a round trip drops the minted token",
      );
      t.ok(
        ctx.dst.get(ctx.a, Position) !== undefined,
        "a round trip keeps the added token",
      );
    },
    teardown(ctx) {
      ctx.src.destroy();
      ctx.dst.destroy();
    },
  },
  {
    id: "entity.codec",
    // a codec token's entries cross export/import as buffers, unpacked after the plain components
    setup(ctx) {
      ctx.src = new Table(8);
      ctx.dst = new Table(8);
      ctx.bufs = [];
      ctx.seen = false;
    },
    verify(ctx, t) {
      const s = ctx.src;
      const codec = {
        pack(data) {
          const b = buffer_create(4, buffer_fixed, 1);
          buffer_write(b, buffer_u32, data.n);
          return b;
        },
        unpack(b) {
          if (b === undefined) return undefined;
          buffer_seek(b, buffer_seek_start, 0);
          return { n: buffer_read(b, buffer_u32) };
        },
      };
      s.codec("TestBlob", codec);
      const a = s.create();
      s.add(a, "TestBlob", { n: 7 });
      s.add(a, Position, { x: 1, y: 2, z: 0 });
      const names = [];
      const exp = s.export((token, index, buf) => {
        names.push(token + "." + index);
        ctx.bufs.push(buf);
        return "blob" + (ctx.bufs.length - 1);
      });
      t.eq(names.join(","), "TestBlob." + Handle.index(a), "the sink sees the codec entry");
      t.eq(exp.components.TestBlob[0][1], "blob0", "the export holds the sink's name");
      t.eq(exp.components.Position[0][1].x, 1, "a plain component stays JSON");
      const d = ctx.dst;
      d.codec("TestBlob", {
        pack: codec.pack,
        unpack(b) {
          ctx.seen = d.get(a, Position) !== undefined;
          return codec.unpack(b);
        },
      });
      d.import(exp, (name) => ctx.bufs[Number(name.slice(4))]);
      t.eq(d.get(a, "TestBlob").n, 7, "the source's buffer unpacks");
      t.ok(ctx.seen, "unpack runs after the plain components are in");
      t.eq(d.get(a, Position).y, 2, "the plain component round-trips");
      d.import(exp, () => undefined);
      t.eq(d.get(a, "TestBlob"), undefined, "an unpack of nothing leaves the slot empty");
      t.eq(d.get(a, Position).y, 2, "the plain component still round-trips");
      const raw = s.export();
      const b2 = raw.components.TestBlob[0][1];
      t.ok(buffer_exists(b2), "without a sink the export holds the buffer");
      ctx.bufs.push(b2);
      const d2 = new Table(8);
      d2.codec("TestBlob", codec);
      d2.import(raw);
      t.eq(d2.get(a, "TestBlob").n, 7, "without a source the buffer unpacks as is");
      d2.destroy();
    },
    teardown(ctx) {
      for (let i = 0; i < ctx.bufs.length; i++) buffer_delete(ctx.bufs[i]);
      ctx.src.destroy();
      ctx.dst.destroy();
    },
  },
  {
    id: "file.roundtrip",
    // text and bytes through one pair: a file reads back as written (the text read stops at
    // EOF — docs/GMRT.md) and a grow buffer's file holds its used bytes only
    setup(ctx) {
      ctx.bufs = [];
    },
    verify(ctx, t) {
      const text = '{"a":[1,2,3],"b":"x"}';
      File.write("test/text.json", text);
      t.eq(File.read("test/text.json"), text, "text reads back as written");
      File.write("test/empty.txt", "");
      t.eq(File.read("test/empty.txt"), "", "an empty file reads as an empty string");
      t.eq(File.read("test/missing.txt"), undefined, "a missing file reads as undefined");
      const out = buffer_create(1, buffer_grow, 1);
      ctx.bufs.push(out);
      for (let i = 0; i < 5; i++) buffer_write(out, buffer_u32, i * 7);
      File.write("test/blob.bin", out, true);
      const back = File.read("test/blob.bin", true);
      t.ok(back !== undefined, "the blob reads back");
      if (back !== undefined) {
        ctx.bufs.push(back);
        t.eq(buffer_get_size(back), 20, "the file holds the used bytes only");
        t.eq(buffer_peek(back, 16, buffer_u32), 28, "the last value is intact");
      }
      t.eq(File.read("test/missing.bin", true), undefined, "a missing blob reads as undefined");
    },
    teardown(ctx) {
      for (let i = 0; i < ctx.bufs.length; i++) buffer_delete(ctx.bufs[i]);
    },
  },
  {
    id: "json.roundtrip",
    // the codec's promises: nesting, a sprite ref, a GML constant as a number, NaN and Infinity
    // as null, a cycle as null, invalid text as undefined, and the inline pretty form
    setup() {},
    verify(ctx, t) {
      const v = {
        n: 1,
        f: 0.5,
        s: 'x"y',
        arr: [1, 2, { a: true }],
        spr: pixMissing,
        key: vk_left,
        col: c_white,
        nul: null,
        nan: NaN,
        inf: 1 / 0,
        u: undefined,
      };
      const text = Json.encode(v);
      const bs = String.fromCharCode(92); // a literal backslash miscompiles (docs/GMRT.md)
      t.eq(
        text,
        '{"n":1,"f":0.5,"s":"x' + bs + '"y","arr":[1,2,{"a":true}],"spr":{"$spr":"pixMissing"},"key":37,"col":16777215,"nul":null,"nan":null,"inf":null}',
        "the compact form",
      );
      const d = Json.decode(text);
      t.ok(d !== undefined, "the compact form decodes");
      if (d !== undefined) {
        t.eq(d.arr[2].a, true, "nesting round-trips");
        t.ok(sprite_exists(d.spr) && sprite_get_name(d.spr) === "pixMissing", "a sprite ref revives");
        t.ok(d.key === vk_left && d.col === c_white, "a GML constant comes back as its number");
        t.eq(d.nan, null, "NaN lands as null");
      }
      const cyc = { a: 1 };
      cyc.self = cyc;
      t.eq(Json.encode(cyc), '{"a":1,"self":null}', "a cycle encodes as null");
      t.eq(Json.decode("garbage"), undefined, "invalid text decodes as undefined");
      t.eq(Json.decode('{"a":[1,2'), undefined, "truncated text decodes as undefined");
      t.eq(
        Json.encode({ r: [1, 2], o: { k: [{ a: 1 }] } }, { pretty: true }),
        '{\n  "r": [1, 2],\n  "o": {\n    "k": [\n      {\n        "a": 1\n      }\n    ]\n  }\n}',
        "the pretty form keeps a scalar array inline",
      );
    },
  },
  {
    id: "entity.transient",
    // a minted token's release hook frees a datum wherever it leaves its slot, so a native
    // handle needs no roster and no reap pass
    setup(ctx) {
      ctx.s = new Table(8);
      ctx.freed = [];
    },
    verify(ctx, t) {
      const s = ctx.s;
      const hook = (d) => ctx.freed.push(d.tag);
      const a = s.create();
      const b = s.create();
      const c = s.create();
      s.mint(a, "TestHandle", { tag: "a" }, hook);
      s.mint(b, "TestHandle", { tag: "b" }, hook);
      s.mint(c, "TestHandle", { tag: "c" }, hook);
      t.eq(s.export().components["TestHandle"], undefined, "a hooked token is transient");
      s.detach(a, "TestHandle");
      t.eq(ctx.freed.join(""), "a", "detach releases the handle");
      s.remove(b);
      t.eq(ctx.freed.length, 1, "a queued removal releases nothing yet");
      s.flush();
      t.eq(ctx.freed.join(""), "ab", "flush releases the removed entity's handle");
      s.add(c, "TestHandle", { tag: "c2" });
      t.eq(ctx.freed.join(""), "abc", "a replacing add releases the old handle");
      s.forEach(["TestHandle"], (id) => s.detach(id, "TestHandle"));
      t.eq(ctx.freed.join(""), "abcc2", "a detach mid-walk releases at once");
      s.mint(c, "TestHandle", { tag: "d" }, hook);
      s.destroy();
      t.eq(ctx.freed.join(""), "abcc2d", "the store's destroy releases what is left");
    },
  },
  {
    id: "id.pack",
    setup() {},
    verify(ctx, t) {
      const id = Handle.make(5, 7);
      t.eq(Handle.index(id), 5, "index unpacks");
      t.eq(Handle.generation(id), 7, "generation unpacks");
      const top = Handle.make(
        Handle.INDEX_MASK,
        Handle.GENERATION_MASK,
      );
      t.eq(Handle.index(top), Handle.INDEX_MASK, "index at its mask");
      t.eq(
        Handle.generation(top),
        Handle.GENERATION_MASK,
        "generation at its mask",
      );
    },
  },
  {
    // `require` is `get` for a component the contract needs: the data, or a throw naming the
    // entity and the token — never undefined
    id: "entity.require",
    setup(ctx) {
      const s = new Table(8);
      ctx.entities = s;
      ctx.a = s.create();
      s.add(ctx.a, Position, { x: 1, y: 2, z: 3 });
    },
    verify(ctx, t) {
      const s = ctx.entities;
      t.eq(s.require(ctx.a, Position).x, 1, "require reads a carried component");
      let missing = "";
      try {
        s.require(ctx.a, Velocity);
      } catch (e) {
        missing = e.message;
      }
      t.ok(missing.indexOf("Velocity") !== -1, "an absent component throws, naming the token");
      let unregistered = "";
      try {
        s.require(ctx.a, "Unregistered");
      } catch (e) {
        unregistered = e.message;
      }
      t.ok(unregistered !== "", "an unregistered token throws too");
      t.eq(s.get(ctx.a, Velocity), undefined, "get still reads undefined for an absent one");
    },
    teardown(ctx) {
      ctx.entities.destroy();
    },
  },
  {
    // a facade is a plain object with no storage of its own: it is seeded on first use, `make`
    // normalizes each def, and a re-registered id keeps its position (docs/ARCHITECTURE.md)
    id: "registry.facade",
    setup(ctx) {
      const Tier = {
        register(defs) {
          Registry.register(Tier, defs, Tier.make);
        },
        make(d) {
          return { id: d.id, weight: d.weight ?? 1 };
        },
      };
      ctx.facade = Tier;
      ctx.before = Registry.all(Tier).length;
      Tier.register([{ id: "low" }, { id: "mid", weight: 2 }]);
      Tier.register([{ id: "high" }, { id: "low", weight: 5 }]);
    },
    verify(ctx, t) {
      const Tier = ctx.facade;
      t.eq(ctx.before, 0, "an unregistered facade reads empty, not undefined");
      t.eq(Registry.get(Tier, "mid").weight, 2, "make normalizes a def");
      t.eq(Registry.get(Tier, "high").weight, 1, "make applies a default");
      t.eq(Registry.get(Tier, "low").weight, 5, "a re-registered id overwrites its def");
      t.eq(Registry.rank(Tier, "low"), 0, "a re-registered id keeps its position");
      t.eq(Registry.rank(Tier, "none"), -1, "an unknown id ranks -1");
      t.ok(Registry.has(Tier, "high"), "has finds a registered id");
      t.ok(!Registry.has(Tier, "none"), "has misses an unknown id");
      const all = Registry.all(Tier);
      t.eq(all.length, 3, "all lists every def once");
      t.eq(all[2].id, "high", "all runs in registration order");
      t.eq(Registry.ids(Tier).join(","), "low,mid,high", "ids is the order itself");
    },
  },
  {
    // the asset-keyed registry: refs are found by identity, a re-registered asset replaces in
    // place, and each field reads its default off an undeclared or unset asset
    id: "assetmeta.lookup",
    setup(ctx) {
      ctx.before = AssetMeta.all().length;
      ctx.sheet = {};
      ctx.track = {};
      ctx.plain = {};
      AssetMeta.register([
        { asset: ctx.sheet, kind: "test", density: 2 },
        { asset: ctx.track, kind: "test", bpm: 90, name: "TEST_TRACK" },
      ]);
      AssetMeta.register([{ asset: ctx.sheet, kind: "test", density: 4 }]);
    },
    verify(ctx, t) {
      t.eq(AssetMeta.all().length - ctx.before, 2, "a re-registered asset adds no entry");
      t.eq(AssetMeta.of(ctx.sheet).density, 4, "a re-registered asset replaces its def");
      t.eq(AssetMeta.all()[ctx.before].asset, ctx.sheet, "a replaced def keeps its position");
      t.eq(AssetMeta.of(ctx.plain), undefined, "an undeclared asset has no def");
      t.eq(AssetMeta.density(ctx.sheet), 4, "density reads the declared value");
      t.eq(AssetMeta.density(ctx.plain), 1, "density defaults to 1 undeclared");
      t.eq(AssetMeta.density(ctx.track), 1, "density defaults to 1 when unset");
      t.eq(AssetMeta.fit(ctx.sheet, 2), 0.5, "fit divides the design scale by density");
      t.eq(AssetMeta.bpm(ctx.track), 90, "bpm reads the declared value");
      t.eq(AssetMeta.bpm(ctx.sheet), 0, "bpm defaults to 0 when unset");
    },
    teardown(ctx) {
      AssetMeta._assets.length = ctx.before;
      AssetMeta._defs.length = ctx.before;
    },
  },
  // perf.layout: a walk costs per lead carrier, never per index. `forEach.sparse` against
  // `forEach.trail` is the same four matches led by the rare token and by Position — the
  // lead-order rule measured, gross per store entity. No ratio here retires an idiom on a runtime
  // upgrade: the lead-order rule is a property of the layout.

  {
    id: "perf.layout",
    setup(ctx) {
      Test.store(ctx, ENTITIES, ENTITIES);
      const s = ctx.entities;
      for (let k = 0; k < 4; k++)
        s.add(ctx.ids[k * 100], "TestRare", { on: true });
      for (let i = 0; i < ENTITIES; i++)
        s.add(ctx.ids[i], "TestChurn", ctx.objs[i]);
      ctx.scratch = new Array(ENTITIES).fill(undefined);
    },
    verify(ctx, t) {
      const n = ENTITIES;
      const empty = Test.empty(n);
      const store = ctx.entities;
      const col = ctx.col;
      const dense = ctx.dense;

      t.measure("forEach.full", n, empty, () => {
        let s = 0;
        store.forEach([Position], (id, p) => {
          s += p.x;
        });
        return s;
      });
      t.measure(
        "forEach.sparse",
        n,
        () => 0,
        () => {
          let s = 0;
          store.forEach(["TestRare", Position], (id, r, p) => {
            s += p.x;
          });
          return s;
        },
      );
      t.measure(
        "forEach.trail",
        n,
        () => 0,
        () => {
          let s = 0;
          store.forEach([Position, "TestRare"], (id, p) => {
            s += p.x;
          });
          return s;
        },
      );
      t.measure("query.get", n, empty, () => {
        const ids = store.query(Position);
        let s = 0;
        for (let k = 0; k < ids.length; k++)
          s += store.get(ids[k], Position).x;
        return s;
      });
      t.measure("column.loop", n, empty, () => {
        let s = 0;
        for (let i = 0; i < n; i++) {
          const d = col[i];
          if (d !== undefined) s += d.x;
        }
        return s;
      });
      t.measure("dense.loop", n, empty, () => {
        let s = 0;
        for (let k = 0; k < n; k++) {
          const d = col[dense[k]];
          if (d !== undefined) s += d.x;
        }
        return s;
      });

      const ids = ctx.ids;
      const objs = ctx.objs;
      const scratch = ctx.scratch;
      const mask = Handle.INDEX_MASK;
      t.measure(
        "store.churn",
        n,
        () => {
          for (let i = 0; i < n; i++) {
            const k = ids[i] & mask;
            scratch[k] = undefined;
            scratch[k] = objs[i];
          }
          return scratch[0];
        },
        () => {
          for (let i = 0; i < n; i++) {
            store.detach(ids[i], "TestChurn");
            store.add(ids[i], "TestChurn", objs[i]);
          }
          return store.get(ids[0], "TestChurn");
        },
      );
    },
    teardown(ctx) {
      ctx.entities.destroy();
    },
  },
]);
