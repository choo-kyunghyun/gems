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
// Albedo CHROMA scale in OKLab — lightness and hue kept, a colour only moves toward its own
// grey — the world's saturation as an atmosphere dial the scene drives per hour, season and
// sky (the demo injects ColonyMap.chroma through RenderMesh's `chroma` provider); 1 = the
// authored colours, and a caller that sets neutral light uniforms sets 1 here too. Applied to
// the ALBEDO before the light multiply, so the sun's warmth, the night blue and the torch
// pools keep their own colour over the calmer ground. Skipped at exactly 1.
uniform float u_chroma;
// WAVE mode (a ground pass whose material flows — water): crest bands computed from the
// world position, drifting on u_time (the SIM clock, so they freeze on pause), painted in
// u_waveColor over the albedo as one more flat tone — no texture, no distortion. u_wave is
// exactly 0 or 1; RenderMesh.setupLights pins 0 so only the pass that asks gets it.
uniform float u_wave;
uniform vec3 u_waveColor;
uniform float u_time;

vec3 toLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}

vec3 toSrgb(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

vec3 chromaScale(vec3 srgb, float k) {
  vec3 c = toLinear(srgb);
  vec3 lms = vec3(
    0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b,
    0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b,
    0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b);
  lms = pow(max(lms, vec3(0.0)), vec3(1.0 / 3.0)); // pow is undefined below 0
  float L = 0.2104542553 * lms.x + 0.7936177850 * lms.y - 0.0040720468 * lms.z;
  float a = (1.9779984951 * lms.x - 2.4285922050 * lms.y + 0.4505937099 * lms.z) * k;
  float b = (0.0259040371 * lms.x + 0.7827717662 * lms.y - 0.8086757660 * lms.z) * k;
  vec3 l = vec3(
    L + 0.3963377774 * a + 0.2158037573 * b,
    L - 0.1055613458 * a - 0.0638541728 * b,
    L - 0.0894841775 * a - 1.2914855480 * b);
  l = l * l * l;
  vec3 lin = vec3(
    4.0767416621 * l.x - 3.3077115913 * l.y + 0.2309699292 * l.z,
    -1.2684380046 * l.x + 2.6097574011 * l.y - 0.3413193965 * l.z,
    -0.0041960863 * l.x - 0.7034186147 * l.y + 1.7076147010 * l.z);
  return toSrgb(clamp(lin, 0.0, 1.0));
}
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
  if (u_wave > 0.5) {
    // one sine along y, its phase warped by a slower one along x: thin crest LINES that
    // drift down-screen and sway, ~1/8 of the surface
    float w = sin(v_worldPos.y * 0.14 + sin(v_worldPos.x * 0.05 + u_time * 0.4) * 2.0 - u_time * 0.7);
    albedo = mix(albedo, u_waveColor, step(0.86, w));
  }
  if (u_chroma < 1.0) albedo = chromaScale(albedo, u_chroma);
  float alpha = v_vColour.a * mix(1.0, tex.a, u_useTex);
  gl_FragColor = vec4(albedo * light, alpha);
}
