/**
 * Paper-doll layer stack drawn around the entity's Visual (RenderBillboard): `back` layers draw
 * behind the body, `front` over it, every layer at the SAME subimg/transform as the body. The
 * contract that keeps layers in lockstep: every layer sheet mirrors the body sprite's strip
 * layout (frame count/order via AnimState `start` offsets), cell size, and foot anchor — so a
 * layer needs zero animation knowledge and can never desync from the Animator.
 * DERIVED data, rebuilt from Equipment by AppearanceSystem (Gameplay) — never authored per
 * entity, never serialized (a carried sheet re-derives it after EntitySnapshot.apply).
 *
 * @typedef {Object} AppearanceLayer
 * @property {Asset.GMSprite} sprite  same strip layout as the body sprite
 * @property {number} color           layer tint — independent of the body's Visual.color (the
 *                                    SKIN tint); whole-doll effects ride Visual.alpha instead
 *
 * @typedef {Object} Appearance
 * @property {AppearanceLayer[]} back   drawn before the body (e.g. backpack)
 * @property {AppearanceLayer[]} front  drawn after the body (armor, then weapon)
 */
globalThis.Appearance = "Appearance";
