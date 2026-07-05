// Mesh lighting, fragment stage: N.L over the baked albedo -- one directional sun + up to
// MAX_LIGHTS point lights (the Light entities RenderMesh gathers each frame).
//
// Composes UNDER RenderLighting's screen-space multiply: this shader DIFFERENTIATES faces
// by direction (tops bright at noon, camera-side faces catch a low sun, torch-facing sides
// pop at night), while the light map keeps owning absolute darkness + the visible glow
// pools. Sun strength goes to 0 at night (WorldClock.sunDir), leaving ambient + points.
varying vec3 v_worldPos;
varying vec3 v_normal;
varying vec4 v_vColour;

#define MAX_LIGHTS 8
// Point-light FILL fraction: this share of a light's attenuated energy applies regardless
// of facing (wrap lighting). Without it a hard N.L zeroes every visible face when the
// light is behind the mesh (approach a rock from the north with the lantern: the south
// face points away, the top sits above the flame height) and the mesh reads as a BLACK
// CUTOUT inside its own glow pool. The fill tracks the light map's omnidirectional pool;
// the remaining (1 - FILL) still differentiates by direction.
#define POINT_FILL 0.4

// Ambient is the COMPLEMENT of the sun (RenderMesh sends 1 - 0.9*sunStrength): 0.55 in full
// daylight (the sun supplies the rest -- tops ~1.0), rising to 1.0 at night so an unlit mesh
// matches the map-lit ground/sprites around it (which have no ambient term of their own) and
// point lights only ever ADD. A constant ambient double-darkened meshes at night -- a dark-
// albedo rock inside a bright lantern pool read as a black cutout.
uniform float u_ambient;
uniform vec4 u_sunDir; // xyz = unit vector TOWARD the sun, w = strength (0 at night)
uniform vec3 u_sunColor; // sun tint (warm at dawn/dusk, white at noon)
uniform float u_lightCount;
uniform vec4 u_lightPos[MAX_LIGHTS]; // xyz world pos (up = -z), w = radius
uniform vec4 u_lightCol[MAX_LIGHTS]; // rgb color, w = intensity (flicker pre-applied)

void main() {
  vec3 n = normalize(v_normal);
  vec3 light = vec3(u_ambient) + u_sunColor * (u_sunDir.w * max(0.0, dot(n, u_sunDir.xyz)));
  for (int i = 0; i < MAX_LIGHTS; i++) {
    if (float(i) >= u_lightCount) break;
    vec3 d = u_lightPos[i].xyz - v_worldPos;
    float dist = max(length(d), 0.001);
    // LINEAR falloff, matching RenderLighting's draw_circle_color glow pool — with a
    // squared falloff the mesh went dark while the pool around it was still bright,
    // reading as a black cutout at mid-radius
    float atten = max(0.0, 1.0 - dist / u_lightPos[i].w);
    float ndl = max(0.0, dot(n, d / dist));
    light += u_lightCol[i].rgb *
      (u_lightCol[i].w * atten * mix(POINT_FILL, 1.0, ndl));
  }
  gl_FragColor = vec4(v_vColour.rgb * light, v_vColour.a);
}
