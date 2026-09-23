/**
 * Ambient world temperature in kelvin, read live. Kept apart from the clock so the clock stays
 * purely temporal; weather and map climate modifiers fold in here.
 */
globalThis.Temperature = {
  ZERO_C: 273.15,

  // °C for readability; kelvin and Celsius share an increment, so the deltas need no offset.
  _BASE: { spring: 14, summer: 26, autumn: 12, winter: 0 },

  DIURNAL_PEAK: 15, // hour of the daily high
  DIURNAL_MEAN: -0.5, // °C
  DIURNAL_AMP: 5.5, // °C half-swing

  now() {
    return (
      Temperature.ZERO_C +
      Temperature.seasonBase() +
      Temperature.diurnal() +
      Weather.tempMod()
    );
  },

  /** °C */
  seasonBase() {
    return Temperature._BASE[WorldClock.season().id];
  },

  diurnal() {
    const h = WorldClock.state().hour;
    const phase = (2 * Math.PI * (h - Temperature.DIURNAL_PEAK)) / 24;
    return Temperature.DIURNAL_MEAN + Temperature.DIURNAL_AMP * Math.cos(phase);
  },

  toCelsius(k) {
    return k - Temperature.ZERO_C;
  },

  toFahrenheit(k) {
    return ((k - Temperature.ZERO_C) * 9) / 5 + 32;
  },

  display() {
    return Temperature.format(Temperature.now());
  },

  /** A kelvin value as a HUD string in the player's chosen unit, suffix included. */
  format(k) {
    const unit = Settings.get("tempUnit");
    if (unit === "C") return Math.round(Temperature.toCelsius(k)) + " °C";
    if (unit === "F") return Math.round(Temperature.toFahrenheit(k)) + " °F";
    return Math.round(k) + " K";
  },
};
