// In-game world clock for the RPG: a global time-of-day + day counter that every
// time-aware feature (the day/night tint now; future weather/NPC schedules) reads.
// Static like `Time` — there is a single world clock — and advanced once per frame
// from the scene's step() by Time.delta (sim time): it pauses when the game pauses
// (obj_game skips scene.step() while the SystemMenu is open) and dilates with
// Time.scale, exactly like FloatingText. It persists across map changes — the scene
// resets it once in create(), not per map — so walking through a door keeps the hour.
globalThis.WorldClock = class WorldClock {
  static dayLength = 240; // real seconds for one full in-game day (at Time.scale 1)
  static startHour = 8; // morning when a fresh scene starts
  static hour = 8; // current time of day in [0, 24)
  static day = 1; // day counter, 1-based

  // Day/night overlay keyframes, sorted by hour and wrapping seamlessly (h:0 and h:24
  // share a color/alpha). Each is { h: hour, c: "#rrggbb" tint, a: overlay alpha }.
  // alpha 0 in full daylight (08:00–17:00) so the pass draws nothing then. A literal
  // initializer (no class self-reference), so the static-field quirk doesn't bite.
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

  // Reset to the starting morning of day 1 (scene create()).
  static reset() {
    WorldClock.hour = WorldClock.startHour;
    WorldClock.day = 1;
  }

  // Advance by `dt` real seconds (pass Time.delta): 24h per dayLength seconds, rolling
  // the day counter at each midnight. `while` (not an empty-for) — an empty for-init
  // crashes the GMRT compiler, and a big frame hitch could cross more than one midnight.
  static update(dt) {
    WorldClock.hour += (24 / WorldClock.dayLength) * dt;
    while (WorldClock.hour >= 24) {
      WorldClock.hour -= 24;
      WorldClock.day += 1;
    }
  }

  // "HH:MM" on a 24-hour clock.
  static clockText() {
    const h = Math.floor(WorldClock.hour);
    const m = Math.floor((WorldClock.hour - h) * 60);
    return (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m;
  }

  // Coarse phase token, for HUD glyphs / future AI hooks. Plain thresholds.
  static phase() {
    const h = WorldClock.hour;
    if (h < 5 || h >= 20) return "night";
    if (h < 8) return "dawn";
    if (h < 17) return "day";
    return "dusk";
  }

  // Day/night overlay as { color, alpha } for the current hour, interpolated between
  // the two bracketing keyframes. Color.parse/merge from a method is fine — only a
  // static-field self-reference breaks on GMRT, not referencing the loaded Color class.
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
