// The colony's calendar: a four-season year laid over the world clock's day count.
globalThis.Season = {
  days: 7, // in-game days per season; the year is 4× this
  // in cycle order; a literal, as an initializer can't self-reference
  _ALL: [
    { id: "spring", name: "SEASON_SPRING" },
    { id: "summer", name: "SEASON_SUMMER" },
    { id: "autumn", name: "SEASON_AUTUMN" },
    { id: "winter", name: "SEASON_WINTER" },
  ],

  now() {
    return Season.at(WorldClock.absHours());
  },

  /** The season of an absolute in-game hour — now() of any day, not just today. */
  at(hours) {
    const day = Math.floor(hours / 24) + 1;
    const i = Math.floor((day - 1) / Season.days) % Season._ALL.length;
    return Season._ALL[i];
  },

  /** Today's 1-based day within its season. */
  day() {
    return ((WorldClock.state().day - 1) % Season.days) + 1;
  },
};
