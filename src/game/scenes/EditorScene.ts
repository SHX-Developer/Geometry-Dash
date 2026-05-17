import * as Phaser from "phaser";
import { CEILING_Y, GAME_HEIGHT, GAME_WIDTH, GRID as GRID_CONST } from "../constants";
import type { LevelData, LevelObject, ObjectKind } from "../levels/types";
import { PLAYER_SIZE } from "../player/Player";
import { THEME } from "../theme";

export type EditorTool =
  | "block"
  | "spike"
  | "pad_purple"
  | "pad_yellow"
  | "pad_blue"
  | "orb_purple"
  | "orb_yellow"
  | "orb_blue"
  | "gravity_portal"
  | "ship_portal"
  | "cube_portal"
  | "ufo_portal"
  | "speed_half"
  | "speed_1x"
  | "speed_2x"
  | "speed_3x"
  | "speed_4x"
  | "erase";

const GRID = GRID_CONST;
const DRAG_THRESHOLD = 6; // px — drag vs tap distinction (touch path only)

// Drag-mode the editor is currently in:
//   "none"   — nothing pressed
//   "paint"  — left mouse held: place current tool on every cell crossed
//   "erase"  — right mouse held: delete every object the cursor passes over
//   "pan"    — touch drag: scroll the camera horizontally
// Only one drag-mode is active at a time; pointerup always returns to "none".
type DragMode = "none" | "paint" | "erase" | "pan";

// Editor uses the shared THEME so what you draw matches the gameplay look.

// Texture key per object kind
const TEX_OF: Record<ObjectKind, string> = {
  block: "tx_block",
  spike: "tx_spike",
  jump_pad: "tx_pad_yellow", // legacy alias
  pad_purple: "tx_pad_purple",
  pad_yellow: "tx_pad_yellow",
  pad_blue: "tx_pad_blue",
  orb_purple: "tx_orb_purple",
  orb_yellow: "tx_orb_yellow",
  orb_blue: "tx_orb_blue",
  gravity_portal: "tx_portal_gravity",
  ship_portal: "tx_portal_ship",
  cube_portal: "tx_portal_cube",
  ufo_portal: "tx_portal_ufo",
  speed_half: "tx_speed_half",
  speed_1x: "tx_speed_1x",
  speed_2x: "tx_speed_2x",
  speed_3x: "tx_speed_3x",
  speed_4x: "tx_speed_4x",
};

interface PlacedObject {
  obj: LevelObject;
  node: Phaser.GameObjects.Image; // visual node tied to obj
}

export class EditorScene extends Phaser.Scene {
  private level!: LevelData;
  private placed: PlacedObject[] = [];
  private undoStack: LevelObject[][] = [];
  private redoStack: LevelObject[][] = [];

  private tool: EditorTool = "block";

  private gridGraphics!: Phaser.GameObjects.Graphics;
  private playerGhost!: Phaser.GameObjects.Image;
  private ghostCursor!: Phaser.GameObjects.Image;
  private finishMarker!: Phaser.GameObjects.Rectangle;

  // drag state
  private dragMode: DragMode = "none";
  private hasMoved = false;
  private startPointerX = 0;
  private startScrollX = 0;
  // "x,y" of cells already touched in the current drag — prevents the same
  // cell from being re-placed/re-erased N times per second while the pointer
  // hovers over it.
  private paintedCells = new Set<string>();

  // Notification callback into React
  onChange: (level: LevelData) => void = () => undefined;

  constructor() {
    // active:false — the runner starts us explicitly with init data so we
    // don't run create() before React has set the level.
    super({ key: "EditorScene", active: false });
  }

  init(data: { level: LevelData; onChange: (l: LevelData) => void }) {
    this.level = data.level;
    this.onChange = data.onChange;
  }

  create() {
    if (!this.level) {
      console.error("EditorScene: no level supplied");
      return;
    }

    // Generate the same procedural textures the gameplay uses. EditorScene
    // is typically launched in its own Phaser.Game so BootScene didn't run
    // for it — we need our own boot here.
    this.bootTextures();

    this.cameras.main.setBackgroundColor(THEME.bgHex);
    this.cameras.main.setBounds(0, 0, this.level.length + GAME_WIDTH, GAME_HEIGHT);

    this.drawGround();
    this.drawGrid();
    this.drawBoundaries();
    this.drawSpawnAndFinish();
    this.placed = [];
    for (const o of this.level.objects) this.placeNode(o);

    const initialTex =
      this.tool === "erase" ? "tx_block" : TEX_OF[this.tool as ObjectKind];
    this.ghostCursor = this.add
      .image(0, 0, initialTex ?? "tx_block")
      .setAlpha(0.45)
      .setVisible(false)
      .setDepth(20);

    this.setupInput();
  }

