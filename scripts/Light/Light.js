// Point-light component for RenderLighting. On any entity with Position, casts a soft radial light.
// usage: world.add(id, Light, { radius: 170, color: make_colour_rgb(255,230,176), intensity: 0.85 })
/**
 * @typedef {Object} Light
 * @property {number} radius        falloff radius in world px (center bright → 0 at the edge)
 * @property {number} color         GM color int — the light's hue (warm white, torch orange, …)
 * @property {number} [intensity]   0..1 brightness scale (default 1)
 * @property {number} [flicker]     0..1 flicker amplitude (0/omitted = steady; e.g. a torch)
 */
globalThis.Light = "Light";
