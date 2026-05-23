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

// Robot mode — variable-height jump. Press = solid initial hop; HOLD to
// stretch the jump way higher than a cube by reducing gravity for a brief
// window; release (or hit the time cap) and gravity returns to normal so the
// robot falls. Auto-repeats on every landing (same hold-to-jump rhythm as
// cube) — only the resulting jump height varies by hold duration.
//
// Tuned so the robot ALWAYS clears taller obstacles than a cube can:
//   Tap-only peak     = ROBOT_JUMP_INIT_VY² / (2 * GRAVITY) = 560²/5000 ≈ 63 px (~2 cells)
//   Full-hold peak    ≈ 170 px (~5 cells) — clearly above the cube's 87 px
const ROBOT_JUMP_INIT_VY = -560;          // initial velY on press; tap-only peak ≈ 63 px
const ROBOT_HOLD_GRAVITY_MULT = 0.22;     // gravity during the hold window (22% of normal)
const ROBOT_MAX_HOLD_TIME = 0.34;         // seconds — beyond this, gravity snaps back

// Swingcopter mode — held = gravity flips OPPOSITE the current gravityDir
// (player accelerates UP), released = gravity is normal (player falls). It's
// the same shape as ship mode but the magnitudes are equal to the cube's
// gravity, not the ship's gentler thrust, so the player swings sharply
// between rising and falling. A gravity-portal flip swaps which direction
// "held" produces — same gravityDir trick as every other mode.
const SWING_GRAVITY = 1700; // px/s² — applied bidirectionally
const SWING_MAX_VY = 620;   // px/s vertical clamp

// Spider mode — instant snap up/down. There is no rolling and no arc: the
// spider just teleports along the gravity axis to the next surface in the
// direction it would fall in the FLIPPED gravity. If there is no surface
// within reach, the gravity is flipped normally and the spider just falls
// under regular gravity. The probe range below covers the full vertical
// playable band (CEILING_Y..groundY ≈ 352 px) plus a generous margin so the
// snap never short-falls when nothing is in the way.
const SPIDER_SNAP_RANGE = 480; // px — how far above/below to look for a surface

// Wave mode — the GD wave. No gravity at all: the dart moves at perfect ±45°,
// because vy = ±vx by construction. Holding the button locks vy to −vx (going
// up-and-right), releasing locks it to +vx (down-and-right). Gravity-flipping
// just swaps the signs, exactly like every other mode.
//   Body shape: small centred 14×14 hitbox so the visible dart can graze
//   edges without instantly dying.

// Visual size of the player.
export const PLAYER_SIZE = 36;

