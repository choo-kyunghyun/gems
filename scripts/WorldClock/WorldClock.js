// In-game world clock: a global time-of-day + day counter that every time-aware feature reads.
// Static like `Time` (one clock), advanced once per frame from step() by Time.delta (sim time —
// pauses with the game, dilates with Time.scale). Persists across map changes — the scene resets it
// once in create(), not per map.
globalThis.WorldClock = class WorldClock {
  static dayLength = 240; // real seconds for one full in-game day (at Time.scale 1)
  static startHour = 8; // morning when a fresh scene starts
  static hour = 8; // current time of day in [0, 24)
  static day = 1; // day counter, 1-based
  static daysPerSeason = 7; // in-game days per season; the four-season "year" is 4× this

  // four seasons in cycle order; a literal (no class self-reference — static-field quirk). Season is
  // a pure derivation of `day`, like phase() of hour.
  static _SEASONS = [
    { id: "spring", name: "RPG_SEASON_SPRING" },
    { id: "summer", name: "RPG_SEASON_SUMMER" },
    { id: "autumn", name: "RPG_SEASON_AUTUMN" },
    { id: "winter", name: "RPG_SEASON_WINTER" },
  ];

  // Hand-authored day/night overlay keyframes { h, c tint, a alpha }, sorted by hour and wrapping
  // (h:0 == h:24). alpha 0 in full daylight (08:00–17:00) so the pass draws nothing then. A literal
  // (no class self-reference — static-field quirk).
  static _KF = [
    { h: 0, c: "#0b1133", a: 0.6 }, // midnight — deep blue
    { h: 5, c: "#0b1133", a: 0.55 }, // late night
    { h: 6.5, c: "#ff8a3d", a: 0.2 }, // dawn — warm
    { h: 8, c: "#ffffff", a: 0.0 }, // morning — clear
    { h: 17, c: "#ffffff", a: 0.0 }, // afternoon — clear
    { h: 18.5, c: "#ff7a2e", a: 0.22 }, // dusk — warm
    { h: 20, c: "#101a44", a: 0.5 }, // nightfall
    { h: 24, c: "#0b1133", a: 0.6 }, // wraps to midnight
  ];

  // reset to the starting morning of day 1 (scene create())
  static reset() {
    WorldClock.hour = WorldClock.startHour;
    WorldClock.day = 1;
  }

  // advance by `dt` (Time.delta), rolling the day at each midnight. `while` not an empty-for — an
  // empty for-init crashes the GMRT compiler, and a big hitch could cross more than one midnight.
  static update(dt) {
    WorldClock.hour += (24 / WorldClock.dayLength) * dt;
    while (WorldClock.hour >= 24) {
      WorldClock.hour -= 24;
      WorldClock.day += 1;
    }
  }

  // "HH:MM" on a 24-hour clock
  static clockText() {
    const h = Math.floor(WorldClock.hour);
    const m = Math.floor((WorldClock.hour - h) * 60);
    return (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m;
  }

  // coarse phase token (night/dawn/day/dusk) for HUD glyphs / AI hooks
  static phase() {
    const h = WorldClock.hour;
    if (h < 5 || h >= 20) return "night";
    if (h < 8) return "dawn";
    if (h < 17) return "day";
    return "dusk";
  }

  // current season def, derived purely from `day` (each spans daysPerSeason days, cycling forever)
  static season() {
    const i = Math.floor((WorldClock.day - 1) / WorldClock.daysPerSeason) % 4;
    return WorldClock._SEASONS[i];
  }

  // day within the current season, 1-based (the HUD's "Day 3")
  static seasonDay() {
    return ((WorldClock.day - 1) % WorldClock.daysPerSeason) + 1;
  }

  // day/night overlay { color, alpha } for the current hour, lerped between bracketing keyframes.
  // Color.parse/merge from a method is fine — only a static-field self-reference breaks on GMRT.
  static tint() {
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
  }
};
