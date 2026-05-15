import * as Phaser from "phaser";

// Boot scene generates all textures procedurally so we don't ship binary
// assets. Real art replaces these by load.image() calls + same keys.
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: "BootScene" });
  }

  preload() {
    // Reserved for future binary assets.
  }

  create() {
    this.makeBlockTexture();
    this.makeSpikeTexture();
    this.makeJumpPadTexture();
    this.makeParticleTexture();
    this.makePortalTexture("tx_portal_gravity", 0x4dffb8, "↕");
    this.makePortalTexture("tx_portal_ship", 0x5c5cff, "▶");
    this.makePortalTexture("tx_portal_cube", 0xb388ff, "■");
    this.scene.start("GameplayScene");
    this.scene.launch("UIScene");
  }

  private makeBlockTexture() {
    const size = 32;
    const g = this.add.graphics({ x: 0, y: 0 });
    g.fillStyle(0xffffff, 1);
    g.fillRect(0, 0, size, size);
    g.fillStyle(0xcccccc, 1);
    g.fillRect(2, 2, size - 4, size - 4);
    g.lineStyle(2, 0xffffff, 1);
    g.strokeRect(1, 1, size - 2, size - 2);
    g.generateTexture("tx_block", size, size);
    g.destroy();
  }

  private makeSpikeTexture() {
    const size = 32;
    const g = this.add.graphics({ x: 0, y: 0 });
    g.fillStyle(0xffffff, 1);
    g.beginPath();
    g.moveTo(0, size);
    g.lineTo(size / 2, 0);
    g.lineTo(size, size);
    g.closePath();
    g.fillPath();
    g.lineStyle(1.5, 0xffffff, 1);
    g.strokePath();
    g.generateTexture("tx_spike", size, size);
    g.destroy();
  }

  private makeJumpPadTexture() {
    const w = 32;
    const h = 12;
    const g = this.add.graphics({ x: 0, y: 0 });
    g.fillStyle(0xffffff, 1);
    g.fillRoundedRect(0, 0, w, h, 4);
    g.fillStyle(0x1a1a2e, 1);
    g.beginPath();
    g.moveTo(8, h - 3);
    g.lineTo(w / 2, 3);
    g.lineTo(w - 8, h - 3);
    g.closePath();
    g.fillPath();
    g.generateTexture("tx_jump_pad", w, h);
    g.destroy();
  }

  private makeParticleTexture() {
    const size = 8;
    const g = this.add.graphics({ x: 0, y: 0 });
    g.fillStyle(0xffffff, 1);
    g.fillCircle(size / 2, size / 2, size / 2);
    g.generateTexture("tx_particle", size, size);
    g.destroy();
  }

  private makePortalTexture(key: string, color: number, _glyph: string) {
    const w = 28;
    const h = 64;
    const g = this.add.graphics({ x: 0, y: 0 });
    // Outer aura
    g.fillStyle(color, 0.18);
    g.fillRoundedRect(-4, -4, w + 8, h + 8, 14);
    // Frame
    g.lineStyle(2, color, 1);
    g.strokeRoundedRect(0, 0, w, h, 10);
    // Inner glow
    g.fillStyle(color, 0.35);
    g.fillRoundedRect(2, 2, w - 4, h - 4, 8);
    // Center band
    g.fillStyle(0xffffff, 0.95);
    g.fillRect(w / 2 - 1, 6, 2, h - 12);
    g.generateTexture(key, w, h);
    g.destroy();
  }
}