  private bootTextures() {
    // We need these textures in this scene's texture manager. Generate them
    // if absent. (Same code as BootScene — duplicated rather than reused
    // because BootScene only runs in the gameplay Phaser.Game.)
    if (!this.textures.exists("tx_block")) makeBlock(this);
    if (!this.textures.exists("tx_spike")) makeSpike(this);
    if (!this.textures.exists("tx_jump_pad")) makeJumpPad(this);
    if (!this.textures.exists("tx_particle")) makeParticle(this);
    if (!this.textures.exists("tx_pad_purple"))
      makePad(this, "tx_pad_purple", THEME.padPurple);
    if (!this.textures.exists("tx_pad_yellow"))
      makePad(this, "tx_pad_yellow", THEME.padYellow);
    if (!this.textures.exists("tx_pad_blue"))
      makePad(this, "tx_pad_blue", THEME.padBlue);
    if (!this.textures.exists("tx_orb_purple"))
      makeOrb(this, "tx_orb_purple", THEME.orbPurple);
    if (!this.textures.exists("tx_orb_yellow"))
      makeOrb(this, "tx_orb_yellow", THEME.orbYellow);
    if (!this.textures.exists("tx_orb_blue"))
      makeOrb(this, "tx_orb_blue", THEME.orbBlue);
    if (!this.textures.exists("tx_portal_gravity"))
      makePortal(this, "tx_portal_gravity", THEME.portalGravity);
    if (!this.textures.exists("tx_portal_ship"))
      makePortal(this, "tx_portal_ship", THEME.portalShip);
    if (!this.textures.exists("tx_portal_cube"))
      makePortal(this, "tx_portal_cube", THEME.portalCube);
    if (!this.textures.exists("tx_portal_ufo"))
      makePortal(this, "tx_portal_ufo", THEME.portalUfo);
    if (!this.textures.exists("tx_speed_half"))
      makeSpeedPortal(this, "tx_speed_half", THEME.speedHalf, 1, "left");
    if (!this.textures.exists("tx_speed_1x"))
      makeSpeedPortal(this, "tx_speed_1x", THEME.speed1x, 1, "right");
    if (!this.textures.exists("tx_speed_2x"))
      makeSpeedPortal(this, "tx_speed_2x", THEME.speed2x, 2, "right");
    if (!this.textures.exists("tx_speed_3x"))
      makeSpeedPortal(this, "tx_speed_3x", THEME.speed3x, 3, "right");
    if (!this.textures.exists("tx_speed_4x"))
      makeSpeedPortal(this, "tx_speed_4x", THEME.speed4x, 4, "right");
  }

  private drawGround() {
    const worldW = this.level.length + GAME_WIDTH;
    this.add
      .rectangle(
        worldW / 2,
        this.level.groundY + GAME_HEIGHT / 2,
        worldW,
        GAME_HEIGHT,
        THEME.groundNum
      )
      .setDepth(-1);
    // Ground line + ceiling line — ink hairlines to stand out on the warm
    // off-white background.
    this.add
      .rectangle(worldW / 2, this.level.groundY, worldW, 2, THEME.glow, 1)
      .setDepth(0);
    this.add
      .rectangle(worldW / 2, CEILING_Y, worldW, 1, THEME.glow, 0.6)
      .setDepth(0);
  }

