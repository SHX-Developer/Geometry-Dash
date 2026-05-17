import * as Phaser from "phaser";
import { THEME } from "../theme";

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

    // Three pad colours — same shape (low slab), tinted differently in
    // GameplayScene/EditorScene via setTint(). Texture is grayscale-ish so
    // tints land predictably.
    this.makePadTexture("tx_pad", THEME.padYellow);
    this.makePadTexture("tx_pad_purple", THEME.padPurple);
    this.makePadTexture("tx_pad_yellow", THEME.padYellow);
    this.makePadTexture("tx_pad_blue", THEME.padBlue);

    // Three orb colours — circles with a darker centre so they read like a
    // "tap target" rather than a pad.
    this.makeOrbTexture("tx_orb_purple", THEME.orbPurple);
    this.makeOrbTexture("tx_orb_yellow", THEME.orbYellow);
    this.makeOrbTexture("tx_orb_blue", THEME.orbBlue);

    this.makePortalTexture("tx_portal_gravity", THEME.portalGravity, "↕");
    this.makePortalTexture("tx_portal_ship", THEME.portalShip, "▶");
    this.makePortalTexture("tx_portal_cube", THEME.portalCube, "■");
    this.makePortalTexture("tx_portal_ufo", THEME.portalUfo, "◉");

    // Speed portals — compact horizontal rings tagged with N chevrons that
    // tell the player the new run-speed level.
    this.makeSpeedPortalTexture("tx_speed_half", THEME.speedHalf, 1, "left");
    this.makeSpeedPortalTexture("tx_speed_1x", THEME.speed1x, 1, "right");
    this.makeSpeedPortalTexture("tx_speed_2x", THEME.speed2x, 2, "right");
    this.makeSpeedPortalTexture("tx_speed_3x", THEME.speed3x, 3, "right");
    this.makeSpeedPortalTexture("tx_speed_4x", THEME.speed4x, 4, "right");
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
    // Legacy texture used by older saves that still reference "tx_jump_pad".
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

  // Generic pad shape — flat slab with an upward chevron painted in the
  // pad's colour. The base is a soft cream so the tinted chevron pops on
  // both the white floor and the off-white ceiling.
  private makePadTexture(key: string, color: number) {
    const w = 32;
    const h = 12;
    const g = this.add.graphics({ x: 0, y: 0 });
    // Base slab
    g.fillStyle(0xffffff, 1);
    g.fillRoundedRect(0, 0, w, h, 3);
    g.lineStyle(1.5, 0x1a1a1a, 1);
    g.strokeRoundedRect(0, 0, w, h, 3);
    // Coloured upward chevron
    g.fillStyle(color, 1);
    g.beginPath();
    g.moveTo(6, h - 3);
    g.lineTo(w / 2, 3);
    g.lineTo(w - 6, h - 3);
    g.closePath();
    g.fillPath();
    g.generateTexture(key, w, h);
    g.destroy();
  }

  // Generic orb shape — circle with a coloured outer ring and a tappable-
  // looking centre. Slightly larger than a pad so the player can tell at a
  // glance "I need to tap this", not just touch it.
  private makeOrbTexture(key: string, color: number) {
    const size = 28;
    const g = this.add.graphics({ x: 0, y: 0 });
    // Soft halo
    g.fillStyle(color, 0.22);
    g.fillCircle(size / 2, size / 2, size / 2);
    // Coloured ring
    g.lineStyle(2, color, 1);
    g.strokeCircle(size / 2, size / 2, size / 2 - 2);
    // White core
    g.fillStyle(0xffffff, 1);
    g.fillCircle(size / 2, size / 2, size / 2 - 6);
    // Dot in centre matching the colour — visual "this is the tap target"
    g.fillStyle(color, 1);
    g.fillCircle(size / 2, size / 2, 3);
    g.generateTexture(key, size, size);
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

  // Short wide ring with N chevrons indicating the speed level.
  private makeSpeedPortalTexture(
    key: string,
    color: number,
    chevrons: number,
    direction: "left" | "right"
  ) {
    const w = 36;
    const h = 22;
    const g = this.add.graphics({ x: 0, y: 0 });
    g.fillStyle(color, 0.22);
    g.fillRoundedRect(-3, -3, w + 6, h + 6, 8);
    g.lineStyle(2, color, 1);
    g.strokeRoundedRect(0, 0, w, h, 6);
    g.fillStyle(color, 0.35);
    g.fillRoundedRect(2, 2, w - 4, h - 4, 4);
    g.fillStyle(0xffffff, 1);
    g.fillRoundedRect(3, 3, w - 6, h - 6, 3);
    const cw = 4;
    const gap = 1.5;
    const totalW = chevrons * cw + (chevrons - 1) * gap;
    const startX = (w - totalW) / 2;
    const top = 6;
    const bot = h - 6;
    const mid = h / 2;
    g.fillStyle(color, 1);
    for (let i = 0; i < chevrons; i++) {
      const x = startX + i * (cw + gap);
      g.beginPath();
      if (direction === "right") {
        g.moveTo(x, top);
        g.lineTo(x + cw, mid);
        g.lineTo(x, bot);
        g.lineTo(x + cw / 2, mid);
      } else {
        g.moveTo(x + cw, top);
        g.lineTo(x, mid);
        g.lineTo(x + cw, bot);
        g.lineTo(x + cw / 2, mid);
      }
      g.closePath();
      g.fillPath();
    }
    g.generateTexture(key, w, h);
    g.destroy();
  }
}
