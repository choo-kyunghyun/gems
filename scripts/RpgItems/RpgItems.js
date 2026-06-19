// RPG item content: the rarity tiers + the full item set (consumables / weapons / armor /
// trinket / unique items / crafting materials). Registered once by RpgContent.register() at a
// scene's create() (NOT at top level — avoids GMRT load-order issues). An item's `rarity` is a
// tier id defined here, so rarities + items live together. wood_sword = melee (swings a hitbox
// in the facing dir); blaster = ranged (cursor-aimed bullet) — RpgController picks melee-swing
// vs fire by the Weapon `melee` flag.
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
        id: "slime_gel",
        name: "ITEM_SLIME_GEL",
        weight: 1,
        value: 2,
        rarity: "common",
      },
      // Consumable — heals from the bag.
      {
        id: "potion",
        name: "ITEM_POTION",
        description: "ITEM_POTION_DESC",
        weight: 1,
        value: 10,
        rarity: "uncommon",
        components: [new Consumable({ heal: 5 })],
      },
      // Buff consumables — apply a timed Status (Buff/Status system). Tonic = Regen (HoT over 8s);
      // Elixir = Fortify (+attack/+defense for 12s, folded into Stats via StatModel). The status id
      // is content (RpgStatuses); ConsumableSystem.use routes it to StatusSystem.apply.
      {
        id: "tonic",
        name: "ITEM_TONIC",
        description: "ITEM_TONIC_DESC",
        weight: 1,
        value: 15,
        rarity: "uncommon",
        components: [new Consumable({ status: "regen" })],
      },
      {
        id: "elixir",
        name: "ITEM_ELIXIR",
        description: "ITEM_ELIXIR_DESC",
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
        id: "bread",
        name: "ITEM_BREAD",
        description: "ITEM_BREAD_DESC",
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
        id: "power_shard",
        name: "ITEM_POWER_SHARD",
        description: "ITEM_POWER_SHARD_DESC",
        weight: 1,
        value: 50,
        rarity: "epic",
        components: [new Consumable({ attr: "pow", amount: 1 })],
      },
      {
        id: "vitality_shard",
        name: "ITEM_VITALITY_SHARD",
        description: "ITEM_VITALITY_SHARD_DESC",
        weight: 1,
        value: 50,
        rarity: "epic",
        components: [new Consumable({ attr: "vit", amount: 1 })],
      },
      {
        id: "agility_shard",
        name: "ITEM_AGILITY_SHARD",
        description: "ITEM_AGILITY_SHARD_DESC",
        weight: 1,
        value: 50,
        rarity: "epic",
        components: [new Consumable({ attr: "agi", amount: 1 })],
      },
      {
        id: "endurance_shard",
        name: "ITEM_ENDURANCE_SHARD",
        description: "ITEM_ENDURANCE_SHARD_DESC",
        weight: 1,
        value: 50,
        rarity: "epic",
        components: [new Consumable({ attr: "end", amount: 1 })],
      },
      // Weapons. wood_sword = melee (swings a hitbox in the facing dir); blaster = ranged
      // (cursor-aimed bullet). RpgController picks melee-swing vs fire by the Weapon `melee`
      // flag.
      {
        id: "wood_sword",
        name: "ITEM_WOOD_SWORD",
        description: "ITEM_WOOD_SWORD_DESC",
        stack: 1,
        weight: 4,
        value: 8,
        rarity: "common",
        components: [
          new Equippable({ slot: "weapon", mods: { attack: 1 } }),
          // sockets → installable weapon mods (Anvil / WeaponModUI). fireCd + reach are declared
          // so a fireCd/reach mod has an explicit base to delta (composeWeapon only deltas
          // declared fields — an unset field would otherwise fall to the controller default).
          new Weapon({
            damage: 3,
            fireCd: 18,
            melee: true,
            reach: 34,
            sockets: 2,
          }),
        ],
      },
      {
        id: "blaster",
        name: "ITEM_BLASTER",
        stack: 1,
        weight: 5,
        value: 60,
        rarity: "rare",
        components: [
          new Equippable({ slot: "weapon", mods: { attack: 2 } }),
          new Weapon({ damage: 6, fireCd: 8, bulletSpeed: 700, sockets: 2 }),
        ],
      },
      // Armor + trinket (flat Stats deltas while worn).
      {
        id: "leather_armor",
        name: "ITEM_LEATHER_ARMOR",
        description: "ITEM_LEATHER_ARMOR_DESC",
        stack: 1,
        weight: 8,
        value: 20,
        rarity: "uncommon",
        components: [
          new Equippable({ slot: "armor", mods: { defense: 2, maxHp: 5 } }),
        ],
      },
      {
        id: "swift_ring",
        name: "ITEM_SWIFT_RING",
        stack: 1,
        weight: 1,
        value: 40,
        rarity: "rare",
        components: [new Equippable({ slot: "trinket", mods: { speed: 40 } })],
      },
      // Backpack: equippable that grows the wearer's Inventory capacity (Container).
      {
        id: "backpack",
        name: "ITEM_BACKPACK",
        stack: 1,
        weight: 3,
        value: 30,
        rarity: "uncommon",
        components: [
          new Equippable({ slot: "backpack" }),
          new Container({ capacity: 8 }),
        ],
      },
      // Currency + unique loot.
      { id: "coin", name: "ITEM_COIN", weight: 0, value: 1, rarity: "common" },
      { id: "gem", name: "ITEM_GEM", weight: 1, value: 50, rarity: "rare" },
      {
        id: "key",
        name: "ITEM_KEY",
        stack: 1,
        weight: 0,
        value: 0,
        rarity: "epic",
      },
      // Crafting materials (no behavior — consumed by Recipes at a workbench).
      { id: "wood", name: "ITEM_WOOD", weight: 1, value: 1, rarity: "common" },
      { id: "iron", name: "ITEM_IRON", weight: 2, value: 4, rarity: "common" },
      // Weapon mods (WeaponMod) — fungible items installed into a weapon's sockets at a workbench
      // with the Toolkit module slotted (WeaponModUI panel). `weapon` deltas fold into the composed
      // attack profile; `stat` deltas fold into the wearer's derived Stats. A delta only applies to a
      // field the BASE weapon declares (e.g. reach is melee-only, bulletSpeed ranged-only — so
      // mod_heavy's reach is inert on the blaster, mod_scope's speed inert on a sword). Crafted with
      // the Forge module (RpgRecipes).
      {
        id: "mod_sharp",
        name: "ITEM_MOD_SHARP",
        description: "ITEM_MOD_SHARP_DESC",
        weight: 1,
        value: 25,
        rarity: "uncommon",
        components: [
          new WeaponMod({ weapon: { damage: 2 }, stat: { attack: 1 } }),
        ],
      },
      {
        id: "mod_rapid",
        name: "ITEM_MOD_RAPID",
        description: "ITEM_MOD_RAPID_DESC",
        weight: 1,
        value: 25,
        rarity: "uncommon",
        components: [new WeaponMod({ weapon: { fireCd: -4 } })],
      },
      {
        id: "mod_heavy",
        name: "ITEM_MOD_HEAVY",
        description: "ITEM_MOD_HEAVY_DESC",
        weight: 1,
        value: 40,
        rarity: "rare",
        components: [new WeaponMod({ weapon: { damage: 3, reach: 10 } })],
      },
      {
        id: "mod_scope",
        name: "ITEM_MOD_SCOPE",
        description: "ITEM_MOD_SCOPE_DESC",
        weight: 1,
        value: 40,
        rarity: "rare",
        components: [new WeaponMod({ weapon: { bulletSpeed: 250 } })],
      },
      // Workbench modules (WorkbenchModule) — slotted into a workbench's single module slot to
      // upgrade it. The three "recipes" modules unlock the recipes that declare `requires: <id>`
      // (RpgRecipes); the Toolkit ("weaponmod") switches the bench into the weapon-mod panel. All
      // are crafted at the BARE bench (base recipes), so the bench bootstraps its own upgrades.
      {
        id: "forge",
        name: "ITEM_FORGE",
        description: "ITEM_FORGE_DESC",
        weight: 3,
        value: 30,
        rarity: "uncommon",
        components: [new WorkbenchModule()], // kind defaults "recipes"
      },
      {
        id: "alembic",
        name: "ITEM_ALEMBIC",
        description: "ITEM_ALEMBIC_DESC",
        weight: 2,
        value: 35,
        rarity: "uncommon",
        components: [new WorkbenchModule()],
      },
      {
        id: "hearth",
        name: "ITEM_HEARTH",
        description: "ITEM_HEARTH_DESC",
        weight: 3,
        value: 25,
        rarity: "uncommon",
        components: [new WorkbenchModule()],
      },
      {
        id: "toolkit",
        name: "ITEM_TOOLKIT",
        description: "ITEM_TOOLKIT_DESC",
        weight: 2,
        value: 40,
        rarity: "rare",
        components: [new WorkbenchModule({ kind: "weaponmod" })],
      },
    ]);
  },
};
