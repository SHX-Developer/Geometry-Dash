import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH, type GameLaunchOptions } from "../PhaserGame";
import { Player, PLAYER_SIZE } from "../player/Player";
import { loadLevel } from "../levels/LevelLoader";
import type { LevelData, LevelObject, ObjectKind } from "../levels/types";
import { getSkin } from "../skins/skins";
import { BeatEngine } from "../audio/BeatEngine";

const GROUND_HEIGHT = GAME_HEIGHT;
const PLAYER_X_ON_SCREEN = 120;
const CEILING_Y = 96; // for flipped gravity — invisible top wall

export class GameplayScene extends Phaser.Scene {
  private player!: Player;
  private level!: LevelData;
  private launch!: GameLaunchOptions;
  private attempts = 0;
  private maxX = 0;
  private finished = false;
  private beat?: BeatEngine;

  // Portals that have already triggered, to prevent re-firing while the
  // player is still overlapping the same one.
  private consumedPortals = new WeakSet<Phaser.GameObjects.GameObject>();

  // groups
  private blocks!: Phaser.Physics.Arcade.StaticGroup;
  private spikes!: Phaser.Physics.Arcade.StaticGroup;
  private jumpPads!: Phaser.Physics.Arcade.StaticGroup;
  private portals!: Phaser.Physics.Arcade.StaticGroup;
  private groundSpriteBody!: Phaser.GameObjects.Rectangle;
  private ceilingSpriteBody!: Phaser.GameObjects.Rectangle;
  private parallaxLayers: Phaser.GameObjects.TileSprite[] = [];
  private beatFlash?: Phaser.GameObjects.Rectangle;

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
    this.consumedPortals = new WeakSet();
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
    const bgColor = this.level.colors?.background ?? "#0F0F1A";
    this.cameras.main.setBackgroundColor(bgColor);

    const worldW = this.level.length + GAME_WIDTH;
    this.physics.world.setBounds(0, 0, worldW, GAME_HEIGHT);

    this.makeParallax();

    // Ground rectangle — visual
    const groundY = this.level.groundY;
    const groundColor = Phaser.Display.Color.HexStringToColor(
      this.level.colors?.ground ?? "#1E1E36"
    ).color;
    this.add
      .rectangle(
        worldW / 2,
        groundY + GROUND_HEIGHT / 2,
        worldW,
        GROUND_HEIGHT,
        groundColor
      )
      .setDepth(-1);
    const glowColor = Phaser.Display.Color.HexStringToColor(
      this.level.colors?.primary ?? "#7C4DFF"
    ).color;
    this.add.rectangle(worldW / 2, groundY, worldW, 3, glowColor, 1).setDepth(0);
    this.add
      .rectangle(worldW / 2, groundY + 6, worldW, 1, glowColor, 0.35)
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

    // Ceiling — invisible static body for flipped-gravity / ship-flight cap.
    // Visible band at the top of the world tells the player something's
    // there without being intrusive.
    this.add
      .rectangle(worldW / 2, CEILING_Y, worldW, 3, glowColor, 0.6)
      .setDepth(0);
    this.add
      .rectangle(worldW / 2, CEILING_Y - 6, worldW, 1, glowColor, 0.25)
      .setDepth(0);
    const ceilingSprite = this.add.rectangle(
      worldW / 2,
      CEILING_Y - GROUND_HEIGHT / 2,
      worldW,
      GROUND_HEIGHT
    );
    this.physics.add.existing(ceilingSprite, true);
    (ceilingSprite.body as Phaser.Physics.Arcade.StaticBody).updateFromGameObject();
    this.ceilingSpriteBody = ceilingSprite;

    // Object groups
    this.blocks = this.physics.add.staticGroup();
    this.spikes = this.physics.add.staticGroup();
    this.jumpPads = this.physics.add.staticGroup();
    this.portals = this.physics.add.staticGroup();

    for (const obj of this.level.objects) {
      this.spawnObject(obj);
    }

