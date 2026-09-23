/**
 * The colony's interaction defs.
 *
 * Window actions open a page over the target, so leaving range or pressing again closes it;
 * instant actions act once per press. The survival stations act on the player, not the station.
 * An NPC def carries an empty prompt, since its dialogue prompts instead; a prompt may be a
 * function of the run ctx when the action depends on the target's state.
 */
globalThis.contentInteractions = {
  registered: false,

  /**
   * The view side of a harvest: credit, refresh and toast, or the refusal it names.
   */
  _harvest(ctx) {
    const r = Flora.harvest(ctx.entities, ctx.id, ctx.playerId);
    if (r.qty === 0) {
      if (r.reason !== "") Toast.push(I18n.text(r.reason), { type: "info" });
      return;
    }
    ctx.scene.onCollect(r.itemId, r.qty);
    ctx.scene.window.dirty = true;
    Toast.push(
      I18n.text("FLORA_HARVESTED", r.qty, I18n.text(Item.get(r.itemId).name)),
      { type: "success" },
    );
  },

  register() {
    if (contentInteractions.registered) return;
    contentInteractions.registered = true;

    InteractAction.register([
      {
        id: "storage",
        prompt: "STORAGE_PROMPT",
        run(ctx) {
          ctx.scene.window.open("storage", { target: ctx.id });
        },
      },
      {
        // a lootable body: the storage page, with takes credited as pickups
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
        // a site's departure point: the world map the squad deploys from
        id: "travel",
        prompt: "WORLDMAP_PROMPT",
        run(ctx) {
          ctx.scene.window.open("travel", { target: ctx.id });
        },
      },
      {
        // a merchant NPC: the shop over its own stock
        id: "trade",
        prompt: "",
        run(ctx) {
          ctx.scene.window.open("trade", { target: ctx.id });
        },
      },

      {
        // a quest NPC: accept its quest, or turn it in once ready; inert in between
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
        // a ground drop, credited like corpse looting
        id: "pickup",
        prompt: "INV_PICKUP_PROMPT",
        run(ctx) {
          const r = ColonyCombat.pickup(ctx.entities, ctx.id, ctx.playerId);
          if (r.qty === 0) {
            Toast.push(I18n.text(r.reason), { type: "info" });
            return;
          }
          ctx.scene.onCollect(r.itemId, r.qty);
          ctx.scene.window.dirty = true;
          Toast.push(
            I18n.text("INV_PICKED_UP", r.qty, I18n.text(Item.get(r.itemId).name)),
            { type: "success" },
          );
        },
      },
      {
        id: "door",
        prompt: "BUILD_DOOR_PROMPT",
        run(ctx) {
          const why = Door.toggle(ctx.scene.level, ctx.id);
          if (why !== "") Toast.push(I18n.text(why), { type: "info" });
        },
      },
      {
        // founds the player's settlement over the level; the id stays "claim" for the scene data
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
        // a ripe plant; one action under two prompts (a crop is picked, a tree felled)
        id: "harvest",
        prompt: "FLORA_HARVEST_PROMPT",
        run(ctx) {
          contentInteractions._harvest(ctx);
        },
      },
      {
        id: "chop",
        prompt: "FLORA_CHOP_PROMPT",
        run(ctx) {
          contentInteractions._harvest(ctx);
        },
      },
      {
        // an unhired or dismissed companion
        id: "rehire",
        prompt: "SQUAD_RECRUIT_PROMPT",
        run(ctx) {
          Companions.hire(ctx.entities, ctx.playerId, ctx.id);
          ctx.scene.window.dirty = true;
          Toast.push(I18n.text("SQUAD_HIRED"), { type: "success" });
        },
      },
      {
        // a squad member: flips between following and waiting; one not commandable shows no
        // prompt. Low priority: it walks at your side, so it yields to any station you stop at.
        id: "companion",
        priority: -1,
        prompt(ctx) {
          const next = Companions.next(ctx.entities, ctx.id);
          if (next === "") return "";
          return next === "wait" ? "FOLLOWER_WAIT_PROMPT" : "FOLLOWER_FOLLOW_PROMPT";
        },
        run(ctx) {
          const state = Companions.toggle(ctx.entities, ctx.playerId, ctx.id);
          if (state === "") return;
          Toast.push(I18n.text(state === "wait" ? "FOLLOWER_WAIT" : "FOLLOWER_FOLLOW"), {
            type: state === "wait" ? "info" : "success",
          });
        },
      },

      // survival stations act on the player; a satisfied need gets a "no effect" cue
      {
        id: "hydrate",
        prompt: "SURVIVAL_DRINK_PROMPT",
        run(ctx) {
          const ok = Needs.restore(
            ctx.entities,
            ctx.playerId,
            Thirst,
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
          const ok = Needs.restore(
            ctx.entities,
            ctx.playerId,
            Hunger,
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
          Effects.apply(
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
