const MOVE_SPEED = 220; // world px/s (32px-cell scale)
const PLAYER_SCALE = 1.5; // baked size factor over the 32px design cell (bbox + Skeleton)
const SPRINT_MULT = 1.6; // speed multiplier while sprinting (drains Stamina)
const BULLET_SPEED = 600; // world px/s — gun muzzle velocity (feeds kinetic power + hitscan reach)
const SHOT_RANGE_SECS = 1.5; // hitscan reach = velocity × this (s) ≈ the old bullet's 90-tick range
const FIRE_CD = 8; // ticks between shots while held
const ATTACK_ANIM = 18; // ticks the punch pose stays up after a shot/swing (3 frames @ 10fps)
const KICK_ANIM = 23; // ticks the kick plays (5 frames @ 13fps — fits the fist's 22-tick cadence)
const MELEE_REACH = 34; // fallback reach (px) for a melee weapon without `reach`
const STICK_DEADZONE = 0.25; // analog stick magnitude below this reads as centered (drift guard)

// unarmed fallback: a weak melee "fist" so unarmed never means "fire a free bullet". A
// pre-composed melee profile (composeWeapon shape) for a fully unarmed wielder; read-only, shared.
const PLAYER_FIST = { kind: "melee", damage: 1, fireCd: 22, reach: 22 };

// The player brain as an ECS system (the input counterpart of CombatAI): update(entities) drives
// every Playable entity once per tick — it runs at the HEAD of the scene's physics sequence, before
// SolidSystem integrates the Velocity it writes. Per-tick state (fireCd/attackCd + the scene-
// latched world cursor) lives in the Playable component, so it rides the map transfer with the
// player. bindKeys()/unbind() are input LIFECYCLE, not simulation — bound at map boot
// (ColonyMap.build, and SaveGame on a load boot), unbound in sceneColony.destroy().