    // Full-screen flash overlay for beat sync (alpha-controlled).
    this.beatFlash = this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, glowColor)
      .setScrollFactor(0)
      .setAlpha(0)
      .setDepth(50);
  }

  private makeParallax() {
    const farKey = "tx_parallax_far";
    if (!this.textures.exists(farKey)) {
      const g = this.add.graphics();
      g.fillStyle(0xffffff, 0.5);
      for (let i = 0; i < 60; i++) {
        const x = Phaser.Math.Between(0, 540);
        const y = Phaser.Math.Between(0, 760);
        const r = Phaser.Math.FloatBetween(0.5, 1.6);
        g.fillCircle(x, y, r);
      }
      g.generateTexture(farKey, 540, 760);
      g.destroy();
    }
    const far = this.add.tileSprite(
      GAME_WIDTH / 2,
      380,
      GAME_WIDTH,
      760,
      farKey
    );
    far.setScrollFactor(0);
    far.setDepth(-10);
    far.setAlpha(0.6);
    this.parallaxLayers.push(far);

    const nearKey = "tx_parallax_near";
    if (!this.textures.exists(nearKey)) {
      const g = this.add.graphics();
      const tint = Phaser.Display.Color.HexStringToColor(
        this.level.colors?.primary ?? "#7C4DFF"
      ).color;
      g.fillStyle(tint, 0.18);
      for (let i = 0; i < 12; i++) {
        const x = Phaser.Math.Between(0, 540);
        const y = Phaser.Math.Between(80, 700);
        g.fillCircle(x, y, Phaser.Math.Between(20, 70));
      }
      g.generateTexture(nearKey, 540, 760);
      g.destroy();
    }
    const near = this.add.tileSprite(
      GAME_WIDTH / 2,
      380,
      GAME_WIDTH,
      760,
      nearKey
    );
    near.setScrollFactor(0);
    near.setDepth(-9);
    this.parallaxLayers.push(near);
  }

  private spawnObject(obj: LevelObject) {
    const primary = this.level.colors?.primary ?? "#7C4DFF";
    const secondary = this.level.colors?.secondary ?? "#B388FF";
    const primaryNum = Phaser.Display.Color.HexStringToColor(primary).color;
    const secondaryNum = Phaser.Display.Color.HexStringToColor(secondary).color;

    switch (obj.id) {
      case "block": {
        const s = this.blocks
          .create(obj.x, obj.y, "tx_block")
          .setOrigin(0.5)
          .setScale(obj.scale ?? 1)
          .setAngle(obj.rotation ?? 0) as Phaser.Physics.Arcade.Image;
        s.setTint(primaryNum);
        (s.body as Phaser.Physics.Arcade.StaticBody).updateFromGameObject();
        this.add
          .rectangle(obj.x, obj.y, 30, 30)
          .setStrokeStyle(1, secondaryNum, 0.8)
          .setDepth(1);
        break;
      }
      case "spike": {
        const s = this.spikes
          .create(obj.x, obj.y, "tx_spike")
          .setOrigin(0.5)
          .setScale(obj.scale ?? 1)
          .setAngle(obj.rotation ?? 0) as Phaser.Physics.Arcade.Image;
        s.setTint(secondaryNum);
        const body = s.body as Phaser.Physics.Arcade.StaticBody;
        body.setSize(18, 18);
        body.setOffset(7, 12);
        body.updateFromGameObject();
        break;
      }
      case "jump_pad": {
        const s = this.jumpPads
          .create(obj.x, obj.y + 10, "tx_jump_pad")
          .setOrigin(0.5)
          .setScale(obj.scale ?? 1) as Phaser.Physics.Arcade.Image;
        s.setTint(0x4dffb8);
        this.tweens.add({
          targets: s,
          alpha: { from: 1, to: 0.6 },
          duration: 600,
          yoyo: true,
          repeat: -1,
        });
        (s.body as Phaser.Physics.Arcade.StaticBody).updateFromGameObject();
        break;
      }
      case "gravity_portal":
      case "ship_portal":
      case "cube_portal": {
        const texKey =
          obj.id === "gravity_portal"
            ? "tx_portal_gravity"
            : obj.id === "ship_portal"
            ? "tx_portal_ship"
            : "tx_portal_cube";
        const p = this.portals
          .create(obj.x, obj.y, texKey)
          .setOrigin(0.5)
          .setScale(obj.scale ?? 1)
          .setAngle(obj.rotation ?? 0) as Phaser.Physics.Arcade.Image;
        p.setData("kind", obj.id as ObjectKind);
        const portalBody = p.body as Phaser.Physics.Arcade.StaticBody;
        // Tall but thin hitbox so the player passes through easily.
        portalBody.setSize(20, 56);
        portalBody.updateFromGameObject();
        // pulse animation
        this.tweens.add({
          targets: p,
          scaleY: { from: 1, to: 1.08 },
          alpha: { from: 1, to: 0.75 },
          duration: 600,
          yoyo: true,
          repeat: -1,
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

    const startY = this.level.groundY - PLAYER_SIZE / 2 - 4;
    this.player = new Player(this, PLAYER_X_ON_SCREEN, startY, skinCopy);
    this.player.setDepth(5);

    // Collisions
    this.physics.add.collider(this.player, this.groundSpriteBody);
    this.physics.add.collider(this.player, this.ceilingSpriteBody);
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
      this.jumpPads,
      this.onJumpPadOverlap,
      undefined,
      this
    );
    this.physics.add.overlap(
      this.player,
      this.portals,
      this.onPortalOverlap,
      undefined,
      this
    );
  }

  private setupCamera() {
    const worldW = this.level.length + GAME_WIDTH;
    this.cameras.main.setBounds(0, 0, worldW, GAME_HEIGHT);
    this.cameras.main.scrollX = 0;
    this.cameras.main.scrollY = 0;
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
    this.beat.onBeat((idx) => {
      if (!this.player?.isAlive() || this.finished) return;
      // Subtle visual pulse per beat.
      const isDownbeat = idx % 4 === 0;
      this.beatFlash?.setAlpha(isDownbeat ? 0.12 : 0.05);
      this.tweens.add({
        targets: this.beatFlash,
        alpha: 0,
        duration: isDownbeat ? 280 : 160,
      });
      if (isDownbeat) this.player.pulse();
    });
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

  private onJumpPadOverlap: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (
    _player,
    pad
  ) => {
    this.player.bouncePad();
    const padImg = pad as unknown as Phaser.Physics.Arcade.Image;
    this.tweens.add({
      targets: padImg,
      scaleY: 0.5,
      duration: 80,
      yoyo: true,
    });
  };

  private onPortalOverlap: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (
    _player,
    portal
  ) => {
    const obj = portal as unknown as Phaser.Physics.Arcade.Image;
    if (this.consumedPortals.has(obj)) return;
    this.consumedPortals.add(obj);
    const kind = obj.getData("kind") as ObjectKind;
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
    }
    // Visual cue on portal hit.
    this.cameras.main.flash(150, 255, 255, 255, false);
  };

  private killPlayer() {
    if (!this.player.isAlive() || this.finished) return;
    this.cameras.main.shake(180, 0.012);
    this.cameras.main.flash(120, 255, 80, 120);
    this.player.die();
    this.attempts++;

    this.time.delayedCall(550, () => {
      this.registry.set("attempts", this.attempts);
      this.scene.restart();
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

    const desired = Math.max(0, this.player.x - PLAYER_X_ON_SCREEN);
    this.cameras.main.scrollX = desired;

    if (this.parallaxLayers.length >= 2) {
      this.parallaxLayers[0].tilePositionX = this.cameras.main.scrollX * 0.15;
      this.parallaxLayers[1].tilePositionX = this.cameras.main.scrollX * 0.35;
    }

    // Falling off either edge of the play area kills the player.
    if (this.player.y > GAME_HEIGHT + 100 || this.player.y < -100) {
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
