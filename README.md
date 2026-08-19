# G.E.M.S.

GameMaker Entity &amp; Map System

G.E.M.S. is a high-performance UI and entity management system for GameMaker developers. It introduces the Flexbox layout model to help build flexible and complex user interfaces with ease.

## Key Features

- **Flexbox-based Layout**: Responsive UI design utilizing the `flexpanel`.
- **GMRT & JavaScript**: All game logic is JavaScript on the GMRT runtime, not GML.
- **ECS**: Instance-based entity-component-system core with fixed-rate simulation.
- **Gameplay Model**: A complete action-RPG model — combat, items/inventory/equipment, status, survival, crafting, trade, quests — as flat components and systems over the engine, with a ready-made action-RPG scene.
- **Renderer**: Hardware-accelerated tilemaps with autotiling and dual-grid terrain blending.
- **Pathfinding, Input, Save & I18n**: Grid A\*, rebindable input actions, persistence, and localization.

## Getting Started

### Dependencies

- GameMaker
- GMRT 0.20.0

### Build & Run

The project uses `gm-cli` (experimental GameMaker CLI) with the GMRT 0.20 toolchain. The IDE can also build and run.

```sh
gm-cli run     --toolchain GMRT@0.20 gems.yyp   # run
gm-cli compile --toolchain GMRT@0.20 gems.yyp   # compile only
```

VS Code users can run these via the bundled tasks (`.vscode/tasks.json`): **Run**, **Compile**, **Compile (errors only)**.

### Project Structure

- G.E.M.S.
  - Core — the pure engine: ECS, systems, level, render, UI, input, utilities
  - Game — the integrated demo consuming Core: the gameplay model (`Component`/`System`), the item vocabulary (`Item`), content, the themed UI factory kit over the Core UI system, and the scenes — the action-RPG, and the app shell / lobby

## License

G.E.M.S. is licensed under the MIT License. For more details, see the [LICENSE](LICENSE) file in the repository.

## Notice of Generative AI Usage

Various files in this repository—including code, documentation, and assets—were created with the assistance of generative AI technology.

## Open Source Licenses

### Noto Sans

- Licensed under the SIL Open Font License, Version 1.1.
- The full license text and the author's README are located in `/datafiles/i18n/en-US/fonts/Noto_Sans/`.
- Copyright 2022 The Noto Project Authors (https://github.com/notofonts/latin-greek-cyrillic)

### Noto Sans KR

- Licensed under the SIL Open Font License, Version 1.1.
- The full license text and the author's README are located in `/datafiles/i18n/ko-KR/fonts/Noto_Sans_KR/`.
- Copyright 2014-2021 Adobe (http://www.adobe.com/), with Reserved Font Name 'Source'
