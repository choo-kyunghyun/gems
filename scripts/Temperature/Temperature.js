// Ambient world temperature for the RPG, in °C. A PURE DERIVATION — no stored state and no
// tick: now() composes the season baseline (WorldClock.season) with a time-of-day swing, so
// it is always read live (like EncumbranceSystem.scale), never simulated. Kept off WorldClock
// so the clock stays the pure temporal authority; the weather + region modifiers (slices #3/#4)
// fold into now() here without touching the clock.
//
// The diurnal swing is a KEYFRAME-LERP table over hour, NOT trig: Math.cos/Math.sin/Math.PI are
// all undefined/garbage on GMRT (see CLAUDE.md), so a cosine day-curve would yield NaN. Same
// bracket-and-lerp shape as WorldClock._KF / tint().
globalThis.Temperature = class Temperature {
  // Season baseline °C, keyed by the season id WorldClock.season() returns.
  static _BASE = { spring: 14, summer: 26, autumn: 12, winter: 0 };

  // Time-of-day delta °C from the season baseline: coldest just before dawn, warmest mid-
  // afternoon. Wraps seamlessly (h:0 and h:24 share a delta). A literal table — no trig.
  static _DIURNAL = [
    { h: 0, d: -4 },
    { h: 5, d: -6 }, // coldest before dawn
    { h: 9, d: -2 },
    { h: 15, d: 5 }, // warmest mid-afternoon
    { h: 19, d: 0 },
    { h: 24, d: -4 }, // wraps to midnight
  ];

  // Current temperature in °C: season baseline + diurnal swing. The weather/region modifiers
  // land here later (Weather.tempMod() + the active climate Zone's data.tempMod).
  static now() {
    return Temperature.seasonBase() + Temperature.diurnal();
  }

  // Season baseline °C for the current day.
  static seasonBase() {
    return Temperature._BASE[WorldClock.season().id];
  }

  // Time-of-day delta °C, interpolated between the two bracketing _DIURNAL keyframes.
  static diurnal() {
    const kf = Temperature._DIURNAL;
    const h = WorldClock.hour;
    let i = 0;
    while (i < kf.length - 2 && h >= kf[i + 1].h) i++;
    const a = kf[i];
    const b = kf[i + 1];
    const t = (h - a.h) / (b.h - a.h);
    return a.d + (b.d - a.d) * t;
  }
};
