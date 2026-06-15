// Ambient world temperature for the RPG, in KELVIN (the canonical unit — use toCelsius/
// toFahrenheit to display). A PURE DERIVATION — no stored state and no tick: now() composes
// the season baseline (WorldClock.season) with a time-of-day swing, so it is always read live
// (like EncumbranceSystem.scale), never simulated. Kept off WorldClock so the clock stays the
// pure temporal authority; the weather + region modifiers (slices #3/#4) fold into now() here.
//
// The diurnal swing is a KEYFRAME-LERP table over hour, NOT trig: Math.cos/Math.sin/Math.PI are
// all undefined/garbage on GMRT (see CLAUDE.md), so a cosine day-curve would yield NaN. Same
// bracket-and-lerp shape as WorldClock._KF / tint().
globalThis.Temperature = class Temperature {
  static ZERO_C = 273.15; // Kelvin at 0 °C — the offset between the Kelvin and Celsius scales

  // Season baseline in °C — authored human-readably (14 °C reads; 287 K does not); now() adds
  // ZERO_C to return Kelvin. The Kelvin and Celsius scales share the same increment, so the
  // _DIURNAL deltas below (and the later weather/region modifiers) are unit-agnostic — no offset.
  static _BASE = { spring: 14, summer: 26, autumn: 12, winter: 0 };

  // Time-of-day delta from the season baseline: coldest just before dawn, warmest mid-afternoon.
  // Wraps seamlessly (h:0 and h:24 share a delta). A literal table — no trig.
  static _DIURNAL = [
    { h: 0, d: -4 },
    { h: 5, d: -6 }, // coldest before dawn
    { h: 9, d: -2 },
    { h: 15, d: 5 }, // warmest mid-afternoon
    { h: 19, d: 0 },
    { h: 24, d: -4 }, // wraps to midnight
  ];

  // Current temperature in KELVIN: ZERO_C offset + season baseline + diurnal swing + the live
  // weather modifier (a scale-agnostic Kelvin delta). The region modifier (the active climate
  // Zone's data.tempMod) folds in here too once slice #4 lands.
  static now() {
    return (
      Temperature.ZERO_C +
      Temperature.seasonBase() +
      Temperature.diurnal() +
      Weather.tempMod()
    );
  }

  // Season baseline in °C for the current day (internal — now() offsets it to Kelvin).
  static seasonBase() {
    return Temperature._BASE[WorldClock.season().id];
  }

  // Time-of-day delta, interpolated between the two bracketing _DIURNAL keyframes.
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

  // Kelvin → Celsius.
  /** @param {number} k @returns {number} */
  static toCelsius(k) {
    return k - Temperature.ZERO_C;
  }

  // Kelvin → Fahrenheit (the "freedom unit").
  /** @param {number} k @returns {number} */
  static toFahrenheit(k) {
    return ((k - Temperature.ZERO_C) * 9) / 5 + 32;
  }
};
