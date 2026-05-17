import * as Phaser from "phaser";
import type { Skin } from "../skins/skins";
import type { PlayerMode } from "../levels/types";
import { THEME } from "../theme";

// Physics constants — tuned for the 16:9 landscape canvas (960×540).
// Cube jump is a single fixed-height hop, just like classic Geometry Dash:
// no variable height. Holding the button auto-jumps each landing.
//
// IMPORTANT: world gravity is set to 0 in PhaserGame.ts. ALL vertical accel
// on the player comes from `body.setGravityY(GRAVITY * gravityDir)`. This is
// what makes gravity flip truly symmetric: the body's gravity sign is the
// only thing that changes, magnitude is identical in both directions.
//
// Tuned so the cube clears at least 3 adjacent ground spikes:
//   Max jump height   = JUMP_FORCE² / (2 * GRAVITY) = 660² / 5000 ≈ 87 px
//   Air time          = 2 * |JUMP_FORCE| / GRAVITY ≈ 0.528 s
//   Horizontal travel = RUN_SPEED * air time ≈ 158 px
//   3 spikes = 3×32 = 96 px → ~62 px of margin (still comfortable).
export const GRAVITY = 2500;
export const JUMP_FORCE = -660;
export const RUN_SPEED = 300;

// Pad / orb impulse strengths. All three pads share the same physics shape
// (a single instantaneous velocity change in the direction opposite gravity),
// they just hand out different magnitudes:
//   purple  – very light hop, ~0.7× a normal jump (just a tiny bounce)
//   yellow  – medium bounce, ~1.2× a normal jump (clearly stronger than purple
//             but not the wild launch the classic GD yellow pad does)
//   blue    – no impulse, just flips gravity (handled separately)
export const PAD_FORCE_PURPLE = -460;
export const PAD_FORCE_YELLOW = -800;
// PAD_FORCE kept as an alias so any legacy callers still resolve to a sane
// magnitude.
export const PAD_FORCE = PAD_FORCE_YELLOW;

// Ship-mode flight. World gravity is 0 so these are the TOTAL accelerations
// the body sees while in ship mode. Same idea as the cube's gravityDir trick:
// both constants are multiplied by `gravityDir`, so an inverted gravity portal
// flips the ship just like it flips the cube — release-falls-up, hold-thrusts-
// down. Symmetric magnitudes (1700/1700) give the responsive "fly around the
// map" feel rather than the heavy GD-style ship that drops like a stone.
const SHIP_THRUST = -1700; // body accel while jump held (toward "up" of current gravity)
const SHIP_FALL = 1700;    // body accel while NOT held (toward "down" of current gravity)
const SHIP_MAX_VY = 500;   // px/s vertical clamp — caps the speed in both directions

// UFO mode — flappy-bird mechanic. Each discrete tap fires a single upward
// impulse (against current gravity); between taps the body falls freely under
// the same GRAVITY the cube uses. Holding the button does NOT auto-flap —
// the player has to release and tap again, which is what makes UFO feel
// different from both cube ("auto-jump while held") and ship ("continuous
// thrust while held").
const UFO_FLAP_FORCE = -560; // initial velY per tap; peak hop ≈ 63 px (~2 cells)
const UFO_MAX_VY = 700;      // vertical clamp so a long fall doesn't gain unfair speed

// Visual size of the player.
export const PLAYER_SIZE = 36;

export class Player extends Phaser.Physics.Arcade.Sprite {
  private skin: Skin;
  private isJumpHeld = false;
  private alive = true;
  // Baseline scale captured after setDisplaySize(). reset() restores this —
  // otherwise it would shrink the player back to texture-native size (32 px)
  // instead of display size (36 px).
  private baseScale = 1;

  // Modes — switched by portals.
  private mode: PlayerMode = "cube";
  // gravity direction: 1 = down (normal), -1 = up (flipped). Flipped via
  // gravity_portal. Affects jump direction and ground detection.
  private gravityDir: 1 | -1 = 1;
  // Ball mode flips gravity on each tap rather than jumping.
  private ballGravityFlipReady = true;
  // Horizontal run speed — mutable so speed-portals can rescale it on the
  // fly without changing the global RUN_SPEED constant (which is the design
  // baseline used by all jump-physics math).
  private currentRunSpeed: number = RUN_SPEED;

