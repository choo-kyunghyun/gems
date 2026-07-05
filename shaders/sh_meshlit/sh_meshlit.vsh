// Mesh lighting, vertex stage: forward world-space position + the face normal PACKED in
// the texcoord by tools/vox-kit/vox2vbuf.py (u = nx, v = ny; nz = -sqrt(1 - u^2 - v^2) --
// valid because the converter never emits a BOTTOM face, so nz <= 0 with up = -z).
// The world matrix on this path is scale + translate only (no rotation), so transforming
// the axis-aligned normal by mat3(world) + renormalizing keeps it exact -- and a negative
// xscale (mirrored model) flips nx correctly.
attribute vec3 in_Position; // (x,y,z)
attribute vec4 in_Colour; // (r,g,b,a) - UNSHADED albedo
attribute vec2 in_TextureCoord; // packed face normal (u = nx, v = ny)

varying vec3 v_worldPos;
varying vec3 v_normal;
varying vec4 v_vColour;

void main() {
  vec4 object_space_pos = vec4(in_Position.x, in_Position.y, in_Position.z, 1.0);
  gl_Position = gm_Matrices[MATRIX_WORLD_VIEW_PROJECTION] * object_space_pos;
  v_worldPos = (gm_Matrices[MATRIX_WORLD] * object_space_pos).xyz;

  float nx = in_TextureCoord.x;
  float ny = in_TextureCoord.y;
  float nz = -sqrt(max(0.0, 1.0 - nx * nx - ny * ny));
  v_normal = normalize(mat3(gm_Matrices[MATRIX_WORLD]) * vec3(nx, ny, nz));
  v_vColour = in_Colour;
}
