/**
 * JSON codec for save data.
 *
 * Why not a built-in: JS JSON.stringify faults on nesting (docs/GMRT.md #15565); GML
 * json_stringify handles nesting and cycles but writes a keycode or colour constant as an
 * `@i64@` string and a sprite as `@ref GMSprite(name)`, and only json_parse — whose arrays reach
 * JS as boundary values (docs/GMRT.md) — revives them. So encode() walks the value itself,
 * calling JSON.stringify on string leaves only, and tags a sprite ref as {"$spr": name};
 * decode() is JSON.parse plus a walk that revives the tag through asset_get_index.
 *
 * A cycle: an object or array already on the DFS path encodes as null with a warning, and a
 * step cap aborts a runaway walk (encode returns undefined) — a save passes clean, durable data,
 * the guards are a net. The path is an array scanned by `===` (an object-keyed Set/Map crashes
 * natively — docs/GMRT.md #15567).
 *
 * Contract: plain-JSON data (scalars, arrays, object literals) plus sprite refs. A function,
 * Map, Set, class instance or other asset ref encodes as null with a warning; an undefined
 * field is dropped and NaN/Infinity become null, as native JSON does.
 */
globalThis.Json = {
  _MAX_STEPS: 4000000, // ~4M node visits — orders of magnitude above any real save, well under an OOM

  /**
   * Serialize a JSON-plus-sprite-ref value to a string — linear, cycle-safe, step-capped.
   * `opt.pretty` switches to the hand-editable form for files a human reads and diffs
   * (a LevelData exported as a literal): 2-space indent, one object key per line, and pure-scalar
   * arrays kept INLINE so a `[x, y, w, h]` rect stays one line. Save games stay compact.
   * Returns undefined after a step-cap abort (Log.error'd) — truncated output is never
   * handed back for a caller to persist as if complete.
   */
  encode(v, opt = {}) {
    const ctx = {
      path: [],
      steps: 0,
      aborted: false,
      pretty: opt.pretty === true,
      pad: "", // current indent (pretty only) — each container restores it on the way out
    };
    const out = [];
    Json._enc(v, out, ctx);
    if (ctx.aborted) {
      Log.error("Json.encode: aborted at step cap — cyclic/oversized input");
      return undefined;
    }
    return out.join("");
  },

  /**
   * pretty form keeps an all-scalar array inline; a null element counts as scalar.
   */
  _inlineArray(v) {
    for (let i = 0; i < v.length; i++) {
      const e = v[i];
      if (e !== null && typeof e === "object") return false;
    }
    return true;
  },

  /**
   * Is `v` an ancestor on the current DFS path? (=== identity scan — no object-keyed Set/Map).
   */
  _onPath(v, ctx) {
    const p = ctx.path;
    for (let i = 0; i < p.length; i++) if (p[i] === v) return true;
    return false;
  },

  /**
   * append the encoding of v onto the `out` chunk array (join once at the top — O(n)).
   * `ctx.path` is the ancestor chain on the CURRENT path (DFS cycle detection).
   */
  _enc(v, out, ctx) {
    if (ctx.aborted) return;
    if (++ctx.steps > Json._MAX_STEPS) {
      ctx.aborted = true;
      out.push("null");
      return;
    }
    if (v === null || v === undefined) {
      out.push("null");
      return;
    }
    const t = typeof v;
    if (t === "number") {
      // JSON has no NaN/Infinity literal; global isFinite passes NaN (docs/GMRT.md)
      out.push(Number.isFinite(v) ? String(v) : "null");
      return;
    }
    if (t === "boolean") {
      out.push(v ? "true" : "false");
      return;
    }
    if (t === "string") {
      out.push(JSON.stringify(v)); // scalar leaf — native escaping is safe (not nested)
      return;
    }
    if (t === "object") {
      if (Array.isArray(v)) {
        if (Json._onPath(v, ctx)) {
          Log.warn("Json.encode: cycle in array → null");
          out.push("null");
          return;
        }
        ctx.path.push(v);
        const block = ctx.pretty && v.length > 0 && !Json._inlineArray(v);
        const outer = ctx.pad;
        if (block) ctx.pad = outer + "  ";
        out.push("[");
        for (let i = 0; i < v.length; i++) {
          if (i > 0) out.push(ctx.pretty ? (block ? ",\n" : ", ") : ",");
          else if (block) out.push("\n");
          if (block) out.push(ctx.pad);
          Json._enc(v[i], out, ctx);
        }
        if (block) {
          ctx.pad = outer;
          out.push("\n" + outer);
        }
        out.push("]");
        ctx.path.pop(); // leaves the current path — a later sibling ref is not a cycle
        return;
      }
      if (v.constructor === Object) {
        if (Json._onPath(v, ctx)) {
          Log.warn("Json.encode: cycle in object → null");
          out.push("null");
          return;
        }
        ctx.path.push(v);
        const outer = ctx.pad;
        if (ctx.pretty) ctx.pad = outer + "  ";
        out.push("{");
        let first = true;
        for (const k in v) {
          const val = v[k];
          if (val === undefined) continue; // drop undefined fields, like native JSON
          if (!first) out.push(ctx.pretty ? ",\n" : ",");
          else if (ctx.pretty) out.push("\n");
          first = false;
          if (ctx.pretty) out.push(ctx.pad);
          out.push(JSON.stringify(k)); // key escaping — scalar string, safe
          out.push(ctx.pretty ? ": " : ":");
          Json._enc(val, out, ctx);
        }
        ctx.pad = outer;
        if (ctx.pretty && !first) out.push("\n" + outer); // all-undefined keys stay "{}"
        out.push("}");
        ctx.path.pop();
        return;
      }
      // Not a plain object → an asset ref (typeof "object", constructor !== Object). The only
      // refs stored in component data are sprite handles (Visual.sprite, Skeleton.sprite, Appearance slots) —
      // tag by NAME so decode can re-resolve. Fail loud on anything else.
      if (sprite_exists(v)) {
        out.push('{"$spr":');
        out.push(JSON.stringify(sprite_get_name(v)));
        out.push("}");
        return;
      }
      Log.warn("Json.encode: non-plain object → null");
      out.push("null");
      return;
    }
    // function / symbol / bigint — unsupported
    Log.warn("Json.encode: unserializable " + t + " → null");
    out.push("null");
  },

  /**
   * Parse a string produced by encode() (or any compatible JSON) back to a value, reviving
   * {"$spr": name} tags to live sprite refs. Returns undefined if the text is not valid JSON
   * (or is the literal null).
   */
  decode(s) {
    const root = JSON.parse(s); // null on invalid text, never a throw (docs/GMRT.md)
    if (root === null) return undefined;
    return Json._revive(root);
  },

  /**
   * Walk a freshly-parsed tree, replacing {"$spr": name} sentinels with the resolved ref.
   * A missing sprite resolves to asset_get_index's -1 sentinel — existing draw code already
   * sprite_exists-guards, so a save from a build whose art was since removed degrades
   * gracefully rather than faulting here. Parsed JSON is always a tree (no cycles), so no guard.
   */
  _revive(v) {
    if (v === null || typeof v !== "object") return v;
    if (Array.isArray(v)) {
      for (let i = 0; i < v.length; i++) v[i] = Json._revive(v[i]);
      return v;
    }
    if (v.$spr !== undefined) return asset_get_index(v.$spr); // sentinel → live ref
    for (const k in v) v[k] = Json._revive(v[k]);
    return v;
  },
};
