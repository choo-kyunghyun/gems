// Colony prefabs — the level fragments the generator places. Registered at level create() (NOT
// top-level — GMRT load-order), before the generator is built (GenAnchor/PrefabStamp resolve
// them). A def body is a LevelData in footprint-local coords — see Prefab.
//
// Two kinds by how they are placed: ANCHORS (untagged — a site names one by id, GenAnchor fixes it
// once on dry ground near the centre; each carries the site's travel beacon and its `entry`
// arrival marker) and the TAGGED set PrefabStamp scatters at a biome's density ("overworld" for
// the open wilds, "cave" for the tube's pockets).
globalThis.contentPrefabs = {
  register() {
    Prefab.register([
      // ---- anchors ----

      // the colony compound — the home site's whole hand-built ground: the Elder's quest post with
      // the landing beacon and radio, the trader row outside the DEPOT (a closed room around the
      // stockpile chest and workbench, its door to the south), the QUARTERS (the walled ruin, its
      // door to the north, two cots and a lantern — the only safe beds on the planet), and the
      // "reach" quest marker on the ruin walls. Both buildings are rooms (Rooms): a roof over the
      // air and the cold, warmed by their lanterns. No raider — the site is safe (danger 0).
      {
        id: "colony_hub",
        cols: 45,
        rows: 30,
        tiles: [
          {
            layer: "wall",
            rects: [
              [4, 4, 3, 3],
              [16, 3, 1, 1],

              // depot: x 9..15, y 7..12; interior x 10..14, y 8..11; door at (12, 12)
              [9, 7, 7, 1],
              [9, 8, 1, 4],
              [15, 8, 1, 4],
              [9, 12, 3, 1],
              [13, 12, 3, 1],

              [38, 6, 1, 8],

              [22, 13, 1, 1],
              [25, 13, 1, 1],
              [22, 16, 1, 1],
              [25, 16, 1, 1],

              // quarters: x 30..44, y 20..29; interior x 31..43, y 21..28; door at (37, 20)
              [30, 20, 7, 1],
              [38, 20, 7, 1],
              [30, 29, 15, 1],
              [30, 20, 1, 10],
              [44, 20, 1, 10],
            ],
          },
        ],
        spawns: [
          { preset: "entry", gx: 2, gy: 2 },
          {
            preset: "npc",
            gx: 5,
            gy: 2,
            label: "Elder",
            nameKey: "NPC_ELDER_NAME",
            questId: "td_humans",
            color: "#6a5a86",
            settlement: "hub",
          },
          { preset: "reach", gx: 17, gy: 2, half: 88 },
          { preset: "radio", gx: 2, gy: 5 },
          { preset: "prop", gx: 2, gy: 3, kind: "travel", label: "Beacon" },
          // the depot's door (an E-W wall run: walls left and right, so the leaf lies flat) and
          // lantern
          { preset: "prop", gx: 12, gy: 12, kind: "door", label: "Door" },
          { preset: "lantern", gx: 14, gy: 11 },
          // the quarters: door, two cots, lantern
          { preset: "prop", gx: 37, gy: 20, kind: "door", label: "Door" },
          { preset: "prop", gx: 32, gy: 23, kind: "bed", furn: "cot", label: "Cot" },
          { preset: "prop", gx: 35, gy: 23, kind: "bed", furn: "cot", label: "Cot" },
          { preset: "lantern", gx: 42, gy: 27 },
          {
            preset: "chest",
            gx: 10,
            gy: 9,
            capacity: 12,
            settlement: "hub",
            items: [
              { itemId: "medkit", qty: 2 },
              { itemId: "circuitry", qty: 1 },
              { itemId: "adrenal_implant", qty: 1 },
              { itemId: "wood", qty: 5 },
              { itemId: "scrap_metal", qty: 3 },
            ],
          },
          {
            preset: "prop",
            gx: 12,
            gy: 9,
            label: "Workbench",
            color: "#966e46",
            kind: "workbench",
          },
          {
            preset: "npc",
            gx: 8,
            gy: 9,
            label: "Trader",
            nameKey: "NPC_TRADER_NAME",
            color: "#a9743f",
            settlement: "hub",
            merchant: {
              infinite: true,
              buyMargin: 1.25,
              sellMargin: 0.45,
              stock: [
                { itemId: "medkit", qty: 1 },
                { itemId: "medgel", qty: 1 },
                { itemId: "water_bottle", qty: 1 },
                { itemId: "soda", qty: 1 },
                { itemId: "ration_pack", qty: 1 },
                { itemId: "cooked_meat", qty: 1 },
                { itemId: "ammo_light", qty: 1 },
                { itemId: "ammo_heavy", qty: 1 },
                { itemId: "ammo_ap", qty: 1 },
                { itemId: "aeon_rounds", qty: 1 },
                { itemId: "helios_ration", qty: 1 },
                { itemId: "helios_trauma_kit", qty: 1 },
                { itemId: "aeon_cutter", qty: 1 },
                { itemId: "wood", qty: 1 },
                { itemId: "scrap_metal", qty: 1 },
                { itemId: "backpack", qty: 1 },
              ],
            },
          },
          {
            preset: "npc",
            gx: 16,
            gy: 9,
            label: "Quartermaster",
            nameKey: "NPC_QUARTERMASTER_NAME",
            color: "#5a6a8a",
            settlement: "hub",
            merchant: {
              infinite: false,
              buyMargin: 1.15,
              sellMargin: 0.6,
              credits: 500,
              restockSecs: 60,
              capacity: 40,
              stock: [
                { itemId: "combat_stim", qty: 3 },
                { itemId: "armored_vest", qty: 2 },
                { itemId: "helios_vest", qty: 1 },
                { itemId: "adrenal_implant", qty: 1 },
                { itemId: "blaster", qty: 1 },
                { itemId: "aeon_pistol", qty: 1 },
                { itemId: "vekt_pistol", qty: 1 },
                { itemId: "vekt_wrench", qty: 1 },
                { itemId: "mod_scope", qty: 1 },
                { itemId: "mod_grip", qty: 1 },
                { itemId: "ammo_ap", qty: 20 },
              ],
              template: [
                { itemId: "combat_stim", qty: 3 },
                { itemId: "armored_vest", qty: 2 },
                { itemId: "helios_vest", qty: 1 },
                { itemId: "adrenal_implant", qty: 1 },
                { itemId: "blaster", qty: 1 },
                { itemId: "aeon_pistol", qty: 1 },
                { itemId: "vekt_pistol", qty: 1 },
                { itemId: "vekt_wrench", qty: 1 },
                { itemId: "mod_scope", qty: 1 },
                { itemId: "mod_grip", qty: 1 },
                { itemId: "ammo_ap", qty: 20 },
              ],
            },
          },
        ],
      },
      // a wild site's landing pad: the beacon on a 3×3 tile apron, a Survey Post beside it (the
      // site is unsettled until the player founds an outpost there — BuildMode.claim), the
      // arrival a cell below the beacon
      {
        id: "landing_pad",
        cols: 3,
        rows: 3,
        tiles: [{ layer: "floorTile", rects: [[0, 0, 3, 3]] }],
        spawns: [
          { preset: "prop", gx: 1, gy: 1, kind: "travel", label: "Beacon" },
          { preset: "prop", gx: 2, gy: 1, kind: "claim", label: "Survey Post" },
          { preset: "entry", gx: 1, gy: 2 },
        ],
      },
      // the tube's mouth: the beacon on bare rock, the arrival a cell below
      {
        id: "cave_mouth",
        cols: 3,
        rows: 3,
        spawns: [
          { preset: "prop", gx: 1, gy: 1, kind: "travel", label: "Beacon" },
          { preset: "entry", gx: 1, gy: 2 },
        ],
      },

      // ---- overworld ----

      // terrain flavor, no enemies — rock mesh entities (same rects the old collide-only
      // walls covered; the `rock` adapter branch rebuilds the identical solid footprint)
      {
        id: "boulder_cluster",
        tags: ["overworld"],
        weight: 4,
        cols: 4,
        rows: 4,
        spawns: [
          { preset: "rock", gx: 0, gy: 0, w: 1, h: 2 },
          { preset: "rock", gx: 2, gy: 0, w: 1, h: 1 },
          { preset: "rock", gx: 1, gy: 2, w: 2, h: 1 },
          { preset: "rock", gx: 3, gy: 3, w: 1, h: 1 },
        ],
      },
      // sheltered corner with a raider pack (one tougher)
      {
        id: "raider_camp",
        tags: ["overworld"],
        weight: 3,
        cols: 5,
        rows: 5,
        tiles: [
          {
            layer: "wall",
            rects: [
              [0, 0, 3, 1],
              [0, 1, 1, 2],
            ],
          },
        ],
        spawns: [
          { preset: "raider", gx: 3, gy: 2, hp: 3 },
          { preset: "raider", gx: 2, gy: 3, hp: 3 },
          { preset: "raider", gx: 4, gy: 4, hp: 5 },
        ],
      },
      // broken walls around a loot chest
      {
        id: "ruin",
        tags: ["overworld"],
        weight: 1,
        cols: 6,
        rows: 4,
        tiles: [
          {
            layer: "wall",
            rects: [
              [0, 0, 4, 1],
              [0, 1, 1, 2],
              [5, 0, 1, 3],
            ],
          },
        ],
        spawns: [
          {
            preset: "chest",
            gx: 2,
            gy: 2,
            capacity: 8,
            items: [
              { itemId: "coin", qty: 5 },
              { itemId: "scrap_metal", qty: 2 },
            ],
          },
        ],
      },

      // ---- cave ----

      // a raider stash in a tube pocket: the keycard chest behind a walled corner, two guards
      {
        id: "cave_stash",
        tags: ["cave"],
        weight: 1,
        cols: 5,
        rows: 5,
        tiles: [
          {
            layer: "wall",
            rects: [
              [0, 0, 3, 1],
              [0, 1, 1, 2],
            ],
          },
        ],
        spawns: [
          {
            preset: "chest",
            gx: 1,
            gy: 2,
            capacity: 8,
            items: [
              { itemId: "keycard", qty: 1 },
              { itemId: "scrap_metal", qty: 2 },
            ],
          },
          {
            preset: "raider",
            gx: 3,
            gy: 1,
            loot: [
              { itemId: "circuitry", qty: 1 },
              { itemId: "medkit", qty: 1 },
            ],
          },
          {
            preset: "raider",
            gx: 3,
            gy: 3,
            hp: 5,
            loot: [
              { itemId: "circuitry", qty: 2 },
              { itemId: "keycard", qty: 1 },
            ],
          },
        ],
      },
    ]);
  },
};
