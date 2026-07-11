// Mesh lighting, vertex stage. The texcoord has TWO interpretations, selected by the
// FRAGMENT stage's u_useTex (all uniforms live in the fsh — the proven-on-GMRT stage):
// - vox mode: the texcoord is the face normal PACKED by tools/vox-kit/vox2vbuf.py
//   (u = nx, v = ny; nz = -sqrt(1 - u^2 - v^2) — valid because the converter never emits a
//   BOTTOM face, so nz <= 0 with up = -z). The world matrix on this path is scale +
//   OPTIONAL rotation (Mesh.yaw/pitch/roll) + translate: transforming the normal by
//   mat3(world) + renormalizing rotates it with the model (a yawed mesh lights per its
//   world-facing sides) — and a negative xscale (mirrored model) flips nx.
// - textured mode (walls / billboards / ground tiles): the texcoord is REAL UVs — the decode
//   below then produces garbage the fsh mixes away in favor of its u_normal uniform. The
//   1e-6 floor keeps the garbage FINITE: real UVs can hit u^2+v^2 >= 1, and normalize(vec3(0))
//   is NaN — which would survive the fsh mix() (NaN*0 = NaN) and black the fragment.
attribute vec3 in_Position; // (x,y,z)
attribute vec4 in_Colour; // (r,g,b,a) - UNSHADED albedo (vox) or material tint (textured)
attribute vec2 in_TextureCoord; // packed face normal OR real UVs (see fsh u_useTex)

varying vec3 v_worldPos;
varying vec3 v_normal;
varying vec2 v_texcoord;
varying vec4 v_vColour;

void main() {
  vec4 object_space_pos = vec4(in_Position.x, in_Position.y, in_Position.z, 1.0);
  gl_Position = gm_Matrices[MATRIX_WORLD_VIEW_PROJECTION] * object_space_pos;
  v_worldPos = (gm_Matrices[MATRIX_WORLD] * object_space_pos).xyz;

  float nx = in_TextureCoord.x;
  float ny = in_TextureCoord.y;
  float nz = -sqrt(max(1e-6, 1.0 - nx * nx - ny * ny));
  v_normal = normalize(mat3(gm_Matrices[MATRIX_WORLD]) * vec3(nx, ny, nz));
  v_texcoord = in_TextureCoord;
  v_vColour = in_Colour;
}
