// Colony item content — rarities + manufacturers + full item set. Registered once via
// content.register() at level create(), NOT top-level (avoids GMRT load-order issues).
const RARITIES = [
  { id: "common", name: "RARITY_COMMON", color: "#b0b0b0", valueMod: 1 },
  { id: "uncommon", name: "RARITY_UNCOMMON", color: "#4caf50", valueMod: 2 },
  { id: "rare", name: "RARITY_RARE", color: "#2196f3", valueMod: 5 },
  { id: "epic", name: "RARITY_EPIC", color: "#9c27b0", valueMod: 12 },
  { id: "legendary", name: "RARITY_LEGENDARY", color: "#ff9800", valueMod: 30 },
];

// The colony-era companies (Item.maker). A maker's `ops` is its signature weapon layer, folded
// into composeWeapon like an attachment — Aeon = fast/precise but soft, Vekt = slow but punchy
// with small clips. Helios (the failed terraformer itself) makes survival gear, no weapon ops.
const MAKERS = [
  {
    id: "aeon",
    name: "MAKER_AEON",
    lore: "MAKER_AEON_LORE",
    color: "#4dd0e1",
    ops: {
      fireCd: { mul: 0.8 },
      velocity: { mul: 1.15 },
      power: { mul: 0.9 },
      damage: { mul: 0.9 },
    },
  },
  {
    id: "vekt",
    name: "MAKER_VEKT",
    lore: "MAKER_VEKT_LORE",
    color: "#e08a3c",
    ops: {
      fireCd: { mul: 1.25 },
      power: { mul: 1.3 },
      damage: { mul: 1.3 },
      magazine: { mul: 0.75 },
    },
  },
  {
    id: "helios",
    name: "MAKER_HELIOS",
    lore: "MAKER_HELIOS_LORE",
    color: "#9ccc65",
  },
];