  private drawGrid() {
    this.gridGraphics?.destroy();
    this.gridGraphics = this.add.graphics().setDepth(-0.5);
    const worldW = this.level.length + GAME_WIDTH;
    const groundY = this.level.groundY;
    // Horizontal lines — stack UPWARD from the ground so the bottom edge is
    // exactly the ground (no half-rows above it).
    this.gridGraphics.lineStyle(1, THEME.gridLight, 0.45);
    for (let y = groundY; y >= CEILING_Y; y -= GRID) {
      this.gridGraphics.lineBetween(0, y, worldW, y);
    }
    // Vertical lines — at every grid edge.
    this.gridGraphics.lineStyle(1, THEME.gridLight, 0.4);
    for (let x = 0; x <= worldW; x += GRID) {
      this.gridGraphics.lineBetween(x, CEILING_Y, x, groundY);
    }
    // Highlighted gridline every 5 cells (160 px)
    this.gridGraphics.lineStyle(1, THEME.gridBright, 0.7);
    for (let x = 0; x <= worldW; x += GRID * 5) {
      this.gridGraphics.lineBetween(x, CEILING_Y, x, groundY);
    }
  }

  private drawBoundaries() {
    const h = this.level.groundY - CEILING_Y;
    // Left wall: thin ink marker for x=0
    this.add
      .rectangle(2, CEILING_Y + h / 2, 4, h, THEME.glow, 0.35)
      .setDepth(-0.4);
  }

  private drawSpawnAndFinish() {
    const startX = 180;
    // Match the gameplay spawn exactly — cube bottom flush on the ground
    // line, no -4 gap so the editor preview lines up with what actually
    // happens when you press TEST.
    const startY = this.level.groundY - PLAYER_SIZE / 2;
    const h = this.level.groundY - CEILING_Y;
    // Player spawn — accent-blue dashed-look box (wireframe START marker).
    this.playerGhost = this.add
      .rectangle(startX, startY, PLAYER_SIZE, PLAYER_SIZE, THEME.accent, 0.08)
      .setStrokeStyle(2, THEME.accent, 1)
      .setDepth(2) as unknown as Phaser.GameObjects.Image;

    // Finish marker (vertical strip at x = level.length) — accent blue.
    this.finishMarker = this.add
      .rectangle(this.level.length, CEILING_Y + h / 2, 4, h, THEME.accent, 0.9)
      .setDepth(2);
    this.add
      .rectangle(this.level.length, CEILING_Y - 16, 60, 22, THEME.accent, 1)
      .setStrokeStyle(1.5, THEME.glow, 1)
      .setDepth(2);
  }

  private placeNode(obj: LevelObject) {
    const tex = TEX_OF[obj.id];
    if (!tex) return;
    const img = this.add
      .image(obj.x, obj.id === "jump_pad" ? obj.y + 10 : obj.y, tex)
      .setOrigin(0.5)
      .setScale(obj.scale ?? 1)
      .setAngle(obj.rotation ?? 0)
      .setDepth(3);
    // Editor-only theming: blocks and spikes are ink on the warm off-white
    // background. Pads / orbs keep their semantic colours.
    if (obj.id === "block") {
      img.setTint(THEME.object);
      // Faint inner edge — separates stacked blocks without being noisy.
      this.add
        .rectangle(obj.x, obj.y, 30, 30)
        .setStrokeStyle(1, THEME.objectOutline, 0.4)
        .setDepth(4);
    } else if (obj.id === "spike") {
      img.setTint(THEME.object);
    }
    // Pads / orbs already use their semantic colour palette baked into the
    // texture, so no setTint is needed for them.
    this.placed.push({ obj, node: img });
  }

  // ─── Input ──────────────────────────────────────────────────────────────

