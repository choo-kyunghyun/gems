const RPG_MOVE_SPEED = 220;
const RPG_SPRINT_MULT = 1.6; // speed multiplier while sprinting (drains Stamina)
const RPG_BULLET_SPEED = 600;
const RPG_FIRE_CD = 8; // ticks between shots while held
const RPG_ATTACK_ANIM = 12; // ticks the attack pose stays up after a shot
const RPG_MELEE_REACH = 34; // fallback reach for a melee weapon without `reach`
const RPG_STICK_DEADZONE = 0.25; // analog stick magnitude below this reads as centered (drift guard)

// Player input + entity setup for the top-down genre.
// Usage:
//   const ctrl = RpgController.create(world, spawn);  // call once in scene create()
//   RpgController.update(world, ctrl);                 // call each physics tick
//   RpgController.destroy();                           // call in scene destroy()
//
// ctrl = { id, fireCd, attackCd } — hold this on the scene; pass it to update().

globalThis.RpgController = {
  // Register the RPG keymap (keyboard/mouse + gamepad + analog axes) and its InputContext tags.
  // Split out of create() so the scene can RE-APPLY it on resume() after a guest minigame's
  // controller unbinds shared action names (the platformer's destroy() unbinds moveLeft/moveRight,
  // which the RPG also uses). Idempotent — bindAll/register overwrite, so calling it twice is safe.
  //
  // InputContext tags decide which actions are live per context (set by sceneRpg each frame):
  // "play" = free roam, "build" = build mode, "window" = a gameplay window open. Movement stays
  // live everywhere (the player keeps walking with a window open). fire is "play"-only, so it
  // self-mutes while building (LMB places tiles) or with a window open (clicks don't shoot) — no
  // per-frame BuildMode/window check in update(). interact opens in play + closes a station window
  // in "window"; build/follow are inert while a window owns input. See InputContext / inContext.
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
    });

    // Gamepad (device 0), added ALONGSIDE the keyboard/mouse bindings above — InputAction
    // OR-combines buttons and takes the largest-magnitude axis. Twin-stick: left stick = move,
    // right stick = aim. Gameplay gamepad input self-mutes while a menu owns nav
    // (InputAction._gamepadMuted), so the left stick / face buttons drive UINav — not the player —
    // when a window is open.
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
    // Analog stick axes (no keyboard equivalent): left stick drives movement, right stick aim.
    // Tagged like their button siblings — movement everywhere, aim only in "play" (read in fire).
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
  },

  /** @param {{ x: number, y: number }} spawn */
  create(world, spawn) {
    RpgController.bindKeys(); // register the keymap + context tags (re-applied on host resume)

    // The RPG player entity (RpgPlayer.spawn); then this genre's Animator. BBox is centered;
    // faces down; move speed from Stats.
    const id = RpgPlayer.spawn(world, spawn, {
      bbox: { x: -12, y: -12, width: 24, height: 24 },
      dir: { x: 0, y: 1, z: 0 },
      speed: RPG_MOVE_SPEED,
    });
    world.add(id, Animator, {
      graph: {
        idle: {
          sprite: spr_play,
          frames: sprite_get_number(spr_play),
          fps: 6,
          loop: true,
        },
        walk: {
          sprite: spr_choo,
          frames: sprite_get_number(spr_choo),
          fps: 10,
          loop: true,
        },
        attack: {
          sprite: spr_choo,
          frames: sprite_get_number(spr_choo),
          fps: 12,
          loop: false,
        },
      },
      state: "idle",
      frame: 0,
      time: 0,
    });

    // Unarmed fallback weapon: a weak melee "fist" so an attack is ALWAYS item-shaped (a Weapon
    // profile) — being unarmed never means "fire a free bullet". Built here, not at top level
    // (Weapon loads after this script in resource order) nor as a `Weapon` static (a static field
    // initializer can't reference its own class on GMRT). The player still spawns with a real
    // wood_sword equipped (sceneRpg.create); this only governs a fully unarmed wielder.
    return {
      id,
      fireCd: 0,
      attackCd: 0,
      fist: new Weapon({ damage: 1, fireCd: 22, melee: true, reach: 22 }),
    };
  },

  /** @param {{ id: number, fireCd: number, attackCd: number }} ctrl */
  update(world, ctrl) {
    let dx =
      (Input.get("moveRight").down() ? 1 : 0) -
      (Input.get("moveLeft").down() ? 1 : 0);
    let dy =
      (Input.get("moveDown").down() ? 1 : 0) -
      (Input.get("moveUp").down() ? 1 : 0);
    // Analog left stick overrides the digital dirs when pushed past the deadzone. value() returns 0
    // while a menu owns nav (InputAction._gamepadMuted), so the stick can't move the player with a
    // window open — the left stick drives UINav there instead.
    const sx = Input.get("moveX").value();
    const sy = Input.get("moveY").value();
    if (
      Math.abs(sx) > RPG_STICK_DEADZONE ||
      Math.abs(sy) > RPG_STICK_DEADZONE
    ) {
      dx = sx;
      dy = sy;
    }

    const vel = world.get(Velocity, ctrl.id);
    const dir = world.get(Direction, ctrl.id);
    const stats = world.get(Stats, ctrl.id);
    // Status speed multiplier scales the final speed (heavier bag → slower via the "encumbered"
    // status EncumbranceSystem maintains; also any slow/haste status). 1 when no speed status is
    // active. Applied here, not on Stats.speed, so it never disturbs the derived sheet.
    const speed =
      (stats !== undefined ? stats.speed : RPG_MOVE_SPEED) *
      StatusSystem.scale(world, ctrl.id, "speed");
    const len = Math.sqrt(dx * dx + dy * dy);
    // Sprint: hold Shift while moving for a speed boost that drains Stamina; it regenerates
    // when not sprinting. StaminaSystem runs every tick (regen even while idle) and returns
    // whether the boost actually applies — gated on stamina/exhaustion, so it cuts out when empty.
    // NOTE: do NOT cache `len > 0` in a `moving` boolean local — the `&&` below yields a boolean
    // that clobbers such a local on GMRT (the boolean-local clobber quirk), which silently zeroed
    // NON-sprint movement (the expr is false → flips the local false → `if (moving)` skipped).
    // Recompute `len > 0` live at each use instead.
    const sprinting = StaminaSystem.sprint(
      world,
      ctrl.id,
      len > 0 && Input.get("sprint").down(),
    );
    const moveSpeed = speed * (sprinting ? RPG_SPRINT_MULT : 1);
    if (len > 0) {
      // Magnitude clamps to 1, so a partly-tilted analog stick (len < 1) walks proportionally
      // slower while digital input (len >= 1, normalized) is unchanged — keyboard speed identical.
      const mag = Math.min(len, 1);
      vel.x = (dx / len) * moveSpeed * mag;
      vel.y = (dy / len) * moveSpeed * mag;
      dir.x = dx / len;
      dir.y = dy / len;
    } else {
      vel.x = 0;
      vel.y = 0;
    }

    // Twin-stick facing: the right stick aims CONTINUOUSLY (every frame, not only when firing) so
    // the character visibly turns toward the aim and you can strafe (move one way, face another).
    // Overrides the movement-derived facing while deflected; KBM cursor aim is resolved at fire time
    // below. value() is 0 while a menu owns nav, so this is inert with a window open.
    const aimX = Input.get("aimX").value();
    const aimY = Input.get("aimY").value();
    if (
      Math.abs(aimX) > RPG_STICK_DEADZONE ||
      Math.abs(aimY) > RPG_STICK_DEADZONE
    ) {
      const al = Math.sqrt(aimX * aimX + aimY * aimY) || 1;
      dir.x = aimX / al;
      dir.y = aimY / al;
    }

    if (ctrl.fireCd > 0) ctrl.fireCd--;
    if (ctrl.attackCd > 0) ctrl.attackCd--;
    // fire is tagged "play"-only, so it already returns false while building or with a
    // window open (InputContext) — no explicit BuildMode/window guard needed here.
    if (Input.get("fire").down() && ctrl.fireCd === 0) {
      // Item-driven attack: the equipped Weapon — or the unarmed fist fallback — fully defines
      // the action (melee swing vs ranged shot + its damage/cadence/reach). The controller no
      // longer hardcodes a bullet; it just runs whatever the item describes. Read live each shot.
      const wpn = EquipmentSystem.weaponProfile(world, ctrl.id) ?? ctrl.fist;
      // Aim drives the swing/shot direction. The right stick already set `dir` continuously above
      // (twin-stick); for keyboard/mouse (stick centered), aim at the cursor instead.
      const pos = world.get(Position, ctrl.id);
      const rx = Input.get("aimX").value();
      const ry = Input.get("aimY").value();
      if (
        Math.abs(rx) <= RPG_STICK_DEADZONE &&
        Math.abs(ry) <= RPG_STICK_DEADZONE
      ) {
        const adx = mouse_x - pos.x;
        const ady = mouse_y - pos.y;
        const adist = Math.sqrt(adx * adx + ady * ady) || 1;
        dir.x = adx / adist;
        dir.y = ady / adist;
      }
      // Damage = the weapon's base + the wielder's attack stat (level-ups + equipment mods), so
      // the character sheet finally feeds combat and weapons aren't inert stat-sticks. `stats`
      // was read above for movement.
      const damage = wpn.damage + (stats !== undefined ? stats.attack : 0);
      if (wpn.melee) {
        const reach = wpn.reach !== undefined ? wpn.reach : RPG_MELEE_REACH;
        MeleeSystem.swing(world, ctrl.id, dir.x, dir.y, reach, damage);
      } else {
        this._fire(world, ctrl, wpn, damage);
      }
      ctrl.fireCd = wpn.fireCd !== undefined ? wpn.fireCd : RPG_FIRE_CD;
      ctrl.attackCd = RPG_ATTACK_ANIM;
    }

    // Animation tree: attack > walk > idle. attackCd is read live off ctrl each
    // use (no cached boolean — see GMRT boolean-local clobber note).
    const anim = world.get(Animator, ctrl.id);
    if (anim !== undefined) {
      let state = "idle";
      if (ctrl.attackCd > 0) state = "attack";
      else if (len > 0) state = "walk";
      AnimationSystem.set(anim, state);
    }

    // Facing: flip horizontally toward the last horizontal move; tint while
    // attacking so the placeholder sprite reads as a distinct state.
    const vis = world.get(Visual, ctrl.id);
    if (vis !== undefined) {
      if (dir.x < -0.01) vis.xscale = -1;
      else if (dir.x > 0.01) vis.xscale = 1;
      vis.color =
        ctrl.attackCd > 0
          ? make_colour_rgb(255, 110, 110)
          : make_colour_rgb(90, 160, 255);
    }
  },

  // Spawns a bullet at the player along the resolved aim Direction. Bullets carry no Collision, so
  // they pass through each other; ProjectileSystem raycasts their path each tick. `wpn` is the
  // resolved weapon profile and `damage` the already-computed (base + attack) value — the caller
  // owns the item-driven resolution; this only reads the projectile speed off the weapon.
  _fire(world, ctrl, wpn, damage) {
    const speed =
      wpn.bulletSpeed !== undefined ? wpn.bulletSpeed : RPG_BULLET_SPEED;

    // dir already holds the resolved aim (right stick or cursor — set in update() before this), so
    // pass it to fireBullet; the bullet flies along the aim, not always the cursor. muzzleY = 0.
    const dir = world.get(Direction, ctrl.id);
    const aim = RpgPlayer.fireBullet(world, ctrl.id, {
      speed,
      damage,
      nx: dir.x,
      ny: dir.y,
    });

    // Muzzle flash at the barrel (player center pushed ~18px along the aim), aimed forward.
    // GM angle (0=right, 90=up) from the aim vector; the ps_muzzle asset emits up (90), so
    // ParticleFx rotates it to face the shot. Ticks/draws in world space (pause-aware).
    const pos = world.get(Position, ctrl.id);
    const ang = point_direction(0, 0, aim.nx, aim.ny);
    ParticleFx.spawnAsset(
      ps_muzzle,
      pos.x + aim.nx * 18,
      pos.y + aim.ny * 18,
      ang,
    );
  },

  destroy() {
    Input.unbindAll([
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
      "moveX",
      "moveY",
      "aimX",
      "aimY",
    ]);
  },
};
