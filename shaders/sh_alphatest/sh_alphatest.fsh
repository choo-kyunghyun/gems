//
// Manual alpha-test discard (GLSL ES).
//
// GMRT's fixed-function alpha test (gpu_set_alphatestref) is unreliable on the runtime, so a
// billboard sprite's fully-transparent pixels still wrote depth and punched a hole through whatever
// was behind them (the 2.5D overlap bug). This shader cuts those pixels out explicitly: discard any
// fragment whose TEXEL alpha is below u_alphaRef. A discarded fragment writes NO depth, so empty
// sprite pixels can't occlude entities behind them.
//
// Discarding on the TEXEL alpha (the sprite's shape), NOT the final colour, keeps a dimmed / tinted
// entity (v_vColour.a < 1, e.g. a downed companion) fully visible — only the shape is cut. The
// output is still v_vColour * tex so colour + dim apply. u_alphaRef defaults to 0.5 (a crisp cutout
// that also drops the half-transparent texels bilinear filtering produces at sprite edges); the
// caller (RenderBillboard) sets it per draw.
//
varying vec2 v_vTexcoord;
varying vec4 v_vColour;

uniform float u_alphaRef;

void main() {
  vec4 tex = texture2D(gm_BaseTexture, v_vTexcoord);
  if (tex.a < u_alphaRef) discard;
  gl_FragColor = v_vColour * tex;
}
