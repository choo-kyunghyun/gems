/**
 * On Time.delta, everything — transitions, rain/snow fall, cloud drift — freezes when the game pauses
 * and dilates with Time.scale (the bed fast-forward races the sky). Conditions are a fixed literal
 * table (clear/cloudy/rain/storm/snow), each with a render look + a Kelvin tempMod. A change CROSS-
 * FADES over _fadeTime (lerped by blend()). The active MAP's climate can pin the open sky map-wide
 * (setClimate); the displayed condition is the effective one (climate ?? ambient).
 */
globalThis.Weather = {
  KEY: "weather", // its World.meta key — a data key (a save holds it)
  // built-in conditions by id: { c, a } screen tint, particle/density for RenderWeather, cloud the
  // cloud-shadow coverage for RenderCloudShadow, temp a scale-agnostic Kelvin delta, chroma the
  // sky's factor on the world's colour (chromaMod). A literal — no class self-reference.
  _COND: {
    clear: {
      id: "clear",
      name: "WEATHER_CLEAR",
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
      name: "WEATHER_CLOUDY",
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
      name: "WEATHER_RAIN",
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
      name: "WEATHER_STORM",
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
      name: "WEATHER_SNOW",
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

  /**
   * The sky record — ambient (season-rolled) sky vs. the active map's optional climate; the
   * displayed condition is the effective one (climate ?? ambient), cross-faded into cur/prev/blend
   * by _sync(): `ambient` the season-rolled open-sky condition, `climate` the condition id the
   * active map forces (or null) and `climateTemp` its additive Kelvin offset, `cur`/`prev` the
   * displayed and outgoing conditions, `blend` 1 = settled on cur (eases 0..1 after a change),
   * `timer` real seconds until the next re-roll, `time` cumulative SIM seconds — the clock the
   * weather VISUALS scroll on (see time()). Seeded a settled clear sky; a loaded record needs no
   * _sync(), the next update() re-syncs from it.
   */
  state() {
    return World.record(Weather.KEY, () => ({
      ambient: "clear",
      climate: null,
      climateTemp: 0,
      cur: "clear",
      prev: "clear",
      blend: 1,
      timer: Weather._rollHold(),
      time: 0,
    }));
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
   * The active map's climate, applied on every arrival (ColonyMap._applyClimate): `c` is the
   * level's `meta.climate` — { weather?, tempMod? }, pinning the sky map-wide — or undefined for
   * an open sky. Either way the change cross-fades like a re-roll.
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

  /**
   * season-weighted pick excluding the current ambient (so it changes); for...in over a plain
   * object is GMRT-safe (Map iteration is not — docs/GMRT.md)
   */
  _rollAmbient(w) {
    const weights = Weather._WEIGHTS[WorldClock.season().id];
    let total = 0;
    const ids = [];
    const cum = [];
    for (const id in weights) {
      if (id === w.ambient || weights[id] <= 0) continue;
      total += weights[id];
      ids.push(id);
      cum.push(total);
    }
    if (total <= 0) return w.ambient; // nothing else available — stay
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
    return Weather.state().time;
  },

  current() {
    return Weather._COND[Weather.state().cur];
  }, // target condition (HUD name)
  previous() {
    return Weather._COND[Weather.state().prev];
  }, // outgoing condition (cross-fade)
  blend() {
    return Weather.state().blend;
  }, // 0..1 incoming weight

  /** Blended chroma factor (outgoing → incoming) of the sky — an overcast or snowing sky drains the world's colour a little further (ColonyMap.chroma multiplies it in). */
  chromaMod() {
    const w = Weather.state();
    const p = Weather._COND[w.prev].chroma;
    const c = Weather._COND[w.cur].chroma;
    return p + (c - p) * w.blend;
  },

  /** Blended Kelvin temp delta (outgoing → incoming) + the map's climate offset; folded into Temperature.now(). */
  tempMod() {
    const w = Weather.state();
    const p = Weather._COND[w.prev].temp;
    const c = Weather._COND[w.cur].temp;
    return p + (c - p) * w.blend + w.climateTemp;
  },
};
