// The colony's light across the day: the overlay tint, the world's chroma and the sun, each read
// live off the world clock's hour.
globalThis.Daylight = {
  // Overlay keyframes { h, c tint, a alpha }, sorted by hour and wrapping (h:0 == h:24).
  // Alpha 0 in full daylight, so the overlay draws nothing then.
  _TINT: [
    { h: 0, c: "#0b1133", a: 0.6 }, // midnight — deep blue
    { h: 5, c: "#0b1133", a: 0.55 }, // late night
    { h: 6.5, c: "#ff8a3d", a: 0.2 }, // dawn — warm
    { h: 8, c: "#ffffff", a: 0.0 }, // morning — clear
    { h: 17, c: "#ffffff", a: 0.0 }, // afternoon — clear
    { h: 18.5, c: "#ff7a2e", a: 0.22 }, // dusk — warm
    { h: 20, c: "#101a44", a: 0.5 }, // nightfall
    { h: 24, c: "#0b1133", a: 0.6 }, // wraps to midnight
  ],
  // Albedo chroma keyframes { h, k }, sorted by hour and wrapping like _TINT: a dusty noon flattens
  // the world's colour most, the low sun at dawn and dusk lets it back, night sits between (the
  // blue multiply owns the night look).
  _CHROMA: [
    { h: 0, k: 0.8 },
    { h: 5, k: 0.8 },
    { h: 6.5, k: 0.85 },
    { h: 9, k: 0.55 },
    { h: 16, k: 0.55 },
    { h: 18.5, k: 0.85 },
    { h: 20, k: 0.8 },
    { h: 24, k: 0.8 },
  ],
  // per-season offset on the keyframed chroma: winter drains it a little further
  _CHROMA_SEASON: { spring: 0, summer: 0.05, autumn: -0.05, winter: -0.1 },

  /**
   * Directional sun for mesh lighting: a flat
   * { x, y, z, strength, r, g, b } — unit vector TOWARD the sun (up = -z), strength 0 at
   * night (meshes fall to ambient + point lights), color warmed toward dawn/dusk. The sun
   * rises east (+x), sets west (-x), with a constant southward lean so the camera-side
   * faces still catch light at midday.
   */
  sun() {
    const h = WorldClock.state().hour;
    if (h < 6 || h > 18)
      return { x: 0, y: 0.33, z: -0.94, strength: 0, r: 1, g: 1, b: 1 };
    const t = (h - 6) / 12;
    const elev = Math.sin(Math.PI * t) * ((65 * Math.PI) / 180);
    let hx = Math.cos(Math.PI * t); // east at sunrise → west at sunset
    let hy = 0.35; // southward lean (the camera side)
    const hn = Math.sqrt(hx * hx + hy * hy);
    hx /= hn;
    hy /= hn;
    const ce = Math.cos(elev);
    const warm = 1 - Math.sin(Math.PI * t); // 1 at the horizons, 0 at noon
    return {
      x: hx * ce,
      y: hy * ce,
      z: -Math.sin(elev),
      strength: 0.5 * Math.sqrt(Math.sin(Math.PI * t)), // rises fast, flat through midday
      r: 1,
      g: 1 - 0.25 * warm,
      b: 1 - 0.45 * warm,
    };
  },

  /**
   * World chroma 0..1 for the current hour and season, clamped. The weather's share is the
   * caller's to multiply in.
   */
  chroma() {
    const kf = Daylight._CHROMA;
    const h = WorldClock.state().hour;
    let i = 0;
    while (i < kf.length - 2 && h >= kf[i + 1].h) i++;
    const a = kf[i];
    const b = kf[i + 1];
    const t = (h - a.h) / (b.h - a.h);
    const k = a.k + (b.k - a.k) * t + Daylight._CHROMA_SEASON[Season.now().id];
    return Math.min(1, Math.max(0, k));
  },

  /**
   * Overlay { color, alpha } for the current hour. Color.parse/merge from a method is fine — a
   * field initializer would be load-order-sensitive.
   */
  tint() {
    const kf = Daylight._TINT;
    const h = WorldClock.state().hour;
    let i = 0;
    while (i < kf.length - 2 && h >= kf[i + 1].h) i++;
    const a = kf[i];
    const b = kf[i + 1];
    const t = (h - a.h) / (b.h - a.h);
    return {
      color: Color.merge(Color.parse(a.c), Color.parse(b.c), t),
      alpha: a.a + (b.a - a.a) * t,
    };
  },
};