  constructor(scene: Phaser.Scene, x: number, y: number, skin: Skin) {
    // Procedural texture key — unified minimalist look, one texture per shape
    // (no per-skin variants).
    const texKey = `tx_player_minimal_${skin.shape}`;
    if (!scene.textures.exists(texKey)) {
      Player.makeTexture(scene, texKey, skin);
    }
    super(scene, x, y, texKey);
    this.skin = skin;

    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setOrigin(0.5, 0.5);
    this.setDisplaySize(PLAYER_SIZE, PLAYER_SIZE);
    // After setDisplaySize the scale is not 1 — it's PLAYER_SIZE / texture
    // size. Cache it so reset() preserves the visual size.
    this.baseScale = this.scaleX;

    const body = this.body as Phaser.Physics.Arcade.Body;
    // Hitbox is noticeably smaller than the visible 36 px cube — gives the
    // cube room to slip through 1-cell-wide gaps and forgives near-misses
    // on spike sides. Texture is 32×32; body is 22×22 with offset (5,10) so
    // the body's BOTTOM edge lines up with the texture's bottom edge. Means
    // a spawnY = groundY - PLAYER_SIZE/2 puts both the visible cube and its
    // physics body flush with the ground line — no first-frame "settling".
    // Top of body still sits ~7 display-px below the texture top, which
    // keeps the low-ceiling forgiveness (you can squeeze through 1-cell
    // gaps without the corner clipping a hanging block).
    body.setSize(22, 22);
    body.setOffset(5, 10);
    body.setCollideWorldBounds(false);
    body.setGravityY(GRAVITY);
    body.setVelocityX(this.currentRunSpeed);
    body.setMaxVelocity(this.currentRunSpeed, 2000);
  }

  static makeTexture(scene: Phaser.Scene, key: string, skin: Skin) {
    // Minimalist player — white silhouette with a thick ink outline, so it
    // reads cleanly against the solid-black obstacles. No skin colours, no
    // gloss, no inner shape: matches the wireframe look of the prototype.
    const size = 32;
    const g = scene.add.graphics({ x: 0, y: 0 });
    const fill = 0xffffff; // white body
    const outline = 0x1a1a1a; // ink border
    const stroke = 2;

    switch (skin.shape) {
      case "cube": {
        g.fillStyle(fill, 1);
        g.fillRect(stroke / 2, stroke / 2, size - stroke, size - stroke);
        g.lineStyle(stroke, outline, 1);
        g.strokeRect(stroke / 2, stroke / 2, size - stroke, size - stroke);
        break;
      }
      case "ball": {
        g.fillStyle(fill, 1);
        g.fillCircle(size / 2, size / 2, size / 2 - stroke / 2);
        g.lineStyle(stroke, outline, 1);
        g.strokeCircle(size / 2, size / 2, size / 2 - stroke / 2);
        break;
      }
      case "ship": {
        // GD-style ship silhouette: pointed nose on the right, tapered tail
        // on the left, dark cockpit window near the front, small wing-fin
        // sticking down at the rear. Rendered at native 32×32 — gets scaled
        // up to PLAYER_SIZE (36) at runtime.
        //
        // Hull — single closed path, tail to nose:
        g.fillStyle(fill, 1);
        g.beginPath();
        g.moveTo(3, 12);    // tail upper-left
        g.lineTo(15, 7);    // shoulder rises forward
        g.lineTo(24, 9);    // top behind the nose
        g.lineTo(30, 16);   // nose tip
        g.lineTo(24, 23);   // bottom behind the nose
        g.lineTo(15, 25);   // belly
        g.lineTo(3, 20);    // tail lower-left
        g.closePath();
        g.fillPath();
        g.lineStyle(stroke, outline, 1);
        g.strokePath();

        // Cockpit — dark trapezoid window sitting behind the nose. Reads as
        // "this end is the front" at a glance.
        g.fillStyle(outline, 1);
        g.beginPath();
        g.moveTo(19, 12);
        g.lineTo(25, 14);
        g.lineTo(25, 18);
        g.lineTo(19, 20);
        g.closePath();
        g.fillPath();

        // Wing/fin — small triangle hanging off the bottom-rear, sells the
        // "jet / GD ship" shape vs. just a blob.
        g.fillStyle(fill, 1);
        g.beginPath();
        g.moveTo(6, 21);
        g.lineTo(11, 29);
        g.lineTo(15, 23);
        g.closePath();
        g.fillPath();
        g.lineStyle(stroke, outline, 1);
        g.strokePath();
        break;
      }
      case "wave": {
        g.fillStyle(fill, 1);
        g.beginPath();
        g.moveTo(size / 2, 2);
        g.lineTo(size - 2, size / 2);
        g.lineTo(size / 2, size - 2);
        g.lineTo(2, size / 2);
        g.closePath();
        g.fillPath();
        g.lineStyle(stroke, outline, 1);
        g.strokePath();
        break;
      }
      case "ufo": {
        // Classic flying saucer: wide flat disc with a small dome on top
        // and four cockpit lights underneath. Reads as "UFO" at 32×32.
        // Disc body — flat rounded slab, the bulk of the silhouette.
        g.fillStyle(fill, 1);
        g.fillRoundedRect(1, 17, 30, 10, 5);
        g.lineStyle(stroke, outline, 1);
        g.strokeRoundedRect(1, 17, 30, 10, 5);
        // Dome on top — upper semicircle. Filled, then only the curved part
        // is stroked (skip the closing line because the disc already draws
        // an edge across the dome's base).
        g.fillStyle(fill, 1);
        g.beginPath();
        g.arc(size / 2, 17, 7, Math.PI, 0, true);
        g.closePath();
        g.fillPath();
        g.beginPath();
        g.arc(size / 2, 17, 7, Math.PI, 0, true);
        g.strokePath();
        // Cockpit lights — four small dark dots on the disc's underside.
        g.fillStyle(outline, 1);
        g.fillCircle(size / 2 - 9, 23, 1.5);
        g.fillCircle(size / 2 - 3, 23, 1.5);
        g.fillCircle(size / 2 + 3, 23, 1.5);
        g.fillCircle(size / 2 + 9, 23, 1.5);
        break;
      }
    }
    g.generateTexture(key, size, size);
    g.destroy();
  }

