// Ambient world temperature for the RPG, in KELVIN (the canonical unit — use toCelsius/
// toFahrenheit to display). A PURE DERIVATION — no stored state and no tick: now() composes
// the season baseline (WorldClock.season) with a time-of-day swing, so it is always read live
// (like EncumbranceSystem.scale), never simulated. Kept off WorldClock so the clock stays the
// pure temporal authority; the weather + region modifiers (slices #3/#4) fold into now() here.
//
// The diurnal swing is a cosine of the hour (trig works on GMRT 0.20; on the dropped 0.19
// Math.cos/Math.PI were undefined/garbage, which forced a keyframe-lerp table here). It peaks
// mid-afternoon and bottoms out ~12h opposite — the textbook daily temperature curve, in one
// expression instead of a table + bracket-lerp.
globalThis.Temperature = class Temperature {
  static ZERO_C = 273.15; // Kelvin at 0 °C — the offset between the Kelvin and Celsius scales

  // Season baseline in °C — authored human-readably (14 °C reads; 287 K does not); now() adds
  // ZERO_C to return Kelvin. The Kelvin and Celsius scales share the same increment, so the
  // _DIURNAL deltas below (and the later weather/region modifiers) are unit-agnostic — no offset.
  static _BASE = { spring: 14, summer: 26, autumn: 12, winter: 0 };

  // Time-of-day delta from the season baseline, as a cosine of the hour: warmest at DIURNAL_PEAK
  // (mid-afternoon), coldest ~12h opposite (before dawn). MEAN is the daily average offset, AMP the
  // half-swing (peak = MEAN + AMP, trough = MEAN − AMP). Wraps seamlessly — cos is periodic.
  static DIURNAL_PEAK = 15; // hour of the daily high
  static DIURNAL_MEAN = -0.5; // °C offset at the daily mean
  static DIURNAL_AMP = 5.5; // °C half-swing amplitude

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

  // Time-of-day delta: a cosine peaking at DIURNAL_PEAK.
  static diurnal() {
    const h = WorldClock.hour;
    const phase = (2 * Math.PI * (h - Temperature.DIURNAL_PEAK)) / 24;
    return Temperature.DIURNAL_MEAN + Temperature.DIURNAL_AMP * Math.cos(phase);
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
