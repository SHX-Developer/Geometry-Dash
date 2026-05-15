import * as Phaser from "phaser";
import type { Skin } from "../skins/skins";
import type { PlayerMode } from "../levels/types";

// Physics constants from the TЗ:
export const GRAVITY = 1200;
export const JUMP_FORCE = -420;
export const RUN_SPEED = 300;
export const PAD_FORCE = -720;

// Ship-mode flight: hold = thrust up, release = fall. Top speed clamps so
// the ship doesn't escape the play area.
const SHIP_THRUST = -780; // accel applied while holding
const SHIP_MAX_VY = 520;

// Variable jump (cube mode): while held + still going up + within hold
// window, gravity is reduced so a held tap floats higher than a quick tap.
const HOLD_GRAVITY = 600;
const HOLD_WINDOW_MS = 220;

// Visual size of the player.
export const PLAYER_SIZE = 36;

export class Player extends Phaser.Physics.Arcade.Sprite {
  private skin: Skin;
  private primaryColor: number;
  private secondaryColor: number;
  private isJumpHeld = false;
  private jumpStartTime = 0;
  private alive = true;
  private trailEmitter?: Phaser.GameObjects.Particles.ParticleEmitter;

  // Modes — switched by portals.
  private mode: PlayerMode = "cube";
  // gravity direction: 1 = down (normal), -1 = up (flipped). Flipped via
  // gravity_portal. Affects jump direction and ground detection.
  private gravityDir: 1 | -1 = 1;
  // Ball mode flips gravity on each tap rather than jumping.
  private ballGravityFlipReady = true;

  constructor(scene: Phaser.Scene, x: number, y: number, skin: Skin) {
    // Procedural texture key includes the shape so changing shapes generates
    // a fresh texture.
    const texKey = `tx_player_${skin.id}_${skin.shape}`;
    if (!scene.textures.exists(texKey)) {
      Player.makeTexture(scene, texKey, skin);
    }
    super(scene, x, y, texKey);
    this.skin = skin;
    this.primaryColor = Phaser.Display.Color.HexStringToColor(
      skin.primary
    ).color;
    this.secondaryColor = Phaser.Display.Color.HexStringToColor(
      skin.secondary
    ).color;

    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setOrigin(0.5, 0.5);
    this.setDisplaySize(PLAYER_SIZE, PLAYER_SIZE);

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(PLAYER_SIZE - 6, PLAYER_SIZE - 4);
    body.setOffset(3, 2);
    body.setCollideWorldBounds(false);
    body.setGravityY(GRAVITY);
    body.setVelocityX(RUN_SPEED);
    body.setMaxVelocity(RUN_SPEED, 2000);

    this.setupTrail();
  }

  static makeTexture(scene: Phaser.Scene, key: string, skin: Skin) {
    const size = 32;
    const g = scene.add.graphics({ x: 0, y: 0 });
    const primary = Phaser.Display.Color.HexStringToColor(skin.primary).color;
    const secondary = Phaser.Display.Color.HexStringToColor(
      skin.secondary
    ).color;

    switch (skin.shape) {
      case "cube": {
        g.fillStyle(primary, 1);
        g.fillRoundedRect(0, 0, size, size, 5);
        g.fillStyle(secondary, 1);
        g.fillRoundedRect(7, 7, size - 14, size - 14, 3);
        g.fillStyle(0xffffff, 0.18);
        g.fillRect(3, 3, size - 6, 5);
        break;
      }
      case "ball": {
        g.fillStyle(primary, 1);
        g.fillCircle(size / 2, size / 2, size / 2 - 1);
        g.fillStyle(secondary, 1);
        g.fillCircle(size / 2, size / 2, size / 2 - 7);
        // shine
        g.fillStyle(0xffffff, 0.32);
        g.fillCircle(size / 2 - 5, size / 2 - 5, 4);
        break;
      }
      case "ship": {
        // Triangular hull pointing right, cockpit detail.
        g.fillStyle(primary, 1);
        g.beginPath();
        g.moveTo(2, size - 6);
        g.lineTo(size - 4, size / 2);
        g.lineTo(2, 6);
        g.closePath();
        g.fillPath();
        g.fillStyle(secondary, 1);
        g.fillCircle(size / 2, size / 2, 4);
        // wing accent
        g.fillStyle(secondary, 0.8);
        g.fillTriangle(
          2,
          size - 6,
          12,
          size - 2,
          12,
          size - 10
        );
        break;
      }
      case "wave": {
        // Small diamond
        g.fillStyle(primary, 1);
        g.beginPath();
        g.moveTo(size / 2, 2);
        g.lineTo(size - 2, size / 2);
        g.lineTo(size / 2, size - 2);
        g.lineTo(2, size / 2);
        g.closePath();
        g.fillPath();
        g.fillStyle(secondary, 1);
        g.fillCircle(size / 2, size / 2, 5);
        break;
      }
    }
    g.generateTexture(key, size, size);
    g.destroy();
  }

  private setupTrail() {
    this.trailEmitter = this.scene.add.particles(0, 0, "tx_particle", {
      lifespan: 320,
      speed: { min: 10, max: 40 },
      angle: { min: 160, max: 200 },
      scale: { start: 0.7, end: 0 },
      alpha: { start: 0.55, end: 0 },
      tint: this.primaryColor,
      blendMode: Phaser.BlendModes.ADD,
      frequency: 30,
      follow: this,
    });
    this.trailEmitter.setDepth(this.depth - 1);
  }

  // ─── Modes ───────────────────────────────────────────────────────────────

  setMode(mode: PlayerMode) {
    this.mode = mode;
  }
  getMode(): PlayerMode {
    return this.mode;
  }