  // ─── Modes ───────────────────────────────────────────────────────────────

  setMode(mode: PlayerMode) {
    if (this.mode === mode) return;
    this.mode = mode;
    // Visual: swap the texture so the cube actually BECOMES a triangle ship
    // (and back). The skin's colour scheme is preserved — only the shape
    // changes. Textures are cached per-shape after first use.
    const shape: "cube" | "ship" | "ball" | "ufo" =
      mode === "ship"
        ? "ship"
        : mode === "ball"
        ? "ball"
        : mode === "ufo"
        ? "ufo"
        : "cube";
    const texKey = `tx_player_minimal_${shape}`;
    if (!this.scene.textures.exists(texKey)) {
      Player.makeTexture(this.scene, texKey, { ...this.skin, shape });
    }
    this.setTexture(texKey);
    this.setDisplaySize(PLAYER_SIZE, PLAYER_SIZE);
    this.baseScale = this.scaleX;
    // Body alignment per mode:
    //   cube/ball → bottom-aligned for normal gravity, top-aligned for inverted
    //               (so the visible cube sits flush on the surface it's on)
    //   ship/ufo  → centred inside the texture (they float between floor and
    //               ceiling, never rest on either, so an asymmetric body
    //               would just bias the hitbox for no reason)
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (mode === "ship" || mode === "ufo") {
      body.setOffset(5, 5);
    } else {
      body.setOffset(5, this.gravityDir === 1 ? 10 : 0);
    }
  }
  getMode(): PlayerMode {
    return this.mode;
  }