// Orb payload identifiers — both the queued orb and the fire callback use
// this union. Adding a new orb means extending this and the fireOrb switch.
export type OrbKind =
  | "orb_purple"
  | "orb_yellow"
  | "orb_blue"
  | "orb_black"
  | "orb_green";

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
  // Spider mode: same tap=flip-gravity rhythm as ball, but the player snaps
  // to the next surface in the new gravity direction. Debounced via this
  // flag so a stack of rapid taps doesn't chain-teleport.
  private spiderSnapReady = true;
  // Horizontal run speed — mutable so speed-portals can rescale it on the
  // fly without changing the global RUN_SPEED constant (which is the design
  // baseline used by all jump-physics math).
  private currentRunSpeed: number = RUN_SPEED;
  // Visual / hitbox scale — driven by mini_portal (0.6×) / big_portal (1×).
  // The sprite's setScale propagates to the arcade body's render size so the
  // hitbox shrinks with the visual. Source-pixel sizes/offsets set in
  // setMode stay the same; only the rendered scale changes.
  private currentSizeScale: number = 1;

  // Wave-mode trail. A single Graphics object that accumulates a black
  // polyline of every position the dart has visited. Created on entering
  // wave mode, cleared on respawn. Stays visible after switching back to
  // cube/ship/etc. — matches GD, where the wave's path stays on screen.
  private waveTrail: Phaser.GameObjects.Graphics | null = null;
  private waveTrailLastX = 0;
  private waveTrailLastY = 0;

  // Robot-mode jump state machine. Each landed press starts a "controlled
  // jump" phase during which gravity is reduced as long as the button is
  // held (capped by ROBOT_MAX_HOLD_TIME). Released mid-air locks the jump
  // so re-pressing doesn't resume it.
  private robotJumpActive = false;
  private robotJumpLocked = false;
  private robotJumpTimer = 0;

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
      case "robot": {
        // Boxy humanoid silhouette: head + torso + two legs, with a dark
        // visor slit on the head and a belt across the torso. Reads as
        // "little robot" at 32×32.
        g.fillStyle(fill, 1);
        // Head
        g.fillRect(9, 3, 14, 9);
        // Torso
        g.fillRect(7, 12, 18, 11);
        // Left leg
        g.fillRect(9, 23, 5, 7);
        // Right leg
        g.fillRect(18, 23, 5, 7);
        // Outlines
        g.lineStyle(stroke, outline, 1);
        g.strokeRect(9, 3, 14, 9);
        g.strokeRect(7, 12, 18, 11);
        g.strokeRect(9, 23, 5, 7);
        g.strokeRect(18, 23, 5, 7);
        // Visor slit + belt
        g.fillStyle(outline, 1);
        g.fillRect(11, 6, 10, 3);
        g.fillRect(8, 18, 16, 2);
        break;
      }
      case "wave": {
        // Sharp dart pointing right — concave "fish-tail" notch at the back
        // makes the silhouette read as motion (vs. the symmetric diamond it
        // used to be). At PLAYER_SIZE 36 the visible dart is ~24 px long;
        // the actual hitbox (set in setMode) is only 14×14 so 45°-runs
        // between hazards are tight but fair.
        g.fillStyle(fill, 1);
        g.beginPath();
        g.moveTo(size - 2, size / 2); // nose tip
        g.lineTo(3, 5);               // upper tail
        g.lineTo(10, size / 2);       // tail notch
        g.lineTo(3, size - 5);        // lower tail
        g.closePath();
        g.fillPath();
        g.lineStyle(stroke, outline, 1);
        g.strokePath();
        break;
      }
      case "swing": {
        // Small flying machine silhouette: round-ish body in the centre with
        // a horizontal rotor blade on top and a small tail fin at the rear.
        // Reads as a hovering little helicopter at 32×32; entirely different
        // from ship (pointed nose) and UFO (wide disc).
        const cx = size / 2;
        const cy = size / 2 + 1;
        // Tail fin (back-left)
        g.fillStyle(fill, 1);
        g.beginPath();
        g.moveTo(2, cy - 4);
        g.lineTo(10, cy - 1);
        g.lineTo(10, cy + 3);
        g.lineTo(2, cy + 5);
        g.closePath();
        g.fillPath();
        g.lineStyle(stroke, outline, 1);
        g.strokePath();
        // Main body — squat oval-ish rounded rect
        g.fillStyle(fill, 1);
        g.fillRoundedRect(cx - 8, cy - 6, 18, 12, 5);
        g.lineStyle(stroke, outline, 1);
        g.strokeRoundedRect(cx - 8, cy - 6, 18, 12, 5);
        // Cockpit / visor dot near the front
        g.fillStyle(outline, 1);
        g.fillCircle(cx + 5, cy - 1, 2);
        // Rotor mast (vertical bar going up from the body)
        g.fillStyle(outline, 1);
        g.fillRect(cx - 1, cy - 11, 2, 5);
        // Rotor blade (long thin horizontal bar across the top)
        g.fillStyle(outline, 1);
        g.fillRect(2, cy - 12, size - 4, 2);
        break;
      }
      case "spider": {
        // Spider silhouette: small round body + four angular legs jutting
        // out to the sides. Reads as "creepy crawler" at 32×32 and is clearly
        // different from the ball (which is a smooth circle).
        const cx = size / 2;
        const cy = size / 2;
        // Legs first so the body draws over the joins.
        g.lineStyle(stroke + 0.5, outline, 1);
        // Upper-left leg (two segments)
        g.lineBetween(cx - 4, cy - 3, cx - 11, cy - 8);
        g.lineBetween(cx - 11, cy - 8, cx - 14, cy - 2);
        // Upper-right leg
        g.lineBetween(cx + 4, cy - 3, cx + 11, cy - 8);
        g.lineBetween(cx + 11, cy - 8, cx + 14, cy - 2);
        // Lower-left leg
        g.lineBetween(cx - 4, cy + 3, cx - 11, cy + 8);
        g.lineBetween(cx - 11, cy + 8, cx - 14, cy + 2);
        // Lower-right leg
        g.lineBetween(cx + 4, cy + 3, cx + 11, cy + 8);
        g.lineBetween(cx + 11, cy + 8, cx + 14, cy + 2);
        // Body — round-ish, slightly squashed vertically
        g.fillStyle(fill, 1);
        g.fillCircle(cx, cy, 8);
        g.lineStyle(stroke, outline, 1);
        g.strokeCircle(cx, cy, 8);
        // Two eye dots so the spider has a "face"
        g.fillStyle(outline, 1);
        g.fillCircle(cx - 3, cy - 2, 1.5);
        g.fillCircle(cx + 3, cy - 2, 1.5);
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
    const shape:
      | "cube"
      | "ship"
      | "ball"
      | "ufo"
      | "wave"
      | "robot"
      | "spider"
      | "swing" =
      mode === "ship"
        ? "ship"
        : mode === "ball"
        ? "ball"
        : mode === "ufo"
        ? "ufo"
        : mode === "wave"
        ? "wave"
        : mode === "robot"
        ? "robot"
        : mode === "spider"
        ? "spider"
        : mode === "swing"
        ? "swing"
        : "cube";
    const texKey = `tx_player_minimal_${shape}`;
    if (!this.scene.textures.exists(texKey)) {
      Player.makeTexture(this.scene, texKey, { ...this.skin, shape });
    }
    this.setTexture(texKey);
    this.updateVisualScale();
    // Body shape / alignment per mode:
    //   cube/ball → 22×22, bottom-aligned for normal gravity, top-aligned
    //               for inverted (so the visible cube sits flush on the
    //               surface it's on).
    //   ship/ufo  → 22×22 centred inside the texture (they float, never rest).
    //   wave      → 14×14 centred — small dart hitbox so 45°-pinpoint runs
    //               between hazards are actually possible.
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (mode === "wave") {
      body.setSize(14, 14);
      body.setOffset(9, 9);
    } else if (mode === "ship" || mode === "ufo" || mode === "swing") {
      // Floaters — body centred inside the 32×32 texture; they never rest
      // on a surface so symmetric alignment is correct.
      body.setSize(22, 22);
      body.setOffset(5, 5);
    } else {
      body.setSize(22, 22);
      body.setOffset(5, this.gravityDir === 1 ? 10 : 0);
    }

    // When entering wave mode, lazily create the trail Graphics. We don't
    // destroy it when LEAVING wave (in GD the line stays drawn until the
    // player dies / restarts) — that's handled by reset().
    if (mode === "wave" && !this.waveTrail) {
      this.waveTrail = this.scene.add.graphics();
      this.waveTrail.setDepth(4); // above blocks, below player (depth 5)
      this.waveTrail.lineStyle(3, 0x1a1a1a, 1);
    }
    if (mode === "wave") {
      // Anchor the first trail segment at the current position so the line
      // doesn't shoot out from (0,0) on the first frame after the portal.
      this.waveTrailLastX = this.x;
      this.waveTrailLastY = this.y;
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

  /**
   * Visually + hitbox shrink (or restore) the player. mini_portal sends
   * scale 0.6, big_portal sends 1. Hitbox follows automatically because the
   * arcade body renders at sourceSize × spriteScale.
   */
  setSizeScale(scale: number) {
    this.currentSizeScale = scale;
    this.updateVisualScale();
  }

  /** Apply the current size scale to the visible sprite. */
  private updateVisualScale() {
    this.setDisplaySize(
      PLAYER_SIZE * this.currentSizeScale,
      PLAYER_SIZE * this.currentSizeScale
    );
    this.baseScale = this.scaleX;
  }

  /**
   * Mini-mode physics multiplier — applied to every vertical impulse the
   * player can produce (cube jump, robot jump, UFO flap, pad/orb forces).
   * A small mini cube CAN'T jump as high as a full-size cube; this is the
   * single source of truth for that.
   *   1.0× scale → 1.0  (no change)
   *   0.6× scale → 0.78 (jump peak ~60% of normal, matches GD feel)
   */
  private isMini(): boolean {
    return this.currentSizeScale < 0.95;
  }
  private getJumpMult(): number {
    return this.isMini() ? 0.78 : 1;
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
          body.setVelocityY(JUMP_FORCE * this.gravityDir * this.getJumpMult());
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
      case "spider": {
        // Spider — INSTANT snap to the next surface in the opposite gravity
        // direction. No arc, no spinning. Debounced via spiderSnapReady so
        // a held button (or rapid tap) doesn't chain-teleport.
        if (this.spiderSnapReady && this.isGrounded()) {
          this.spiderSnap();
          this.spiderSnapReady = false;
        }
        break;
      }
      case "ufo": {
        // Flappy-bird flap. setVelocityY REPLACES current velY (doesn't add)
        // so a stack of rapid taps doesn't accumulate into a rocket launch —
        // each tap just resets velY to the flap value, which is exactly the
        // GD UFO feel. Sign flips with gravity so an inverted UFO flaps DOWN.
        const body = this.body as Phaser.Physics.Arcade.Body;
        body.setVelocityY(
          UFO_FLAP_FORCE * this.gravityDir * this.getJumpMult()
        );
        break;
      }
    }
  }

  // ─── Spider snap ────────────────────────────────────────────────────────

  /**
   * Spider's signature move: instantly teleport the player along the gravity
   * axis to the next solid surface (block or world floor/ceiling) in the
   * direction that would become "down" after flipping gravity. If no surface
   * is found within SPIDER_SNAP_RANGE, the gravity is just flipped normally
   * and the player free-falls — same as if it were a ball.
   */
  private spiderSnap() {
    const body = this.body as Phaser.Physics.Arcade.Body;
    // The NEW gravity direction (post-flip): if we were 1, we'll become -1
    // → "down" becomes UP, so we look UPWARD for the next surface.
    const newGravityDir = (this.gravityDir === 1 ? -1 : 1) as 1 | -1;
    // Direction of travel when snapping: opposite of new gravity direction
    // (= "up of the new world", i.e. against the new gravity).
    // Wait — we want to land on the surface the new gravity would pull us
    // toward. So we travel IN the direction of new gravity until we hit a
    // surface. dir = +1 means snap DOWN, dir = -1 means snap UP.
    const dir = newGravityDir;

    const probeW = 18; // a bit narrower than the body so corners don't snag
    const probeX = body.center.x - probeW / 2;
    // Probe ahead of the body in the direction we're snapping.
    const probeY = dir === 1 ? body.bottom : body.top - SPIDER_SNAP_RANGE;
    const probeH = SPIDER_SNAP_RANGE;

    let bestSurfaceY: number | null = null;
    if (this.scene?.physics) {
      const bodies = this.scene.physics.overlapRect(
        probeX,
        probeY,
        probeW,
        probeH,
        false,
        true
      ) as Phaser.Physics.Arcade.Body[];
      for (const b of bodies) {
        // Ignore our own body if it somehow shows up.
        if (b.gameObject === this) continue;
        // dir === 1 (snap down): we want the TOP of the closest body BELOW us.
        // dir === -1 (snap up): we want the BOTTOM of the closest body ABOVE us.
        if (dir === 1) {
          const top = b.top;
          if (top >= body.bottom) {
            if (bestSurfaceY === null || top < bestSurfaceY) bestSurfaceY = top;
          }
        } else {
          const bottom = b.bottom;
          if (bottom <= body.top) {
            if (bestSurfaceY === null || bottom > bestSurfaceY)
              bestSurfaceY = bottom;
          }
        }
      }
    }

    // Always flip the gravity — even when there's nothing to snap to. That
    // way the spider behaves like the ball in empty air (free-fall in the
    // new direction) rather than getting stuck.
    this.flipGravity();

    if (bestSurfaceY !== null) {
      // Move the sprite so the body's leading edge sits flush on the surface.
      // The body's offset inside the texture was just swapped by flipGravity:
      //   new gravityDir = 1  → offsetY = 10  (body BOTTOM aligned to texture)
      //   new gravityDir = -1 → offsetY = 0   (body TOP aligned to texture)
      // The sprite's setY refers to the texture center. We need to compute
      // the sprite Y that puts the body leading edge on `bestSurfaceY`.
      const bodyH = body.height; // 22
      if (newGravityDir === 1) {
        // Snap DOWN: body bottom = bestSurfaceY → body top = bestSurfaceY - bodyH.
        // Offset (after flip) = (5, 10), so spriteTop = body.top - 10.
        // spriteCenterY = spriteTop + spriteDisplayHeight/2.
        const spriteTop = bestSurfaceY - bodyH - 10;
        this.y = spriteTop + this.displayHeight / 2;
      } else {
        // Snap UP: body top = bestSurfaceY → body bottom = bestSurfaceY + bodyH.
        // Offset = (5, 0), so spriteTop = body.top - 0 = bestSurfaceY.
        const spriteTop = bestSurfaceY;
        this.y = spriteTop + this.displayHeight / 2;
      }
      // Zero vertical velocity — spider lands cleanly.
      body.velocity.y = 0;
      // Sync the body to the new sprite position so the next physics step
      // doesn't see us mid-tunnel through anything.
      body.updateFromGameObject();
    }
  }

  // ─── Pads & orbs ────────────────────────────────────────────────────────
  // A pad fires the instant the player overlaps it (handled by an arcade
  // overlap callback in GameplayScene). An orb does nothing on overlap but
  // "arms" the player — the next jump-press while still overlapping fires
  // the orb's payload. queuedOrb is reset every frame by GameplayScene
  // (set to the orb kind during overlap, null otherwise).
  private queuedOrb: OrbKind | null = null;
  private onOrbFiredCb: (kind: OrbKind) => void = () => undefined;

  /** Called every frame by GameplayScene during overlap (or with null). */
  setQueuedOrb(kind: OrbKind | null) {
    this.queuedOrb = kind;
  }

  /** Scene wires a callback so it can mark the orb sprite "activated"
   *  and play a squash tween the moment the player consumes the orb. */
  setOrbFiredCallback(cb: (kind: OrbKind) => void) {
    this.onOrbFiredCb = cb;
  }

  /** Auto-trigger pad (purple = light, yellow = normal, blue = gravity). */
  bouncePadPurple() {
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setVelocityY(PAD_FORCE_PURPLE * this.gravityDir * this.getJumpMult());
  }
  bouncePadYellow() {
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setVelocityY(PAD_FORCE_YELLOW * this.gravityDir * this.getJumpMult());
  }
  bouncePadBlue() {
    // Gravity flip pad — same physics shape as a gravity portal but
    // re-armable: pads can be re-triggered the next time you touch one,
    // they're not a one-shot event like a portal x-crossing. Tiny pop in
    // the new direction so the cube launches off the surface it was on.
    this.flipGravity();
  }

  private fireOrb(kind: OrbKind) {
    const body = this.body as Phaser.Physics.Arcade.Body;
    const mult = this.getJumpMult();
    if (kind === "orb_purple") {
      body.setVelocityY(PAD_FORCE_PURPLE * this.gravityDir * mult);
    } else if (kind === "orb_yellow") {
      body.setVelocityY(PAD_FORCE_YELLOW * this.gravityDir * mult);
    } else if (kind === "orb_blue") {
      this.flipGravity();
    } else if (kind === "orb_black") {
      // Black orb — sharp dash IN the current gravity direction (down for
      // normal gravity, up for inverted). Replaces vertical velocity rather
      // than adding so a pre-existing upward jump is killed instantly and
      // the dash always feels the same regardless of context.
      const DASH_FORCE = 1100;
      body.setVelocityY(DASH_FORCE * this.gravityDir);
    } else if (kind === "orb_green") {
      // Green orb — flips gravity, THEN fires a yellow-orb-strength hop in
      // the NEW gravity direction. flipGravity() mirrors velY and gives a
      // small kick, but we overwrite it immediately so the resulting jump
      // is consistent (always the yellow-pad impulse against new gravity).
      this.flipGravity();
      body.setVelocityY(PAD_FORCE_YELLOW * this.gravityDir * mult);
    }
    this.onOrbFiredCb(kind);
  }

  jumpRelease() {
    this.isJumpHeld = false;
    // Robot: releasing the button mid-jump LOCKS the current jump — re-pressing
    // in the air won't resume the low-gravity boost. Without this you could
    // tap-release-tap to repeatedly extend a jump. Reset on landing.
    if (this.mode === "robot" && this.robotJumpActive) {
      this.robotJumpLocked = true;
    }
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
        body.setVelocityY(JUMP_FORCE * this.gravityDir * this.getJumpMult());
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
    } else if (this.mode === "spider") {
      // Spider: between taps it behaves just like a cube — normal gravity,
      // sticks to whatever surface gravity is pulling it toward. Tap → snap
      // (handled in jumpPress via spiderSnap). Re-arm on landing.
      if (this.isGrounded()) {
        this.spiderSnapReady = true;
      }
      body.setGravityY(GRAVITY * this.gravityDir);
    } else if (this.mode === "swing") {
      // Swingcopter — symmetric two-state gravity. Releasing makes the
      // copter fall in the current gravity direction; holding INVERTS the
      // gravity so it rises. Both magnitudes are equal so the swing is
      // perfectly symmetric, and the velY clamp keeps the player from
      // running away vertically. A gravity-portal flip naturally swaps
      // which input direction produces "up" — same gravityDir trick as
      // ship/UFO/etc.
      const dir = this.isJumpHeld ? -1 : 1;
      body.setGravityY(SWING_GRAVITY * dir * this.gravityDir);
      body.velocity.y = Phaser.Math.Clamp(
        body.velocity.y,
        -SWING_MAX_VY,
        SWING_MAX_VY
      );
    } else if (this.mode === "robot") {
      // Robot — variable-height jump.
      //
      //   1. Grounded + held + !active → start a new jump (initial velY,
      //      timer reset, flag set).
      //   2. In-air + active + held + !locked + timer < MAX → reduced
      //      gravity, timer ticks. The longer you hold, the higher you go,
      //      up to a hard cap.
      //   3. Anything else (release, time-up, falling) → normal gravity.
      //   4. On landing → reset jump-active and lock so the next press
      //      starts a fresh controlled jump.
      const grounded = this.isGrounded();
      if (grounded) {
        this.robotJumpActive = false;
        this.robotJumpLocked = false;
      }
      if (grounded && this.isJumpHeld && !this.robotJumpActive) {
        body.setVelocityY(
          ROBOT_JUMP_INIT_VY * this.gravityDir * this.getJumpMult()
        );
        this.robotJumpActive = true;
        this.robotJumpTimer = 0;
      }
      const inControlledRise =
        !grounded &&
        this.robotJumpActive &&
        this.isJumpHeld &&
        !this.robotJumpLocked &&
        this.robotJumpTimer < ROBOT_MAX_HOLD_TIME;
      if (inControlledRise) {
        body.setGravityY(
          GRAVITY * ROBOT_HOLD_GRAVITY_MULT * this.gravityDir
        );
        this.robotJumpTimer += delta / 1000;
      } else {
        body.setGravityY(GRAVITY * this.gravityDir);
      }
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
    } else if (this.mode === "wave") {
      // Wave — pure 45° vector. No gravity, vy locked to ±vx so the dart
      // ALWAYS moves at the same slope, just toggled by whether the player
      // is holding the button. This is the entire skill of the wave: you
      // play with the timing of presses, not with any momentum.
      //   gravityDir flips direction in inverted gravity, exactly like every
      //   other mode (held = "toward up of current gravity").
      body.setGravityY(0);
      const dir = this.isJumpHeld ? -1 : 1;
      body.setVelocityY(this.currentRunSpeed * dir * this.gravityDir);

      // Extend the wave trail. One line segment per frame, from the dart's
      // previous position to its current one. Over a level this accumulates
      // into the iconic zig-zag GD line.
      if (this.waveTrail) {
        this.waveTrail.lineBetween(
          this.waveTrailLastX,
          this.waveTrailLastY,
          this.x,
          this.y
        );
        this.waveTrailLastX = this.x;
        this.waveTrailLastY = this.y;
      }
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
    } else if (this.mode === "robot") {
      // Robot stays upright (it has legs — spinning would look broken).
      // Just snap back to 0° smoothly whenever airborne or landed.
      const target = this.gravityDir === 1 ? 0 : 180;
      const t = 1 - Math.pow(0.7, dtFrames);
      this.angle = Phaser.Math.Linear(this.angle, target, t);
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
    } else if (this.mode === "spider") {
      // Spider keeps its silhouette stable. Just snap to upright (or 180°
      // when stuck to a ceiling under flipped gravity).
      const target = this.gravityDir === 1 ? 0 : 180;
      const t = 1 - Math.pow(0.7, dtFrames);
      this.angle = Phaser.Math.Linear(this.angle, target, t);
    } else if (this.mode === "swing") {
      // Tilt with velY like ship, but the rotor blade keeps the silhouette
      // readable so we use a smaller max tilt than ship.
      const targetAngle = Phaser.Math.Clamp(
        (body.velocity.y / SWING_MAX_VY) * 30 * this.gravityDir,
        -30,
        30
      );
      const t = 1 - Math.pow(0.78, dtFrames);
      this.angle = Phaser.Math.Linear(this.angle, targetAngle, t);
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
    } else if (this.mode === "wave") {
      // Hard 45° / -45° tilt locked to button state — the visual exactly
      // tracks the physics: dart noses up when held, down when released.
      const targetAngle = (this.isJumpHeld ? -45 : 45) * this.gravityDir;
      const t = 1 - Math.pow(0.4, dtFrames);
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
    this.spiderSnapReady = true;
    this.isJumpHeld = false;
    this.setFlipY(false);
    this.angle = 0;
    // Wipe any wave trail drawn during the previous attempt — a fresh run
    // starts on a clean canvas.
    if (this.waveTrail) {
      this.waveTrail.destroy();
      this.waveTrail = null;
    }
    // Force-restore the cube texture in case the player died in ship/ball
    // mode — without this you'd respawn as a triangle.
    const texKey = `tx_player_minimal_cube`;
    if (!this.scene.textures.exists(texKey)) {
      Player.makeTexture(this.scene, texKey, { ...this.skin, shape: "cube" });
    }
    this.setTexture(texKey);
    // Reset size back to 1× on respawn so a mini_portal from a previous
    // attempt doesn't leak into the new one.
    this.currentSizeScale = 1;
    this.updateVisualScale();
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
    // Restore the normal-gravity body shape AND alignment. setOffset alone
    // wouldn't undo a wave-mode death (the body would still be 14×14).
    body.setSize(22, 22);
    body.setOffset(5, 10);
  }

  isAlive() {
    return this.alive;
  }

  // External hook — destroys the wave-mode trail explicitly. Useful for
  // scene shutdown / level end where we want the line gone even if the
  // player didn't die. (Reset already handles the respawn path.)
  destroyTrail() {
    if (this.waveTrail) {
      this.waveTrail.destroy();
      this.waveTrail = null;
    }
  }
  // No beat-pulse in the minimalist look — kept for back-compat callers.
  pulse() {}
}
