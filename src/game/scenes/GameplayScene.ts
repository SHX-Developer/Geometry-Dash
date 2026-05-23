import * as Phaser from "phaser";
import { type GameLaunchOptions } from "../PhaserGame";
import { CEILING_Y, GAME_HEIGHT, GAME_WIDTH } from "../constants";
import { Player, PLAYER_SIZE, type OrbKind } from "../player/Player";
import { loadLevel } from "../levels/LevelLoader";
import type { LevelData, LevelObject, ObjectKind } from "../levels/types";
import { getSkin } from "../skins/skins";
import { BeatEngine } from "../audio/BeatEngine";
import { THEME } from "../theme";

const GROUND_HEIGHT = GAME_HEIGHT;
// World-space X where the player should "live" relative to the camera's
// scrollX (= camera.scrollX + PLAYER_X_ON_SCREEN). With camera zoom, the
// player visually appears at PLAYER_X_ON_SCREEN * zoom canvas pixels in.
const PLAYER_X_ON_SCREEN = 200;
// How long after walking past an orb the player can still tap and fire it.
// Adds a forgiving "late tap" window so you don't have to be frame-perfect
// — once you've touched the orb, you've got ~120 ms to actually press jump.
const ORB_LATE_TAP_GRACE_MS = 120;
// 1.0 = no zoom — the full 960×540 world frame fits on screen. Was 1.2;
// dropped to give the player more reaction time on long spike runs.
const CAMERA_ZOOM = 1.0;
// Vertical camera follow tuning. The camera lerps toward (player.y - half-
// view-height) so the player stays roughly centred vertically. Tight enough
// that ship-mode and flipped-gravity reveal the level ahead, loose enough
// that a normal hop doesn't shake the frame on every jump.
const CAM_Y_LERP_PER_FRAME = 0.12;   // fraction of remaining gap collapsed per 60Hz frame
const CAM_Y_DEADZONE = 28;           // px of slack around the target before camera moves

export class GameplayScene extends Phaser.Scene {
  private player!: Player;
  private level!: LevelData;
  private launch!: GameLaunchOptions;
  private attempts = 0;
  private maxX = 0;
  private finished = false;
  private beat?: BeatEngine;

  // Portals are NOT physics bodies — they trigger on x-crossing so the
  // player can never accidentally jump over them or duck under them
  // depending on their y. Each entry tracks whether it's been triggered.
  private portalState: {
    kind: ObjectKind;
    x: number;
    consumed: boolean;
  }[] = [];

  // groups
  private blocks!: Phaser.Physics.Arcade.StaticGroup;
  private spikes!: Phaser.Physics.Arcade.StaticGroup;
  // Pads come in three flavours, but they share an overlap group; the
  // payload (purple/yellow/blue) is read from the per-sprite `padKind`
  // data field. Same for orbs.
  private pads!: Phaser.Physics.Arcade.StaticGroup;
  private orbs!: Phaser.Physics.Arcade.StaticGroup;
  private groundSpriteBody!: Phaser.GameObjects.Rectangle;
  // Per-frame orb state. Two sets:
  //   orbsOverlappingThisFrame — populated by the overlap callback every
  //     physics step. Cleared at the end of update() so the next step
  //     starts fresh.
  //   firedOrbs — orbs the player has already fired DURING the current
  //     overlap. Removed from the set as soon as the player walks off
  //     (detected by comparing orbsOverlappingThisFrame to last frame's
  //     entries). That gives classic GD behaviour: tap once → fires; hold
  //     tap inside same orb → still fires once; walk away & back → re-arms.
  private orbsOverlappingThisFrame = new Set<Phaser.GameObjects.GameObject>();
  private firedOrbs = new Set<Phaser.GameObjects.GameObject>();
  // Minimalist look: no parallax, no beat-synced flash overlay.
  // World x/y of the player's spawn point — set once in spawnPlayer().
  private spawnX = 0;
  private spawnY = 0;