globalThis.contentItems = {
  /**
   * An item id (a snake_case data KEY — docs/NAMING.md) to the Subject half of its sprite
   * name, so the icon convention stays a rule instead of a lookup table. Cased by char code:
   * toUpperCase returns garbage on this runtime (docs/GMRT.md).
   */
  _subject(id) {
    const parts = id.split("_");
    let out = "";
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (p === "") continue;
      const code = p.charCodeAt(0);
      out += (code >= 97 ? String.fromCharCode(code - 32) : p.charAt(0)) + p.slice(1);
    }
    return out;
  },

  // Icon aliases for ids SHARING one sprite — 1:1 art auto-wires by the pixItem<Id> naming
  // convention, so only many-to-one entries live here. Resolved by NAME +
  // sprite_exists in register()'s auto-wire, so a missing asset keeps the colored-box fallback.
  // (circuitry art was retired with the media overhaul — colored-box fallback until new art)
  ICONS: {
    // one serum icon for all four attribute shards
    power_serum: "pixItemSerum",
    vitality_serum: "pixItemSerum",
    agility_serum: "pixItemSerum",
    endurance_serum: "pixItemSerum",
    ration_pack: "pixItemCannedFood",
    berries: "pixItemApple",
    blaster: "pixItemPistol",
    adrenal_implant: "pixItemEnergy",
    // one shared round icon for all three calibers (the only ammo art in the new set)
    ammo_light: "pixItemRounds",
    ammo_heavy: "pixItemRounds",
    ammo_ap: "pixItemRounds",
    // branded gear reuses base art (dedicated icons are a follow-up)
    aeon_pistol: "pixItemPistol",
    vekt_pistol: "pixItemPistol",
    aeon_cutter: "pixItemEnergy",
    helios_vest: "pixItemArmoredVest",
    helios_ration: "pixItemCannedFood",
    aeon_rounds: "pixItemRounds",
  },

  register() {
    Rarity.register(RARITIES);
    Manufacturer.register(MAKERS);

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
        // pre-collapse fizzy drink — a lighter thirst hit than the bottle, and the can
        // survives the drink (Consumable.yields → soda_trash junk)
        id: "soda",
        name: "ITEM_SODA",
        description: "ITEM_SODA_DESC",
        weight: 1,
        value: 6,
        rarity: "common",
        components: [new Consumable({ thirst: 30, yields: "soda_trash" })],
      },
      {
        // the empty can (no components — sellable junk; a future scrap recipe input)
        id: "soda_trash",
        name: "ITEM_SODA_TRASH",
        description: "ITEM_SODA_TRASH_DESC",
        weight: 1,
        value: 1,
        rarity: "common",
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
      // produce — what a plant yields (contentFlora), eaten raw
      {
        id: "berries",
        name: "ITEM_BERRIES",
        description: "ITEM_BERRIES_DESC",
        weight: 1,
        value: 3,
        rarity: "common",
        components: [new Consumable({ hunger: 20, thirst: 5 })],
      },
      {
        id: "grain",
        name: "ITEM_GRAIN",
        description: "ITEM_GRAIN_DESC",
        weight: 1,
        value: 2,
        rarity: "common",
        components: [new Consumable({ hunger: 25 })],
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
          // no `worn`: a weapon with no overlay sheet is drawn as its own ICON anchored at
          // the doll's hand (AppearanceSystem held-icon fallback)
          new Equippable({
            slot: "weapon",
            mods: { attack: 1 },
          }),
          // melee base stats; mod_sharp fits "edge", mod_heavy fits "pommel"
          new Weapon({
            damage: 3,
            fireCd: 18,
            reach: 68,
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
          // worn: the sprite this shows in its doll slot (see Appearance); "" = the slot stays
          // bare. TODO: no armour art survived the Spine move — authoring one fills the `outer` slot.
          new Equippable({
            slot: "armor",
            mods: { defense: 2, maxHp: 5 },
            worn: "",
          }),
        ],
      },
      {
        id: "adrenal_implant",
        name: "ITEM_ADRENAL_IMPLANT",
        weight: 1,
        value: 40,
        rarity: "rare",
        components: [new Equippable({ slot: "trinket", mods: { speed: 80 } })],
      },
      // the thin air's filter: worn on the trinket slot it spares the wearer its seal's share of
      // the open sky's exposure (ExposureSystem); a room shelters wholly
      {
        id: "filter_mask",
        name: "ITEM_FILTER_MASK",
        description: "ITEM_FILTER_MASK_DESC",
        weight: 1,
        value: 25,
        rarity: "uncommon",
        components: [new Equippable({ slot: "trinket", seal: 0.75 })],
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
            velocity: 1440,
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
            velocity: 960,
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
            velocity: 1200,
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
            ops: { velocity: { add: 160 }, penetration: { add: 1 } },
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
      // ── branded gear (maker → Manufacturer registry) ─────────────────────────────────────
      // a maker's signature ops fold into composeWeapon on top of the authored base, so two
      // companies' takes on the same weapon class genuinely play differently.
      {
        id: "aeon_pistol",
        name: "ITEM_AEON_PISTOL",
        description: "ITEM_AEON_PISTOL_DESC",
        weight: 4,
        value: 85,
        rarity: "rare",
        maker: "aeon",
        components: [
          new Equippable({ slot: "weapon", mods: { attack: 2 } }),
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
          new Gun({ caliber: "standard", magazine: 10 }),
        ],
      },
      {
        id: "vekt_pistol",
        name: "ITEM_VEKT_PISTOL",
        description: "ITEM_VEKT_PISTOL_DESC",
        weight: 7,
        value: 85,
        rarity: "rare",
        maker: "vekt",
        components: [
          new Equippable({ slot: "weapon", mods: { attack: 3 } }),
          new Weapon({
            fireCd: 9,
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
      {
        id: "aeon_cutter",
        name: "ITEM_AEON_CUTTER",
        description: "ITEM_AEON_CUTTER_DESC",
        weight: 3,
        value: 70,
        rarity: "rare",
        maker: "aeon",
        components: [
          new Equippable({ slot: "weapon", mods: { attack: 1 } }),
          new Weapon({
            damage: 3,
            fireCd: 12,
            reach: 60,
            slots: [
              { id: "edge", accepts: "edge" },
              { id: "pommel", accepts: "pommel" },
            ],
          }),
        ],
      },
      {
        id: "vekt_wrench",
        name: "ITEM_VEKT_WRENCH",
        description: "ITEM_VEKT_WRENCH_DESC",
        weight: 6,
        value: 75,
        rarity: "rare",
        maker: "vekt",
        components: [
          new Equippable({ slot: "weapon", mods: { attack: 2 } }),
          new Weapon({
            damage: 5,
            fireCd: 24,
            reach: 72,
            slots: [
              { id: "edge", accepts: "edge" },
              { id: "pommel", accepts: "pommel" },
            ],
          }),
        ],
      },
      {
        id: "helios_vest",
        name: "ITEM_HELIOS_VEST",
        description: "ITEM_HELIOS_VEST_DESC",
        weight: 7,
        value: 45,
        rarity: "rare",
        maker: "helios",
        components: [
          new Equippable({
            slot: "armor",
            mods: { defense: 3, maxHp: 8 },
            worn: "",
          }),
        ],
      },
      {
        id: "helios_trauma_kit",
        name: "ITEM_HELIOS_TRAUMA_KIT",
        description: "ITEM_HELIOS_TRAUMA_KIT_DESC",
        weight: 1,
        value: 25,
        rarity: "rare",
        maker: "helios",
        components: [new Consumable({ heal: 12 })],
      },
      {
        id: "helios_ration",
        name: "ITEM_HELIOS_RATION",
        description: "ITEM_HELIOS_RATION_DESC",
        weight: 1,
        value: 12,
        rarity: "uncommon",
        maker: "helios",
        components: [new Consumable({ hunger: 50, thirst: 25 })],
      },
      {
        id: "aeon_rounds",
        name: "ITEM_AEON_ROUNDS",
        description: "ITEM_AEON_ROUNDS_DESC",
        weight: 0,
        value: 4,
        rarity: "rare",
        maker: "aeon",
        components: [
          new Ammo({
            caliber: "standard",
            mass: 2,
            velocity: 1800,
            power: 2,
            penetration: 2,
          }),
        ],
      },
    ]);

    // auto-wire icon sprites by naming convention pixItem<Id>, falling back to the ICONS alias
    // table (legacy-named art); asset_get_index returns an opaque ref so validate with
    // sprite_exists, not >=0 (GMRT — see CLAUDE.md). defs with explicit sprites untouched.
    const items = Item.all();
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.sprite !== -1) continue;
      let spr = asset_get_index("pixItem" + contentItems._subject(it.id));
      if (!sprite_exists(spr) && contentItems.ICONS[it.id] !== undefined)
        spr = asset_get_index(contentItems.ICONS[it.id]);
      if (sprite_exists(spr)) it.sprite = spr;
    }
  },
};
