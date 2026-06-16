# G.E.M.S. June Week-3 Review session

A file-by-file pass over the whole project (the project has grown large enough that a sweep is worthwhile). Apply each goal below to every file as it's checked off.

**Ground rules for this session:** non-surgical refactors are explicitly allowed — touch whatever makes the code better, not just the minimum. Previously-written conventions (especially GMRT 0.19-era notes) can be ignored or dropped when doing so improves the code, **even if it's only readability with no performance gain**. The one hard limit: idioms that are _still broken on GMRT 0.20_ remain real correctness constraints — refactor around them freely, but don't reintroduce a form the current runtime miscompiles.

## Goals

1. **Simplify comments.** Trim verbose/stale comments down to what still earns its place. Keep the one-liners that flag a non-obvious GMRT-Safe idiom (so it isn't "fixed" back), but cut narration and history.
2. **Cleanup GMRT 0.19 legacies.** 0.19 is no longer supported and 0.20 is the default — remove workarounds the [GMRT 0.20 cleanup](ROADMAP.md) covers, and condense comments that still apply to a single current note (drop the 0.19 backstory). Don't touch idioms still broken on 0.20.
3. **Single Responsibility & modularization.** Verify each file/class does one thing. Flag mixed concerns and fat classes (mind the 50-method ceiling, #15065) and split them into smaller collaborators or free helpers.
4. **API consistency & clarity.** Check naming, parameter order, and return shapes are consistent across sibling modules; rename anything ambiguous. Public reads stay methods, not `static get` (GMRT).
5. **Merge duplicate code.** Identify logic duplicated across files and extract it into a shared helper/module.
6. **Mark unused code.** Tag dead/unused code with a `// TODO: Unused code` comment rather than deleting it outright, so it can be reviewed before removal.
7. **Object relationships & logic correctness.** Map how each module relates to and depends on the others, using those relationships to catch logical errors, wrong coupling, or incorrect code.
8. **JSDoc coverage.** Add JSDoc comments across every code file — document each public global/class/method/factory with its params, return shape, and a one-line purpose — so a later session has a complete API reference to work from. Match the existing `@typedef`/`@param` style already used for components.

## Core

- [x] Broadphase
- [x] EntityPreset
- [x] EntitySnapshot
- [x] IdPool
- [x] Query
- [x] Scene
- [x] SceneManager
- [x] World

### Camera

- [x] Camera
- [x] cameraFollow
- [x] cameraPan

### Component

- [x] BBox
- [x] Collision
- [x] Direction
- [x] Grounded
- [x] Lifetime
- [x] Name
- [x] PathRequest
- [x] PathResponse
- [x] Persistent
- [x] Position
- [x] PrevPosition
- [x] State
- [x] Station
- [x] Tag
- [x] Velocity
- [x] Visual

### Input

- [x] Input
- [x] InputAction
- [x] InputAxis
- [x] InputButton
- [x] InputContext

### Level

- [x] ChunkManager
- [x] Level
- [x] TileEdit
- [x] TileLayer
- [x] TileType
- [x] Zone
- [x] ZoneMap
- [x] ZoneSystem

### Render

- [x] ParticleFx
- [x] RenderChunks
- [x] RenderDebugBox
- [x] RenderDebugEntity
- [x] RenderDebugName
- [x] RenderDebugPath
- [x] RenderDebugRange
- [x] RenderDebugTileMap
- [x] RenderEntity
- [x] Renderer
- [x] RenderGrid
- [x] RenderTileMap
- [x] RenderZone
- [x] RenderZoneLabel

### System

- [x] GravitySystem
- [x] InterpolationSystem
- [x] LifetimeSystem
- [x] MovementSystem
- [x] PathfindingSystem
- [x] Pipeline
- [x] SeparationSystem
- [x] SolidSystem
- [x] StateSystem
- [x] TriggerSystem

### UI

- [x] Dialogue
- [x] FloatingText
- [x] I18n
- [x] RadarArrows
- [x] SceneTransition
- [x] SlotDrag
- [x] Toast
- [x] Tooltip
- [x] UIDraw
- [x] UIMinimap
- [x] UIQuestTracker
- [x] VirtualKeyboard

#### Element

- [x] SystemMenu
- [x] UI
- [x] UIAccordion
- [x] UIButton
- [x] UICheckbox
- [x] UIDrag
- [x] UIDropdown
- [x] UIElement
- [x] UIImage
- [x] UIInput
- [x] UIModal
- [x] UINav
- [x] UINineSlice
- [x] UIPanel
- [x] UIProgress
- [x] UIRebind
- [x] UIRichText
- [x] UIScroll
- [x] UISelect
- [x] UISlider
- [x] UISlots
- [x] UIStepper
- [x] UITable
- [x] UITabs
- [x] UIText
- [x] UITooltip
- [x] UITrigger

### Util

- [x] AABB
- [x] Color
- [x] Debug
- [x] DebugImGui
- [x] DebugInspector
- [x] DebugRender
- [x] Display
- [x] File
- [x] Grid
- [x] LevelSerializer
- [x] Log
- [x] MotionPlanner
- [x] NavGrid
- [x] Raycast
- [x] SaveData
- [x] Settings
- [x] Time
- [x] Tween
- [x] Utils
- [x] VertexBuffer

## GemsUI

- [x] GemsContainers
- [x] GemsControls
- [x] GemsTheme
- [x] GemsWidgets

## RPG

### Component

- [x] Animator
- [x] Encumbrance
- [x] Equipment
- [x] Faction
- [x] Follower
- [x] Health
- [x] Inventory
- [x] ItemDrop
- [x] Light
- [x] NPC
- [x] Portal
- [x] Projectile
- [x] Stats
- [x] Turret

### Content

- [x] Achievement
- [x] Consumable
- [x] Container
- [x] Equippable
- [x] Item
- [x] Prefab
- [x] Profile
- [x] QuestLog
- [x] Rarity
- [x] Recipe
- [x] RpgContent
- [x] RpgItems
- [x] RpgPrefabs
- [x] RpgRecipes
- [x] Weapon

### Editor

- [x] sceneEditor

### Scene

- [ ] BuildMode
- [ ] RpgCatalog
- [ ] RpgController
- [ ] RpgLevel
- [ ] RpgMap
- [ ] RpgPlayer
- [ ] RpgQuests
- [ ] RpgSpawn
- [ ] sceneRpg

### System

- [ ] AnimationSystem
- [ ] ChunkSource
- [ ] ConsumableSystem
- [ ] CraftSystem
- [ ] EncumbranceSystem
- [ ] EquipmentSystem
- [ ] FactionSystem
- [ ] FollowerSystem
- [ ] InventorySystem
- [ ] MeleeSystem
- [ ] OverworldGen
- [x] ProjectileSystem
- [ ] RenderDayNight
- [ ] RenderLighting
- [ ] RenderWeather
- [ ] RpgProgression
- [ ] RpgScene
- [ ] sh_daynight
- [ ] SlimeAI
- [ ] Temperature
- [ ] TurretSystem
- [ ] Weather
- [ ] WorldClock

### UI

- [ ] CraftingUI
- [ ] Interactable
- [ ] InvTable
- [ ] RpgHud
- [ ] RpgInventoryUI
- [ ] RpgWorldOverlay
- [ ] StorageUI

## Showcase

### Lobby

- [ ] demo
- [ ] obj_game
- [ ] sceneLobby
- [ ] sceneUIKit

### Map

- [ ] sceneTileAlpha
- [ ] sceneTileInspect
- [ ] sceneTileInspect47
- [ ] sceneTileInspectDual
- [ ] sceneTileMap
- [ ] sceneTileTerrain

### Platformer

- [ ] CollectibleSystem
- [ ] Enemy
- [ ] EnemySystem
- [ ] PlatformerController
- [ ] PlatformerLevel
- [ ] scenePlatformer
- [ ] Spike

### RTS

- [ ] sceneRTS