  flipGravity() {
    this.gravityDir = (this.gravityDir === 1 ? -1 : 1) as 1 | -1;
    const body = this.body as Phaser.Physics.Arcade.Body;

    // CORE RULE: gravity magnitude is constant, only the SIGN changes. Same
    // physics in both directions — no separate "upside-down mode".
    body.setGravityY(GRAVITY * this.gravityDir);

    // Mirror the player visually so it doesn't look upside-down on the ceiling.
    this.setFlipY(this.gravityDir === -1);

    // Symmetric body alignment is the missing piece of GD-style gravity:
    //   normal   → body BOTTOM lines up with texture bottom (rests on floor)
    //   inverted → body TOP    lines up with texture top    (rests on ceiling)
    // Without this swap the visible cube clips ~10 px into ceiling blocks and
    // landing detection feels wrong because the body is bottom-heavy inside
    // the texture in both directions. Body 22×22 inside a 32×32 texture, so
    // (5, 10) bottom-aligns and (5, 0) top-aligns.
    body.setOffset(5, this.gravityDir === 1 ? 10 : 0);

    // Mirror vertical velocity through the flip. A mid-air flip then keeps
    // momentum but reverses direction — feels symmetric.
    body.velocity.y = -body.velocity.y;

    // If we were grounded (vy ≈ 0 after the mirror), give a small kick in the
    // new gravity direction so the cube DEFINITELY leaves the surface it was
    // on this frame. Per the TЗ: "после gravity switch иногда нужно grounded
    // = false" — without it, blocked.down/up linger and you can get sticky
    // surfaces or a phantom double-jump.
    if (Math.abs(body.velocity.y) < 200) {
      body.velocity.y = 200 * this.gravityDir;
    }
  }
  getGravityDir(): 1 | -1 {
    return this.gravityDir;
  }

  /**
   * Change the player's horizontal run speed by a multiplier of the baseline
   * RUN_SPEED. Called from GameplayScene when the player crosses a speed
   * portal. Updates both the live X velocity and the body's max-velocity
   * clamp so the new speed sticks the next physics tick.
   */
  setRunSpeedMultiplier(mult: number) {
    this.currentRunSpeed = RUN_SPEED * mult;
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setVelocityX(this.currentRunSpeed);
    body.setMaxVelocity(this.currentRunSpeed, 2000);
  }
  getRunSpeed(): number {
    return this.currentRunSpeed;
  }

  // ─── Input ──────────────────────────────────────────────────────────────

  jumpPress() {
    if (!this.alive) return;
    this.isJumpHeld = true;

    // Orb takes priority over a regular jump. If the player is currently
    // overlapping an orb (set every frame by GameplayScene), tapping triggers
    // the orb's payload INSTEAD of the normal jump, regardless of grounded
    // state. Each orb is debounced via consumeOrbDuringOverlap = false until
    // overlap ends.
    if (this.queuedOrb) {
      this.fireOrb(this.queuedOrb);
      this.queuedOrb = null;
      return;
    }

    const body = this.body as Phaser.Physics.Arcade.Body;
    switch (this.mode) {
      case "cube": {
        // Immediate hop if grounded. Continuous re-jump while held is
        // handled in tick() — that's the GD-style "hold to keep jumping".
        if (this.isGrounded()) {
          body.setVelocityY(JUMP_FORCE * this.gravityDir);
        }
        break;
      }
      case "ship":
        // Continuous thrust handled in tick() — nothing to do on press.
        break;
      case "ball": {
        // Tap flips gravity in ball mode. Debounced via ballGravityFlipReady,
        // re-enabled when the ball touches a surface again.
        if (this.ballGravityFlipReady && this.isGrounded()) {
          this.flipGravity();
          this.ballGravityFlipReady = false;
        }
        break;
      }
      case "ufo": {
        // Flappy-bird flap. setVelocityY REPLACES current velY (doesn't add)
        // so a stack of rapid taps doesn't accumulate into a rocket launch —
        // each tap just resets velY to the flap value, which is exactly the
        // GD UFO feel. Sign flips with gravity so an inverted UFO flaps DOWN.
        const body = this.body as Phaser.Physics.Arcade.Body;
        body.setVelocityY(UFO_FLAP_FORCE * this.gravityDir);
        break;
      }
    }
  }

  // ─── Pads & orbs ────────────────────────────────────────────────────────
  // A pad fires the instant the player overlaps it (handled by an arcade
  // overlap callback in GameplayScene). An orb does nothing on overlap but
  // "arms" the player — the next jump-press while still overlapping fires
  // the orb's payload. queuedOrb is reset every frame by GameplayScene
  // (set to the orb kind during overlap, null otherwise).
  private queuedOrb: "orb_purple" | "orb_yellow" | "orb_blue" | null = null;
  private onOrbFiredCb: (
    kind: "orb_purple" | "orb_yellow" | "orb_blue"
  ) => void = () => undefined;

