import * as Phaser from "phaser";
import { BootScene } from "./scenes/BootScene";
import { GameplayScene } from "./scenes/GameplayScene";
import { UIScene } from "./scenes/UIScene";
import type { LevelData } from "./levels/types";
import { GAME_HEIGHT, GAME_WIDTH } from "./constants";

export { GAME_HEIGHT, GAME_WIDTH };

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
    backgroundColor: "#28415F",
    scale: {
      // ENVELOP fills 100% of the container, preserving 16:9 aspect — on
      // ultra-wide screens the top/bottom of the world clips off rather
      // than leaving black pillarboxes on the sides.
      mode: Phaser.Scale.ENVELOP,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    physics: {
      default: "arcade",
      arcade: {
        // World gravity is 0 on purpose. All vertical acceleration on the
        // player is supplied by `body.setGravityY(GRAVITY * gravityDir)` in
        // Player.ts. That way a gravity flip is fully symmetric: the body's
        // gravity sign is the ONLY thing that changes, and the magnitude is
        // identical in both directions. If world gravity were non-zero, it
        // would be added to body gravity, so inverted gravity would be
        // (world − body) ≠ −(world + body) — i.e. asymmetric, which is what
        // causes the "mega-jump from the ceiling that slowly drifts back".
        gravity: { x: 0, y: 0 },
        debug: false,
        // ── Deterministic stepping ─────────────────────────────────────────
        // Lock physics integration to a fixed 60 Hz step. Without this,
        // Phaser integrates gravity/velocity with the variable display delta:
        // a 144 Hz monitor produces ~2.4× more sub-steps per second than 60
        // Hz, and rounding error in velocity*dt accumulates differently. The
        // visible symptom is jump height/distance drifting by a couple of
        // pixels between devices — enough that a "barely clears 3 spikes"
        // run on a 60 Hz screen becomes a guaranteed death on 144 Hz.
        //
        // fixedStep:true + fps:60 makes Phaser run as many 1/60 s sub-steps
        // as needed to catch up to wall-clock time, so the same JUMP_FORCE
        // produces the same arc everywhere.
        fps: 60,
        fixedStep: true,
      },
    },
    scene: [BootScene, GameplayScene, UIScene],
    render: {
      pixelArt: false,
      antialias: true,
      // Hint to the browser to pick the discrete GPU on hybrid systems and
      // skip transparency-blended canvas (saves a per-frame composite).
      powerPreference: "high-performance",
      transparent: false,
      clearBeforeRender: true,
    },
    fps: {
      target: 60,
      forceSetTimeOut: false,
      smoothStep: true,
    },
    disableContextMenu: true,
    input: {
      activePointers: 3,
    },
  };

  const game = new Phaser.Game(config);
  game.registry.set("launch", opts);
  return game;
}
