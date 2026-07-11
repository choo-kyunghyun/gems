// RPG item content — rarities + full item set. Registered once via RpgContent.register() at
// scene create(), NOT top-level (avoids GMRT load-order issues).
const RPG_RARITIES = [
  { id: "common", name: "RARITY_COMMON", color: "#b0b0b0", valueMod: 1 },
  { id: "uncommon", name: "RARITY_UNCOMMON", color: "#4caf50", valueMod: 2 },
  { id: "rare", name: "RARITY_RARE", color: "#2196f3", valueMod: 5 },
  { id: "epic", name: "RARITY_EPIC", color: "#9c27b0", valueMod: 12 },
  { id: "legendary", name: "RARITY_LEGENDARY", color: "#ff9800", valueMod: 30 },
];

globalThis.RpgItems = {
  // Icon aliases for ids whose art predates the spr_item_<id> naming convention (the legacy-named
  // sprites are otherwise unreferenced). Resolved by NAME + sprite_exists in register()'s
  // auto-wire, so a missing/renamed asset just keeps the colored-box fallback.
  ICONS: {
    rags: "spr_rags",
    medkit: "spr_firstAid",
    medgel: "spr_potion",
    combat_stim: "spr_syringe",
    water_bottle: "spr_waterBottle",
    ration_pack: "spr_cannedFood",
    power_serum: "spr_serum",
    vitality_serum: "spr_serum",
    agility_serum: "spr_serum",
    endurance_serum: "spr_serum",
    lead_pipe: "spr_leadPipe",
    blaster: "spr_pistol",
    adrenal_implant: "spr_energy",
    backpack: "spr_leatherBackpack",
    coin: "spr_goldCoin",
    // circuitry art was retired with the media overhaul — colored-box fallback until new art
    keycard: "spr_keycard",
    wood: "spr_wood",
    scrap_metal: "spr_scrap",
    // one shared round icon for all three calibers (the only ammo art in the new set)
    ammo_light: "spr_ammo_pistol",
    ammo_heavy: "spr_ammo_pistol",
    ammo_ap: "spr_ammo_pistol",
  },

  register() {
    Rarity.register(RPG_RARITIES);

    Item.register([
      // loot trash
      {
        id: "rags",
        name: "ITEM_RAGS",
        weight: 1,
        value: 2,
        rarity: "common",
      },
      // instant heal from bag
      {
        id: "medkit",
        name: "ITEM_MEDKIT",
        description: "ITEM_MEDKIT_DESC",
        weight: 1,
        value: 10,
        rarity: "uncommon",
        components: [new Consumable({ heal: 5 })],
      },
      // buff consumables: Medgel = Regen (HoT), Combat Stim = Fortify (+attack/+defense)
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
      // survival consumables: lower Thirst / Hunger (cooked_meat also heals)
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
      // permanent +1 to one attribute — item-driven progression instead of XP leveling
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
      // weapons: lead_pipe = melee, blaster = ammo-driven gun (Gun component → composeWeapon gun branch)
      {
        id: "lead_pipe",
        name: "ITEM_LEAD_PIPE",
        description: "ITEM_LEAD_PIPE_DESC",
        weight: 4,
        value: 8,
        rarity: "common",
        components: [
          // worn: held-weapon overlay drawn at the doll's hand (generated by human_sprites.py)
          new Equippable({
            slot: "weapon",
            mods: { attack: 1 },
            worn: "spr_held_pipe",
          }),
          // melee base stats; mod_sharp fits "edge", mod_heavy fits "pommel"
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
          new Equippable({
            slot: "weapon",
            mods: { attack: 2 },
            worn: "spr_held_blaster",
          }),
          // Gun component → ammo-driven; ops are neutral (attachments do the shaping)
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
      // armor + trinket
      {
        id: "armored_vest",
        name: "ITEM_ARMORED_VEST",
        description: "ITEM_ARMORED_VEST_DESC",
        weight: 8,
        value: 20,
        rarity: "uncommon",
        components: [
          // worn: paper-doll overlay sheet (mirrors spr_human's strip layout — see Appearance)
          new Equippable({
            slot: "armor",
            mods: { defense: 2, maxHp: 5 },
            worn: "spr_wear_vest",
          }),
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
      // backpack: Equippable + Container (expands inventory slots)
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
      // currency: coin stacks very high so a large balance occupies one slot
      {
        id: "coin",
        name: "ITEM_COIN",
        weight: 0,
        value: 1,
        rarity: "common",
        stack: 99999,
      },
      {
        id: "circuitry",
        name: "ITEM_CIRCUITRY",
        weight: 1,
        value: 50,
        rarity: "rare",
      },
      {
        id: "keycard",
        name: "ITEM_KEYCARD",
        weight: 0,
        value: 0,
        rarity: "epic",
      },
      // crafting materials — Material component tints built structures using this material
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
      // ammo: base projectile stats a gun fires; light = fast/low-pen, heavy = slow/punchy, ap = armor-piercing
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
      // weapon attachments (WeaponMod): ops = (base+Σadd)·Πmul per field; inert ops on missing fields
      // gun attachments (blaster's scope/barrel/magazine/grip/muzzle slots)
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
      // melee attachments (lead pipe's edge/pommel slots)
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
      // workbench modules: slot to unlock recipe gates or switch to weapon-mod panel (Toolkit)
      {
        id: "machining_module",
        name: "ITEM_MACHINING_MODULE",
        description: "ITEM_MACHINING_MODULE_DESC",
        weight: 3,
        value: 30,
        rarity: "uncommon",
        components: [new WorkbenchModule()], // defaults kind:"recipes"
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

    // auto-wire icon sprites by naming convention spr_item_<id>, falling back to the ICONS alias
    // table (legacy-named art); asset_get_index returns an opaque ref so validate with
    // sprite_exists, not >=0 (GMRT — see CLAUDE.md). defs with explicit sprites untouched.
    const items = Item.all();
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.sprite !== -1) continue;
      let spr = asset_get_index("spr_item_" + it.id);
      if (!sprite_exists(spr) && RpgItems.ICONS[it.id] !== undefined)
        spr = asset_get_index(RpgItems.ICONS[it.id]);
      if (sprite_exists(spr)) it.sprite = spr;
    }
  },
};
