const SPRINT_MULT = 1.6; // speed multiplier while sprinting (drains Stamina)
const BULLET_SPEED = 600; // world px/s — gun muzzle velocity (feeds kinetic power + hitscan reach)
const SHOT_RANGE_SECS = 1.5; // hitscan reach = velocity × this (s) ≈ 1.5 s of bullet flight
const FIRE_CD = 0.13; // s between shots while held
const ATTACK_ANIM = 0.3; // s the punch pose stays up after a shot/swing (3 frames @ 10fps)
const KICK_ANIM = 0.38; // s the kick plays (5 frames @ 13fps — fits the fist's 0.37 s cadence)
const MELEE_REACH = 34; // fallback reach (px) for a melee weapon without `reach`
const STICK_DEADZONE = 0.25; // analog stick magnitude below this reads as centered (drift guard)

// grenade (G / LT): a fused charge lobbed at the cursor (Combat.lob)
// TODO: a grenade item (a Throwable capability) gates the throw on the bag; until then it is unlimited
const GRENADE_SPEED = 320; // world px/s — flight speed of the lobbed charge
const GRENADE_FUSE = 1.5; // s from the throw to the blast
const GRENADE_RADIUS = 96; // blast radius (px) — three 32px cells
const GRENADE_DAMAGE = 6; // blast damage at the centre (halves toward the edge)
const THROW_RANGE = 320; // max throw distance (px); the pad's fixed reach along the aim
const THROW_CD = 0.5; // s before the next shot/throw after a throw

// unarmed fallback: a weak melee "fist" so unarmed never means "fire a free bullet". A
// pre-composed melee profile (composeWeapon shape) for a fully unarmed wielder; read-only, shared.
const PLAYER_FIST = { kind: "melee", damage: 1, fireCd: 0.37, reach: 22 };

// The player brain as an ECS system (the input counterpart of CombatAI): update(level) drives
// every Playable entity once per frame — it runs at the HEAD of the scene's physics sequence, before
// SolidSystem integrates the Velocity it writes. Per-frame state (fireCd/attackCd + the scene-
// latched world cursor) lives in the Playable component, so it rides the map transfer with the
// player. The keymap it reads is ColonyKeymap's (bound at boot); the player entity and its tuning
// are ColonyPlayer's.

