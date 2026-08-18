// Colony crafting recipes. `requires` = the WorkbenchModule itemId that must be slotted (undefined =
// base, always available). Registered once at level create() (NOT top-level — GMRT load-order).
/**
 * The Toolkit module isn't a recipe gate — it switches the workbench to the weapon-mod panel
 * (WeaponModUI).
 */
globalThis.contentRecipes = {
  register() {
    Recipe.register([
      // BASE (no module needed)
      {
        id: "craft_lead_pipe",
        station: "workbench",
        inputs: [{ itemId: "wood", qty: 3 }],
        output: { itemId: "lead_pipe", qty: 1 },
      },
      // modules crafted at bare bench so it bootstraps its own upgrades
      {
        id: "craft_machining_module",
        station: "workbench",
        inputs: [
          { itemId: "scrap_metal", qty: 4 },
          { itemId: "wood", qty: 2 },
        ],
        output: { itemId: "machining_module", qty: 1 },
      },
      {
        id: "craft_chem_module",
        station: "workbench",
        inputs: [
          { itemId: "scrap_metal", qty: 2 },
          { itemId: "circuitry", qty: 1 },
        ],
        output: { itemId: "chem_module", qty: 1 },
      },
      {
        id: "craft_cooking_module",
        station: "workbench",
        inputs: [
          { itemId: "scrap_metal", qty: 2 },
          { itemId: "wood", qty: 4 },
        ],
        output: { itemId: "cooking_module", qty: 1 },
      },
      {
        id: "craft_gunsmith_kit",
        station: "workbench",
        inputs: [
          { itemId: "scrap_metal", qty: 3 },
          { itemId: "circuitry", qty: 1 },
        ],
        output: { itemId: "gunsmith_kit", qty: 1 },
      },

      // MACHINING module — gear, gun, ammo, weapon attachments
      {
        id: "craft_armored_vest",
        station: "workbench",
        requires: "machining_module",
        inputs: [{ itemId: "scrap_metal", qty: 2 }],
        output: { itemId: "armored_vest", qty: 1 },
      },
      {
        id: "craft_blaster",
        station: "workbench",
        requires: "machining_module",
        inputs: [
          { itemId: "scrap_metal", qty: 4 },
          { itemId: "circuitry", qty: 1 },
        ],
        output: { itemId: "blaster", qty: 1 },
      },
      // ammo — crafted in batches
      {
        id: "craft_ammo_light",
        station: "workbench",
        requires: "machining_module",
        inputs: [{ itemId: "scrap_metal", qty: 1 }],
        output: { itemId: "ammo_light", qty: 12 },
      },
      {
        id: "craft_ammo_heavy",
        station: "workbench",
        requires: "machining_module",
        inputs: [{ itemId: "scrap_metal", qty: 2 }],
        output: { itemId: "ammo_heavy", qty: 8 },
      },
      {
        id: "craft_ammo_ap",
        station: "workbench",
        requires: "machining_module",
        inputs: [
          { itemId: "scrap_metal", qty: 2 },
          { itemId: "circuitry", qty: 1 },
        ],
        output: { itemId: "ammo_ap", qty: 6 },
      },
      // gun attachments
      {
        id: "craft_mod_scope",
        station: "workbench",
        requires: "machining_module",
        inputs: [
          { itemId: "scrap_metal", qty: 2 },
          { itemId: "circuitry", qty: 1 },
        ],
        output: { itemId: "mod_scope", qty: 1 },
      },
      {
        id: "craft_mod_long_barrel",
        station: "workbench",
        requires: "machining_module",
        inputs: [{ itemId: "scrap_metal", qty: 3 }],
        output: { itemId: "mod_long_barrel", qty: 1 },
      },
      {
        id: "craft_mod_extended_mag",
        station: "workbench",
        requires: "machining_module",
        inputs: [
          { itemId: "scrap_metal", qty: 2 },
          { itemId: "wood", qty: 2 },
        ],
        output: { itemId: "mod_extended_mag", qty: 1 },
      },
      {
        id: "craft_mod_grip",
        station: "workbench",
        requires: "machining_module",
        inputs: [
          { itemId: "scrap_metal", qty: 1 },
          { itemId: "wood", qty: 2 },
        ],
        output: { itemId: "mod_grip", qty: 1 },
      },
      {
        id: "craft_mod_suppressor",
        station: "workbench",
        requires: "machining_module",
        inputs: [
          { itemId: "scrap_metal", qty: 2 },
          { itemId: "circuitry", qty: 1 },
        ],
        output: { itemId: "mod_suppressor", qty: 1 },
      },
      // melee attachments
      {
        id: "craft_mod_sharp",
        station: "workbench",
        requires: "machining_module",
        inputs: [{ itemId: "scrap_metal", qty: 3 }],
        output: { itemId: "mod_sharp", qty: 1 },
      },
      {
        id: "craft_mod_heavy",
        station: "workbench",
        requires: "machining_module",
        inputs: [
          { itemId: "scrap_metal", qty: 4 },
          { itemId: "circuitry", qty: 1 },
        ],
        output: { itemId: "mod_heavy", qty: 1 },
      },

      // CHEM module — meds, buffs, attribute serums
      {
        id: "craft_medkit",
        station: "workbench",
        requires: "chem_module",
        inputs: [
          { itemId: "rags", qty: 2 },
          { itemId: "wood", qty: 1 },
        ],
        output: { itemId: "medkit", qty: 1 },
      },
      // buff consumables: Medgel = Regen, Combat Stim = Fortify
      {
        id: "craft_medgel",
        station: "workbench",
        requires: "chem_module",
        inputs: [{ itemId: "rags", qty: 3 }],
        output: { itemId: "medgel", qty: 1 },
      },
      {
        id: "craft_combat_stim",
        station: "workbench",
        requires: "chem_module",
        inputs: [
          { itemId: "scrap_metal", qty: 2 },
          { itemId: "rags", qty: 2 },
        ],
        output: { itemId: "combat_stim", qty: 1 },
      },
      // permanent attribute serums — growth gated on gathering, not playtime
      {
        id: "craft_power_serum",
        station: "workbench",
        requires: "chem_module",
        inputs: [
          { itemId: "circuitry", qty: 1 },
          { itemId: "scrap_metal", qty: 3 },
        ],
        output: { itemId: "power_serum", qty: 1 },
      },
      {
        id: "craft_vitality_serum",
        station: "workbench",
        requires: "chem_module",
        inputs: [
          { itemId: "circuitry", qty: 1 },
          { itemId: "rags", qty: 4 },
        ],
        output: { itemId: "vitality_serum", qty: 1 },
      },
      {
        id: "craft_agility_serum",
        station: "workbench",
        requires: "chem_module",
        inputs: [
          { itemId: "circuitry", qty: 1 },
          { itemId: "wood", qty: 4 },
        ],
        output: { itemId: "agility_serum", qty: 1 },
      },
      {
        id: "craft_endurance_serum",
        station: "workbench",
        requires: "chem_module",
        inputs: [
          { itemId: "circuitry", qty: 1 },
          { itemId: "scrap_metal", qty: 2 },
        ],
        output: { itemId: "endurance_serum", qty: 1 },
      },

      // COOKING module — drink + foods
      {
        id: "craft_water_bottle",
        station: "workbench",
        requires: "cooking_module",
        inputs: [{ itemId: "rags", qty: 1 }],
        output: { itemId: "water_bottle", qty: 1 },
      },
      {
        id: "craft_ration_pack",
        station: "workbench",
        requires: "cooking_module",
        inputs: [{ itemId: "wood", qty: 2 }],
        output: { itemId: "ration_pack", qty: 1 },
      },
      {
        id: "craft_cooked_meat",
        station: "workbench",
        requires: "cooking_module",
        inputs: [
          { itemId: "rags", qty: 2 },
          { itemId: "wood", qty: 1 },
        ],
        output: { itemId: "cooked_meat", qty: 1 },
      },
    ]);
  },
};
