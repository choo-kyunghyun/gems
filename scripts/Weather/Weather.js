/**
 * The sky: a season-weighted roll between the registered CONDITIONS (contentWeather's — this holds
 * the cross-fade, the hold timer and the climate pin, never a condition of its own), on Time.delta
 * so everything — transitions, rain/snow fall, cloud drift — freezes when the game pauses and
 * dilates with Time.scale (the bed fast-forward races the sky). A change CROSS-FADES over _fadeTime
 * (lerped by blend()). The active MAP's climate can pin the open sky map-wide (setClimate); the
 * displayed condition is the effective one (climate ?? ambient).
 */
globalThis.Weather = {
  KEY: "weather", // its World.meta key — a data key (a save holds it)

  _minHold: 25, // a condition holds 25..70 real seconds (at Time.scale 1) before re-roll
  _maxHold: 70,
  _fadeTime: 2.5, // cross-fade seconds when the condition changes

  // ── the condition registry (a Registry facade) ──
  /**
   * A condition def, keyed by `id`: name (i18n key, the HUD's), { c, a } the screen tint,
   * particle ("none"/"rain"/"snow") + density for RenderWeather, cloud the cloud-shadow coverage
   * for RenderCloudShadow, temp a scale-agnostic Kelvin delta, chroma the sky's factor on the
   * world's colour (chromaMod), weight the per-season roll weight { <season id>: n } (0 = never
   * in that season). The FIRST registered condition is the settled default a fresh world starts on.
   */
  register(defs) {
    Registry.register(Weather, defs);
  },

  get(id) {
    return Registry.get(Weather, id);
  },

  /**
   * The sky record — ambient (season-rolled) sky vs. the active map's optional climate; the
   * displayed condition is the effective one (climate ?? ambient), cross-faded into cur/prev/blend
   * by _sync(): `ambient` the season-rolled open-sky condition, `climate` the condition id the
   * active map forces (or null) and `climateTemp` its additive Kelvin offset, `cur`/`prev` the
   * displayed and outgoing conditions, `blend` 1 = settled on cur (eases 0..1 after a change),
   * `timer` real seconds until the next re-roll, `time` cumulative SIM seconds — the clock the
   * weather VISUALS scroll on (see time()). Seeded settled on the first registered condition; a
   * loaded record needs no _sync(), the next update() re-syncs from it.
   */
  state() {
    return World.record(Weather.KEY, () => {
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

  /** season-weighted pick over the registered conditions, excluding the current ambient (so it changes) */
  _rollAmbient(w) {
    const season = WorldClock.season().id;
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

  /** target condition (the HUD's name) */
  current() {
    return Weather.get(Weather.state().cur);
  },

  /** outgoing condition (the cross-fade's other half) */
  previous() {
    return Weather.get(Weather.state().prev);
  },

  /** 0..1 incoming weight */
  blend() {
    return Weather.state().blend;
  },

  /** Blended chroma factor (outgoing → incoming) of the sky — an overcast or snowing sky drains the world's colour a little further (ColonyMap.chroma multiplies it in). */
  chromaMod() {
    const w = Weather.state();
    const p = Weather.get(w.prev).chroma;
    const c = Weather.get(w.cur).chroma;
    return p + (c - p) * w.blend;
  },

  /** Blended Kelvin temp delta (outgoing → incoming) + the map's climate offset; folded into Temperature.now(). */
  tempMod() {
    const w = Weather.state();
    const p = Weather.get(w.prev).temp;
    const c = Weather.get(w.cur).temp;
    return p + (c - p) * w.blend + w.climateTemp;
  },
};
