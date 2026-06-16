// Point-light component for the 2D light-map renderer (RenderLighting). Attach to any
// entity with Position and it casts a soft radial light (the player's lantern, a torch,
// a glowing drop, a lit window). A string-token component like the rest of the ECS.
//
// usage: world.add(id, Light, { radius: 170, color: make_colour_rgb(255,230,176), intensity: 0.85 })
globalThis.Light = "Light";

/**
 * @typedef {Object} Light
 * @property {number} radius        falloff radius in world px (center bright → 0 at the edge)
 * @property {number} color         GM color int — the light's hue (warm white, torch orange, …)
 * @property {number} [intensity]   0..1 brightness scale (default 1)
 * @property {number} [flicker]     0..1 flicker amplitude (0/omitted = steady; e.g. a torch)
 */
