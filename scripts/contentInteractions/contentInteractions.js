// Registers the colony's concrete InteractAction defs — the data behind the generic Interactable engine.
// Called once from content.register(); adding an interaction = one entry here + a prompt key.
/**
 * Two families: WINDOW actions open a UI + set scene._interOpenId (so the engine range-closes /
 * refreshes them); INSTANT actions act once per E press. The survival ones (hydrate/feed/buff) act on
 * the PLAYER (ctx.playerId), not the station — the reference examples of "an interaction that does
 * something to the player, not just open a panel". The entity just carries { kind: <id> }.
 */
globalThis.contentInteractions = {
  registered: false,

  register() {
    if (this.registered) return;
    this.registered = true;

    InteractAction.register([
      // ── window actions (open a UI; the engine tracks _interOpenId for range-close + refresh) ──
      {
        id: "storage",
        prompt: "STORAGE_PROMPT",
        run(ctx) {
          ctx.scene._interOpenId = ctx.id;
          StorageUI.open(ctx.scene, ctx.id);
        },
      },
      {
        // lootable body left by a "corpse"-kind Mortal (ColonyCombat._toCorpse) — the standard
        // storage window over the body's Inventory, with takes counted as pickups (the same
        // quest/achievement credit as ground drops; StorageUI.close clears the hook)
        id: "corpse",
        prompt: "CORPSE_PROMPT",
        run(ctx) {
          ctx.scene._interOpenId = ctx.id;
          ctx.scene._storeOnTake = (itemId, qty) =>
            ctx.scene._onCollect(itemId, qty);
          StorageUI.open(ctx.scene, ctx.id);
        },
      },
      {
        id: "workbench",
        prompt: "CRAFT_PROMPT",
        run(ctx) {
          ctx.scene._interOpenId = ctx.id;
          CraftingUI.open(ctx.scene, ctx.id);
        },
      },
      {
        // travel beacon (prop kind "travel") — a site's departure point: the world map, from which
        // the squad deploys to another site (WorldMapUI.travel → ColonyMap.travel)
        id: "travel",
        prompt: "TRAVEL_PROMPT",
        run(ctx) {
          ctx.scene._interOpenId = ctx.id;
          WorldMapUI.open(ctx.scene);
        },
      },

      // ── instant actions ──
      {
        // built door (wooden_door prop): toggles passability. Closed = a solid slab (blocks
        // bodies AND pathing — NavGrid rasterizes the kinematic collider live); open = non-solid
        // with the slab swung 80° on its center. State (`open`) + yaw are component data, so a
        // door round-trips map parking/EntitySnapshot as-is.
        id: "door",
        prompt: "DOOR_PROMPT",
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
              { hasCollision: true },
            );
            for (let i = 0; i < ids.length; i++) {
              if (ids[i] === ctx.id) continue;
              const c = ctx.entities.get(ids[i], Collision);
              if (
                c !== undefined &&
                c.solid === true &&
                c.kinematic === false
              ) {
                Toast.push(I18n.text("DOOR_BLOCKED"), { type: "info" });
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
        // Survey Post — founds the player's Settlement (its buildable land). Keeps the "claim"
        // id so existing scene JSON (kind:"claim") is unchanged; the prompt reads as founding.
        id: "claim",
        prompt: "SETTLEMENT_FOUND_PROMPT",
        run(ctx) {
          BuildMode.claim(ctx.scene, ctx.id);
        },
      },
      {
        id: "bed",
        prompt: "BED_PROMPT",
        run(ctx) {
          ctx.scene._sleep();
        },
      },
      {
        // unhired/kicked companion — talking recruits it into the player's squad
        // (FollowerSystem.hire adds Squad + follow + carry bonus and drops this Interaction)
        id: "rehire",
        prompt: "REHIRE_PROMPT",
        run(ctx) {
          FollowerSystem.hire(ctx.entities, ctx.playerId, ctx.id);
          ctx.scene._invDirty = true; // squad roster changed
          Toast.push(I18n.text("SQUAD_HIRED"), { type: "success" });
        },
      },

      // survival stations — act on the player (ctx.playerId). restore() returns false when the need
      // is already satisfied, so a full player gets a "no effect" cue instead of wasting the visit.
      {
        id: "hydrate",
        prompt: "HYDRATE_PROMPT",
        run(ctx) {
          const ok = ThirstSystem.restore(
            ctx.entities,
            ctx.playerId,
            ctx.comp.amount ?? 60,
          );
          Toast.push(I18n.text(ok ? "TOAST_DRINK" : "TOAST_NO_NEED"), {
            type: ok ? "success" : "info",
          });
        },
      },
      {
        id: "feed",
        prompt: "FEED_PROMPT",
        run(ctx) {
          const ok = HungerSystem.restore(
            ctx.entities,
            ctx.playerId,
            ctx.comp.amount ?? 60,
          );
          Toast.push(I18n.text(ok ? "TOAST_EAT" : "TOAST_NO_NEED"), {
            type: ok ? "success" : "info",
          });
        },
      },
      {
        id: "buff",
        prompt: "BUFF_PROMPT",
        run(ctx) {
          StatusSystem.apply(
            ctx.entities,
            ctx.playerId,
            ctx.comp.status ?? "regen",
          );
          Toast.push(I18n.text("TOAST_BUFF"), { type: "success" });
        },
      },
    ]);
  },
};
