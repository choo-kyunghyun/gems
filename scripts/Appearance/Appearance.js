/**
 * Paper-doll layer stack drawn around the entity's Visual (RenderBillboard): `back` layers draw
 * behind the body, `front` over it, every layer at the SAME subimg/transform as the body. The
 * contract that keeps layers in lockstep: every layer sheet mirrors the body sprite's strip
 * layout (frame count/order via AnimState `start` offsets), cell size, and foot anchor — so a
 * layer needs zero animation knowledge and can never desync from the Animator.
 * DERIVED data, rebuilt from Equipment by AppearanceSystem (Game) — never authored per
 * entity, never serialized (a carried sheet re-derives it after EntitySnapshot.apply).
 *
 * @typedef {Object} AppearanceLayer
 * @property {Asset.GMSprite} sprite  same strip layout as the body sprite — UNLESS `anchor`
 *                                    is set: then any single-frame sprite (a held item icon)
 * @property {number} color           layer tint — independent of the body's Visual.color (the
 *                                    SKIN tint); whole-doll effects ride Visual.alpha instead
 * @property {string} [anchor]        ANCHORED variant: draw the sprite (subimg 0) at this named
 *                                    per-frame attachment point of the body sheet (SpriteMeta
 *                                    `anchors`, e.g. "handR" — the held weapon), not at the
 *                                    shared subimg; skipped if the body sheet declares none
 * @property {number} [scale]         anchored only: size relative to the body draw scale
 *
 * @typedef {Object} Appearance
 * @property {AppearanceLayer[]} back   drawn before the body (e.g. backpack)
 * @property {AppearanceLayer[]} front  drawn after the body (armor, then weapon)
 */
globalThis.Appearance = "Appearance";
