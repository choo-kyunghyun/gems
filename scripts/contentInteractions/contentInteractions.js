// Registers the colony's concrete InteractAction defs — the data behind the generic Interactable engine.
// Called once from content.register(); adding an interaction = one entry here + a prompt key.
/**
 * Two families: WINDOW actions open their page through the scene's Window with the target
 * (`scene.window.open(id, { target })` — so Interactable range-closes it and E closes it); INSTANT
 * actions act once per E press. The survival ones (hydrate/feed/buff) act on
 * the PLAYER (ctx.playerId), not the station — the reference examples of "an interaction that does
 * something to the player, not just open a panel". The entity just carries { kind: <id> }.
 * The NPC pair (talk/trade) carries `prompt: ""`: no pill, the dialogue panel prompts for them. A
 * prompt may also be a function of the run() ctx, for a def whose action depends on the target's
 * state (companion: the wait/follow flip it will make).
 */
globalThis.contentInteractions = {
  registered: false,

  register() {
    if (contentInteractions.registered) return;
    contentInteractions.registered = true;

    InteractAction.register([
      // ── window actions (open a page of the scene's Window over the target entity) ──
      {
        id: "storage",
        prompt: "STORAGE_PROMPT",
        run(ctx) {
          ctx.scene.window.open("storage", { target: ctx.id });
        },
      },
      {
        // lootable body left by a "corpse"-kind Mortal (ColonyCombat._toCorpse) — the standard
        // storage page over the body's Inventory, with takes counted as pickups (the same
        // quest/achievement credit as ground drops; the hook lasts the open — StorageUI)
        id: "corpse",
        prompt: "STORAGE_CORPSE_PROMPT",
        run(ctx) {
          ctx.scene.window.open("storage", {
            target: ctx.id,
            onTake: (itemId, qty) => ctx.scene.onCollect(itemId, qty),
          });
        },
      },
      {
        id: "workbench",
        prompt: "CRAFT_PROMPT",
        run(ctx) {
          ctx.scene.window.open("workbench", { target: ctx.id });
        },
      },
      {
        // travel beacon (prop kind "travel") — a site's departure point: the world map, from which
        // the squad deploys to another site (WorldMapUI.travel → ColonyMap.travel)
        id: "travel",
        prompt: "WORLDMAP_PROMPT",
        run(ctx) {
          ctx.scene.window.open("travel", { target: ctx.id });
        },
      },
      {
        // a merchant NPC (ColonySpawn's `merchant` descriptor): the shop over its own stock
        id: "trade",
        prompt: "",
        run(ctx) {
          ctx.scene.window.open("trade", { target: ctx.id });
        },
      },

      // ── instant actions ──
      {
        // a quest NPC: accept its quest, or turn it in once ready; inert in between (the dialogue
        // panel names this press's action, QUEST_ACCEPT / QUEST_TURNIN, or nothing)
        id: "talk",
        prompt: "",
        run(ctx) {
          const npc = ctx.entities.get(ctx.id, NPC);
          if (npc === undefined) return;
          const qid = npc.questId;
          if (Tracker.isReady(qid)) {
            ctx.scene.completeQuest(qid);
          } else if (!Tracker.isActive(qid) && !Tracker.isDone(qid)) {
            Tracker.accept(qid);
            Log.info(`accepted ${qid}`);
          }
        },
      },
      {
        // built door (woodenDoor prop): toggles passability. Closed = a solid slab (blocks
        // bodies AND pathing — NavGrid rasterizes the kinematic collider live); open = non-solid
        // with the slab swung 80° on its center. State (`open`) + yaw are component data, so a
        // door round-trips map parking/EntitySnapshot as-is.
        id: "door",
        prompt: "BUILD_DOOR_PROMPT",
        run(ctx) {
          const col = ctx.entities.get(ctx.id, Collision);
          const mesh = ctx.entities.get(ctx.id, Mesh);
          if (col === undefined) return;
          if (ctx.comp.open === 1) {
            // refuse to close over a standing body — it would trap it inside the collider
            const box = AABB.of(ctx.entities, ctx.id);
            const ids = Query.inRect(
              ctx.entities,
              box.x1 - 4,
              box.y1 - 4,
              box.x2 + 4,
              box.y2 + 4,
              { has: Collision },
            );
            for (let i = 0; i < ids.length; i++) {
              if (ids[i] === ctx.id) continue;
              const c = ctx.entities.get(ids[i], Collision);
              if (
                c !== undefined &&
                c.solid === true &&
                c.kinematic === false
              ) {
                Toast.push(I18n.text("BUILD_DOOR_BLOCKED"), { type: "info" });
                return;
              }
            }
            ctx.comp.open = 0;
            col.solid = true;
            if (mesh !== undefined) mesh.yaw = (mesh.yaw ?? 0) - 80;
          } else {
            ctx.comp.open = 1;
            col.solid = false;
            if (mesh !== undefined) mesh.yaw = (mesh.yaw ?? 0) + 80;
          }
          // solid flipped in place on a kinematic collider — the id-set fingerprint cannot see it
          SolidSystem.invalidate();
        },
      },
      {
        // Survey Post — founds the player's Settlement over the level (its buildable map). Keeps
        // the "claim" id so existing scene JSON (kind:"claim") is unchanged; the prompt reads as founding.
        id: "claim",
        prompt: "SETTLEMENT_FOUND_PROMPT",
        run(ctx) {
          BuildMode.claim(ctx.scene, ctx.id);
        },
      },
      {
        id: "bed",
        prompt: "SURVIVAL_SLEEP_PROMPT",
        run(ctx) {
          ctx.scene.sleep();
        },
      },
      {
        // a ripe plant (FloraSystem adds the Interaction at ripeness): the yield to the bag,
        // then the plant regrows or goes — one action under two prompts (a crop is picked, a
        // tree felled)
        id: "harvest",
        prompt: "FLORA_HARVEST_PROMPT",
        run(ctx) {
          FloraSystem.harvest(ctx.scene, ctx.id);
        },
      },
      {
        id: "chop",
        prompt: "FLORA_CHOP_PROMPT",
        run(ctx) {
          FloraSystem.harvest(ctx.scene, ctx.id);
        },
      },
      {
        // unhired/kicked companion — talking recruits it into the player's squad
        // (FollowerSystem.hire adds Squad + follow + carry bonus and drops this Interaction)
        id: "rehire",
        prompt: "SQUAD_RECRUIT_PROMPT",
        run(ctx) {
          FollowerSystem.hire(ctx.entities, ctx.playerId, ctx.id);
          ctx.scene.window.dirty = true; // squad roster changed
          Toast.push(I18n.text("SQUAD_HIRED"), { type: "success" });
        },
      },
      {
        // a squad member (FollowerSystem.hire swaps its "rehire" for this): E flips it between
        // following and waiting here; the prompt names the flip. Waiting is map-local — a trip
        // forces every member back to follow (ColonyMap.go). A Downed one is not commandable:
        // no prompt, no-op (it lies where it fell until it recovers). Priority -1: a companion
        // walks at your side, so by proximity it yields to any station you stopped at.
        id: "companion",
        priority: -1,
        prompt(ctx) {
          if (ctx.entities.has(ctx.id, Downed)) return "";
          const f = ctx.entities.get(ctx.id, Follower);
          if (f === undefined) return "";
          return f.state === "follow"
            ? "FOLLOWER_WAIT_PROMPT"
            : "FOLLOWER_FOLLOW_PROMPT";
        },
        run(ctx) {
          if (ctx.entities.has(ctx.id, Downed)) return;
          const f = ctx.entities.get(ctx.id, Follower);
          if (f === undefined) return;
          const toWait = f.state === "follow";
          FollowerSystem.setState(
            ctx.entities,
            ctx.playerId,
            ctx.id,
            toWait ? "wait" : "follow",
          );
          Toast.push(I18n.text(toWait ? "FOLLOWER_WAIT" : "FOLLOWER_FOLLOW"), {
            type: toWait ? "info" : "success",
          });
        },
      },

      // survival stations — act on the player (ctx.playerId). restore() returns false when the need
      // is already satisfied, so a full player gets a "no effect" cue instead of wasting the visit.
      {
        id: "hydrate",
        prompt: "SURVIVAL_DRINK_PROMPT",
        run(ctx) {
          const ok = ThirstSystem.restore(
            ctx.entities,
            ctx.playerId,
            ctx.comp.amount ?? 60,
          );
          Toast.push(I18n.text(ok ? "SURVIVAL_DRINK_DONE" : "SURVIVAL_NO_NEED"), {
            type: ok ? "success" : "info",
          });
        },
      },
      {
        id: "feed",
        prompt: "SURVIVAL_EAT_PROMPT",
        run(ctx) {
          const ok = HungerSystem.restore(
            ctx.entities,
            ctx.playerId,
            ctx.comp.amount ?? 60,
          );
          Toast.push(I18n.text(ok ? "SURVIVAL_EAT_DONE" : "SURVIVAL_NO_NEED"), {
            type: ok ? "success" : "info",
          });
        },
      },
      {
        id: "buff",
        prompt: "SURVIVAL_PRAY_PROMPT",
        run(ctx) {
          StatusSystem.apply(
            ctx.entities,
            ctx.playerId,
            ctx.comp.status ?? "regen",
          );
          Toast.push(I18n.text("SURVIVAL_PRAY_DONE"), { type: "success" });
        },
      },
    ]);
  },
};
