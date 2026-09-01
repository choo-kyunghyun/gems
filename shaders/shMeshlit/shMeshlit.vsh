// Mesh lighting, vertex stage. The texcoord has TWO interpretations, selected by the
// FRAGMENT stage's u_useTex (the fsh owns every shared uniform; this stage's only two are
// the sway pair below — vsh uniforms verified live on the pinned runtime):
// - vox mode: the texcoord is the face normal PACKED by Vox (scripts/Vox)
//   (u = nx, v = ny; nz = -sqrt(1 - u^2 - v^2) — valid because Vox never emits a
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

// GRASS SWAY — the vertex stage's ONLY uniforms (the fsh owns the rest; each uniform in
// exactly one stage). u_sway is the level's wind strength: RenderMesh.setupLights pins it 0
// (everything is rigid), RenderGrass raises it for its own submits. u_swayTime is the SIM
// clock (Weather.time — the wave crests' clock), so the field freezes on pause with the rain.
// Displacement is horizontal and proportional to height above ground (-z): the foot stays
// planted, a taller clump swings wider, and the world-position phase makes gusts TRAVEL.
uniform float u_sway;
uniform float u_swayTime;

void main() {
  vec4 object_space_pos = vec4(in_Position.x, in_Position.y, in_Position.z, 1.0);
  if (u_sway > 0.0) {
    float h = max(0.0, -in_Position.z);
    float ph = in_Position.x * 0.11 + in_Position.y * 0.07;
    object_space_pos.x += u_sway * h * 0.22 *
      (sin(u_swayTime * 1.9 + ph) * 0.6 + sin(u_swayTime * 3.1 + ph * 1.7) * 0.4);
  }
  gl_Position = gm_Matrices[MATRIX_WORLD_VIEW_PROJECTION] * object_space_pos;
  v_worldPos = (gm_Matrices[MATRIX_WORLD] * object_space_pos).xyz;

  float nx = in_TextureCoord.x;
  float ny = in_TextureCoord.y;
  float nz = -sqrt(max(1e-6, 1.0 - nx * nx - ny * ny));
  v_normal = normalize(mat3(gm_Matrices[MATRIX_WORLD]) * vec3(nx, ny, nz));
  v_texcoord = in_TextureCoord;
  v_vColour = in_Colour;
}
