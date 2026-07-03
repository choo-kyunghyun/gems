// Registers the RPG's concrete InteractAction defs — the data behind the generic Interactable
// engine. Two families: WINDOW actions open a UI + set scene._interOpenId (so the engine range-
// closes / refreshes them); INSTANT actions act once per E press. The survival ones (hydrate/feed/
// buff) act on the PLAYER (ctx.playerId), not the station — the reference examples of "an interaction
// that does something to the player, not just open a panel". Called once from RpgContent.register().
// Adding a new interaction = one entry here + a prompt key; the entity just carries { kind: <id> }.
globalThis.RpgInteractions = {
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
        // lootable body left by a "corpse"-kind Mortal (RpgScene._toCorpse) — the standard
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

      // ── instant actions ──
      {
        id: "claim",
        prompt: "CLAIM_PROMPT",
        run(ctx) {
          BuildMode.claim(ctx.scene, ctx.id);
        },
      },
      {
        id: "arcade",
        prompt: "ARCADE_PROMPT",
        run(ctx) {
          ctx.scene._openArcade();
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
          FollowerSystem.hire(ctx.world, ctx.playerId, ctx.id);
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
            ctx.world,
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
            ctx.world,
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
            ctx.world,
            ctx.playerId,
            ctx.comp.status ?? "regen",
          );
          Toast.push(I18n.text("TOAST_BUFF"), { type: "success" });
        },
      },
    ]);
  },
};
