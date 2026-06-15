// Global weather for the RPG — the current sky condition + a season-biased transition, a static
// singleton like WorldClock (one sky). State advances on SIM time (Time.delta from sceneRpg.step,
// so it freezes when the SystemMenu pauses the game and dilates with Time.scale); the visual fall
// of the RenderWeather particles runs on Time.raw (wall-clock). Conditions are a fixed built-in
// set (a literal table, like WorldClock._KF) — clear/cloudy/rain/storm/snow — each carrying its
// render look (tint + particle type/density) and a Kelvin tempMod folded into Temperature.now().
// A change CROSS-FADES over _fadeTime: the render pass + tempMod lerp the outgoing (_prev) and
// incoming (_cur) conditions by blend(), so weather eases in/out instead of snapping. A CLIMATE
// ZONE can override the open sky in a region (enterRegion/exitRegion — a forced condition + a
// temperature offset); the displayed condition is the effective one (override ?? ambient).
globalThis.Weather = class Weather {
  // Built-in conditions, keyed by id. { c, a } is the screen tint; particle/density drive
  // RenderWeather; temp is a Kelvin delta (scale-agnostic). A literal — no class self-reference.
  static _COND = {
    clear: {
      id: "clear",
      name: "RPG_WX_CLEAR",
      c: "#ffffff",
      a: 0.0,
      particle: "none",
      density: 0,
      temp: 0,
    },
    cloudy: {
      id: "cloudy",
      name: "RPG_WX_CLOUDY",
      c: "#9fb0c0",
      a: 0.12,
      particle: "none",
      density: 0,
      temp: -2,
    },
    rain: {
      id: "rain",
      name: "RPG_WX_RAIN",
      c: "#5b6b80",
      a: 0.26,
      particle: "rain",
      density: 0.6,
      temp: -4,
    },
    storm: {
      id: "storm",
      name: "RPG_WX_STORM",
      c: "#3a4252",
      a: 0.4,
      particle: "rain",
      density: 1.0,
      temp: -6,
    },
    snow: {
      id: "snow",
      name: "RPG_WX_SNOW",
      c: "#dfe8f2",
      a: 0.2,
      particle: "snow",
      density: 0.5,
      temp: -8,
    },
  };

  // Per-season relative transition weights over the condition ids. Re-rolls EXCLUDE the current
  // condition (so a change actually changes the weather). Winter favors snow + bans rain; summer
  // favors clear with the odd storm; etc.
  static _WEIGHTS = {
    spring: { clear: 4, cloudy: 3, rain: 3, storm: 1, snow: 0 },
    summer: { clear: 6, cloudy: 2, rain: 2, storm: 2, snow: 0 },
    autumn: { clear: 3, cloudy: 4, rain: 3, storm: 1, snow: 1 },
    winter: { clear: 3, cloudy: 3, rain: 0, storm: 0, snow: 5 },
  };

  static _minHold = 25; // a condition holds 25..70 real seconds (at Time.scale 1) before re-roll
  static _maxHold = 70;
  static _fadeTime = 2.5; // cross-fade seconds when the condition changes

  // Ambient (season-rolled) sky vs. an optional climate-zone override; the DISPLAYED condition is
  // the effective one (override ?? ambient), cross-faded into _cur/_prev/_blend by _sync().
  static _ambient = "clear"; // season-rolled open-sky condition
  static _override = null; // forced condition id from a climate zone (or null)
  static _regionTemp = 0; // additive Kelvin offset from a climate zone

  static _cur = "clear"; // displayed effective condition
  static _prev = "clear";
  static _blend = 1; // 1 = settled on _cur; eases 0..1 after each change
  static _timer = 0; // real seconds until the next re-roll

  // Reset to a settled clear sky, no region override (scene create() once — like WorldClock).
  static reset() {
    Weather._ambient = "clear";
    Weather._override = null;
    Weather._regionTemp = 0;
    Weather._cur = "clear";
    Weather._prev = "clear";
    Weather._blend = 1;
    Weather._timer = Weather._rollHold();
  }

  // Advance by `dt` real seconds (Time.delta): re-roll the ambient sky on hold expiry, recompute
  // the effective (displayed) condition, then ease the cross-fade.
  static update(dt) {
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
  }

  // Climate-zone enter (from sceneRpg): force a condition + a temperature offset while inside.
  static enterRegion(zone) {
    const d = zone.data;
    Weather._override =
      d.weather !== undefined && d.weather !== null ? d.weather : null;
    Weather._regionTemp = d.tempMod !== undefined ? d.tempMod : 0;
    Weather._sync();
  }

  // Climate-zone exit: back to the open-sky ambient weather.
  static exitRegion() {
    Weather._override = null;
    Weather._regionTemp = 0;
    Weather._sync();
  }

  // Recompute the effective condition (override ?? ambient); begin a cross-fade if it changed.
  static _sync() {
    const eff =
      Weather._override !== null ? Weather._override : Weather._ambient;
    if (eff !== Weather._cur) {
      Weather._prev = Weather._cur;
      Weather._cur = eff;
      Weather._blend = 0;
    }
  }

  static _rollHold() {
    return (
      Weather._minHold + Math.random() * (Weather._maxHold - Weather._minHold)
    );
  }

  // Season-weighted pick over the conditions, EXCLUDING the current ambient (so it changes).
  // for...in over a plain object is GMRT-safe (Map/Set iteration is not).
  static _rollAmbient() {
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
  }

  // ── reads for HUD / Temperature / RenderWeather ──
  static current() {
    return Weather._COND[Weather._cur];
  } // target condition (HUD name)
  static previous() {
    return Weather._COND[Weather._prev];
  } // outgoing condition (cross-fade)
  static blend() {
    return Weather._blend;
  } // 0..1 incoming weight

  // Blended Kelvin temperature delta (outgoing → incoming) + the active climate-zone offset.
  // Folded into Temperature.now().
  static tempMod() {
    const p = Weather._COND[Weather._prev].temp;
    const c = Weather._COND[Weather._cur].temp;
    return p + (c - p) * Weather._blend + Weather._regionTemp;
  }
};
