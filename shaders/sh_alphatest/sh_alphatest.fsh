// Manual alpha-test discard (GLSL ES).
//
// GMRT's fixed-function alpha test is INERT (see CLAUDE.md) — billboard transparent pixels still
// wrote depth and occluded entities behind them. This shader discards fragments whose TEXEL alpha
// is below u_alphaRef; discarded fragments write NO depth.
//
// Discard on TEXEL alpha (sprite shape), NOT final colour: a dimmed entity (v_vColour.a < 1,
// e.g. a downed companion) stays visible — only empty pixels are cut. u_alphaRef defaults to 0.5
// (crisp cutout; also drops bilinear half-transparent edge texels).
varying vec2 v_vTexcoord;
varying vec4 v_vColour;

uniform float u_alphaRef;

void main() {
  vec4 tex = texture2D(gm_BaseTexture, v_vTexcoord);
  if (tex.a < u_alphaRef) discard;
  gl_FragColor = v_vColour * tex;
}