  /** Called every frame by GameplayScene during overlap (or with null). */
  setQueuedOrb(kind: "orb_purple" | "orb_yellow" | "orb_blue" | null) {
    this.queuedOrb = kind;
  }

  /** Scene wires a callback so it can mark the orb sprite "activated"
   *  and play a squash tween the moment the player consumes the orb. */
  setOrbFiredCallback(
    cb: (kind: "orb_purple" | "orb_yellow" | "orb_blue") => void
  ) {
    this.onOrbFiredCb = cb;
  }

  /** Auto-trigger pad (purple = light, yellow = normal, blue = gravity). */
  bouncePadPurple() {
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setVelocityY(PAD_FORCE_PURPLE * this.gravityDir);
  }
  bouncePadYellow() {
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setVelocityY(PAD_FORCE_YELLOW * this.gravityDir);
  }
  bouncePadBlue() {
    // Gravity flip pad — same physics shape as a gravity portal but
    // re-armable: pads can be re-triggered the next time you touch one,
    // they're not a one-shot event like a portal x-crossing. Tiny pop in
    // the new direction so the cube launches off the surface it was on.
    this.flipGravity();
  }

  private fireOrb(kind: "orb_purple" | "orb_yellow" | "orb_blue") {
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (kind === "orb_purple") {
      body.setVelocityY(PAD_FORCE_PURPLE * this.gravityDir);
    } else if (kind === "orb_yellow") {
      body.setVelocityY(PAD_FORCE_YELLOW * this.gravityDir);
    } else if (kind === "orb_blue") {
      this.flipGravity();
    }
    this.onOrbFiredCb(kind);
  }

  jumpRelease() {
    this.isJumpHeld = false;
  }

  /**
   * "Smart" auto-jump filter: probe a thin column above the player up to
   * the height the jump would reach. If a static body (block) sits in that
   * column, the jump would crash the cube — skip it so the player can just
   * walk under low ceilings.
   */
  private isJumpClearOfBlocks(): boolean {
    if (!this.scene?.physics) return true;
    const body = this.body as Phaser.Physics.Arcade.Body;
    // Actual apex of a hop with current physics is ~87 px. Add a small buffer
    // so the cube doesn't graze a block whose underside is right at the peak.
    const peak = (JUMP_FORCE * JUMP_FORCE) / (2 * GRAVITY) + 24;
    const probeW = 20; // slightly narrower than the body so corners don't snag
    // Probe rectangle directly above (or below, if gravity flipped) the
    // ACTUAL body — body is now asymmetric inside the texture (offset y=10)
    // so we read body.top/body.bottom instead of computing from sprite.y.
    const probeX = body.center.x - probeW / 2;
    const probeY = this.gravityDir === 1 ? body.top - peak : body.bottom;
    const bodies = this.scene.physics.overlapRect(
      probeX,
      probeY,
      probeW,
      peak,
      false,
      true
    );
    return bodies.length === 0;
  }

