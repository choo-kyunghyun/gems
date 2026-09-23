/**
 * JSON codec for save data, walking the value itself because neither built-in serializer
 * survives the pinned runtime (docs/GMRT.md #15565). A sprite ref is tagged {"$spr": name} and
 * revived on decode.
 *
 * Contract: plain-JSON data (scalars, arrays, object literals) plus sprite refs. Anything else,
 * and a cycle, encodes as null with a warning; an undefined field is dropped and NaN/Infinity
 * become null, as native JSON does. A step cap aborts a runaway walk. The guards are a net:
 * a save passes clean, durable data.
 */
globalThis.Json = {
  _MAX_STEPS: 4000000, // orders of magnitude above any real save, well under an OOM

  /**
   * `opt.pretty` gives the hand-editable form for files a human diffs, keeping all-scalar arrays
   * inline. Returns undefined after a step-cap abort, never truncated output.
   */
  encode(v, opt = {}) {
    const ctx = {
      path: [],
      steps: 0,
      aborted: false,
      pretty: opt.pretty === true,
      pad: "", // each container restores it on the way out
    };
    const out = [];
    Json._enc(v, out, ctx);
    if (ctx.aborted) {
      Log.error("Json.encode: aborted at step cap — cyclic/oversized input");
      return undefined;
    }
    return out.join("");
  },

  _inlineArray(v) {
    for (let i = 0; i < v.length; i++) {
      const e = v[i];
      if (e !== null && typeof e === "object") return false;
    }
    return true;
  },

  /** An identity scan, not an object-keyed Set (docs/GMRT.md #15567). */
  _onPath(v, ctx) {
    const p = ctx.path;
    for (let i = 0; i < p.length; i++) if (p[i] === v) return true;
    return false;
  },

  /** Appends chunks to `out`, joined once at the top so encoding stays linear. */
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
      // not the global isFinite (docs/GMRT.md)
      out.push(Number.isFinite(v) ? String(v) : "null");
      return;
    }
    if (t === "boolean") {
      out.push(v ? "true" : "false");
      return;
    }
    if (t === "string") {
      out.push(JSON.stringify(v)); // native escaping is safe on a scalar leaf
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
        ctx.path.pop(); // a later sibling ref is not a cycle
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
          if (val === undefined) continue;
          if (!first) out.push(ctx.pretty ? ",\n" : ",");
          else if (ctx.pretty) out.push("\n");
          first = false;
          if (ctx.pretty) out.push(ctx.pad);
          out.push(JSON.stringify(k));
          out.push(ctx.pretty ? ": " : ":");
          Json._enc(val, out, ctx);
        }
        ctx.pad = outer;
        if (ctx.pretty && !first) out.push("\n" + outer); // all-undefined keys stay "{}"
        out.push("}");
        ctx.path.pop();
        return;
      }
      // an asset ref; sprites are tagged by name so decode can re-resolve them
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
    Log.warn("Json.encode: unserializable " + t + " → null");
    out.push("null");
  },

  /** Undefined when the text is not valid JSON or is the literal null. */
  decode(s) {
    const root = JSON.parse(s); // null on invalid text, never a throw (docs/GMRT.md)
    if (root === null) return undefined;
    return Json._revive(root);
  },

  /**
   * A missing sprite revives as -1, so a save whose art was since removed degrades rather than
   * faulting. Parsed JSON is a tree, so no cycle guard.
   */
  _revive(v) {
    if (v === null || typeof v !== "object") return v;
    if (Array.isArray(v)) {
      for (let i = 0; i < v.length; i++) v[i] = Json._revive(v[i]);
      return v;
    }
    if (v.$spr !== undefined) return asset_get_index(v.$spr);
    for (const k in v) v[k] = Json._revive(v[k]);
    return v;
  },
};
