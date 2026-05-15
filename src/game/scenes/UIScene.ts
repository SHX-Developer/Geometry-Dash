import * as Phaser from "phaser";

// Overlay HUD: level name (top), progress bar (top), attempt counter (top
// right). Drawn in screen space — scroll factor 0 keeps it pinned.
export class UIScene extends Phaser.Scene {
  private nameText!: Phaser.GameObjects.Text;
  private attemptText!: Phaser.GameObjects.Text;
  private barFill!: Phaser.GameObjects.Rectangle;
  private barBg!: Phaser.GameObjects.Rectangle;
  private barWidth = 0;

  constructor() {
    super({ key: "UIScene", active: false });
  }

  create() {
    const w = this.cameras.main.width;

    // Progress bar
    this.barWidth = w - 32;
    this.barBg = this.add
      .rectangle(w / 2, 36, this.barWidth, 8, 0xffffff, 0.12)
      .setScrollFactor(0)
      .setDepth(100);
    this.barFill = this.add
      .rectangle(
        16 + 0,
        36,
        0,
        8,
        Phaser.Display.Color.HexStringToColor("#B388FF").color,
        1
      )
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(101);

    this.nameText = this.add
      .text(16, 56, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "14px",
        color: "#B388FF",
      })
      .setScrollFactor(0)
      .setDepth(101);

    this.attemptText = this.add
      .text(w - 16, 56, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "14px",
        color: "#ffffff",
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(101);

    // Listen to gameplay events
    const gameplay = this.scene.get("GameplayScene");
    gameplay.events.on(
      "run:start",
      (payload: { levelName: string; attempts: number }) => {
        this.nameText.setText(payload.levelName);
        this.attemptText.setText(`Attempt #${payload.attempts}`);
        this.barFill.width = 0;
      }
    );
    gameplay.events.on(
      "run:progress",
      (payload: { percent: number; attempts: number }) => {
        this.barFill.width = (this.barWidth * payload.percent) / 100;
        this.attemptText.setText(`Attempt #${payload.attempts}`);
      }
    );

    // Small "tap to jump" hint shown for 2 seconds at the start
    const hint = this.add
      .text(w / 2, this.cameras.main.height - 80, "TAP TO JUMP", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "16px",
        color: "#B388FF",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setAlpha(0.8)
      .setDepth(101);
    this.tweens.add({
      targets: hint,
      alpha: 0,
      delay: 1500,
      duration: 700,
      onComplete: () => hint.destroy(),
    });
  }
}
