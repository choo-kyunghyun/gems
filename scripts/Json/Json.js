// Ref-safe, nesting-safe, CYCLE-safe JSON codec — the disk-serialization substrate for save
// games (SaveGame) and any structured blob that outgrows a flat key→scalar store.
/**
 * It exists because native JSON on GMRT 0.20 can't round-trip live game data:
 *   1. JSON.stringify FAULTS NATIVELY on a nested object/array (process death, not a JS throw — see
 *      docs/GMRT.md). So encode() is a hand-rolled LINEAR walk that concatenates the output itself,
 *      calling native JSON.stringify only on SCALAR LEAVES (strings/numbers — safe, correct
 *      escaping). JSON.parse handles nesting fine, so decode() uses it directly and then revives.
 *      (GML json_stringify serializes nesting crash-free too — the interop workaround — but it can't
 *      tag asset refs (2) or guard cycles (below), so it backs the flat/ref-free stores instead:
 *      Settings, InputPreset.)
 *   2. An ASSET REF (a sprite handle in Visual.sprite / Animator graph states) reports typeof
 *      "object" with an EMPTY key set, so a generic serializer would silently emit {}. encode()
 *      discriminates plain data by `v.constructor === Object` (true for object literals, false for
 *      asset refs) and tags a ref as {"$spr": name}; decode() revives it via asset_get_index.
 *
 * CYCLE SAFETY: a cross-entity object reference in a component's data can form a CYCLE that a naive
 * recursive walk would follow until it OOMs, so the encoder does DFS cycle detection — an object/array
 * already on the current PATH (an ANCESTOR) is a back-edge → emit null + warn, never recurse into it.
 * Shared-but-acyclic refs (a diamond) still encode fully in each place. A hard STEP-COUNT cap
 * backstops even that. So encode() can never OOM regardless of input — but a SAVE should still pass
 * CLEAN data (durable components only, no live cross-references); the guards are a safety net, not a
 * license to serialize raw runtime state.
 *
 * The ancestor set is a plain ARRAY scanned by `===`, NOT a Set/Map (an object-keyed Set/Map crashes
 * GMRT natively — see docs/GMRT.md). The path only holds the current ancestor chain (pushed on enter,
 * popped on leave), so the `===` scan is O(depth) — the same parallel-array identity-scan idiom
 * SpriteMeta uses.
 *
 * Contract: values are plain-JSON data (scalars / arrays / object literals) plus sprite refs.
 * Functions, Maps, Sets, and non-sprite asset refs are NOT supported. Encode drops undefined object
 * fields (like native JSON) and warns rather than corrupting the stream.
 */
globalThis.Json = {
  _MAX_STEPS: 4000000, // ~4M node visits — orders of magnitude above any real save, well under an OOM

  /**
   * Serialize a JSON-plus-sprite-ref value to a string. Linear, cycle-safe, and step-capped:
   * it dodges the native nested-value fault, the O(n²) big-array cost, AND any infinite
   * recursion from a cyclic reference in the input.
   * `opt.pretty` switches to the hand-editable form for files a human reads and diffs
   * (LevelSerializer's level files): 2-space indent, one object key per line, and pure-scalar
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
      // JSON has no NaN/Infinity literal — coerce to null like native JSON.stringify does.
      out.push(isFinite(v) ? String(v) : "null");
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
      // refs stored in component data are sprite handles (Visual.sprite, Animator states) —
      // tag by NAME so decode can re-resolve. Fail loud on anything else.
      if (sprite_exists(v)) {
        out.push('{"$spr":');
        out.push(JSON.stringify(sprite_get_name(v)));
        out.push("}");
        return;
      }
      Log.warn("Json.encode: unserializable ref → null");
      out.push("null");
      return;
    }
    // function / symbol / bigint — unsupported
    Log.warn("Json.encode: unserializable " + t + " → null");
    out.push("null");
  },

  /**
   * Parse a string produced by encode() (or any compatible JSON) back to a value, reviving
   * {"$spr": name} tags to live sprite refs. Returns undefined if the text is not valid JSON.
   */
  decode(s) {
    let root;
    try {
      root = JSON.parse(s); // native parse handles nesting fine — only stringify faults
    } catch (_) {
      return undefined;
    }
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
