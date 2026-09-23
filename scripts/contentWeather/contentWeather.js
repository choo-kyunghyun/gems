// Colony sky defs: the conditions the open sky rolls between, each with its look, its Kelvin
// delta and its per-season roll weight. The first is the settled default a fresh world starts on.
// Registered from register(), not at top level (load order — docs/GMRT.md).
globalThis.contentWeather = {
  register() {
    Weather.register([
      {
        id: "clear",
        name: "WEATHER_CLEAR",
        c: "#ffffff",
        a: 0.0,
        particle: "none",
        density: 0,
        cloud: 0.12,
        temp: 0,
        chroma: 1,
        weight: { spring: 4, summer: 6, autumn: 3, winter: 3 },
      },
      {
        id: "cloudy",
        name: "WEATHER_CLOUDY",
        c: "#9fb0c0",
        a: 0.12,
        particle: "none",
        density: 0,
        cloud: 0.9,
        temp: -2,
        chroma: 0.92,
        weight: { spring: 3, summer: 2, autumn: 4, winter: 3 },
      },
      {
        id: "rain",
        name: "WEATHER_RAIN",
        c: "#5b6b80",
        a: 0.26,
        particle: "rain",
        density: 0.6,
        cloud: 0.55,
        temp: -4,
        chroma: 0.85,
        weight: { spring: 3, summer: 2, autumn: 3, winter: 0 },
      },
      {
        id: "storm",
        name: "WEATHER_STORM",
        c: "#3a4252",
        a: 0.4,
        particle: "rain",
        density: 1.0,
        cloud: 0.85,
        temp: -6,
        chroma: 0.8,
        weight: { spring: 1, summer: 2, autumn: 1, winter: 0 },
      },
      {
        id: "snow",
        name: "WEATHER_SNOW",
        c: "#dfe8f2",
        a: 0.2,
        particle: "snow",
        density: 0.5,
        cloud: 0.45,
        temp: -8,
        chroma: 0.85,
        weight: { spring: 0, summer: 0, autumn: 1, winter: 5 },
      },
    ]);
  },
};
