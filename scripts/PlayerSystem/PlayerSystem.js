const DODGE_SECS = 0.42; // s a roll lasts
const DODGE_DIST = 150; // px a roll covers on open ground
const DODGE_REST = 0.15; // s after a roll before the next
const FIRE_CD = 0.13; // s
const ATTACK_ANIM = 0.3; // s — 3 frames @ 10fps
const KICK_ANIM = 0.38; // s — 5 frames @ 13fps, fits the fist's cadence
// for a melee weapon without a `hitbox`
const MELEE_HITBOX = { width: 46, height: 24, xoffset: 23, yoffset: 0 };
const STICK_DEADZONE = 0.25; // drift guard

const THROW_RANGE = 320; // px; the pad's fixed reach along the aim
const THROW_CD = 0.5; // s

// A composed melee profile for the unarmed wielder, so unarmed never fires a free bullet.
// Read-only, shared.
const PLAYER_FIST = {
  kind: "melee",
  damage: 1,
  fireCd: 0.37,
  hitbox: { width: 34, height: 24, xoffset: 17, yoffset: 0 },
};

// The player brain: turns input into every Playable entity's Velocity, Direction, attacks and
// animation state, ahead of the integration of the Velocity it writes; a seated player's input
// works its seat instead. Per-frame state lives in the Playable component, so it travels with the
// player.

