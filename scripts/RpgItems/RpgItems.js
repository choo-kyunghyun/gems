// RPG item content: the rarity tiers + the full item set (consumables / weapons / armor /
// trinket / unique items / crafting materials). Registered once by RpgContent.register() at a
// scene's create() (NOT at top level — avoids GMRT load-order issues). An item's `rarity` is a
// tier id defined here, so rarities + items live together. lead_pipe = melee (swings a hitbox
// in the facing dir); blaster = an ammo-driven gun — RpgController picks melee-swing vs fire by
// whether the item carries a Gun component (composeWeapon's gun branch).
const RPG_RARITIES = [
  { id: "common", name: "RARITY_COMMON", color: "#b0b0b0", valueMod: 1 },
  { id: "uncommon", name: "RARITY_UNCOMMON", color: "#4caf50", valueMod: 2 },
  { id: "rare", name: "RARITY_RARE", color: "#2196f3", valueMod: 5 },
  { id: "epic", name: "RARITY_EPIC", color: "#9c27b0", valueMod: 12 },
  { id: "legendary", name: "RARITY_LEGENDARY", color: "#ff9800", valueMod: 30 },
];

globalThis.RpgItems = {
  register() {
    Rarity.register(RPG_RARITIES);

    Item.register([
      // Loot trash + currency-ish.
      {
        id: "rags",
        name: "ITEM_RAGS",
        weight: 1,
        value: 2,
        rarity: "common",
      },
      // Consumable — heals from the bag.
      {
        id: "medkit",
        name: "ITEM_MEDKIT",
        description: "ITEM_MEDKIT_DESC",
        weight: 1,
        value: 10,
        rarity: "uncommon",
        components: [new Consumable({ heal: 5 })],
      },
      // Buff consumables — apply a timed Status (Buff/Status system). Medgel = Regen (HoT over 8s);
      // Combat Stim = Fortify (+attack/+defense for 12s, folded into Stats via StatModel). The status id
      // is content (RpgStatuses); ConsumableSystem.use routes it to StatusSystem.apply.
      {
        id: "medgel",
        name: "ITEM_MEDGEL",
        description: "ITEM_MEDGEL_DESC",
        weight: 1,
        value: 15,
        rarity: "uncommon",
        components: [new Consumable({ status: "regen" })],
      },
      {
        id: "combat_stim",
        name: "ITEM_COMBAT_STIM",
        description: "ITEM_COMBAT_STIM_DESC",
        weight: 1,
        value: 35,
        rarity: "rare",
        components: [new Consumable({ status: "fortify" })],
      },
      // Survival drink + foods (Gameplay/Survival) — lower Thirst / Hunger when used from the bag.
      // cooked_meat also heals a little. The Consumable thirst/hunger fields drive ThirstSystem /
      // HungerSystem.restore (see ConsumableSystem). Sourced via workbench recipes for now (proper
      // sourcing — farming/fishing — is on the roadmap).
      {
        id: "water_bottle",
        name: "ITEM_WATER_BOTTLE",
        description: "ITEM_WATER_BOTTLE_DESC",
        weight: 1,
        value: 4,
        rarity: "common",
        components: [new Consumable({ thirst: 45 })],
      },
      {
        id: "ration_pack",
        name: "ITEM_RATION_PACK",
        description: "ITEM_RATION_PACK_DESC",
        weight: 1,
        value: 5,
        rarity: "common",
        components: [new Consumable({ hunger: 40 })],
      },
      {
        id: "cooked_meat",
        name: "ITEM_COOKED_MEAT",
        description: "ITEM_COOKED_MEAT_DESC",
        weight: 1,
        value: 12,
        rarity: "uncommon",
        components: [new Consumable({ hunger: 60, heal: 3 })],
      },
      // Permanent attribute-boost consumables (Terraria Life-Crystal style) — the item-driven
      // progression that replaced leveling. Each raises ONE primary attribute by +1 forever (via
      // ConsumableSystem.grantAttr → StatModel.recompute), so growth comes from finding/crafting
      // these, not an XP grind. One per StatModel.ATTRS key; obtained by crafting (RpgRecipes) +
      // quest rewards (RpgQuests). `attr` matches the Attributes bag key.
      {
        id: "power_serum",
        name: "ITEM_POWER_SERUM",
        description: "ITEM_POWER_SERUM_DESC",
        weight: 1,
        value: 50,
        rarity: "epic",
        components: [new Consumable({ attr: "pow", amount: 1 })],
      },
      {
        id: "vitality_serum",
        name: "ITEM_VITALITY_SERUM",
        description: "ITEM_VITALITY_SERUM_DESC",
        weight: 1,
        value: 50,
        rarity: "epic",
        components: [new Consumable({ attr: "vit", amount: 1 })],
      },
      {
        id: "agility_serum",
        name: "ITEM_AGILITY_SERUM",
        description: "ITEM_AGILITY_SERUM_DESC",
        weight: 1,
        value: 50,
        rarity: "epic",
        components: [new Consumable({ attr: "agi", amount: 1 })],
      },
      {
        id: "endurance_serum",
        name: "ITEM_ENDURANCE_SERUM",
        description: "ITEM_ENDURANCE_SERUM_DESC",
        weight: 1,
        value: 50,
        rarity: "epic",
        components: [new Consumable({ attr: "end", amount: 1 })],
      },
      // Weapons. lead_pipe = melee (swings a hitbox in the facing dir); blaster = an ammo-driven
      // gun (the Gun component → composeWeapon's gun branch). RpgController picks melee-swing vs
      // fire by whether the item carries a Gun component.
      {
        id: "lead_pipe",
        name: "ITEM_LEAD_PIPE",
        description: "ITEM_LEAD_PIPE_DESC",
        weight: 4,
        value: 8,
        rarity: "common",
        components: [
          new Equippable({ slot: "weapon", mods: { attack: 1 } }),
          // Named, typed attachment slots (the unified slot model): mod_sharp fits "edge",
          // mod_heavy fits "pommel". `damage`/`reach`/`fireCd` are the MELEE base the attachment
          // `ops` operate on (no Gun component → composeWeapon's melee branch).
          new Weapon({
            damage: 3,
            fireCd: 18,
            reach: 34,
            slots: [
              { id: "edge", accepts: "edge" },
              { id: "pommel", accepts: "pommel" },
            ],
          }),
        ],
      },
      {
        id: "blaster",
        name: "ITEM_BLASTER",
        description: "ITEM_BLASTER_DESC",
        weight: 5,
        value: 60,
        rarity: "rare",
        components: [
          new Equippable({ slot: "weapon", mods: { attack: 2 } }),
          // An ammo-driven GUN: the `Gun` component makes composeWeapon take the gun branch — it
          // fires whatever the LOADED Ammo describes (mass/velocity/power/penetration), run through
          // the gun-base ops + each attachment's ops. `slots` are the named attachment slots; the
          // gun-base `ops` are inert here (a neutral frame — attachments do the shaping).
          new Weapon({
            fireCd: 8,
            slots: [
              { id: "scope", accepts: "scope" },
              { id: "barrel", accepts: "barrel" },
              { id: "magazine", accepts: "magazine" },
              { id: "grip", accepts: "grip" },
              { id: "muzzle", accepts: "muzzle" },
            ],
          }),
          new Gun({ caliber: "standard", magazine: 8 }),
        ],
      },
      // Armor + trinket (flat Stats deltas while worn).
      {
        id: "armored_vest",
        name: "ITEM_ARMORED_VEST",
        description: "ITEM_ARMORED_VEST_DESC",
        weight: 8,
        value: 20,
        rarity: "uncommon",
        components: [
          new Equippable({ slot: "armor", mods: { defense: 2, maxHp: 5 } }),
        ],
      },
      {
        id: "adrenal_implant",
        name: "ITEM_ADRENAL_IMPLANT",
        weight: 1,
        value: 40,
        rarity: "rare",
        components: [new Equippable({ slot: "trinket", mods: { speed: 40 } })],
      },
      // Backpack: equippable that grows the wearer's Inventory capacity (Container).
      {
        id: "backpack",
        name: "ITEM_BACKPACK",
        weight: 3,
        value: 30,
        rarity: "uncommon",
        components: [
          new Equippable({ slot: "backpack" }),
          new Container({ capacity: 8 }),
        ],
      },
      // Currency + unique loot. coin stacks very high so a big credit balance stays ONE inventory
      // slot (at the default stack of 99, 1000 coins would eat ~11 of the player's 16 slots).
      { id: "coin", name: "ITEM_COIN", weight: 0, value: 1, rarity: "common", stack: 99999 },
      { id: "circuitry", name: "ITEM_CIRCUITRY", weight: 1, value: 50, rarity: "rare" },
      {
        id: "keycard",
        name: "ITEM_KEYCARD",
        weight: 0,
        value: 0,
        rarity: "epic",
      },
      // Crafting materials — consumed by Recipes at a workbench. The Material component
      // carries the tint a structure/floor/furniture built from this stuff is drawn with
      // (RimWorld-style per-material tinting; see Material / TerrainStream).
      {
        id: "wood",
        name: "ITEM_WOOD",
        weight: 1,
        value: 1,
        rarity: "common",
        components: [new Material({ color: "#a9743f" })],
      },
      {
        id: "scrap_metal",
        name: "ITEM_SCRAP_METAL",
        weight: 2,
        value: 4,
        rarity: "common",
        components: [new Material({ color: "#9aa3ad" })],
      },
      // Gun ammo (Ammo) — the BASE projectile stats a gun fires (mass / velocity / power /
      // penetration); the gun-base + installed attachments operate on these into the final shot.
      // `caliber:"standard"` matches the blaster. Consumed one per shot (magazine-fed); weight 0 so a
      // full belt doesn't dominate the weight budget. Crafted at the Machining. light = fast/low-pen,
      // heavy = slow/punchy, ap = armor-piercing.
      {
        id: "ammo_light",
        name: "ITEM_AMMO_LIGHT",
        description: "ITEM_AMMO_LIGHT_DESC",
        weight: 0,
        value: 1,
        rarity: "common",
        components: [
          new Ammo({
            caliber: "standard",
            mass: 3,
            velocity: 720,
            power: 2,
            penetration: 1,
          }),
        ],
      },
      {
        id: "ammo_heavy",
        name: "ITEM_AMMO_HEAVY",
        description: "ITEM_AMMO_HEAVY_DESC",
        weight: 0,
        value: 2,
        rarity: "uncommon",
        components: [
          new Ammo({
            caliber: "standard",
            mass: 8,
            velocity: 480,
            power: 4,
            penetration: 3,
          }),
        ],
      },
      {
        id: "ammo_ap",
        name: "ITEM_AMMO_AP",
        description: "ITEM_AMMO_AP_DESC",
        weight: 0,
        value: 3,
        rarity: "uncommon",
        components: [
          new Ammo({
            caliber: "standard",
            mass: 5,
            velocity: 600,
            power: 3,
            penetration: 6,
          }),
        ],
      },
      // Weapon attachments (WeaponMod) — fungible items installed into a weapon instance's matching
      // NAMED slot at a workbench with the Toolkit module slotted (WeaponModUI panel). `slot` is the
      // category it fits (vs a weapon slot's `accepts`); `ops` are the operators it applies to the
      // composed profile ({ field: { add?, mul? } } → (base+Σadd)·Πmul); `stat` folds into the
      // wearer's derived Stats. An op on a field the weapon doesn't expose is simply inert. Crafted
      // with the Machining module (RpgRecipes).
      // ── Gun attachments (the blaster's scope/barrel/magazine/grip/muzzle slots) ──
      {
        id: "mod_scope",
        name: "ITEM_MOD_SCOPE",
        description: "ITEM_MOD_SCOPE_DESC",
        weight: 1,
        value: 40,
        rarity: "rare",
        components: [
          new WeaponMod({
            slot: "scope",
            ops: { velocity: { add: 80 }, penetration: { add: 1 } },
          }),
        ],
      },
      {
        id: "mod_long_barrel",
        name: "ITEM_MOD_LONG_BARREL",
        description: "ITEM_MOD_LONG_BARREL_DESC",
        weight: 2,
        value: 35,
        rarity: "uncommon",
        components: [
          new WeaponMod({ slot: "barrel", ops: { velocity: { mul: 1.2 } } }),
        ],
      },
      {
        id: "mod_extended_mag",
        name: "ITEM_MOD_EXTENDED_MAG",
        description: "ITEM_MOD_EXTENDED_MAG_DESC",
        weight: 1,
        value: 30,
        rarity: "uncommon",
        components: [
          new WeaponMod({ slot: "magazine", ops: { magazine: { mul: 1.5 } } }),
        ],
      },
      {
        id: "mod_grip",
        name: "ITEM_MOD_GRIP",
        description: "ITEM_MOD_GRIP_DESC",
        weight: 1,
        value: 30,
        rarity: "uncommon",
        components: [
          new WeaponMod({ slot: "grip", ops: { fireCd: { mul: 0.8 } } }),
        ],
      },
      {
        id: "mod_suppressor",
        name: "ITEM_MOD_SUPPRESSOR",
        description: "ITEM_MOD_SUPPRESSOR_DESC",
        weight: 1,
        value: 45,
        rarity: "rare",
        components: [
          new WeaponMod({
            slot: "muzzle",
            ops: { velocity: { mul: 0.92 }, penetration: { add: 1 } },
          }),
        ],
      },
      // ── Melee attachments (the lead pipe's edge/pommel slots) ──
      {
        id: "mod_sharp",
        name: "ITEM_MOD_SHARP",
        description: "ITEM_MOD_SHARP_DESC",
        weight: 1,
        value: 25,
        rarity: "uncommon",
        components: [
          new WeaponMod({
            slot: "edge",
            ops: { damage: { add: 2 } },
            stat: { attack: 1 },
          }),
        ],
      },
      {
        id: "mod_heavy",
        name: "ITEM_MOD_HEAVY",
        description: "ITEM_MOD_HEAVY_DESC",
        weight: 2,
        value: 40,
        rarity: "rare",
        components: [
          new WeaponMod({
            slot: "pommel",
            ops: { damage: { mul: 1.3 }, fireCd: { add: 4 } },
          }),
        ],
      },
      // Workbench modules (WorkbenchModule) — slotted into a workbench's single module slot to
      // upgrade it. The three "recipes" modules unlock the recipes that declare `requires: <id>`
      // (RpgRecipes); the Toolkit ("weaponmod") switches the bench into the weapon-mod panel. All
      // are crafted at the BARE bench (base recipes), so the bench bootstraps its own upgrades.
      {
        id: "machining_module",
        name: "ITEM_MACHINING_MODULE",
        description: "ITEM_MACHINING_MODULE_DESC",
        weight: 3,
        value: 30,
        rarity: "uncommon",
        components: [new WorkbenchModule()], // kind defaults "recipes"
      },
      {
        id: "chem_module",
        name: "ITEM_CHEM_MODULE",
        description: "ITEM_CHEM_MODULE_DESC",
        weight: 2,
        value: 35,
        rarity: "uncommon",
        components: [new WorkbenchModule()],
      },
      {
        id: "cooking_module",
        name: "ITEM_COOKING_MODULE",
        description: "ITEM_COOKING_MODULE_DESC",
        weight: 3,
        value: 25,
        rarity: "uncommon",
        components: [new WorkbenchModule()],
      },
      {
        id: "gunsmith_kit",
        name: "ITEM_GUNSMITH_KIT",
        description: "ITEM_GUNSMITH_KIT_DESC",
        weight: 2,
        value: 40,
        rarity: "rare",
        components: [new WorkbenchModule({ kind: "weaponmod" })],
      },
    ]);

    // Auto-wire each item's icon sprite by the asset-naming convention `spr_item_<id>` (icons are
    // generated by tools/pixel-art-kit/gm-import/item_sprites.py). asset_get_index returns an opaque
    // ref (or -1 for a missing name), validated by sprite_exists — so an item with no generated icon
    // simply keeps sprite -1, and every render site (UISlots/UITable/drops) guards on sprite_exists.
    // A def that set its own `sprite` explicitly is left alone.
    const items = Item.all();
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.sprite !== -1) continue;
      const spr = asset_get_index("spr_item_" + it.id);
      if (sprite_exists(spr)) it.sprite = spr;
    }
  },
};