  flipGravity() {
    this.gravityDir = (this.gravityDir === 1 ? -1 : 1) as 1 | -1;
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setGravityY(GRAVITY * this.gravityDir);
    // Mirror the player visually so it doesn't look upside-down on the ceiling.
    this.setFlipY(this.gravityDir === -1);
    // Give a tiny pop in the new direction so the player launches off the
    // surface they were standing on.
    body.setVelocityY(-160 * this.gravityDir);
  }
  getGravityDir(): 1 | -1 {
    return this.gravityDir;
  }

  // ─── Input ──────────────────────────────────────────────────────────────

  jumpPress() {
    if (!this.alive) return;
    this.isJumpHeld = true;
    const body = this.body as Phaser.Physics.Arcade.Body;
    switch (this.mode) {
      case "cube": {
        const onGround = this.isGrounded();
        if (onGround) {
          body.setVelocityY(JUMP_FORCE * this.gravityDir);
          this.jumpStartTime = this.scene.time.now;
        }
        break;
      }
      case "ship": {
        // continuous thrust handled in tick(); jumpStartTime tracks press
        this.jumpStartTime = this.scene.time.now;
        break;
      }
      case "ball": {
        // Tap flips gravity in ball mode. Debounced via ballGravityFlipReady,
        // re-enabled when the ball touches a surface again.
        if (this.ballGravityFlipReady && this.isGrounded()) {
          this.flipGravity();
          this.ballGravityFlipReady = false;
        }
        break;
      }
    }
  }

  jumpRelease() {
    this.isJumpHeld = false;
  }

  bouncePad() {
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setVelocityY(PAD_FORCE * this.gravityDir);
    this.jumpStartTime = this.scene.time.now;
  }

  private isGrounded(): boolean {
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (this.gravityDir === 1) {
      return body.blocked.down || body.touching.down;
    }
    return body.blocked.up || body.touching.up;
  }

  // ─── Per-frame update ───────────────────────────────────────────────────

  tick(delta: number) {
    if (!this.alive) return;
    const body = this.body as Phaser.Physics.Arcade.Body;

    // Keep forward velocity stable (collisions can dampen it).
    if (body.velocity.x < RUN_SPEED) body.setVelocityX(RUN_SPEED);

    if (this.mode === "cube") {
      // Variable jump: reduce gravity while held + going up.
      const heldRecently =
        this.scene.time.now - this.jumpStartTime < HOLD_WINDOW_MS;
      const goingUp = body.velocity.y * this.gravityDir < 0;
      if (this.isJumpHeld && goingUp && heldRecently) {
        body.setGravityY(HOLD_GRAVITY * this.gravityDir);
      } else {
        body.setGravityY(GRAVITY * this.gravityDir);
      }
    } else if (this.mode === "ship") {
      // Ship: while held, apply thrust opposite to gravity. Cap vertical
      // speed both ways so the ship can't escape.
      if (this.isJumpHeld) {
        body.setGravityY(SHIP_THRUST * this.gravityDir);
      } else {
        body.setGravityY(GRAVITY * 0.65 * this.gravityDir);
      }
      body.velocity.y = Phaser.Math.Clamp(
        body.velocity.y,
        -SHIP_MAX_VY,
        SHIP_MAX_VY
      );
    } else if (this.mode === "ball") {
      // Ball: gravity is normal; tap flips it (handled in jumpPress).
      // Re-arm the flip when the ball lands.
      if (this.isGrounded()) {
        this.ballGravityFlipReady = true;
      }
      body.setGravityY(GRAVITY * this.gravityDir);
    }

    // Rotation feedback per mode.
    if (this.mode === "cube") {
      if (this.isGrounded()) {
        const snap = Math.round(this.angle / 90) * 90;
        this.angle = Phaser.Math.Linear(this.angle, snap, 0.4);
      } else {
        this.angle += (delta / 1000) * 360 * 1.2 * this.gravityDir;
      }
    } else if (this.mode === "ship") {
      // Tilt up/down with vertical velocity.
      const targetAngle = Phaser.Math.Clamp(
        (body.velocity.y / SHIP_MAX_VY) * 40 * this.gravityDir,
        -45,
        45
      );
      this.angle = Phaser.Math.Linear(this.angle, targetAngle, 0.18);
    } else if (this.mode === "ball") {
      // Spin with horizontal speed.
      this.angle += (delta / 1000) * 540 * this.gravityDir;
    }
  }

  // ─── Death / life ───────────────────────────────────────────────────────

  die() {
    if (!this.alive) return;
    this.alive = false;
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0, 0);
    body.setAcceleration(0, 0);
    body.enable = false;
    this.trailEmitter?.stop();
    this.scene.add
      .particles(this.x, this.y, "tx_particle", {
        lifespan: 600,
        speed: { min: 80, max: 260 },
        scale: { start: 1.1, end: 0 },
        alpha: { start: 0.9, end: 0 },
        tint: [this.primaryColor, this.secondaryColor, 0xffffff],
        blendMode: Phaser.BlendModes.ADD,
        quantity: 32,
        emitting: false,
      })
      .explode(32);
    this.setVisible(false);
  }

  isAlive() {
    return this.alive;
  }

  destroyTrail() {
    this.trailEmitter?.destroy();
    this.trailEmitter = undefined;
  }

  // Beat pulse: subtle scale-up when a beat hits, for visual sync.
  pulse() {
    this.scene.tweens.add({
      targets: this,
      scale: { from: 1.18, to: 1 },
      ease: "Quad.easeOut",
      duration: 220,
    });
  }
}
