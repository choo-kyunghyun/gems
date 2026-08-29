/**
 * On Time.delta, everything — transitions, rain/snow fall, cloud drift — freezes when the game pauses
 * and dilates with Time.scale (the bed fast-forward races the sky). Conditions are a fixed literal
 * table (clear/cloudy/rain/storm/snow), each with a render look + a Kelvin tempMod. A change CROSS-
 * FADES over _fadeTime (lerped by blend()). The active MAP's climate can pin the open sky map-wide
 * (setClimate); the displayed condition is the effective one (climate ?? ambient).
 */
globalThis.Weather = {
  // built-in conditions by id: { c, a } screen tint, particle/density for RenderWeather, cloud the
  // cloud-shadow coverage for RenderCloudShadow, temp a scale-agnostic Kelvin delta, chroma the
  // sky's factor on the world's colour (chromaMod). A literal — no class self-reference.
  _COND: {
    clear: {
      id: "clear",
      name: "RPG_WX_CLEAR",
      c: "#ffffff",
      a: 0.0,
      particle: "none",
      density: 0,
      cloud: 0.12,
      temp: 0,
      chroma: 1,
    },
    cloudy: {
      id: "cloudy",
      name: "RPG_WX_CLOUDY",
      c: "#9fb0c0",
      a: 0.12,
      particle: "none",
      density: 0,
      cloud: 0.9,
      temp: -2,
      chroma: 0.92,
    },
    rain: {
      id: "rain",
      name: "RPG_WX_RAIN",
      c: "#5b6b80",
      a: 0.26,
      particle: "rain",
      density: 0.6,
      cloud: 0.55,
      temp: -4,
      chroma: 0.85,
    },
    storm: {
      id: "storm",
      name: "RPG_WX_STORM",
      c: "#3a4252",
      a: 0.4,
      particle: "rain",
      density: 1.0,
      cloud: 0.85,
      temp: -6,
      chroma: 0.8,
    },
    snow: {
      id: "snow",
      name: "RPG_WX_SNOW",
      c: "#dfe8f2",
      a: 0.2,
      particle: "snow",
      density: 0.5,
      cloud: 0.45,
      temp: -8,
      chroma: 0.85,
    },
  },

  // per-season transition weights; re-rolls exclude the current condition (so a change changes the weather)
  _WEIGHTS: {
    spring: { clear: 4, cloudy: 3, rain: 3, storm: 1, snow: 0 },
    summer: { clear: 6, cloudy: 2, rain: 2, storm: 2, snow: 0 },
    autumn: { clear: 3, cloudy: 4, rain: 3, storm: 1, snow: 1 },
    winter: { clear: 3, cloudy: 3, rain: 0, storm: 0, snow: 5 },
  },

  _minHold: 25, // a condition holds 25..70 real seconds (at Time.scale 1) before re-roll
  _maxHold: 70,
  _fadeTime: 2.5, // cross-fade seconds when the condition changes

  // ambient (season-rolled) sky vs. the active map's optional climate; the displayed condition is
  // the effective one (climate ?? ambient), cross-faded into _cur/_prev/_blend by _sync()
  _ambient: "clear", // season-rolled open-sky condition
  _climate: null, // condition id the active map's climate forces (or null)
  _climateTemp: 0, // additive Kelvin offset from the active map's climate

  _cur: "clear", // displayed effective condition
  _prev: "clear",
  _blend: 1, // 1 = settled on _cur; eases 0..1 after each change
  _timer: 0, // real seconds until the next re-roll
  _time: 0, // cumulative SIM seconds — the clock the weather VISUALS scroll on (see time())

  /**
   * Flat save state: the whole sky is these eight scalars (see fields above). No _sync() on import —
   * the fields fully define the sky, and the next update() re-syncs from them.
   */
  export() {
    return {
      ambient: Weather._ambient,
      climate: Weather._climate,
      climateTemp: Weather._climateTemp,
      cur: Weather._cur,
      prev: Weather._prev,
      blend: Weather._blend,
      timer: Weather._timer,
      time: Weather._time,
    };
  },

  import(d) {
    if (d === undefined) return;
    Weather._ambient = d.ambient;
    Weather._climate = d.climate;
    Weather._climateTemp = d.climateTemp;
    Weather._cur = d.cur;
    Weather._prev = d.prev;
    Weather._blend = d.blend;
    Weather._timer = d.timer;
    Weather._time = d.time;
  },

  /** reset to a settled clear sky, no map climate (scene create() once) */
  reset() {
    Weather._ambient = "clear";
    Weather._climate = null;
    Weather._climateTemp = 0;
    Weather._cur = "clear";
    Weather._prev = "clear";
    Weather._blend = 1;
    Weather._timer = Weather._rollHold();
    Weather._time = 0;
  },

  update(dt) {
    Weather._time += dt;
    Weather._timer -= dt;
    if (Weather._timer <= 0) {
      Weather._ambient = Weather._rollAmbient();
      Weather._timer = Weather._rollHold();
    }
    Weather._sync();
    if (Weather._blend < 1) {
      Weather._blend += dt / Weather._fadeTime;
      if (Weather._blend > 1) Weather._blend = 1;
    }
  },

  /**
   * The active map's climate, applied on every arrival (ColonyMap._applyClimate): `c` is the
   * level's `meta.climate` — { weather?, tempMod? }, pinning the sky map-wide — or undefined for
   * an open sky. Either way the change cross-fades like a re-roll.
   */
  setClimate(c) {
    const has = c !== undefined && c !== null;
    const w = has ? c.weather : undefined;
    Weather._climate = w !== undefined && w !== null ? w : null;
    Weather._climateTemp = has ? (c.tempMod !== undefined ? c.tempMod : 0) : 0;
    Weather._sync();
  },

  _sync() {
    const eff =
      Weather._climate !== null ? Weather._climate : Weather._ambient;
    if (eff !== Weather._cur) {
      Weather._prev = Weather._cur;
      Weather._cur = eff;
      Weather._blend = 0;
    }
  },

  _rollHold() {
    return (
      Weather._minHold + Math.random() * (Weather._maxHold - Weather._minHold)
    );
  },

  /**
   * season-weighted pick excluding the current ambient (so it changes); for...in over a plain
   * object is GMRT-safe (Map/Set iteration is not)
   */
  _rollAmbient() {
    const w = Weather._WEIGHTS[WorldClock.season().id];
    let total = 0;
    const ids = [];
    const cum = [];
    for (const id in w) {
      if (id === Weather._ambient || w[id] <= 0) continue;
      total += w[id];
      ids.push(id);
      cum.push(total);
    }
    if (total <= 0) return Weather._ambient; // nothing else available — stay
    const r = Math.random() * total;
    let i = 0;
    while (i < ids.length) {
      if (r < cum[i]) return ids[i];
      i++;
    }
    return ids[ids.length - 1];
  },

  /**
   * cumulative sim-time clock (seconds) the weather visuals scroll on: RenderWeather's particle
   * fall and RenderCloudShadow's drift both multiply speeds by this, so they FREEZE on pause and
   * dilate with Time.scale, matching the condition transitions. A plain method, not a getter —
   * house style, not a runtime dodge.
   */
  time() {
    return Weather._time;
  },

  current() {
    return Weather._COND[Weather._cur];
  }, // target condition (HUD name)
  previous() {
    return Weather._COND[Weather._prev];
  }, // outgoing condition (cross-fade)
  blend() {
    return Weather._blend;
  }, // 0..1 incoming weight

  /** Blended chroma factor (outgoing → incoming) of the sky — an overcast or snowing sky drains the world's colour a little further (ColonyMap.chroma multiplies it in). */
  chromaMod() {
    const p = Weather._COND[Weather._prev].chroma;
    const c = Weather._COND[Weather._cur].chroma;
    return p + (c - p) * Weather._blend;
  },

  /** Blended Kelvin temp delta (outgoing → incoming) + the map's climate offset; folded into Temperature.now(). */
  tempMod() {
    const p = Weather._COND[Weather._prev].temp;
    const c = Weather._COND[Weather._cur].temp;
    return p + (c - p) * Weather._blend + Weather._climateTemp;
  },
};