globalThis.PlayerSystem = {
  update(level) {
    const entities = level.entities;
    entities.forEach([Playable], (id) => PlayerSystem._drive(level, id));
  },

  _drive(level, id) {
    const entities = level.entities;
    const pl = entities.get(id, Playable);
    let dx =
      (Input.get("moveRight").down() ? 1 : 0) -
      (Input.get("moveLeft").down() ? 1 : 0);
    let dy =
      (Input.get("moveDown").down() ? 1 : 0) -
      (Input.get("moveUp").down() ? 1 : 0);
    // the stick overrides the digital dirs past the deadzone
    const sx = Input.get("moveX").value();
    const sy = Input.get("moveY").value();
    if (
      Math.abs(sx) > STICK_DEADZONE ||
      Math.abs(sy) > STICK_DEADZONE
    ) {
      dx = sx;
      dy = sy;
    }

    const role = Boarding.role(entities, id);
    if (role !== "") {
      PlayerSystem._ride(level, id, pl, role, dx, dy);
      return;
    }

    const vel = entities.get(id, Velocity);
    const dir = entities.get(id, Direction);
    const stats = entities.require(id, Stats);
    const pp = entities.get(id, Position);
    // status and terrain scale apply here, not on Stats.speed, so the derived sheet stays clean
    const scale =
      Effects.scale(entities, id, "speed") *
      PathFollow.speedScale(level.grid, pp.x, pp.y);
    const speed = stats.speed * scale;
    const len = Math.sqrt(dx * dx + dy * dy);

    Endurance.regen(entities, id);
    if (pl.dodge > 0) pl.dodge -= Time.step;
    if (pl.dodgeCd > 0) pl.dodgeCd -= Time.step;
    if (
      Input.get("dodge").pressed() &&
      pl.dodgeCd <= 0 &&
      Endurance.spend(entities, id)
    )
      PlayerSystem._roll(entities, id, pl, dir, dx, dy, len);

    if (pl.dodge > 0) {
      // the roll holds its heading and outruns the walk
      const roll = (DODGE_DIST / DODGE_SECS) * scale;
      vel.x = pl.dodgeX * roll;
      vel.y = pl.dodgeY * roll;
    } else if (len > 0) {
      // a partly-tilted stick walks slower
      const mag = Math.min(len, 1);
      vel.x = (dx / len) * speed * mag;
      vel.y = (dy / len) * speed * mag;
      dir.x = dx / len;
      dir.y = dy / len;
    } else {
      vel.x = 0;
      vel.y = 0;
    }

    // a deflected aim stick overrides the move facing, so the player can strafe
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

    if (Input.get("reload").pressed()) Loadout.reload(entities, id);

    // "play"-only actions read false while another input context owns the keys; a roll holds fire
    if (pl.dodge <= 0 && Input.get("fire").down() && pl.fireCd <= 0) {
      // the live slot, since a gun mutates `rounds`
      const slot = Loadout.weaponSlot(entities, id);
      const wpn =
        slot !== null ? Loadout.composeWeapon(slot) : PLAYER_FIST;
      PlayerSystem._aim(entities.get(id, Position), pl, dir);
      const attack = stats.attack;
      if (wpn === null) {
        // an equipped item with no Weapon component
      } else if (wpn.kind === "gun") {
        const inv = entities.require(id, Inventory);
        PlayerSystem._fireGun(level, id, inv, pl, slot, wpn, dir, attack);
      } else {
        const hitbox = wpn.hitbox !== undefined ? wpn.hitbox : MELEE_HITBOX;
        // an attachment can make it fractional; HP stays integer
        const damage = Math.round(wpn.damage) + attack;
        // face the aim first so the swing lands on the facing side
        Doll.face(entities, id, dir.x, 0.01);
        const facing = entities.get(id, Sprite).xscale;
        Melee.swing(entities, id, facing, hitbox, damage);
        pl.fireCd = wpn.fireCd !== undefined ? wpn.fireCd : FIRE_CD;
        // the fist alternates punch and kick; an armed swing stays the punch
        pl.attackAnim =
          wpn === PLAYER_FIST && pl.attackAnim !== "kick" ? "kick" : "attack";
        pl.attackCd =
          pl.attackAnim === "kick" ? KICK_ANIM : ATTACK_ANIM;
      }
    }

    // shares fireCd so a throw never overlaps a shot
    if (pl.toss !== "" && pl.fireCd <= 0 && pl.dodge <= 0)
      PlayerSystem._toss(entities, id, pl, dir);

    // attackCd is read live, never cached (docs/GMRT.md)
    let state = "idle";
    if (pl.dodge > 0) state = "dodge";
    else if (pl.attackCd > 0) state = pl.attackAnim === "kick" ? "kick" : "attack";
    else if (len > 0) state = "walk";
    Doll.setState(entities, id, state);

    Doll.face(entities, id, pl.dodge > 0 ? pl.dodgeX : dir.x, 0.01);
  },

  /**
   * Start a roll along the move input, else along the facing; it cancels a swing in progress.
   */
  _roll(entities, id, pl, dir, dx, dy, len) {
    let hx = len > 0 ? dx / len : dir.x;
    let hy = len > 0 ? dy / len : dir.y;
    const hl = Math.sqrt(hx * hx + hy * hy);
    if (hl > 0) {
      hx /= hl;
      hy /= hl;
    } else {
      hx = entities.get(id, Sprite).xscale < 0 ? -1 : 1;
      hy = 0;
    }
    pl.dodge = DODGE_SECS;
    pl.dodgeCd = DODGE_SECS + DODGE_REST;
    pl.dodgeX = hx;
    pl.dodgeY = hy;
    pl.attackCd = 0;
  },

  /** Whether `id` is mid-roll, where no hit lands. */
  evading(entities, id) {
    const pl = entities.get(id, Playable);
    return pl !== undefined && pl.dodge > 0;
  },

  /**
   * A seated player: the stick steers a "drive" seat's vehicle, and the trigger fires the gun a
   * "gun" seat's carrier holds at the aim, armed and reloaded from the carrier's own bag. The
   * body itself stays put and wields nothing.
   */
  _ride(level, id, pl, role, dx, dy) {
    const entities = level.entities;
    const dir = entities.get(id, Direction);
    const carrier = Ride.carrier(entities, id);
    pl.toss = ""; // nothing is thrown from a seat
    pl.dodge = 0; // nor rolled
    Endurance.regen(entities, id);
    if (pl.fireCd > 0) pl.fireCd -= Time.step;
    if (pl.attackCd > 0) pl.attackCd -= Time.step;

    if (role === "drive") {
      const veh = entities.get(carrier, Vehicle);
      if (veh !== undefined) {
        const len = Math.sqrt(dx * dx + dy * dy);
        const k = len > 1 ? 1 / len : 1;
        veh.steerX = dx * k;
        veh.steerY = dy * k;
      }
    } else if (role === "gun") {
      PlayerSystem._aim(entities.get(carrier, Position), pl, dir);
      const slot = Loadout.arm(entities, carrier);
      if (slot !== null) {
        const inv = entities.require(carrier, Inventory);
        if (Input.get("reload").pressed()) Loadout.reloadSlot(inv, slot);
        if (Input.get("fire").down() && pl.fireCd <= 0) {
          const wpn = Loadout.composeWeapon(slot);
          if (wpn !== null && wpn.kind === "gun") {
            const attack = entities.require(id, Stats).attack;
            PlayerSystem._fireGun(level, carrier, inv, pl, slot, wpn, dir, attack);
          }
        }
      }
    }

    Doll.setState(entities, id, pl.attackCd > 0 ? "attack" : "idle");
    Doll.face(entities, id, dir.x, 0.01);
  },

  /**
   * Turn `dir` from `pos` toward the aim: the deflected stick's heading, else the latched cursor —
   * never mouse_x/mouse_y, which are wrong under the pitched camera.
   */
  _aim(pos, pl, dir) {
    const rx = Input.get("aimX").value();
    const ry = Input.get("aimY").value();
    if (Math.abs(rx) > STICK_DEADZONE || Math.abs(ry) > STICK_DEADZONE) {
      const rl = Math.sqrt(rx * rx + ry * ry) || 1;
      dir.x = rx / rl;
      dir.y = ry / rl;
      return;
    }
    const adx = pl.cursorX - pos.x;
    const ady = pl.cursorY - pos.y;
    const adist = Math.sqrt(adx * adx + ady * ady) || 1;
    dir.x = adx / adist;
    dir.y = ady / adist;
  },

  /** Edge-gated, so a held trigger clicks once. */
  _dryClick() {
    if (Input.get("fire").pressed()) Audio.play({ sound: sndGunUncocked });
  },

  /**
   * Spends a round from `slot`, shot from `from`, the entity the gun stands on. A dry gun does not
   * fire and sets no cooldown.
   */
  _fireGun(level, from, inv, pl, slot, wpn, dir, attack) {
    const fired = Gunfire.shoot(level, from, inv, slot, wpn, dir.x, dir.y, attack);
    if (fired === null) return PlayerSystem._dryClick();
    pl.fireCd = fired.fireCd !== undefined ? fired.fireCd : FIRE_CD;
    pl.attackAnim = "attack"; // gun fire plays the punch thrust (reads as recoil), never the kick
    pl.attackCd = ATTACK_ANIM;
  },

  /**
   * Lobs one unit of the readied Throwable at the cursor, clamped to THROW_RANGE, or the full
   * range along the aim while the stick is deflected. A cursor throw turns the player toward its
   * target. A readied item the bag no longer holds is dropped unthrown.
   */
  _toss(entities, id, pl, dir) {
    const item = Item.get(pl.toss);
    pl.toss = "";
    const thr = item !== undefined ? item.getComponent(Throwable) : undefined;
    if (thr === undefined) return;
    if (Bag.remove(entities.require(id, Inventory), item.id, 1) < 1) return;
    const pos = entities.get(id, Position);
    const rx = Input.get("aimX").value();
    const ry = Input.get("aimY").value();
    let tx;
    let ty;
    if (Math.abs(rx) > STICK_DEADZONE || Math.abs(ry) > STICK_DEADZONE) {
      tx = pos.x + dir.x * THROW_RANGE;
      ty = pos.y + dir.y * THROW_RANGE;
    } else {
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
      speed: thr.speed,
      secs: thr.fuse,
      radius: thr.radius,
      damage: thr.damage,
      penetration: thr.penetration,
    });
    pl.fireCd = THROW_CD;
    pl.attackAnim = "attack"; // the punch thrust reads as the throw
    pl.attackCd = ATTACK_ANIM;
  },
};
