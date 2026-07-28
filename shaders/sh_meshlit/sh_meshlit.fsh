// Mesh lighting, fragment stage: N.L over the baked albedo -- one directional sun + up to
// MAX_LIGHTS point lights (the Light entities RenderMesh gathers each frame).
//
// Composes UNDER RenderLighting's screen-space multiply: this shader DIFFERENTIATES faces
// by direction (tops bright at noon, camera-side faces catch a low sun, torch-facing sides
// pop at night), while the light map keeps owning absolute darkness + the visible glow
// pools. Sun strength goes to 0 at night (WorldClock.sunDir), leaving ambient + points.
//
// THE one world shader: every world pass submits through it in vox or textured mode, so
// day/night stays RenderLighting's light map and never becomes a second shader. Rules for
// adding to it (general GameMaker behaviour, not GMRT quirks):
//   * declare each uniform in exactly ONE stage. Declared in both, shader_get_uniform hands
//     back the VERTEX location while this stage reads a default 0 — the symptom is a shader
//     quietly ignoring its flag, not a compile error. Pass vsh->fsh through a varying.
//   * a caller guards with shaders_are_supported() + shader_is_compiled() and keeps a
//     non-shader fallback (the passes' litOk guard).
varying vec3 v_worldPos;
varying vec3 v_normal;
varying vec2 v_texcoord;
varying vec4 v_vColour;

// 0 = vox mode (albedo = vertex colour; texcoord is a packed normal the vsh decoded into
// v_normal), 1 = textured mode (walls / billboards / ground tiles: albedo = gm_BaseTexture
// sample x vertex tint; the normal is u_normal — constant per submit, a UNIT vector in
// world space: walls swap top/south, billboards pass the bent sprite normal, ground passes
// straight up). The texture sample runs in BOTH modes — an untextured vox submit reads
// gm_BaseTexture as black (GMRT), but the mix() throws that sample away at u_useTex = 0, so
// it's harmless; likewise the vsh's normal decode of real UVs is finite garbage this mix
// discards. u_useTex is only ever exactly 0 or 1, so each mix returns an endpoint exactly.
uniform float u_useTex;
uniform vec3 u_normal;
// texel-alpha cutout (billboards / sprite faces; 0 = off — RenderMesh.setupLights pins 0 so
// vox/wall submits never discard). Tested on the TEXEL alpha (the sprite SHAPE), never the
// final v_vColour*tex alpha, so a dimmed/tinted entity stays fully visible — only the shape
// is cut. A discarded fragment writes no depth (GMRT's fixed-function alpha test is inert;
// this replaces the retired sh_alphatest).
uniform float u_alphaRef;

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
  vec3 n = mix(normalize(v_normal), u_normal, u_useTex);
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
  vec4 tex = texture2D(gm_BaseTexture, v_texcoord);
  if (u_alphaRef > 0.0 && tex.a < u_alphaRef) discard;
  vec3 albedo = mix(v_vColour.rgb, v_vColour.rgb * tex.rgb, u_useTex);
  float alpha = v_vColour.a * mix(1.0, tex.a, u_useTex);
  gl_FragColor = vec4(albedo * light, alpha);
}
