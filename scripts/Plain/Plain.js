/**
 * Plain data — arrays and objects whose constructor is `Object` — as distinct from everything
 * else a component may hold. An asset ref reflects as an empty object (docs/GMRT.md), so only the
 * constructor tells the two apart.
 */
globalThis.Plain = {
  /** Arrays and plain objects deep; anything else by reference. */
  copy(v) {
    if (Array.isArray(v)) {
      const out = [];
      for (let i = 0; i < v.length; i++) out.push(Plain.copy(v[i]));
      return out;
    }
    if (v !== null && typeof v === "object" && v.constructor === Object) {
      const out = {};
      for (const key in v) out[key] = Plain.copy(v[key]);
      return out;
    }
    return v;
  },
};