  constructor() {
    super({ key: "GameplayScene" });
  }

  async create() {
    this.launch = this.registry.get("launch") as GameLaunchOptions;
    if (!this.launch) {
      console.error("GameplayScene: no launch options in registry");
      return;
    }

    // Two ways to receive a level:
    //  - launch.levelData (Editor "Play" passes the in-memory level)
    //  - launch.levelId (Level Select looks up from LevelLoader)
    try {
      if (this.launch.levelData) {
        this.level = this.launch.levelData;
      } else if (this.launch.levelId) {
        this.level = await loadLevel(this.launch.levelId);
      } else {
        throw new Error("No level specified");
      }
    } catch (e) {
      console.error("Failed to load level:", e);
      this.endGame(false, 0);
      return;
    }

    this.attempts = (this.registry.get("attempts") as number) ?? 0;
    this.finished = false;
    this.portalState = [];
    this.setupWorld();
    this.spawnPlayer();
    this.setupInput();
    this.setupCamera();
    this.setupAudio();

    this.events.emit("run:start", {
      levelName: this.level.name,
      attempts: this.attempts + 1,
    });

    // Stop audio when the scene shuts down (restart on death, exit, etc.)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.beat?.stop();
      this.beat = undefined;
    });
  }

  private setupWorld() {
    // Unified "blueprint" theme — ignores level.colors so the whole game
    // (editor + gameplay) shares a consistent light palette.
    this.cameras.main.setBackgroundColor(THEME.bgHex);

    const worldW = this.level.length + GAME_WIDTH;
    this.physics.world.setBounds(0, 0, worldW, GAME_HEIGHT);

    // No parallax / no background effects — flat blueprint background only.

    // Ground rectangle — visual
    const groundY = this.level.groundY;
    this.add
      .rectangle(
        worldW / 2,
        groundY + GROUND_HEIGHT / 2,
        worldW,
        GROUND_HEIGHT,
        THEME.groundNum
      )
      .setDepth(-1);
    // Ground glow line + soft inner line — white for contrast on dark blue.
    this.add
      .rectangle(worldW / 2, groundY, worldW, 3, THEME.glow, 1)
      .setDepth(0);
    this.add
      .rectangle(worldW / 2, groundY + 6, worldW, 1, THEME.glow, 0.3)
      .setDepth(0);

    // Static ground physics body (invisible rectangle)
    const groundSprite = this.add.rectangle(
      worldW / 2,
      groundY + GROUND_HEIGHT / 2,
      worldW,
      GROUND_HEIGHT
    );
    this.physics.add.existing(groundSprite, true);
    (groundSprite.body as Phaser.Physics.Arcade.StaticBody).updateFromGameObject();
    this.groundSpriteBody = groundSprite;

    // Object groups — pads and orbs are both static-overlap groups; their
    // kind is stored per-sprite via setData("padKind"/"orbKind").
    this.blocks = this.physics.add.staticGroup();
    this.spikes = this.physics.add.staticGroup();
    this.pads = this.physics.add.staticGroup();
    this.orbs = this.physics.add.staticGroup();

    for (const obj of this.level.objects) {
      this.spawnObject(obj);
    }
  }

  private spawnObject(obj: LevelObject) {
    switch (obj.id) {
      case "block": {
        const s = this.blocks
          .create(obj.x, obj.y, "tx_block")
          .setOrigin(0.5)
          .setScale(obj.scale ?? 1)
          .setAngle(obj.rotation ?? 0) as Phaser.Physics.Arcade.Image;
        // Unified theme: near-black block with a soft white outline so it
        // pops on the blueprint-blue background.
        s.setTint(THEME.object);
        (s.body as Phaser.Physics.Arcade.StaticBody).updateFromGameObject();
        this.add
          .rectangle(obj.x, obj.y, 30, 30)
          .setStrokeStyle(1, THEME.objectOutline, 0.55)
          .setDepth(1);
        break;
      }
      case "spike": {
        const s = this.spikes
          .create(obj.x, obj.y, "tx_spike")
          .setOrigin(0.5)
          .setScale(obj.scale ?? 1)
          .setAngle(obj.rotation ?? 0) as Phaser.Physics.Arcade.Image;
        s.setTint(THEME.object);
        const body = s.body as Phaser.Physics.Arcade.StaticBody;
        // Triangle-shaped hitbox: a narrow strip running along the spike's
        // axis. Trimmed down (4 px wide × 14 px tall instead of 8×20) so a
        // run of adjacent spikes is far more forgiving — the cube can clear
        // 3 in a row without scraping the slope of the first or last spike.
        const rot = (((obj.rotation ?? 0) % 360) + 360) % 360;
        if (rot === 90 || rot === 270) {
          body.setSize(14, 4);
          body.setOffset(9, 14);
        } else {
          body.setSize(4, 14);
          body.setOffset(14, 9);
        }
        body.updateFromGameObject();
        break;
      }
      // Legacy yellow pad (back-compat with older saved levels). Same
      // payload as pad_yellow.
      case "jump_pad":
      case "pad_yellow":
      case "pad_purple":
      case "pad_blue": {
        const kind = obj.id === "jump_pad" ? "pad_yellow" : obj.id;
        const texKey =
          kind === "pad_purple"
            ? "tx_pad_purple"
            : kind === "pad_blue"
            ? "tx_pad_blue"
            : "tx_pad_yellow";
        const s = this.pads
          .create(obj.x, obj.y + 10, texKey)
          .setOrigin(0.5)
          .setScale(obj.scale ?? 1) as Phaser.Physics.Arcade.Image;
        s.setData("padKind", kind);
        // Subtle alpha pulse so pads read as "active" interactables in the
        // otherwise still minimalist scene.
        this.tweens.add({
          targets: s,
          alpha: { from: 1, to: 0.65 },
          duration: 700,
          yoyo: true,
          repeat: -1,
        });
        (s.body as Phaser.Physics.Arcade.StaticBody).updateFromGameObject();
        break;
      }
      case "orb_purple":
      case "orb_yellow":
      case "orb_blue":
      case "orb_black":
      case "orb_green": {
        const texKey =
          obj.id === "orb_purple"
            ? "tx_orb_purple"
            : obj.id === "orb_yellow"
            ? "tx_orb_yellow"
            : obj.id === "orb_blue"
            ? "tx_orb_blue"
            : obj.id === "orb_black"
            ? "tx_orb_black"
            : "tx_orb_green";
        const s = this.orbs
          .create(obj.x, obj.y, texKey)
          .setOrigin(0.5)
          .setScale(obj.scale ?? 1) as Phaser.Physics.Arcade.Image;
        s.setData("orbKind", obj.id);
        // Bigger pulse than pads — visually says "tap me".
        this.tweens.add({
          targets: s,
          scale: { from: obj.scale ?? 1, to: (obj.scale ?? 1) * 1.12 },
          alpha: { from: 1, to: 0.85 },
          duration: 500,
          yoyo: true,
          repeat: -1,
        });
        // Expand the static body well beyond the visible 28-px ring so the
        // overlap is forgiving — without this, the player has to be near-
        // pixel-perfect on a fast scroll to land a tap. ~46×46 means roughly
        // ±9 px slack in every direction around the visible orb.
        const body = s.body as Phaser.Physics.Arcade.StaticBody;
        const HIT = 46;
        body.setSize(HIT, HIT);
        body.setOffset(
          (s.width - HIT) / 2,
          (s.height - HIT) / 2
        );
        body.updateFromGameObject();
        break;
      }
      case "gravity_portal":
      case "ship_portal":
      case "cube_portal":
      case "ufo_portal":
      case "wave_portal":
      case "ball_portal":
      case "robot_portal":
      case "spider_portal":
      case "swing_portal":
      case "mini_portal":
      case "big_portal": {
        const texKey =
          obj.id === "gravity_portal"
            ? "tx_portal_gravity"
            : obj.id === "ship_portal"
            ? "tx_portal_ship"
            : obj.id === "ufo_portal"
            ? "tx_portal_ufo"
            : obj.id === "wave_portal"
            ? "tx_portal_wave"
            : obj.id === "ball_portal"
            ? "tx_portal_ball"
            : obj.id === "robot_portal"
            ? "tx_portal_robot"
            : obj.id === "spider_portal"
            ? "tx_portal_spider"
            : obj.id === "swing_portal"
            ? "tx_portal_swing"
            : obj.id === "mini_portal"
            ? "tx_portal_mini"
            : obj.id === "big_portal"
            ? "tx_portal_big"
            : "tx_portal_cube";
        // Visual only — trigger handled by x-crossing in update() so the
        // player can never miss a portal by being at the "wrong" y.
        const p = this.add
          .image(obj.x, obj.y, texKey)
          .setOrigin(0.5)
          .setScale(obj.scale ?? 1)
          .setAngle(obj.rotation ?? 0)
          .setDepth(2);
        // Faint full-height pillar hints at the trigger region. Tint chosen
        // from the THEME palette so portals stay visually distinct in the
        // monochrome scene without reintroducing the old neon colours.
        const tint =
          obj.id === "gravity_portal"
            ? THEME.portalGravity
            : obj.id === "ship_portal"
            ? THEME.portalShip
            : obj.id === "ufo_portal"
            ? THEME.portalUfo
            : obj.id === "wave_portal"
            ? THEME.portalWave
            : obj.id === "ball_portal"
            ? THEME.portalBall
            : obj.id === "robot_portal"
            ? THEME.portalRobot
            : obj.id === "spider_portal"
            ? THEME.portalSpider
            : obj.id === "swing_portal"
            ? THEME.portalSwing
            : obj.id === "mini_portal"
            ? THEME.portalMini
            : obj.id === "big_portal"
            ? THEME.portalBig
            : THEME.portalCube;
        this.add
          .rectangle(
            obj.x,
            (CEILING_Y + this.level.groundY) / 2,
            4,
            this.level.groundY - CEILING_Y,
            tint,
            0.22
          )
          .setDepth(1);
        this.tweens.add({
          targets: p,
          scaleY: { from: 1, to: 1.08 },
          alpha: { from: 1, to: 0.75 },
          duration: 600,
          yoyo: true,
          repeat: -1,
        });
        this.portalState.push({
          kind: obj.id as ObjectKind,
          x: obj.x,
          consumed: false,
        });
        break;
      }
      case "speed_half":
      case "speed_1x":
      case "speed_2x":
      case "speed_3x":
      case "speed_4x": {
        // Speed portals are short horizontal rings — visually distinct from
        // the tall mode portals so the player reads them at a glance.
        const texMap: Record<string, string> = {
          speed_half: "tx_speed_half",
          speed_1x: "tx_speed_1x",
          speed_2x: "tx_speed_2x",
          speed_3x: "tx_speed_3x",
          speed_4x: "tx_speed_4x",
        };
        const tintMap: Record<string, number> = {
          speed_half: THEME.speedHalf,
          speed_1x: THEME.speed1x,
          speed_2x: THEME.speed2x,
          speed_3x: THEME.speed3x,
          speed_4x: THEME.speed4x,
        };
        const p = this.add
          .image(obj.x, obj.y, texMap[obj.id])
          .setOrigin(0.5)
          .setScale(obj.scale ?? 1)
          .setDepth(2);
        // Faint horizontal bar — speed portals don't need a full-height
        // pillar (they're more lane markers than gravity portals).
        this.add
          .rectangle(obj.x, obj.y, 4, 36, tintMap[obj.id], 0.25)
          .setDepth(1);
        this.tweens.add({
          targets: p,
          scaleX: { from: 1, to: 1.1 },
          alpha: { from: 1, to: 0.8 },
          duration: 500,
          yoyo: true,
          repeat: -1,
        });
        this.portalState.push({
          kind: obj.id as ObjectKind,
          x: obj.x,
          consumed: false,
        });
        break;
      }
    }
  }

  private spawnPlayer() {
    const skin = getSkin(this.launch.skinId);
    const skinCopy = { ...skin };
    if (this.launch.primary) skinCopy.primary = this.launch.primary;
    if (this.launch.secondary) skinCopy.secondary = this.launch.secondary;

    this.spawnX = PLAYER_X_ON_SCREEN;
    // Sprite origin is (0.5, 0.5) and the player's body is now bottom-aligned
    // inside the texture, so this puts the visible cube AND its hitbox flush
    // on the ground line with no first-frame fall/settle.
    this.spawnY = this.level.groundY - PLAYER_SIZE / 2;
    this.player = new Player(this, this.spawnX, this.spawnY, skinCopy);
    this.player.setDepth(5);

    // When the player consumes an orb, mark that orb's sprite as "fired" so
    // a second tap inside the same overlap can't re-fire it. Also play a
    // tiny squash on the orb so the firing reads visually.
    this.player.setOrbFiredCallback(() => {
      const sprite = this.currentOrbSprite;
      if (!sprite) return;
      this.firedOrbs.add(sprite);
      const img = sprite as unknown as Phaser.Physics.Arcade.Image;
      this.tweens.add({
        targets: img,
        scale: { from: img.scale, to: img.scale * 0.6 },
        duration: 90,
        yoyo: true,
      });
    });

    // Collisions. NB: no ceiling collider on purpose — when a gravity portal
    // flips gravity, the cube "falls upward". If there's nothing above to
    // land on, the cube flies off the top of the world and dies via the
    // out-of-bounds check in update(). That matches classic GD behaviour.
    this.physics.add.collider(this.player, this.groundSpriteBody);
    this.physics.add.collider(
      this.player,
      this.blocks,
      this.onBlockCollide,
      undefined,
      this
    );
    this.physics.add.overlap(
      this.player,
      this.spikes,
      this.onSpikeOverlap,
      undefined,
      this
    );
    this.physics.add.overlap(
      this.player,
      this.pads,
      this.onPadOverlap,
      undefined,
      this
    );
    this.physics.add.overlap(
      this.player,
      this.orbs,
      this.onOrbOverlap,
      undefined,
      this
    );
    // Portals: x-crossing only — checked in update().
  }

  private setupCamera() {
    const worldW = this.level.length + GAME_WIDTH;
    // Camera bounds are widened vertically (negative top, +below-ground) so
    // ship-mode and flipped-gravity flights can drift the view up/down
    // beyond the strict 0..GAME_HEIGHT band. Anything past the kill
    // threshold in update() ends the run anyway.
    this.cameras.main.setBounds(
      0,
      -GAME_HEIGHT,
      worldW,
      GAME_HEIGHT * 3
    );
    this.cameras.main.setZoom(CAMERA_ZOOM);
    this.cameras.main.scrollX = 0;
    this.cameras.main.scrollY = (GAME_HEIGHT - GAME_HEIGHT / CAMERA_ZOOM) / 2;
  }

  /**
   * Frame-rate-independent vertical camera follow. Called from update() once
   * per frame after the player has been integrated.
   *
   * The target scrollY is the position that puts the player roughly 60% down
   * the visible viewport (slightly above center) — giving more headroom for
   * jumps than ground-look. A deadzone prevents micro-jitter during normal
   * grounded running.
   */
  private updateCameraY(delta: number) {
    if (!this.player) return;
    const viewH = GAME_HEIGHT / CAMERA_ZOOM;
    const target = this.player.y - viewH * 0.55;
    const cam = this.cameras.main;
    const dy = target - cam.scrollY;
    if (Math.abs(dy) < CAM_Y_DEADZONE) return;
    // Lerp only the part of the gap outside the deadzone — gives a soft
    // edge so the camera doesn't snap as soon as the deadzone is crossed.
    const overshoot = dy - Math.sign(dy) * CAM_Y_DEADZONE;
    const k = 1 - Math.pow(1 - CAM_Y_LERP_PER_FRAME, delta / (1000 / 60));
    cam.scrollY += overshoot * k;
  }

  private setupInput() {
    this.input.on("pointerdown", () => this.player.jumpPress());
    this.input.on("pointerup", () => this.player.jumpRelease());
    const space = this.input.keyboard?.addKey(
      Phaser.Input.Keyboard.KeyCodes.SPACE
    );
    const up = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.UP);
    space?.on("down", () => this.player.jumpPress());
    space?.on("up", () => this.player.jumpRelease());
    up?.on("down", () => this.player.jumpPress());
    up?.on("up", () => this.player.jumpRelease());
    this.input.keyboard?.addKey("ESC").on("down", () => {
      this.endGame(false, this.currentPercent());
    });
  }

  private setupAudio() {
    const bpm = this.level.bpm ?? 130;
    this.beat = new BeatEngine(bpm);
    this.beat.setMuted(this.launch.muted ?? false);
    // Beat callback intentionally not wired — the minimalist look has no
    // visual reaction to the music. The BeatEngine still runs so audio plays.
    this.beat.start();
  }

  // ─── Collision callbacks ────────────────────────────────────────────────

  private onBlockCollide: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (
    player
  ) => {
    const sprite = player as Phaser.GameObjects.Sprite;
    const body = sprite.body as Phaser.Physics.Arcade.Body | null;
    if (!body) return;
    if (body.blocked.right || body.touching.right) {
      this.killPlayer();
    }
  };

  private onSpikeOverlap: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = () => {
    this.killPlayer();
  };

  /**
   * Pad overlap — auto-trigger the moment the player touches it. The pad
   * sprite stores its kind in setData("padKind"); we dispatch to the right
   * Player.bouncePad* method. Pads are RE-armable: stepping on the same pad
   * again later will trigger again, exactly like in classic GD.
   */
  private onPadOverlap: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (
    _player,
    pad
  ) => {
    const padObj = pad as Phaser.GameObjects.GameObject;
    const kind = padObj.getData("padKind") as
      | "pad_purple"
      | "pad_yellow"
      | "pad_blue"
      | undefined;
    if (!kind) return;
    if (kind === "pad_purple") this.player.bouncePadPurple();
    else if (kind === "pad_yellow") this.player.bouncePadYellow();
    else if (kind === "pad_blue") this.player.bouncePadBlue();

    // Little squash tween so the pad reads as "fired"
    const padImg = pad as unknown as Phaser.Physics.Arcade.Image;
    this.tweens.add({
      targets: padImg,
      scaleY: 0.5,
      duration: 80,
      yoyo: true,
    });
  };

  /**
   * Orb overlap — does NOT fire the orb. Instead, it arms the player by
   * setting Player.queuedOrb; the next jumpPress() will consume the orb.
   *
   *   - walk into an orb without tapping → nothing happens
   *   - tap once inside the orb → fires
   *   - hold tap inside the orb → fires exactly once
   *   - tap again inside the SAME orb → no re-fire
   *   - walk off, walk back into the same orb → re-armed, can fire again
   *
   * We sync the player's queued kind right here in the callback so that an
   * input event arriving immediately after the physics step sees the latest
   * value (the alternative — syncing in update() — would lag by a frame).
   */
  private onOrbOverlap: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (
    _player,
    orb
  ) => {
    const orbObj = orb as Phaser.GameObjects.GameObject;
    this.orbsOverlappingThisFrame.add(orbObj);
    if (this.firedOrbs.has(orbObj)) {
      // Already fired this overlap — don't arm again until we walk off.
      return;
    }
    const kind = orbObj.getData("orbKind") as OrbKind | undefined;
    if (!kind) return;
    this.currentOrbSprite = orbObj;
    this.player.setQueuedOrb(kind);
    // Late-tap grace: even after the player leaves the orb's hitbox, the
    // queued orb stays armed for a few extra frames so a tap a tiny bit
    // late still fires. Recorded as an absolute timestamp; checked in
    // update() when the overlap is gone.
    this.orbGraceUntil = this.time.now + ORB_LATE_TAP_GRACE_MS;
    this.lateGraceOrbSprite = orbObj;
    this.lateGraceOrbKind = kind;
  };

  // Reference to whichever orb the player is armed against right now —
  // used by Player's onOrbFired callback to mark it as activated and to
  // play a squash tween.
  private currentOrbSprite: Phaser.GameObjects.GameObject | null = null;
  // Late-tap grace: after the player leaves an orb's hitbox, we keep the
  // queued orb armed for ORB_LATE_TAP_GRACE_MS so a slightly late press
  // still fires. orbGraceUntil is an absolute time.now value.
  private orbGraceUntil = 0;
  private lateGraceOrbSprite: Phaser.GameObjects.GameObject | null = null;
  private lateGraceOrbKind: OrbKind | null = null;

  private triggerPortal(kind: ObjectKind) {
    switch (kind) {
      case "gravity_portal":
        this.player.flipGravity();
        break;
      case "ship_portal":
        this.player.setMode("ship");
        break;
      case "cube_portal":
        this.player.setMode("cube");
        break;
      case "ufo_portal":
        this.player.setMode("ufo");
        break;
      case "wave_portal":
        this.player.setMode("wave");
        break;
      case "ball_portal":
        this.player.setMode("ball");
        break;
      case "robot_portal":
        this.player.setMode("robot");
        break;
      case "spider_portal":
        this.player.setMode("spider");
        break;
      case "swing_portal":
        this.player.setMode("swing");
        break;
      case "mini_portal":
        this.player.setSizeScale(0.6);
        break;
      case "big_portal":
        this.player.setSizeScale(1);
        break;
      // Speed portals — instant horizontal-speed change. Multipliers are
      // tuned for playable difficulty (not the literal label number):
      //   ×0.5 → 0.7×, ×1 → 1×, ×2 → 1.3×, ×3 → 1.5×, ×4 → 1.75×
      case "speed_half":
        this.player.setRunSpeedMultiplier(0.7);
        break;
      case "speed_1x":
        this.player.setRunSpeedMultiplier(1.0);
        break;
      case "speed_2x":
        this.player.setRunSpeedMultiplier(1.3);
        break;
      case "speed_3x":
        this.player.setRunSpeedMultiplier(1.5);
        break;
      case "speed_4x":
        this.player.setRunSpeedMultiplier(1.75);
        break;
    }
    this.cameras.main.flash(150, 255, 255, 255, false);
  }

  private killPlayer() {
    if (!this.player.isAlive() || this.finished) return;
    this.cameras.main.shake(180, 0.012);
    this.cameras.main.flash(120, 255, 80, 120);
    this.player.die();
    this.attempts++;

    // Soft reset on retry — no scene.restart() (heavy: re-creates every
    // static body and texture binding). Just put the player back, reset
    // portal triggers and camera.
    this.time.delayedCall(550, () => this.softResetForRetry());
  }

  private softResetForRetry() {
    if (!this.player) return;
    for (const p of this.portalState) p.consumed = false;
    this.firedOrbs.clear();
    this.orbsOverlappingThisFrame.clear();
    this.currentOrbSprite = null;
    this.orbGraceUntil = 0;
    this.lateGraceOrbSprite = null;
    this.lateGraceOrbKind = null;
    this.player.reset(this.spawnX, this.spawnY);
    this.cameras.main.scrollX = 0;
    this.cameras.main.scrollY =
      (GAME_HEIGHT - GAME_HEIGHT / CAMERA_ZOOM) / 2;
    this.events.emit("run:start", {
      levelName: this.level.name,
      attempts: this.attempts + 1,
    });
  }

  private currentPercent(): number {
    if (!this.level) return 0;
    const x = Math.max(0, this.player?.x ?? 0);
    return Math.min(100, Math.round((x / this.level.length) * 100));
  }

  update(_time: number, delta: number) {
    if (!this.player || this.finished) return;
    this.player.tick(delta);
    this.maxX = Math.max(this.maxX, this.player.x);

    // X follow — instant. Player should always be PLAYER_X_ON_SCREEN canvas
    // pixels in from the left edge. Y follow is smoothed (see updateCameraY).
    const desired = Math.max(0, this.player.x - PLAYER_X_ON_SCREEN);
    this.cameras.main.scrollX = desired;
    this.updateCameraY(delta);

    // Trigger portals on x-crossing (independent of player y, so flipped
    // gravity / ship-mode flight can't dodge them).
    for (const p of this.portalState) {
      if (!p.consumed && this.player.x >= p.x) {
        p.consumed = true;
        this.triggerPortal(p.kind);
      }
    }

    // ── Orb bookkeeping ─────────────────────────────────────────────────
    // 1. Disarm orbs the player walked off this frame: any orb in firedOrbs
    //    that is NOT in orbsOverlappingThisFrame is gone — re-arm it.
    if (this.firedOrbs.size > 0) {
      for (const orb of [...this.firedOrbs]) {
        if (!this.orbsOverlappingThisFrame.has(orb)) {
          this.firedOrbs.delete(orb);
        }
      }
    }
    // 2. If the player is no longer overlapping ANY orb this frame, KEEP
    //    the queued orb armed until orbGraceUntil expires. That gives the
    //    player a small "late tap" window after stepping off an orb so the
    //    timing isn't pixel-perfect. The current orb sprite is preserved
    //    so the squash tween still targets the right orb if/when it fires.
    if (this.orbsOverlappingThisFrame.size === 0) {
      if (this.time.now >= this.orbGraceUntil) {
        this.player.setQueuedOrb(null);
        this.currentOrbSprite = null;
        this.lateGraceOrbSprite = null;
        this.lateGraceOrbKind = null;
      } else if (this.lateGraceOrbKind) {
        // Re-arm with the late-grace orb in case Player.queuedOrb was
        // cleared by something else (defensive — no-op if it's already set).
        this.player.setQueuedOrb(this.lateGraceOrbKind);
        this.currentOrbSprite = this.lateGraceOrbSprite;
      }
    } else {
      // We're still in an orb — reset the grace deadline so it only kicks
      // in once we actually leave.
      this.orbGraceUntil = 0;
    }
    // 3. Reset the frame-local overlap set for the next physics step.
    this.orbsOverlappingThisFrame.clear();

    // ── Death thresholds ────────────────────────────────────────────────
    // Below the floor (any mode) → death.
    // Above the ceiling band → death. The ceiling is no longer a physical
    // body, so a cube in flipped gravity that has no roof above it just
    // flies off the top of the world — we kill it the moment it crosses
    // CEILING_Y minus a small grace margin.
    if (this.player.y > GAME_HEIGHT + 100) {
      this.killPlayer();
      return;
    }
    if (this.player.y < CEILING_Y - 30) {
      this.killPlayer();
      return;
    }

    if (this.player.x >= this.level.length) {
      this.finished = true;
      this.endGame(true, 100);
      return;
    }

    this.events.emit("run:progress", {
      percent: this.currentPercent(),
      attempts: this.attempts + 1,
    });
  }

  private endGame(completed: boolean, percent: number) {
    const exit = this.launch?.onExit;
    this.beat?.stop();
    this.beat = undefined;
    this.scene.stop("UIScene");
    this.scene.stop();
    if (exit) {
      window.setTimeout(() => {
        exit({ completed, percent, attempts: this.attempts + 1 });
      }, 0);
    }
  }
}
