// Top-down-specific content, layered over the shared RpgContent (rarity tiers, universal
// items, recipes). Called once from sceneTopDown.create() (not at top level — avoids GMRT
// load-order issues). Idempotent.
//
// Extras here: unique items (gem / key / backpack), this genre's WEAPONS (both ranged:
// `wood_sword` and `blaster` fire cursor-aimed bullets, differing in cadence), and the
// genre's quests + achievements.
globalThis.TopDownContent = {
  registered: false,

  // Quest ids (shared between content, scene, and NPC data).
  QUEST_SLIMES: "td_slimes",
  QUEST_GATHER: "td_gather",
  QUEST_REACH: "td_reach",

  register() {
    if (this.registered) return;
    this.registered = true;

    RpgContent.register(); // shared rarities + universal items + recipes

    Item.register([
      { id: "gem", name: "ITEM_GEM", weight: 1, value: 50, rarity: "rare" },
      {
        id: "key",
        name: "ITEM_KEY",
        stack: 1,
        weight: 0,
        value: 0,
        rarity: "epic",
      },
      // Ranged weapons (cursor-aimed bullets); damage/cadence from the Weapon component.
      {
        id: "wood_sword",
        name: "ITEM_WOOD_SWORD",
        stack: 1,
        weight: 4,
        value: 8,
        rarity: "common",
        components: [
          new Equippable({ slot: "weapon", mods: { attack: 1 } }),
          new Weapon({ damage: 3, fireCd: 14, bulletSpeed: 520 }),
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
          new Weapon({ damage: 6, fireCd: 6, bulletSpeed: 700 }),
        ],
      },
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
    ]);

    QuestLog.register([
      {
        id: this.QUEST_SLIMES,
        name: "QUEST_SLIMES_NAME",
        objLabel: "QUEST_SLIMES_OBJ", // formatted as text(label, done, count)
        objectives: [{ kind: "kill", target: "slime", count: 5 }],
        rewards: { xp: 25, items: [{ itemId: "potion", qty: 2 }] },
      },
      {
        id: this.QUEST_GATHER,
        name: "QUEST_GATHER_NAME",
        objLabel: "QUEST_GATHER_OBJ",
        objectives: [{ kind: "collect", target: "slime_gel", count: 3 }],
        rewards: { xp: 15, items: [{ itemId: "gem", qty: 1 }] },
      },
      {
        id: this.QUEST_REACH,
        name: "QUEST_REACH_NAME",
        objLabel: "QUEST_REACH_OBJ",
        objectives: [{ kind: "reach", target: "ruins", count: 1 }],
        rewards: { xp: 10 },
      },
    ]);

    Achievement.register([
      {
        id: "td_first_kill",
        name: "ACH_FIRST_KILL_NAME",
        desc: "ACH_FIRST_KILL_DESC",
        condition: (c) => (c.enemiesKilled ?? 0) >= 1,
      },
      {
        id: "td_slayer",
        name: "ACH_SLAYER_NAME",
        desc: "ACH_SLAYER_DESC",
        condition: (c) => (c.enemiesKilled ?? 0) >= 10,
      },
      {
        id: "td_collector",
        name: "ACH_COLLECTOR_NAME",
        desc: "ACH_COLLECTOR_DESC",
        condition: (c) => (c.itemsCollected ?? 0) >= 10,
      },
      {
        id: "td_quester",
        name: "ACH_QUESTER_NAME",
        desc: "ACH_QUESTER_DESC",
        condition: (c) => (c.questsCompleted ?? 0) >= 1,
      },
    ]);
  },
};
