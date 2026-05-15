import Phaser from "phaser";
import { BootScene } from "./scenes/BootScene";
import { GameplayScene } from "./scenes/GameplayScene";
import { UIScene } from "./scenes/UIScene";
import type { LevelData } from "./levels/types";

// Logical canvas size — portrait 9:16. Scale.FIT keeps the aspect ratio
// inside any container size.
export const GAME_WIDTH = 540;
export const GAME_HEIGHT = 960;

export interface GameLaunchOptions {
  parent: HTMLElement;
  // Either levelId (loads from LevelLoader) or levelData (used by the editor
  // "Play" preview, where the level isn't yet saved).
  levelId?: string;
  levelData?: LevelData;
  skinId: string;
  primary?: string | null;
  secondary?: string | null;
  muted?: boolean;
  onExit: (result: {
    completed: boolean;
    percent: number;
    attempts: number;
  }) => void;
}

export function createGame(opts: GameLaunchOptions): Phaser.Game {
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
    physics: {
      default: "arcade",
      arcade: {
        gravity: { x: 0, y: 1200 },
        debug: false,
      },
    },
    scene: [BootScene, GameplayScene, UIScene],
    render: {
      pixelArt: false,
      antialias: true,
    },
    fps: {
      target: 60,
      forceSetTimeOut: false,
    },
    input: {
      activePointers: 3,
    },
  };

  const game = new Phaser.Game(config);
  game.registry.set("launch", opts);
  return game;
}