globalThis.PlayerSystem = {
  /** once per tick, from the scene's physics sequence: drive every Playable entity */
  update(level) {
    const entities = level.entities;
    entities.forEach([Playable], (id) => PlayerSystem._drive(level, id));
  },

  /** the per-entity brain: read input → write Velocity/Direction, fire, pick the animation state */
  _drive(level, id) {
    const entities = level.entities;
    const pl = entities.get(id, Playable);
    let dx =
      (Input.get("moveRight").down() ? 1 : 0) -
      (Input.get("moveLeft").down() ? 1 : 0);
    let dy =
      (Input.get("moveDown").down() ? 1 : 0) -
      (Input.get("moveUp").down() ? 1 : 0);
    // analog left stick overrides digital dirs past the deadzone (value() is 0 while a menu owns nav)
    const sx = Input.get("moveX").value();
    const sy = Input.get("moveY").value();
    if (
      Math.abs(sx) > STICK_DEADZONE ||
      Math.abs(sy) > STICK_DEADZONE
    ) {
      dx = sx;
      dy = sy;
    }

    const vel = entities.get(id, Velocity);
    const dir = entities.get(id, Direction);
    const stats = entities.get(id, Stats);
    const pp = entities.get(id, Position);
    // status speed multiplier (encumbrance/slow/haste) × terrain movement cost (wading/mud slow —
    // PathFollow.speedScale); applied here, not on Stats.speed, so it never disturbs the derived sheet
    const speed =
      (stats !== undefined ? stats.speed : ColonyPlayer.TUNING.speed) *
      Effects.scale(entities, id, "speed") *
      PathFollow.speedScale(level.grid, pp.x, pp.y);
    const len = Math.sqrt(dx * dx + dy * dy);
    // sprint (Shift while moving, drains Stamina); Endurance returns whether the boost applies.
    // BUG: [#15549] do NOT cache `len > 0` in a `moving` boolean local — recompute live.
    const sprinting = Endurance.sprint(
      entities,
      id,
      len > 0 && Input.get("sprint").down(),
    );
    const moveSpeed = speed * (sprinting ? SPRINT_MULT : 1);
    if (len > 0) {
      // clamp magnitude to 1: a partly-tilted stick walks slower; digital input is unchanged
      const mag = Math.min(len, 1);
      vel.x = (dx / len) * moveSpeed * mag;
      vel.y = (dy / len) * moveSpeed * mag;
      dir.x = dx / len;
      dir.y = dy / len;
    } else {
      vel.x = 0;
      vel.y = 0;
    }

    // twin-stick facing: right stick aims continuously (enables strafing), overriding the move-derived
    // facing while deflected; KBM cursor aim resolved at fire time below
    const aimX = Input.get("aimX").value();
    const aimY = Input.get("aimY").value();
    if (
      Math.abs(aimX) > STICK_DEADZONE ||
      Math.abs(aimY) > STICK_DEADZONE
    ) {
      const al = Math.sqrt(aimX * aimX + aimY * aimY) || 1;
      dir.x = aimX / al;
      dir.y = aimY / al;
    }

    if (pl.fireCd > 0) pl.fireCd -= Time.step;
    if (pl.attackCd > 0) pl.attackCd -= Time.step;

    // manual reload (R), "play"-only; no-op on a melee weapon
    if (Input.get("reload").pressed()) Loadout.reload(entities, id);

    // fire is "play"-only, so it already returns false while building / window open — no guard needed
    if (Input.get("fire").down() && pl.fireCd <= 0) {
      // item-driven attack: the equipped weapon's composed profile (or the fist fallback) drives it.
      // Read the live slot (a gun mutates `rounds`) then compose; `wpn.kind` picks melee/gun.
      const slot = Loadout.weaponSlot(entities, id);
      const wpn =
        slot !== null ? Loadout.composeWeapon(slot) : PLAYER_FIST;
      // aim: right stick already set `dir` above; for KBM (stick centered) aim at the cursor instead
      const pos = entities.get(id, Position);
      const rx = Input.get("aimX").value();
      const ry = Input.get("aimY").value();
      if (
        Math.abs(rx) <= STICK_DEADZONE &&
        Math.abs(ry) <= STICK_DEADZONE
      ) {
        // scene-latched AIM point — the body the cursor covers, else the aim plane, and NOT
        // mouse_x/mouse_y, which are wrong under the pitched matrix camera (see
        // ColonyPlayer.aim; sceneColony.update latches Playable.cursorX/Y)
        const adx = pl.cursorX - pos.x;
        const ady = pl.cursorY - pos.y;
        const adist = Math.sqrt(adx * adx + ady * ady) || 1;
        dir.x = adx / adist;
        dir.y = ady / adist;
      }
      // the wielder's attack stat adds on top of the weapon's base/kinetic power
      const attack = stats !== undefined ? stats.attack : 0;
      if (wpn === null) {
        // equipped a weapon item with no Weapon component — nothing to do
      } else if (wpn.kind === "gun") {
        PlayerSystem._fireGun(level, id, pl, slot, wpn, dir, attack);
      } else {
        const reach = wpn.reach !== undefined ? wpn.reach : MELEE_REACH;
        // round composed damage (a `mul` attachment can make it fractional) so HP stays integer
        const damage = Math.round(wpn.damage) + attack;
        Melee.swing(entities, id, dir.x, dir.y, reach, damage);
        pl.fireCd = wpn.fireCd !== undefined ? wpn.fireCd : FIRE_CD;
        // the unarmed fist fallback alternates punch/kick; an armed swing stays the punch
        // thrust (the held-weapon overlay rides the hand through it)
        pl.attackAnim =
          wpn === PLAYER_FIST && pl.attackAnim !== "kick" ? "kick" : "attack";
        pl.attackCd =
          pl.attackAnim === "kick" ? KICK_ANIM : ATTACK_ANIM;
      }
    }

    // grenade is "play"-only like fire; shares fireCd so a throw never overlaps a shot
    if (Input.get("grenade").pressed() && pl.fireCd <= 0)
      PlayerSystem._throwGrenade(entities, id, pl, dir);

    // animation tree: attack > walk > idle. attackCd read live off the component (no cached boolean — GMRT clobber)
    let state = "idle";
    if (pl.attackCd > 0) state = pl.attackAnim === "kick" ? "kick" : "attack";
    else if (len > 0) state = "walk";
    Doll.setState(entities, id, state);

    // facing: flip toward the last horizontal move, at the aim's fine deadzone
    Doll.face(entities, id, dir.x, 0.01);
  },

  /**
   * dry-click cue for a gun with no round to fire. Edge-gated: the fire key is held-polled
   * (.down()), so an un-gated cue would repeat every tick while the trigger is held.
   */
  _dryClick() {
    if (Input.get("fire").pressed()) Audio.play({ sound: sndGunUncocked });
  },

  /**
   * fire the equipped gun: spend a round, hitscan along the aim, set cooldown. `wpn` is the composed
   * gun profile; `slot.rounds` is decremented. An empty clip (or a fresh gun with no ammo type
   * chosen) auto-reloads from the bag; a dry gun doesn't fire (no cooldown).
   */
  _fireGun(level, id, pl, slot, wpn, dir, attack) {
    const entities = level.entities;
    if (wpn.noAmmo) {
      // no ammo TYPE loaded: reload auto-picks the first compatible round from the bag
      // (reloadSlot); dry-click if none owned. Recompose so this shot uses the round's stats.
      if (Loadout.reload(entities, id) <= 0)
        return PlayerSystem._dryClick();
      wpn = Loadout.composeWeapon(slot);
    }
    if (slot.rounds <= 0) {
      // empty clip: auto-reload from reserves; if none, dry-click (no shot, no cooldown)
      if (Loadout.reload(entities, id) <= 0)
        return PlayerSystem._dryClick();
    }
    if (slot.rounds <= 0) return PlayerSystem._dryClick(); // still empty after the reload attempt

    const speed = wpn.velocity !== undefined ? wpn.velocity : BULLET_SPEED;
    // damage = round's kinetic power + attack. penetration lowers target defense; velocity
    // scales reach (the shot is instant, not travel-based).
    const damage = Math.round(wpn.power) + attack;
    const aim = ColonyPlayer.fireBullet(level, id, {
      damage,
      penetration: wpn.penetration,
      range: speed * SHOT_RANGE_SECS,
      nx: dir.x,
      ny: dir.y,
    });
    slot.rounds -= 1; // spend the round

    // muzzle flash at the barrel (~18px along the aim); psMuzzle emits up (90°), ParticleFx rotates it to the shot
    const pos = entities.get(id, Position);
    const ang = point_direction(0, 0, aim.nx, aim.ny);
    ParticleFx.burst({
      asset: psMuzzle,
      x: pos.x + aim.nx * 18,
      y: pos.y + aim.ny * 18,
      angle: ang,
    });
    // gunshot (spatial); the hit plays a hitsound later
    Audio.play({ sound: sndGunFire, position: { x: pos.x, y: pos.y } });

    pl.fireCd = wpn.fireCd !== undefined ? wpn.fireCd : FIRE_CD;
    pl.attackAnim = "attack"; // gun fire plays the punch thrust (reads as recoil), never the kick
    pl.attackCd = ATTACK_ANIM;
  },

  /**
   * lob a grenade: at the scene-latched world cursor for KBM (clamped to THROW_RANGE), or
   * THROW_RANGE along the aim while the right stick is deflected (a pad has no cursor). A KBM
   * throw turns the player toward its target, as a shot does.
   */
  _throwGrenade(entities, id, pl, dir) {
    const pos = entities.get(id, Position);
    const rx = Input.get("aimX").value();
    const ry = Input.get("aimY").value();
    let tx;
    let ty;
    if (Math.abs(rx) > STICK_DEADZONE || Math.abs(ry) > STICK_DEADZONE) {
      tx = pos.x + dir.x * THROW_RANGE;
      ty = pos.y + dir.y * THROW_RANGE;
    } else {
      // scene-latched AIM point, as the gun aims (ColonyPlayer.aim)
      const dx = pl.cursorX - pos.x;
      const dy = pl.cursorY - pos.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      const k = d > THROW_RANGE ? THROW_RANGE / d : 1;
      tx = pos.x + dx * k;
      ty = pos.y + dy * k;
      if (d > 0) {
        dir.x = dx / d;
        dir.y = dy / d;
      }
    }
    Combat.lob(entities, id, tx, ty, {
      speed: GRENADE_SPEED,
      secs: GRENADE_FUSE,
      radius: GRENADE_RADIUS,
      damage: GRENADE_DAMAGE,
    });
    pl.fireCd = THROW_CD;
    pl.attackAnim = "attack"; // the punch thrust reads as the throw
    pl.attackCd = ATTACK_ANIM;
  },
};