  /** Legacy alias: defaults to the yellow (normal) pad. */
  bouncePad() {
    this.bouncePadYellow();
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
    if (body.velocity.x < this.currentRunSpeed) {
      body.setVelocityX(this.currentRunSpeed);
    }

    if (this.mode === "cube") {
      // Constant gravity — no variable jump. The button changes WHETHER to
      // jump, not HOW HIGH.
      body.setGravityY(GRAVITY * this.gravityDir);
      // Hold-to-jump: re-jump on every landing, BUT skip the jump if the
      // arc would crash the cube into a block right above. Without this
      // guard a held button on a low platform under a hanging ceiling
      // launches the cube straight into the ceiling and kills it.
      if (
        this.isJumpHeld &&
        this.isGrounded() &&
        this.isJumpClearOfBlocks()
      ) {
        body.setVelocityY(JUMP_FORCE * this.gravityDir);
      }
    } else if (this.mode === "ship") {
      // Ship — symmetric flight. Hold = thrust toward "up of current gravity",
      // release = drift toward "down of current gravity". Both magnitudes
      // are identical (SHIP_THRUST == −SHIP_FALL by design) so the ship rises
      // and falls at the same rate, which is the easiest feel to control.
      // Inverted gravity (gravityDir = −1) flips both — exactly the same
      // gravityDir trick the cube uses.
      if (this.isJumpHeld) {
        body.setGravityY(SHIP_THRUST * this.gravityDir);
      } else {
        body.setGravityY(SHIP_FALL * this.gravityDir);
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
    } else if (this.mode === "ufo") {
      // UFO: same gravity as a cube — falls freely between taps. The actual
      // flap impulse is fired in jumpPress(), NOT here, so holding the button
      // does nothing. Clamp velY both directions so the saucer doesn't
      // build up a runaway fall after a long drop.
      body.setGravityY(GRAVITY * this.gravityDir);
      body.velocity.y = Phaser.Math.Clamp(
        body.velocity.y,
        -UFO_MAX_VY,
        UFO_MAX_VY
      );
    }

    // Rotation feedback per mode. The lerps below use frame-rate-independent
    // exponential decay: at 60 Hz they collapse the same fraction of the
    // remaining gap as the old fixed-coefficient Linear() did, but at 144 Hz
    // they don't over-snap (which used to make the cube look "twitchy" on
    // high-refresh monitors). General form:
    //   t = 1 - (1 - oldCoeff)^(delta_seconds * 60)
    const dtFrames = delta / (1000 / 60);
    if (this.mode === "cube") {
      if (this.isGrounded()) {
        const snap = Math.round(this.angle / 90) * 90;
        const t = 1 - Math.pow(0.6, dtFrames); // was 0.4 per frame
        this.angle = Phaser.Math.Linear(this.angle, snap, t);
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
      const t = 1 - Math.pow(0.82, dtFrames); // was 0.18 per frame
      this.angle = Phaser.Math.Linear(this.angle, targetAngle, t);
    } else if (this.mode === "ball") {
      // Spin with horizontal speed.
      this.angle += (delta / 1000) * 540 * this.gravityDir;
    } else if (this.mode === "ufo") {
      // Subtle tilt with velY — saucer noses up just after a flap, levels
      // out as it falls. Clamped tighter than the ship so the silhouette
      // stays readable as a UFO rather than spinning like a coin.
      const targetAngle = Phaser.Math.Clamp(
        (body.velocity.y / UFO_MAX_VY) * 22 * this.gravityDir,
        -22,
        22
      );
      const t = 1 - Math.pow(0.78, dtFrames);
      this.angle = Phaser.Math.Linear(this.angle, targetAngle, t);
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
    // Minimalist: no particle burst — death is communicated through camera
    // shake/flash (handled by the scene) plus the player vanishing.
    this.setVisible(false);
  }

  /**
   * Soft reset for retry — keeps all level geometry in place and avoids a
   * full Phaser scene restart (which causes a ~50ms hitch on long levels).
   */
  reset(x: number, y: number) {
    this.alive = true;
    this.mode = "cube";
    this.gravityDir = 1;
    this.ballGravityFlipReady = true;
    this.isJumpHeld = false;
    this.setFlipY(false);
    this.angle = 0;
    // Force-restore the cube texture in case the player died in ship/ball
    // mode — without this you'd respawn as a triangle.
    const texKey = `tx_player_minimal_cube`;
    if (!this.scene.textures.exists(texKey)) {
      Player.makeTexture(this.scene, texKey, { ...this.skin, shape: "cube" });
    }
    this.setTexture(texKey);
    this.setDisplaySize(PLAYER_SIZE, PLAYER_SIZE);
    this.baseScale = this.scaleX;
    this.setScale(this.baseScale);
    this.setVisible(true);
    this.setActive(true);
    this.setPosition(x, y);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.enable = true;
    body.reset(x, y);
    // Reset run speed to baseline — any speed-portal multiplier from the
    // previous attempt is discarded on respawn.
    this.currentRunSpeed = RUN_SPEED;
    body.setVelocity(this.currentRunSpeed, 0);
    body.setGravityY(GRAVITY);
    body.setMaxVelocity(this.currentRunSpeed, 2000);
    // Restore the normal-gravity body alignment (was swapped to top-aligned
    // by flipGravity if the player flipped before dying, or centred if it
    // died in ship mode).
    body.setOffset(5, 10);
  }

  isAlive() {
    return this.alive;
  }

  // Kept for backward compatibility with callers in GameplayScene; the
  // minimalist look intentionally has no beat pulse, so these are no-ops.
  destroyTrail() {}
  pulse() {}
}
