//
// Day/night overlay — fragment shader. Outputs a flat tint plus a soft vignette that
// deepens the tint toward the screen edges, for a richer dusk/night feel than a flat
// rectangle. No texture sample: the primitive is untextured, so sampling gm_BaseTexture
// would read black (see the manual's "Guide To Using Shaders"); the color is fully
// computed from uniforms + the screen-space gradient.
//
varying vec2 v_clip;

uniform vec3 u_tint; // overlay color, 0..1 RGB
uniform float u_intensity; // base overlay alpha, 0..1
uniform float u_vignette; // extra alpha added toward the corners, 0..1

void main() {
  float d = length(v_clip) * 0.7071; // 0 at center, ~1 at the corners
  float a = clamp(u_intensity + u_vignette * d * d, 0.0, 1.0);
  gl_FragColor = vec4(u_tint, a);
}