  private setupInput() {
    // Disable the native browser right-click menu on the canvas so we can use
    // RMB as an "erase" gesture without the OS popup eating the event.
    this.input.mouse?.disableContextMenu();

    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      this.hasMoved = false;
      this.startPointerX = p.x;
      this.startScrollX = this.cameras.main.scrollX;
      this.paintedCells.clear();

      // Touch: keep the old behaviour — drag pans, tap places on pointerup.
      // Mobile users don't have separate buttons, so paint-on-drag would
      // make the level un-pannable.
      if (p.wasTouch) {
        this.dragMode = "pan";
        return;
      }

      // Mouse: button decides what the drag does.
      //   0 (LMB) → continuous paint with the current tool
      //   2 (RMB) → continuous erase, regardless of selected tool
      //   1 (MMB) → camera pan (nice escape hatch when wheel-scroll isn't enough)
      if (p.button === 2 || p.rightButtonDown()) {
        this.dragMode = "erase";
        this.snapshotForUndo();
        this.eraseAtPointer(p);
      } else if (p.button === 1) {
        this.dragMode = "pan";
      } else {
        this.dragMode = "paint";
        this.snapshotForUndo();
        this.placeAtPointer(p);
      }
    });

    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      const worldX = p.worldX;
      const worldY = p.worldY;
      // Ghost cursor preview — hidden while right-erasing or when the erase
      // tool is active (no preview = visual cue that you're in delete mode).
      const { x: gx, y: gy } = snapToGrid(worldX, worldY, this.level.groundY);
      const showGhost = this.tool !== "erase" && this.dragMode !== "erase";
      if (showGhost) {
        const tex = TEX_OF[this.tool as ObjectKind] ?? "tx_block";
        this.ghostCursor.setVisible(true).setPosition(gx, gy).setTexture(tex);
      } else {
        this.ghostCursor.setVisible(false);
      }

      if (this.dragMode === "none") return;

      if (this.dragMode === "pan") {
        const dx = p.x - this.startPointerX;
        if (!this.hasMoved && Math.abs(dx) > DRAG_THRESHOLD) {
          this.hasMoved = true;
        }
        if (this.hasMoved) {
          const worldW = this.level.length + GAME_WIDTH;
          const maxScroll = Math.max(0, worldW - this.cameras.main.width);
          this.cameras.main.scrollX = Phaser.Math.Clamp(
            this.startScrollX - dx,
            0,
            maxScroll
          );
        }
      } else if (this.dragMode === "paint") {
        this.placeAtPointer(p);
      } else if (this.dragMode === "erase") {
        this.eraseAtPointer(p);
      }
    });

    this.input.on("pointerup", (p: Phaser.Input.Pointer) => {
      const mode = this.dragMode;
      this.dragMode = "none";

      // Touch path: a tap (no significant pan) places/erases a single cell —
      // same as the original behaviour, kept so mobile editing still works.
      if (p.wasTouch) {
        if (this.hasMoved) return;
        const snap = snapToGrid(p.worldX, p.worldY, this.level.groundY);
        if (!this.inBounds(snap.x, snap.y)) return;
        this.commitAction(() => {
          if (this.tool === "erase") {
            this.eraseAt(snap.x, snap.y);
          } else {
            this.placeAt(this.tool, snap.x, snap.y);
          }
        });
        return;
      }

      // Mouse path: paint/erase already happened on every pointermove. Just
      // emit a final change notification so the React layer sees the result.
      if (mode === "paint" || mode === "erase") {
        this.notify();
      }
    });

    // Out-of-canvas pointer release (drag off the editor): make sure we
    // don't get "stuck" in paint/erase mode.
    this.input.on("pointerupoutside", () => {
      this.dragMode = "none";
    });

    // Mouse wheel / trackpad scroll → horizontal pan. Both deltaX (some
    // trackpads send horizontal directly) and deltaY (most mice) translate
    // into camera scrollX so users can navigate long levels comfortably.
    this.input.on(
      "wheel",
      (
        _pointer: Phaser.Input.Pointer,
        _objects: Phaser.GameObjects.GameObject[],
        deltaX: number,
        deltaY: number
      ) => {
        const worldW = this.level.length + GAME_WIDTH;
        const maxScroll = Math.max(0, worldW - this.cameras.main.width);
        const dx = (Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY) * 0.8;
        this.cameras.main.scrollX = Phaser.Math.Clamp(
          this.cameras.main.scrollX + dx,
          0,
          maxScroll
        );
      }
    );
  }

  // Continuous-paint helpers. They live OUTSIDE commitAction so that an
  // entire drag is recorded as a single undo entry (snapshotForUndo runs
  // once at pointerdown, then each cell mutates `placed` directly).
  private placeAtPointer(p: Phaser.Input.Pointer) {
    if (this.tool === "erase") {
      this.eraseAtPointer(p);
      return;
    }
    const snap = snapToGrid(p.worldX, p.worldY, this.level.groundY);
    if (!this.inBounds(snap.x, snap.y)) return;
    const key = `${snap.x},${snap.y}`;
    if (this.paintedCells.has(key)) return;
    this.paintedCells.add(key);
    this.placeAt(this.tool, snap.x, snap.y);
  }

  private eraseAtPointer(p: Phaser.Input.Pointer) {
    const snap = snapToGrid(p.worldX, p.worldY, this.level.groundY);
    this.eraseAt(snap.x, snap.y);
  }

  private snapshotForUndo() {
    this.undoStack.push(this.placed.map((p) => ({ ...p.obj })));
    if (this.undoStack.length > 50) this.undoStack.shift();
    this.redoStack = [];
  }

  // ─── Public API for React ───────────────────────────────────────────────

  setTool(tool: EditorTool) {
    this.tool = tool;
  }

  getLevel(): LevelData {
    return {
      ...this.level,
      objects: this.placed.map((p) => ({ ...p.obj })),
    };
  }

  updateMeta(meta: Partial<LevelData>) {
    this.level = { ...this.level, ...meta };
    // Editor background stays fixed (editor theme) regardless of level.colors.
    this.cameras.main.setBounds(0, 0, this.level.length + GAME_WIDTH, GAME_HEIGHT);
    // Redraw boundaries / grid / spawn if length changed
    this.children.list.slice().forEach((c) => {
      if (c === this.gridGraphics) return; // we'll regenerate below
      if (c === this.playerGhost) return;
      if (c === this.finishMarker) return;
    });
    // Redraw grid + finish line + ground
    this.gridGraphics?.destroy();
    this.drawGrid();
    this.finishMarker?.setPosition(this.level.length, 96 + (this.level.groundY - 96) / 2);
    this.notify();
  }

  undo() {
    if (this.undoStack.length === 0) return;
    const prev = this.undoStack.pop()!;
    this.redoStack.push(this.placed.map((p) => ({ ...p.obj })));
    this.replaceObjects(prev);
    this.notify();
  }

  redo() {
    if (this.redoStack.length === 0) return;
    const next = this.redoStack.pop()!;
    this.undoStack.push(this.placed.map((p) => ({ ...p.obj })));
    this.replaceObjects(next);
    this.notify();
  }

  clearAll() {
    this.commitAction(() => {
      for (const p of this.placed) p.node.destroy();
      this.placed = [];
    });
  }

  // ─── Internal mutation helpers ──────────────────────────────────────────

  private commitAction(fn: () => void) {
    this.undoStack.push(this.placed.map((p) => ({ ...p.obj })));
    if (this.undoStack.length > 50) this.undoStack.shift();
    this.redoStack = [];
    fn();
    this.notify();
  }

  private placeAt(kind: EditorTool, x: number, y: number) {
    if (kind === "erase") return;
    // Avoid stacking the exact same object on the same cell.
    const exists = this.placed.find(
      (p) => p.obj.id === kind && p.obj.x === x && p.obj.y === y
    );
    if (exists) return;
    const obj: LevelObject = { id: kind as ObjectKind, x, y };
    this.placeNode(obj);
  }

  private eraseAt(x: number, y: number) {
    // Find object at (or very near) this cell — within half a grid each way.
    const idx = this.placed.findIndex(
      (p) => Math.abs(p.obj.x - x) < GRID && Math.abs(p.obj.y - y) < GRID
    );
    if (idx === -1) return;
    this.placed[idx].node.destroy();
    this.placed.splice(idx, 1);
  }

  private replaceObjects(objs: LevelObject[]) {
    for (const p of this.placed) p.node.destroy();
    this.placed = [];
    for (const o of objs) this.placeNode(o);
  }

  private inBounds(x: number, y: number): boolean {
    return (
      x >= 0 &&
      x <= this.level.length &&
      y >= CEILING_Y &&
      y <= this.level.groundY
    );
  }

  private notify() {
    this.onChange(this.getLevel());
  }

  panBy(deltaPx: number) {
    const worldW = this.level.length + GAME_WIDTH;
    const max = Math.max(0, worldW - this.cameras.main.width);
    this.cameras.main.scrollX = Phaser.Math.Clamp(
      this.cameras.main.scrollX + deltaPx,
      0,
      max
    );
  }
}

