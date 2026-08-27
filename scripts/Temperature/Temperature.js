// Ambient world temperature in KELVIN (canonical unit — toCelsius/toFahrenheit to display).
/**
 * Read live. Kept off WorldClock so the clock stays the pure temporal authority; weather + map
 * climate modifiers fold into now() here. The diurnal swing is a cosine of the hour.
 */
globalThis.Temperature = {
  ZERO_C: 273.15, // Kelvin at 0 °C — the offset between the Kelvin and Celsius scales

  // Season baseline in °C — authored human-readably; now() adds ZERO_C for Kelvin. Kelvin/Celsius
  // share an increment, so the diurnal/weather/climate deltas are unit-agnostic (no offset).
  _BASE: { spring: 14, summer: 26, autumn: 12, winter: 0 },

  // Time-of-day delta, a cosine of the hour: peak = MEAN + AMP at DIURNAL_PEAK, trough = MEAN − AMP.
  DIURNAL_PEAK: 15, // hour of the daily high
  DIURNAL_MEAN: -0.5, // °C offset at the daily mean
  DIURNAL_AMP: 5.5, // °C half-swing amplitude

  /**
   * Kelvin: ZERO_C + season baseline + diurnal swing + live weather modifier (the active map's
   * climate offset folds in via Weather.tempMod)
   */
  now() {
    return (
      Temperature.ZERO_C +
      Temperature.seasonBase() +
      Temperature.diurnal() +
      Weather.tempMod()
    );
  },

  /** season baseline in °C for the current day (now() offsets it to Kelvin) */
  seasonBase() {
    return Temperature._BASE[WorldClock.season().id];
  },

  diurnal() {
    const h = WorldClock.hour;
    const phase = (2 * Math.PI * (h - Temperature.DIURNAL_PEAK)) / 24;
    return Temperature.DIURNAL_MEAN + Temperature.DIURNAL_AMP * Math.cos(phase);
  },

  toCelsius(k) {
    return k - Temperature.ZERO_C;
  },

  toFahrenheit(k) {
    return ((k - Temperature.ZERO_C) * 9) / 5 + 32;
  },

  /**
   * HUD string in the player's tempUnit Setting ("K"|"C"|"F", default "K"). Owns the unit suffix;
   * the locale fonts carry the ° glyph so °C/°F render.
   */
  display() {
    const k = Temperature.now();
    const unit = Settings.get("tempUnit");
    if (unit === "C") return Math.round(Temperature.toCelsius(k)) + " °C";
    if (unit === "F") return Math.round(Temperature.toFahrenheit(k)) + " °F";
    return Math.round(k) + " K";
  },
};
