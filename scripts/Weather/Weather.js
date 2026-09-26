/**
 * The sky: a season-weighted roll between the registered conditions. This holds the cross-fade,
 * the hold timer and the map's climate pin, never a condition of its own. It runs on sim time, so
 * transitions and weather visuals freeze on pause and dilate with the time scale. The displayed
 * condition is the effective one (climate ?? ambient), and a change cross-fades.
 */
globalThis.Weather = {
  KEY: "weather", // a data key: a save holds it

  _minHold: 25, // real seconds at time scale 1 a condition holds before a re-roll
  _maxHold: 70,
  _fadeTime: 2.5, // seconds

  // ── the condition registry ──
  /**
   * A condition def, keyed by `id`: name (i18n key), { c, a } the screen tint, particle
   * ("none"/"rain"/"snow") + density, cloud the cloud-shadow coverage, temp a Kelvin delta, chroma
   * the sky's factor on the world's colour, weight the per-season roll weight { <season id>: n }
   * (0 = never). The first registered condition is the default a fresh world starts on.
   */
  register(defs) {
    Registry.register(Weather, defs);
  },

  get(id) {
    return Registry.get(Weather, id);
  },

  /**
   * The sky record: `ambient` the season-rolled condition, `climate` the id the active map pins
   * (or null) and `climateTemp` its Kelvin offset, `cur`/`prev` the displayed and outgoing
   * conditions, `blend` 1 = settled on cur, `timer` seconds until the next re-roll, `time`
   * cumulative sim seconds. Seeded settled; a loaded record re-syncs on the next update().
   */
  state() {
    return World.active.of(Weather.KEY, () => {
      const first = Registry.ids(Weather)[0];
      return {
        ambient: first,
        climate: null,
        climateTemp: 0,
        cur: first,
        prev: first,
        blend: 1,
        timer: Weather._rollHold(),
        time: 0,
      };
    });
  },

  update(dt) {
    const w = Weather.state();
    w.time += dt;
    w.timer -= dt;
    if (w.timer <= 0) {
      w.ambient = Weather._rollAmbient(w);
      w.timer = Weather._rollHold();
    }
    Weather._sync(w);
    if (w.blend < 1) {
      w.blend += dt / Weather._fadeTime;
      if (w.blend > 1) w.blend = 1;
    }
  },

  /**
   * The active map's climate, on every arrival: `c` is { weather?, tempMod? }, pinning the sky
   * map-wide, or undefined for an open sky. The change cross-fades like a re-roll.
   */
  setClimate(c) {
    const w = Weather.state();
    const has = c !== undefined && c !== null;
    const id = has ? c.weather : undefined;
    w.climate = id !== undefined && id !== null ? id : null;
    w.climateTemp = has ? (c.tempMod !== undefined ? c.tempMod : 0) : 0;
    Weather._sync(w);
  },

  _sync(w) {
    const eff = w.climate !== null ? w.climate : w.ambient;
    if (eff !== w.cur) {
      w.prev = w.cur;
      w.cur = eff;
      w.blend = 0;
    }
  },

  _rollHold() {
    return (
      Weather._minHold + Math.random() * (Weather._maxHold - Weather._minHold)
    );
  },

  /** Excludes the current ambient, so the sky changes. */
  _rollAmbient(w) {
    const season = Season.now().id;
    const conds = Registry.all(Weather);
    let total = 0;
    const ids = [];
    const cum = [];
    for (let i = 0; i < conds.length; i++) {
      const c = conds[i];
      const weight = c.weight[season] ?? 0;
      if (c.id === w.ambient || weight <= 0) continue;
      total += weight;
      ids.push(c.id);
      cum.push(total);
    }
    if (total <= 0) return w.ambient;
    const r = Math.random() * total;
    let i = 0;
    while (i < ids.length) {
      if (r < cum[i]) return ids[i];
      i++;
    }
    return ids[ids.length - 1];
  },

  /**
   * Cumulative sim seconds the weather visuals scroll on, so they freeze and dilate with the
   * condition transitions.
   */
  time() {
    return Weather.state().time;
  },

  /** The incoming condition. */
  current() {
    return Weather.get(Weather.state().cur);
  },

  /** The outgoing condition. */
  previous() {
    return Weather.get(Weather.state().prev);
  },

  /** 0..1 incoming weight */
  blend() {
    return Weather.state().blend;
  },

  /** The sky's blended factor on the world's colour. */
  chromaMod() {
    const w = Weather.state();
    const p = Weather.get(w.prev).chroma;
    const c = Weather.get(w.cur).chroma;
    return p + (c - p) * w.blend;
  },

  /** Blended Kelvin delta plus the map's climate offset. */
  tempMod() {
    const w = Weather.state();
    const p = Weather.get(w.prev).temp;
    const c = Weather.get(w.cur).temp;
    return p + (c - p) * w.blend + w.climateTemp;
  },
};