// Snap X to the natural grid (centers at GRID/2 + k*GRID).
// Snap Y to cells stacked UPWARD from the ground (centers at
// groundY - GRID/2 - k*GRID). This keeps the bottom cell sitting exactly on
// the ground line regardless of where the ceiling is.
function snapToGrid(
  x: number,
  y: number,
  groundY: number
): { x: number; y: number } {
  const cx = Math.round((x - GRID / 2) / GRID) * GRID + GRID / 2;
  const lowestCenter = groundY - GRID / 2;
  const k = Math.max(0, Math.round((lowestCenter - y) / GRID));
  const cy = lowestCenter - k * GRID;
  return { x: cx, y: cy };
}

// ─── Texture generators (mirror of BootScene) ──────────────────────────────

function makeBlock(scene: Phaser.Scene) {
  const size = 32;
  const g = scene.add.graphics({ x: 0, y: 0 });
  g.fillStyle(0xffffff, 1);
  g.fillRect(0, 0, size, size);
  g.fillStyle(0xcccccc, 1);
  g.fillRect(2, 2, size - 4, size - 4);
  g.lineStyle(2, 0xffffff, 1);
  g.strokeRect(1, 1, size - 2, size - 2);
  g.generateTexture("tx_block", size, size);
  g.destroy();
}
function makeSpike(scene: Phaser.Scene) {
  const size = 32;
  const g = scene.add.graphics({ x: 0, y: 0 });
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
function makeJumpPad(scene: Phaser.Scene) {
  const w = 32;
  const h = 12;
  const g = scene.add.graphics({ x: 0, y: 0 });
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
function makeParticle(scene: Phaser.Scene) {
  const size = 8;
  const g = scene.add.graphics({ x: 0, y: 0 });
  g.fillStyle(0xffffff, 1);
  g.fillCircle(size / 2, size / 2, size / 2);
  g.generateTexture("tx_particle", size, size);
  g.destroy();
}
function makePortal(scene: Phaser.Scene, key: string, color: number) {
  const w = 28;
  const h = 64;
  const g = scene.add.graphics({ x: 0, y: 0 });
  g.fillStyle(color, 0.18);
  g.fillRoundedRect(-4, -4, w + 8, h + 8, 14);
  g.lineStyle(2, color, 1);
  g.strokeRoundedRect(0, 0, w, h, 10);
  g.fillStyle(color, 0.35);
  g.fillRoundedRect(2, 2, w - 4, h - 4, 8);
  g.fillStyle(0xffffff, 0.95);
  g.fillRect(w / 2 - 1, 6, 2, h - 12);
  g.generateTexture(key, w, h);
  g.destroy();
}

function makePad(scene: Phaser.Scene, key: string, color: number) {
  const w = 32;
  const h = 12;
  const g = scene.add.graphics({ x: 0, y: 0 });
  g.fillStyle(0xffffff, 1);
  g.fillRoundedRect(0, 0, w, h, 3);
  g.lineStyle(1.5, 0x1a1a1a, 1);
  g.strokeRoundedRect(0, 0, w, h, 3);
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

function makeSpeedPortal(
  scene: Phaser.Scene,
  key: string,
  color: number,
  chevrons: number,
  direction: "left" | "right"
) {
  // Speed portals are shorter & wider than mode portals — they look like a
  // little ring you pass through. Chevron count tells you the speed level
  // (1 chevron = ×1, 4 chevrons = ×4); direction left = slow (×0.5).
  const w = 36;
  const h = 22;
  const g = scene.add.graphics({ x: 0, y: 0 });
  // Soft aura
  g.fillStyle(color, 0.22);
  g.fillRoundedRect(-3, -3, w + 6, h + 6, 8);
  // Frame
  g.lineStyle(2, color, 1);
  g.strokeRoundedRect(0, 0, w, h, 6);
  // Inner glow
  g.fillStyle(color, 0.35);
  g.fillRoundedRect(2, 2, w - 4, h - 4, 4);
  // White core so the chevron reads cleanly
  g.fillStyle(0xffffff, 1);
  g.fillRoundedRect(3, 3, w - 6, h - 6, 3);
  // Chevrons
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

function makeOrb(scene: Phaser.Scene, key: string, color: number) {
  const size = 28;
  const g = scene.add.graphics({ x: 0, y: 0 });
  g.fillStyle(color, 0.22);
  g.fillCircle(size / 2, size / 2, size / 2);
  g.lineStyle(2, color, 1);
  g.strokeCircle(size / 2, size / 2, size / 2 - 2);
  g.fillStyle(0xffffff, 1);
  g.fillCircle(size / 2, size / 2, size / 2 - 6);
  g.fillStyle(color, 1);
  g.fillCircle(size / 2, size / 2, 3);
  g.generateTexture(key, size, size);
  g.destroy();
}
