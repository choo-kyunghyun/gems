// RPG crafting recipes (Station kind "workbench"). Inputs are pulled from, and the output deposited
// into, the player's bag (CraftSystem). One bench, upgraded by a MODULE slot: `requires` is the
// WorkbenchModule itemId that must be slotted for the recipe to show/craft (undefined = a BASE
// recipe, always available). Registered once by RpgContent.register() at a scene's create() (NOT at
// top level — avoids GMRT load-order issues).
//
// Groups: BASE (no module — basic gear + the four modules themselves, so the bare bench bootstraps
// its own upgrades), FORGE ("forge" — smithing + weapon mods), ALCHEMY ("alembic" — potions/buffs +
// attribute shards), COOKING ("hearth" — drink + foods). The Toolkit ("toolkit") module isn't a
// recipe gate — it switches the bench into the weapon-mod panel (WeaponModUI).
globalThis.RpgRecipes = {
  register() {
    Recipe.register([
      // ── BASE (no module needed) ──────────────────────────────────────────
      {
        id: "craft_wood_sword",
        station: "workbench",
        inputs: [{ itemId: "wood", qty: 3 }],
        output: { itemId: "wood_sword", qty: 1 },
      },
      // The four workbench modules — crafted at the bare bench so it can upgrade itself.
      {
        id: "craft_forge",
        station: "workbench",
        inputs: [
          { itemId: "iron", qty: 4 },
          { itemId: "wood", qty: 2 },
        ],
        output: { itemId: "forge", qty: 1 },
      },
      {
        id: "craft_alembic",
        station: "workbench",
        inputs: [
          { itemId: "iron", qty: 2 },
          { itemId: "gem", qty: 1 },
        ],
        output: { itemId: "alembic", qty: 1 },
      },
      {
        id: "craft_hearth",
        station: "workbench",
        inputs: [
          { itemId: "iron", qty: 2 },
          { itemId: "wood", qty: 4 },
        ],
        output: { itemId: "hearth", qty: 1 },
      },
      {
        id: "craft_toolkit",
        station: "workbench",
        inputs: [
          { itemId: "iron", qty: 3 },
          { itemId: "gem", qty: 1 },
        ],
        output: { itemId: "toolkit", qty: 1 },
      },

      // ── FORGE module — smithing (gear), the gun, ammo + weapon attachments ─
      {
        id: "craft_leather_armor",
        station: "workbench",
        requires: "forge",
        inputs: [{ itemId: "iron", qty: 2 }],
        output: { itemId: "leather_armor", qty: 1 },
      },
      {
        id: "craft_blaster",
        station: "workbench",
        requires: "forge",
        inputs: [
          { itemId: "iron", qty: 4 },
          { itemId: "gem", qty: 1 },
        ],
        output: { itemId: "blaster", qty: 1 },
      },
      // Gun ammo — crafted in batches (consumed per shot). light = cheap iron; heavy/ap need more.
      {
        id: "craft_ammo_light",
        station: "workbench",
        requires: "forge",
        inputs: [{ itemId: "iron", qty: 1 }],
        output: { itemId: "ammo_light", qty: 12 },
      },
      {
        id: "craft_ammo_heavy",
        station: "workbench",
        requires: "forge",
        inputs: [{ itemId: "iron", qty: 2 }],
        output: { itemId: "ammo_heavy", qty: 8 },
      },
      {
        id: "craft_ammo_ap",
        station: "workbench",
        requires: "forge",
        inputs: [
          { itemId: "iron", qty: 2 },
          { itemId: "gem", qty: 1 },
        ],
        output: { itemId: "ammo_ap", qty: 6 },
      },
      // Gun attachments (scope / barrel / magazine / grip / muzzle slots).
      {
        id: "craft_mod_scope",
        station: "workbench",
        requires: "forge",
        inputs: [
          { itemId: "iron", qty: 2 },
          { itemId: "gem", qty: 1 },
        ],
        output: { itemId: "mod_scope", qty: 1 },
      },
      {
        id: "craft_mod_long_barrel",
        station: "workbench",
        requires: "forge",
        inputs: [{ itemId: "iron", qty: 3 }],
        output: { itemId: "mod_long_barrel", qty: 1 },
      },
      {
        id: "craft_mod_extended_mag",
        station: "workbench",
        requires: "forge",
        inputs: [
          { itemId: "iron", qty: 2 },
          { itemId: "wood", qty: 2 },
        ],
        output: { itemId: "mod_extended_mag", qty: 1 },
      },
      {
        id: "craft_mod_grip",
        station: "workbench",
        requires: "forge",
        inputs: [
          { itemId: "iron", qty: 1 },
          { itemId: "wood", qty: 2 },
        ],
        output: { itemId: "mod_grip", qty: 1 },
      },
      {
        id: "craft_mod_suppressor",
        station: "workbench",
        requires: "forge",
        inputs: [
          { itemId: "iron", qty: 2 },
          { itemId: "gem", qty: 1 },
        ],
        output: { itemId: "mod_suppressor", qty: 1 },
      },
      // Melee attachments (edge / pommel slots).
      {
        id: "craft_mod_sharp",
        station: "workbench",
        requires: "forge",
        inputs: [{ itemId: "iron", qty: 3 }],
        output: { itemId: "mod_sharp", qty: 1 },
      },
      {
        id: "craft_mod_heavy",
        station: "workbench",
        requires: "forge",
        inputs: [
          { itemId: "iron", qty: 4 },
          { itemId: "gem", qty: 1 },
        ],
        output: { itemId: "mod_heavy", qty: 1 },
      },

      // ── ALCHEMY module — potions, buffs, attribute shards ────────────────
      {
        id: "craft_potion",
        station: "workbench",
        requires: "alembic",
        inputs: [
          { itemId: "rags", qty: 2 },
          { itemId: "wood", qty: 1 },
        ],
        output: { itemId: "potion", qty: 1 },
      },
      // Buff consumables (Buff/Status system): Tonic = Regen, Elixir = Fortify.
      {
        id: "craft_tonic",
        station: "workbench",
        requires: "alembic",
        inputs: [{ itemId: "rags", qty: 3 }],
        output: { itemId: "tonic", qty: 1 },
      },
      {
        id: "craft_elixir",
        station: "workbench",
        requires: "alembic",
        inputs: [
          { itemId: "iron", qty: 2 },
          { itemId: "rags", qty: 2 },
        ],
        output: { itemId: "elixir", qty: 1 },
      },
      // Attribute-boost shards — the crafted, item-driven path to permanent growth (no leveling).
      // Each costs a gem (rare drop) + a themed common material, so growth is gated on gathering.
      {
        id: "craft_power_shard",
        station: "workbench",
        requires: "alembic",
        inputs: [
          { itemId: "gem", qty: 1 },
          { itemId: "iron", qty: 3 },
        ],
        output: { itemId: "power_shard", qty: 1 },
      },
      {
        id: "craft_vitality_shard",
        station: "workbench",
        requires: "alembic",
        inputs: [
          { itemId: "gem", qty: 1 },
          { itemId: "rags", qty: 4 },
        ],
        output: { itemId: "vitality_shard", qty: 1 },
      },
      {
        id: "craft_agility_shard",
        station: "workbench",
        requires: "alembic",
        inputs: [
          { itemId: "gem", qty: 1 },
          { itemId: "wood", qty: 4 },
        ],
        output: { itemId: "agility_shard", qty: 1 },
      },
      {
        id: "craft_endurance_shard",
        station: "workbench",
        requires: "alembic",
        inputs: [
          { itemId: "gem", qty: 1 },
          { itemId: "iron", qty: 2 },
        ],
        output: { itemId: "endurance_shard", qty: 1 },
      },

      // ── COOKING module — drink + foods ───────────────────────────────────
      {
        id: "craft_water_bottle",
        station: "workbench",
        requires: "hearth",
        inputs: [{ itemId: "rags", qty: 1 }],
        output: { itemId: "water_bottle", qty: 1 },
      },
      {
        id: "craft_bread",
        station: "workbench",
        requires: "hearth",
        inputs: [{ itemId: "wood", qty: 2 }],
        output: { itemId: "bread", qty: 1 },
      },
      {
        id: "craft_cooked_meat",
        station: "workbench",
        requires: "hearth",
        inputs: [
          { itemId: "rags", qty: 2 },
          { itemId: "wood", qty: 1 },
        ],
        output: { itemId: "cooked_meat", qty: 1 },
      },
    ]);
  },
};
