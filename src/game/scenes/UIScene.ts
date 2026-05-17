import * as Phaser from "phaser";

// UIScene used to draw a progress bar, level name, attempt counter and a
// "tap to jump" hint directly on the canvas. The React HUD in GameView.tsx
// now owns all of that, listening to the same "run:start" / "run:progress"
// events from GameplayScene. We keep this scene around (referenced from the
// scene list in PhaserGame.ts and launched alongside GameplayScene) so the
// runtime wiring stays unchanged, but it's intentionally empty — the React
// overlay handles every visible HUD element.
export class UIScene extends Phaser.Scene {
  constructor() {
    super({ key: "UIScene", active: false });
  }

  create() {
    // No-op. HUD lives in React.
  }
}
