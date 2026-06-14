//
// Day/night overlay — vertex shader. Standard passthrough transform, and it hands the
// fragment shader the clip-space position so it can build a SCREEN-space vignette with
// no texture / UVs (we draw an untextured full-view rectangle — sampling a texture on it
// would read black; see the manual's "Guide To Using Shaders").
//
attribute vec3 in_Position; // (x,y,z)
attribute vec4 in_Colour; // (r,g,b,a)  — unused
attribute vec2 in_TextureCoord; // (u,v)      — unused

varying vec2 v_clip;

void main() {
  vec4 pos =
      gm_Matrices[MATRIX_WORLD_VIEW_PROJECTION] * vec4(in_Position.xyz, 1.0);
  gl_Position = pos;
  v_clip = pos.xy / pos.w; // normalized device coords, -1..1 across the view
}
