// Cases over the pinned runtime itself, no Core area: the frame clock, and the perf.* families
// that decide the hot-path idioms. Every case references Core only.

const N = 4000;
const N_NATIVE = 20000; // a ~40 ns boundary wants the resolution

Test.register(Test.CHECK, [
  {
    id: "frame.count",
    frames: 3,
    setup(ctx) {
      ctx.seen = 0;
      ctx.frame0 = Time.frame;
    },
    frame(ctx) {
      ctx.seen += 1;
    },
    verify(ctx, t) {
      t.eq(ctx.seen, 3, "a case spans its frames");
      t.eq(Time.frame - ctx.frame0, 2, "one real frame per step");
    },
  },
  // A static-method call and an object literal each cost about a hundred plain reads, a hash
  // lookup a dozen: the rule for every hot loop is the cheap form in the paired row — an inline
  // index, a cached column, a rect filled in place, a reused buffer, and never a per-element reset
  // of a level-sized scratch (a generation stamp instead).
  {
    id: "perf.measured",
    setup(ctx) {
      const n = N;
      ctx.vals = Test.vals(n);
      ctx.packed = new Array(n);
      for (let i = 0; i < n; i++) ctx.packed[i] = Handle.make(i & 63, (i & 63) * 67108859); // up to ~2^32
      Test.store(ctx, 64, n);
      ctx.pos = new Array(n);
      for (let i = 0; i < n; i++) ctx.pos[i] = { x: i, y: i, z: 0 };
      ctx.box = new Array(n);
      for (let i = 0; i < n; i++)
        ctx.box[i] = { x: -8, y: -8, width: 16, height: 16 };
      const map = new Map();
      const names = [];
      for (let k = 0; k < 43; k++) {
        // a colony's column count
        const name = "Component" + k;
        map.set(name, k);
        names.push(name);
      }
      ctx.map = map;
      ctx.keys = new Array(n);
      ctx.keyVals = new Array(n);
      for (let i = 0; i < n; i++) {
        ctx.keys[i] = names[i % names.length];
        ctx.keyVals[i] = i % names.length;
      }
      ctx.buf = [];
      ctx.fillArr = new Array(n).fill(0);
    },
    verify(ctx, t) {
      const n = N;
      const vals = ctx.vals;
      const readVals = Test.read(n, vals);
      const empty = Test.empty(n);

      const f1 = (a) => a;
      t.measure("closure.call1", n, readVals, () => {
        let s = 0;
        for (let i = 0; i < n; i++) s += f1(vals[i]);
        return s;
      });
      const f3 = (a, b, c) => a + b + c;
      t.measure(
        "closure.call3",
        n,
        () => {
          let s = 0;
          for (let i = 0; i < n; i++) s += vals[i] + 1 + 2;
          return s;
        },
        () => {
          let s = 0;
          for (let i = 0; i < n; i++) s += f3(vals[i], 1, 2);
          return s;
        },
      );

      const packed = ctx.packed;
      const readPacked = Test.read(n, packed);
      t.measure("id.index", n, readPacked, () => {
        let s = 0;
        for (let i = 0; i < n; i++) s += Handle.index(packed[i]);
        return s;
      });
      const slots = Handle.SLOTS;
      t.measure("id.index.inline", n, readPacked, () => {
        let s = 0;
        for (let i = 0; i < n; i++) s += packed[i] % slots;
        return s;
      });

      const store = ctx.entities;
      const ids = ctx.ids;
      const objs = ctx.objs;
      const col = ctx.col;
      const readObjs = () => {
        let s = 0;
        for (let i = 0; i < n; i++) {
          const p = objs[i];
          s += p.x;
        }
        return s;
      };
      t.measure("store.get", n, readObjs, () => {
        let s = 0;
        for (let i = 0; i < n; i++) {
          const p = store.get(ids[i], Position);
          s += p.x;
        }
        return s;
      });
      t.measure("store.get.cached", n, readObjs, () => {
        let s = 0;
        for (let i = 0; i < n; i++) {
          const p = col[ids[i] % slots];
          s += p.x;
        }
        return s;
      });

      const pos = ctx.pos;
      const box = ctx.box;
      const readPosBox = () => {
        let s = 0;
        for (let i = 0; i < n; i++) s += pos[i].x + box[i].x;
        return s;
      };
      t.measure("rect.literal", n, readPosBox, () => {
        let s = 0;
        for (let i = 0; i < n; i++) {
          const x1 = pos[i].x + box[i].x;
          const y1 = pos[i].y + box[i].y;
          s += { x1, y1, x2: x1 + box[i].width, y2: y1 + box[i].height }.x1;
        }
        return s;
      });
      const rect = { x1: 0, y1: 0, x2: 0, y2: 0 };
      t.measure("rect.fill", n, readPosBox, () => {
        let s = 0;
        for (let i = 0; i < n; i++) {
          rect.x1 = pos[i].x + box[i].x;
          rect.y1 = pos[i].y + box[i].y;
          rect.x2 = rect.x1 + box[i].width;
          rect.y2 = rect.y1 + box[i].height;
          s += rect.x1;
        }
        return s;
      });

      const map = ctx.map;
      const keys = ctx.keys;
      t.measure("map.get", n, Test.read(n, ctx.keyVals), () => {
        let s = 0;
        for (let i = 0; i < n; i++) s += map.get(keys[i]);
        return s;
      });

      t.measure("array.push", n, empty, () => {
        const out = [];
        for (let i = 0; i < n; i++) out.push(i);
        return out.length;
      });
      const buf = ctx.buf;
      t.measure("array.reuse", n, empty, () => {
        let w = 0;
        for (let i = 0; i < n; i++) buf[w++] = i;
        buf.length = w;
        return w;
      });
      const fillArr = ctx.fillArr;
      t.measure(
        "array.fill",
        n,
        () => 0,
        () => {
          fillArr.fill(1);
          return fillArr[n - 1];
        },
      );
    },
    teardown(ctx) {
      ctx.entities.destroy();
    },
  },
  // A GML built-in against its inline JS twin. The JS↔GML boundary costs ~35-57 ns whatever the
  // call does, so a native pays only when it replaces more JS than that: bulk work inside one
  // call wins outright, a scalar helper loses to a property read or a comparison chain — and the
  // JS standard library is itself slow here, so `Math.abs`/`Math.sin` lose to their GML twins.
  // TODO when `js.abs` reaches `native.abs`, drop the native detours over `Math.*` and
  // `Array.sort` over `array_sort`; when the boundary (`native.clamp` vs `js.clamp`) falls
  // below ~10 ns, re-test natives at scalar sites and `tilemap_*` against vertex-buffer tiles.
  {
    id: "perf.native",
    setup(ctx) {
      const n = N_NATIVE;
      ctx.vals = Test.vals(n);
      // one loop per array: interleaved allocations cost the read rows ~3x in cache misses
      ctx.arrs = new Array(n);
      for (let i = 0; i < n; i++) ctx.arrs[i] = [i, i, i];
      ctx.a = new Array(n);
      for (let i = 0; i < n; i++) ctx.a[i] = { x1: 0, y1: 0, x2: 16, y2: 16 };
      ctx.b = new Array(n);
      for (let i = 0; i < n; i++)
        ctx.b[i] = { x1: (i % 3) * 8, y1: 0, x2: (i % 3) * 8 + 16, y2: 16 };
    },
    verify(ctx, t) {
      const n = N_NATIVE;
      const vals = ctx.vals;
      const readVals = Test.read(n, vals);
      const empty = Test.empty(n);

      t.measure("native.clamp", n, readVals, () => {
        let s = 0;
        for (let i = 0; i < n; i++) s += clamp(vals[i], 0, 1);
        return s;
      });
      t.measure("js.clamp", n, readVals, () => {
        let s = 0;
        for (let i = 0; i < n; i++) {
          const v = vals[i];
          s += v < 0 ? 0 : v > 1 ? 1 : v;
        }
        return s;
      });
      t.measure("native.floor", n, readVals, () => {
        let s = 0;
        for (let i = 0; i < n; i++) s += floor(vals[i]);
        return s;
      });
      t.measure("js.floor", n, readVals, () => {
        let s = 0;
        for (let i = 0; i < n; i++) s += Math.floor(vals[i]);
        return s;
      });
      t.measure("native.sin", n, readVals, () => {
        let s = 0;
        for (let i = 0; i < n; i++) s += sin(vals[i]);
        return s;
      });
      t.measure("js.sin", n, readVals, () => {
        let s = 0;
        for (let i = 0; i < n; i++) s += Math.sin(vals[i]);
        return s;
      });
      t.measure("native.abs", n, readVals, () => {
        let s = 0;
        for (let i = 0; i < n; i++) s += abs(vals[i]);
        return s;
      });
      t.measure("js.abs", n, readVals, () => {
        let s = 0;
        for (let i = 0; i < n; i++) s += Math.abs(vals[i]);
        return s;
      });
      t.measure("native.pointDistance", n, readVals, () => {
        let s = 0;
        for (let i = 0; i < n; i++) {
          const v = vals[i];
          s += point_distance(0, 0, v, v);
        }
        return s;
      });
      t.measure("js.distance", n, readVals, () => {
        let s = 0;
        for (let i = 0; i < n; i++) {
          const v = vals[i];
          s += Math.sqrt(v * v + v * v);
        }
        return s;
      });

      const arrs = ctx.arrs;
      t.measure("native.arrayLength", n, empty, () => {
        let s = 0;
        for (let i = 0; i < n; i++) s += array_length(arrs[i]);
        return s;
      });
      t.measure("js.length", n, empty, () => {
        let s = 0;
        for (let i = 0; i < n; i++) s += arrs[i].length;
        return s;
      });

      const as = ctx.a;
      const bs = ctx.b;
      const readRects = () => {
        let s = 0;
        for (let i = 0; i < n; i++) {
          const a = as[i];
          const b = bs[i];
          s += a.x1 + b.x1;
        }
        return s;
      };
      t.measure("native.rectOverlap", n, readRects, () => {
        let s = 0;
        for (let i = 0; i < n; i++) {
          const a = as[i];
          const b = bs[i];
          s +=
            rectangle_in_rectangle(
              a.x1,
              a.y1,
              a.x2,
              a.y2,
              b.x1,
              b.y1,
              b.x2,
              b.y2,
            ) !== 0
              ? 1
              : 0;
        }
        return s;
      });
      t.measure("js.rectOverlap", n, readRects, () => {
        let s = 0;
        for (let i = 0; i < n; i++) {
          const a = as[i];
          const b = bs[i];
          s +=
            a.x2 > b.x1 && b.x2 > a.x1 && a.y2 > b.y1 && b.y2 > a.y1 ? 1 : 0;
        }
        return s;
      });
    },
  },
  // One read at a loop-variant index. A JS property and a user-defined instance property cost
  // the same; access by name ~5x that, the price of any token-driven path; a typed array element
  // ~20x a plain one — the outlier, so a hot value lives in a plain array, never a typed one.
  // A built-in instance variable goes through accessors at 3-4.5x a column read, which is why an
  // instance holds scope, never data.
  // TODO when `read.typed` reaches `read.array` (AOT does not close it: ~22x under `--runtime
  // native`), a typed array is an option again for a hot value or scratch; when a built-in reaches a user-defined property, an instance may hold data.
  {
    id: "perf.access",
    setup(ctx) {
      const n = N;
      ctx.vals = Test.vals(n);
      ctx.objs = new Array(n);
      for (let i = 0; i < n; i++) ctx.objs[i] = { v: i };
      ctx.typed = new Float64Array(n);
      for (let i = 0; i < n; i++) ctx.typed[i] = i;
    },
    verify(ctx, t) {
      const n = N;
      const vals = ctx.vals;
      const readVals = Test.read(n, vals);
      const empty = Test.empty(n);
      const objs = ctx.objs;
      const typed = ctx.typed;

      t.measure("read.array", n, empty, readVals);
      t.measure("read.object", n, readVals, () => {
        let s = 0;
        for (let i = 0; i < n; i++) s += objs[i].v;
        return s;
      });
      t.measure("read.structGet", n, readVals, () => {
        let s = 0;
        for (let i = 0; i < n; i++) s += variable_struct_get(objs[i], "v");
        return s;
      });
      t.measure("read.typed", n, empty, () => {
        let s = 0;
        for (let i = 0; i < n; i++) s += typed[i];
        return s;
      });
    },
  },
]);
