// In-game world clock — a global time-of-day + day counter every time-aware feature reads. A singleton
// (advanced once per frame by Time.delta, sim time); persists across map changes (reset once in create()).
globalThis.WorldClock = {
  dayLength: 240, // real seconds for one full in-game day (at Time.scale 1)
  startHour: 8, // morning when a fresh level starts
  hour: 8, // current time of day in [0, 24)
  day: 1, // day counter, 1-based
  daysPerSeason: 7, // in-game days per season; the four-season "year" is 4× this

  // four seasons in cycle order; a literal (an initializer can't self-reference). Season is
  // a pure derivation of `day`, like phase() of hour.
  _SEASONS: [
    { id: "spring", name: "SEASON_SPRING" },
    { id: "summer", name: "SEASON_SUMMER" },
    { id: "autumn", name: "SEASON_AUTUMN" },
    { id: "winter", name: "SEASON_WINTER" },
  ],

  // Hand-authored day/night overlay keyframes { h, c tint, a alpha }, sorted by hour and wrapping
  // (h:0 == h:24). alpha 0 in full daylight (08:00–17:00) so the pass draws nothing then. A literal
  // (an initializer can't self-reference).
  _KF: [
    { h: 0, c: "#0b1133", a: 0.6 }, // midnight — deep blue
    { h: 5, c: "#0b1133", a: 0.55 }, // late night
    { h: 6.5, c: "#ff8a3d", a: 0.2 }, // dawn — warm
    { h: 8, c: "#ffffff", a: 0.0 }, // morning — clear
    { h: 17, c: "#ffffff", a: 0.0 }, // afternoon — clear
    { h: 18.5, c: "#ff7a2e", a: 0.22 }, // dusk — warm
    { h: 20, c: "#101a44", a: 0.5 }, // nightfall
    { h: 24, c: "#0b1133", a: 0.6 }, // wraps to midnight
  ],

  /** reset to the starting morning of day 1 (level create()) */
  reset() {
    WorldClock.hour = WorldClock.startHour;
    WorldClock.day = 1;
  },

  /**
   * advance by `dt` (Time.delta), rolling the day at each midnight. `while` not an empty-for — an
   * empty for-init crashes the GMRT compiler, and a big hitch could cross more than one midnight.
   */
  update(dt) {
    WorldClock.hour += (24 / WorldClock.dayLength) * dt;
    while (WorldClock.hour >= 24) {
      WorldClock.hour -= 24;
      WorldClock.day += 1;
    }
  },

  /**
   * absolute in-game hours since day 1, 00:00 — a monotonic timeline for scheduling (WorldEvents).
   */
  absHours() {
    return (WorldClock.day - 1) * 24 + WorldClock.hour;
  },

  clockText() {
    const h = Math.floor(WorldClock.hour);
    const m = Math.floor((WorldClock.hour - h) * 60);
    return (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m;
  },

  phase() {
    const h = WorldClock.hour;
    if (h < 5 || h >= 20) return "night";
    if (h < 8) return "dawn";
    if (h < 17) return "day";
    return "dusk";
  },

  season() {
    return WorldClock.seasonAt(WorldClock.absHours());
  },

  /** the season of an absolute in-game hour (absHours' timeline) — season() of any day, not just today */
  seasonAt(hours) {
    const day = Math.floor(hours / 24) + 1;
    const i = Math.floor((day - 1) / WorldClock.daysPerSeason) % 4;
    return WorldClock._SEASONS[i];
  },

  seasonDay() {
    return ((WorldClock.day - 1) % WorldClock.daysPerSeason) + 1;
  },

  /**
   * Directional sun for mesh lighting (RenderMesh's injected `sun` provider): a flat
   * { x, y, z, strength, r, g, b } — unit vector TOWARD the sun (up = -z), strength 0 at
   * night (meshes fall to ambient + point lights), color warmed toward dawn/dusk. The sun
   * rises east (+x), sets west (-x), with a constant southward lean so the camera-side
   * faces still catch light at midday.
   */
  sunDir() {
    const h = WorldClock.hour;
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

  // Hand-authored albedo CHROMA keyframes { h, k } (shMeshlit's u_chroma through the scene's
  // provider), sorted by hour and wrapping like _KF: a dusty noon flattens the world's colour
  // most, the low sun at dawn and dusk lets it back, night sits between (the blue multiply
  // owns the night look). A literal (an initializer can't self-reference).
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
   * world chroma 0..1 for the current hour and season — _CHROMA lerped between bracketing
   * keyframes, plus the season's offset, clamped. The SKY's share (weather) is the scene's to
   * multiply in (Weather is not Core's to read).
   */
  chroma() {
    const kf = WorldClock._CHROMA;
    const h = WorldClock.hour;
    let i = 0;
    while (i < kf.length - 2 && h >= kf[i + 1].h) i++;
    const a = kf[i];
    const b = kf[i + 1];
    const t = (h - a.h) / (b.h - a.h);
    const k = a.k + (b.k - a.k) * t + WorldClock._CHROMA_SEASON[WorldClock.season().id];
    return Math.min(1, Math.max(0, k));
  },

  /**
   * day/night overlay { color, alpha } for the current hour, lerped between bracketing keyframes.
   * Color.parse/merge from a method is fine — a field initializer would be load-order-sensitive.
   */
  tint() {
    const kf = WorldClock._KF;
    const h = WorldClock.hour;
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
