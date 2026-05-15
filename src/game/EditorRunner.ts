import * as Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "./constants";
import { EditorScene } from "./scenes/EditorScene";
import type { LevelData } from "./levels/types";

export interface EditorRunnerOptions {
  parent: HTMLElement;
  level: LevelData;
  onChange: (level: LevelData) => void;
}

// Editor-specific Phaser.Game. Lighter config than the gameplay one — no
// physics needed in the editor.
export function createEditorRunner(opts: EditorRunnerOptions): {
  game: Phaser.Game;
  getScene: () => EditorScene | null;
} {
  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    parent: opts.parent,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: "#0F0F1A",
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [EditorScene],
    render: {
      pixelArt: false,
      antialias: true,
    },
    input: {
      activePointers: 3,
    },
  };

  const game = new Phaser.Game(config);

  // Wait for the scene to actually be created, then init it with the level.
  // Scene.start with init() data is the clean Phaser way to push props.
  game.events.once(Phaser.Core.Events.READY, () => {
    game.scene.start("EditorScene", { level: opts.level, onChange: opts.onChange });
  });

  return {
    game,
    getScene: () => game.scene.getScene("EditorScene") as EditorScene | null,
  };
}