globalThis.PlayerSystem = {
  /**
   * register the colony keymap + InputContext tags. Split out so a load boot can apply it without
   * going through the new-game path. Idempotent.
   *
   * tags (set by sceneColony each frame): movement live everywhere; fire "play"-only so it self-mutes
   * while building/window (no per-frame BuildMode check); interact opens in play / closes a window;
   * build/follow inert with a window open. See InputContext / inContext.
   */
  bindKeys() {
    const ANYWHERE = ["play", "build", "window"];
    Input.bindAll({
      moveLeft: [INPUT_SOURCE.KEYBOARD, ord("A"), ANYWHERE],
      moveRight: [INPUT_SOURCE.KEYBOARD, ord("D"), ANYWHERE],
      moveUp: [INPUT_SOURCE.KEYBOARD, ord("W"), ANYWHERE],
      moveDown: [INPUT_SOURCE.KEYBOARD, ord("S"), ANYWHERE],
      sprint: [INPUT_SOURCE.KEYBOARD, vk_shift, ANYWHERE], // hold to sprint (drains Stamina)
      fire: [INPUT_SOURCE.MOUSE, mb_left, ["play"]],
      inventory: [INPUT_SOURCE.KEYBOARD, ord("I"), ANYWHERE],
      interact: [INPUT_SOURCE.KEYBOARD, ord("E"), ["play", "window"]],
      build: [INPUT_SOURCE.KEYBOARD, ord("B"), ["play", "build"]],
      follow: [INPUT_SOURCE.KEYBOARD, ord("F"), ["play", "build"]], // toggle companion wait/follow
      reload: [INPUT_SOURCE.KEYBOARD, ord("R"), ["play"]], // top up the equipped gun's magazine
    });

    // gamepad (device 0) added alongside the keyboard bindings (InputAction OR-combines). Twin-stick:
    // left=move, right=aim. Self-mutes while a menu owns nav, so the sticks drive UINav with a window open.
    const GP = INPUT_SOURCE.GAMEPAD;
    Input.get("moveLeft").bindButton(GP, gp_padl);
    Input.get("moveRight").bindButton(GP, gp_padr);
    Input.get("moveUp").bindButton(GP, gp_padu);
    Input.get("moveDown").bindButton(GP, gp_padd);
    Input.get("sprint").bindButton(GP, gp_shoulderl); // LB (hold)
    Input.get("fire").bindButton(GP, gp_shoulderrb); // RT
    Input.get("inventory").bindButton(GP, gp_face4); // Y
    Input.get("interact").bindButton(GP, gp_face1); // A
    Input.get("build").bindButton(GP, gp_face3); // X
    Input.get("follow").bindButton(GP, gp_shoulderr); // RB
    // analog axes: left stick = movement (everywhere), right stick = aim ("play" only)
    Input.register(
      "moveX",
      new InputAction()
        .bindAxis(INPUT_AXIS_MODE.STICK, gp_axislh)
        .inContext(ANYWHERE),
    );
    Input.register(
      "moveY",
      new InputAction()
        .bindAxis(INPUT_AXIS_MODE.STICK, gp_axislv)
        .inContext(ANYWHERE),
    );
    Input.register(
      "aimX",
      new InputAction()
        .bindAxis(INPUT_AXIS_MODE.STICK, gp_axisrh)
        .inContext(["play"]),
    );
    Input.register(
      "aimY",
      new InputAction()
        .bindAxis(INPUT_AXIS_MODE.STICK, gp_axisrv)
        .inContext(["play"]),
    );

    // hotbar number keys 1..N, "play"-only so they self-mute with a window open or building (keyboard
    // only — the gamepad dpad is movement)
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      Input.register(
        "hotbar" + (i + 1),
        new InputAction()
          .bindButton(INPUT_SOURCE.KEYBOARD, ord(String(i + 1)))
          .inContext(["play"]),
      );
    }
  },

  // build the colony player entity (ColonyPlayer.spawn adds Playable + Skeleton with the rest of the
  // sheet) at this genre's tuning. Boot only — a portal arrival transfers the existing player.
  /** Returns the player entity id. */
  spawn(entities, spawn) {
    return ColonyPlayer.spawn(entities, spawn, {
      // 16 design × 1.5 scale = 24 world px — nearer the doll's visual body (a smaller box
      // let the sprite hug walls/mobs deep enough to bury); stays under the 32px cell so
      // 1-cell doorways remain passable
      bbox: { x: -8, y: -8, width: 16, height: 16 },
      dir: { x: 0, y: 1, z: 0 },
      speed: MOVE_SPEED,
      scale: PLAYER_SCALE,
    });
  },

  /**
   * resolve THE player entity live by query (never a stored id — a map transfer can't dangle
   * it); -1 when no Playable entity exists. sceneColony latches it per frame as scene.playerId.
   */
  id(entities) {
    return entities.first(Playable);
  },

  /** once per tick, from the scene's physics sequence: drive every Playable entity */
  update(entities) {
    entities.forEach([Playable], (id) => PlayerSystem._drive(entities, id));
  },

  /** the per-entity brain: read input → write Velocity/Direction, fire, pick the animation state */
  _drive(entities, id) {
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
      (stats !== undefined ? stats.speed : MOVE_SPEED) *
      StatusSystem.scale(entities, id, "speed") *
      PathFollow.speedScale(pp.x, pp.y);
    const len = Math.sqrt(dx * dx + dy * dy);
    // sprint (Shift while moving, drains Stamina); StaminaSystem returns whether the boost applies.
    // BUG: [#15549] do NOT cache `len > 0` in a `moving` boolean local — recompute live.
    const sprinting = StaminaSystem.sprint(
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

    if (pl.fireCd > 0) pl.fireCd--;
    if (pl.attackCd > 0) pl.attackCd--;

    // manual reload (R), "play"-only; no-op on a melee weapon
    if (Input.get("reload").pressed()) EquipmentSystem.reload(entities, id);

    // fire is "play"-only, so it already returns false while building / window open — no guard needed
    if (Input.get("fire").down() && pl.fireCd === 0) {
      // item-driven attack: the equipped weapon's composed profile (or the fist fallback) drives it.
      // Read the live slot (a gun mutates `rounds`) then compose; `wpn.kind` picks melee/gun.
      const slot = EquipmentSystem.weaponSlot(entities, id);
      const wpn =
        slot !== null ? EquipmentSystem.composeWeapon(slot) : PLAYER_FIST;
      // aim: right stick already set `dir` above; for KBM (stick centered) aim at the cursor instead
      const pos = entities.get(id, Position);
      const rx = Input.get("aimX").value();
      const ry = Input.get("aimY").value();
      if (
        Math.abs(rx) <= STICK_DEADZONE &&
        Math.abs(ry) <= STICK_DEADZONE
      ) {
        // scene-latched ground-plane cursor — NOT mouse_x/mouse_y, which are wrong under the
        // pitched matrix camera (see Camera.unproject; sceneColony.step latches Playable.cursorX/Y)
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
        PlayerSystem._fireGun(entities, id, pl, slot, wpn, dir, attack);
      } else {
        const reach = wpn.reach !== undefined ? wpn.reach : MELEE_REACH;
        // round composed damage (a `mul` attachment can make it fractional) so HP stays integer
        const damage = Math.round(wpn.damage) + attack;
        MeleeSystem.swing(entities, id, dir.x, dir.y, reach, damage);
        pl.fireCd =
          wpn.fireCd !== undefined ? Math.round(wpn.fireCd) : FIRE_CD;
        // the unarmed fist fallback alternates punch/kick; an armed swing stays the punch
        // thrust (the held-weapon overlay rides the hand through it)
        pl.attackAnim =
          wpn === PLAYER_FIST && pl.attackAnim !== "kick" ? "kick" : "attack";
        pl.attackCd =
          pl.attackAnim === "kick" ? KICK_ANIM : ATTACK_ANIM;
      }
    }

    // animation tree: attack > walk > idle. attackCd read live off the component (no cached boolean — GMRT clobber)
    let state = "idle";
    if (pl.attackCd > 0) state = pl.attackAnim === "kick" ? "kick" : "attack";
    else if (len > 0) state = "walk";
    ColonyPlayer.setState(entities, id, state);

    // facing: flip toward the last horizontal move, at the aim's fine deadzone
    ColonyPlayer.face(entities, id, dir.x, 0.01);
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
  _fireGun(entities, id, pl, slot, wpn, dir, attack) {
    if (wpn.noAmmo) {
      // no ammo TYPE loaded: reload auto-picks the first compatible round from the bag
      // (reloadSlot); dry-click if none owned. Recompose so this shot uses the round's stats.
      if (EquipmentSystem.reload(entities, id) <= 0)
        return PlayerSystem._dryClick();
      wpn = EquipmentSystem.composeWeapon(slot);
    }
    if (slot.rounds <= 0) {
      // empty clip: auto-reload from reserves; if none, dry-click (no shot, no cooldown)
      if (EquipmentSystem.reload(entities, id) <= 0)
        return PlayerSystem._dryClick();
    }
    if (slot.rounds <= 0) return PlayerSystem._dryClick(); // still empty after the reload attempt

    const speed = wpn.velocity !== undefined ? wpn.velocity : BULLET_SPEED;
    // damage = round's kinetic power + attack. penetration lowers target defense; velocity
    // scales reach (the shot is instant, not travel-based).
    const damage = Math.round(wpn.power) + attack;
    const aim = ColonyPlayer.fireBullet(entities, id, {
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
    ParticleFx.spawnAsset(
      psMuzzle,
      pos.x + aim.nx * 18,
      pos.y + aim.ny * 18,
      ang,
    );
    // gunshot (spatial); the hit plays a hitsound later
    Audio.play({ sound: sndGunFire, position: { x: pos.x, y: pos.y } });

    pl.fireCd = wpn.fireCd !== undefined ? wpn.fireCd : FIRE_CD;
    pl.attackAnim = "attack"; // gun fire plays the punch thrust (reads as recoil), never the kick
    pl.attackCd = ATTACK_ANIM;
  },

  /** drop the keymap (scene destroy) */
  unbind() {
    const keys = [
      "moveLeft",
      "moveRight",
      "moveUp",
      "moveDown",
      "sprint",
      "fire",
      "inventory",
      "interact",
      "build",
      "follow",
      "reload",
      "moveX",
      "moveY",
      "aimX",
      "aimY",
    ];
    for (let i = 0; i < HOTBAR_SIZE; i++) keys.push("hotbar" + (i + 1));
    Input.unbindAll(keys);
  },
};
