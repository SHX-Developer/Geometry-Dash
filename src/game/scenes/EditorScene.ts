import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "../PhaserGame";
import type { LevelData, LevelObject, ObjectKind } from "../levels/types";
import { PLAYER_SIZE } from "../player/Player";

export type EditorTool =
  | "block"
  | "spike"
  | "jump_pad"
  | "gravity_portal"
  | "ship_portal"
  | "cube_portal"
  | "erase";

const GRID = 32;
const DRAG_THRESHOLD = 6; // px — drag vs tap distinction

// Texture key per object kind
const TEX_OF: Record<ObjectKind, string> = {
  block: "tx_block",
  spike: "tx_spike",
  jump_pad: "tx_jump_pad",
  gravity_portal: "tx_portal_gravity",
  ship_portal: "tx_portal_ship",
  cube_portal: "tx_portal_cube",
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
  private isDragging = false;
  private hasMoved = false;
  private startPointerX = 0;
  private startScrollX = 0;
  private paintedCells = new Set<string>(); // "x,y" of cells painted during this drag

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

    const bg = this.level.colors?.background ?? "#0F0F1A";
    this.cameras.main.setBackgroundColor(bg);
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
    if (!this.textures.exists("tx_portal_gravity"))
      makePortal(this, "tx_portal_gravity", 0x4dffb8);
    if (!this.textures.exists("tx_portal_ship"))
      makePortal(this, "tx_portal_ship", 0x5c5cff);
    if (!this.textures.exists("tx_portal_cube"))
      makePortal(this, "tx_portal_cube", 0xb388ff);
  }

  private drawGround() {
    const worldW = this.level.length + GAME_WIDTH;
    const gColor = Phaser.Display.Color.HexStringToColor(
      this.level.colors?.ground ?? "#1E1E36"
    ).color;
    this.add
      .rectangle(worldW / 2, this.level.groundY + (GAME_HEIGHT) / 2, worldW, GAME_HEIGHT, gColor)
      .setDepth(-1);
    const glow = Phaser.Display.Color.HexStringToColor(
      this.level.colors?.primary ?? "#7C4DFF"
    ).color;
    this.add.rectangle(worldW / 2, this.level.groundY, worldW, 3, glow, 1).setDepth(0);
    // Ceiling indicator (where ship/ball-flipped flight is bounded)
    this.add.rectangle(worldW / 2, 96, worldW, 2, glow, 0.4).setDepth(0);
  }

  private drawGrid() {
    this.gridGraphics?.destroy();
    this.gridGraphics = this.add.graphics().setDepth(-0.5);
    const worldW = this.level.length + GAME_WIDTH;
    // Vertical lines — every 32px
    this.gridGraphics.lineStyle(1, 0xffffff, 0.05);
    for (let x = 0; x <= worldW; x += GRID) {
      this.gridGraphics.lineBetween(x, 96, x, this.level.groundY);
    }
    // Highlighted gridline every 5 cells (160 px)
    this.gridGraphics.lineStyle(1, 0xffffff, 0.12);
    for (let x = 0; x <= worldW; x += GRID * 5) {
      this.gridGraphics.lineBetween(x, 96, x, this.level.groundY);
    }
    // Horizontal lines
    this.gridGraphics.lineStyle(1, 0xffffff, 0.05);
    for (let y = 96; y <= this.level.groundY; y += GRID) {
      this.gridGraphics.lineBetween(0, y, worldW, y);
    }
  }

  private drawBoundaries() {
    // Left wall: thin marker for x=0
    this.add.rectangle(2, 96 + (this.level.groundY - 96) / 2, 4, this.level.groundY - 96, 0xffffff, 0.18).setDepth(-0.4);
  }

  private drawSpawnAndFinish() {
    const startX = 120;
    const startY = this.level.groundY - PLAYER_SIZE / 2 - 4;
    this.playerGhost = this.add
      .rectangle(startX, startY, PLAYER_SIZE, PLAYER_SIZE, 0xb388ff, 0.5)
      .setStrokeStyle(2, 0xb388ff, 0.9)
      .setDepth(2) as unknown as Phaser.GameObjects.Image;

    // Finish marker (vertical strip at x = level.length)
    this.finishMarker = this.add
      .rectangle(this.level.length, 96 + (this.level.groundY - 96) / 2, 6, this.level.groundY - 96, 0x4dffb8, 0.9)
      .setDepth(2);
    this.add.rectangle(this.level.length, 80, 60, 24, 0x4dffb8, 0.85).setDepth(2);
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
    // Tint to level palette
    const primary = Phaser.Display.Color.HexStringToColor(
      this.level.colors?.primary ?? "#7C4DFF"
    ).color;
    const secondary = Phaser.Display.Color.HexStringToColor(
      this.level.colors?.secondary ?? "#B388FF"
    ).color;
    if (obj.id === "block") img.setTint(primary);
    else if (obj.id === "spike") img.setTint(secondary);
    else if (obj.id === "jump_pad") img.setTint(0x4dffb8);
    this.placed.push({ obj, node: img });
  }

  // ─── Input ──────────────────────────────────────────────────────────────

  private setupInput() {
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      this.isDragging = true;
      this.hasMoved = false;
      this.startPointerX = p.x;
      this.startScrollX = this.cameras.main.scrollX;
      this.paintedCells.clear();
    });

    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      const worldX = p.worldX;
      const worldY = p.worldY;
      // ghost cursor follows the snapped position
      const { x: gx, y: gy } = snapToGrid(worldX, worldY);
      if (this.tool !== "erase") {
        const tex = TEX_OF[this.tool as ObjectKind] ?? "tx_block";
        this.ghostCursor.setVisible(true).setPosition(gx, gy).setTexture(tex);
      } else {
        this.ghostCursor.setVisible(false);
      }

      if (!this.isDragging) return;
      const dx = p.x - this.startPointerX;
      if (!this.hasMoved && Math.abs(dx) > DRAG_THRESHOLD) {
        this.hasMoved = true;
      }
      if (this.hasMoved) {
        const worldW = this.level.length + GAME_WIDTH;
        const maxScroll = Math.max(0, worldW - this.cameras.main.width);
        const next = Phaser.Math.Clamp(
          this.startScrollX - dx,
          0,
          maxScroll
        );
        this.cameras.main.scrollX = next;
      }
    });

    this.input.on("pointerup", (p: Phaser.Input.Pointer) => {
      const wasDrag = this.hasMoved;
      this.isDragging = false;
      if (wasDrag) return; // pan, not a tap

      const snap = snapToGrid(p.worldX, p.worldY);
      if (!this.inBounds(snap.x, snap.y)) return;
      this.commitAction(() => {
        if (this.tool === "erase") {
          this.eraseAt(snap.x, snap.y);
        } else {
          this.placeAt(this.tool, snap.x, snap.y);
        }
      });
    });
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
    this.cameras.main.setBackgroundColor(this.level.colors?.background ?? "#0F0F1A");
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
      y >= 96 &&
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

function snapToGrid(x: number, y: number): { x: number; y: number } {
  const cx = Math.round((x - GRID / 2) / GRID) * GRID + GRID / 2;
  const cy = Math.round((y - GRID / 2) / GRID) * GRID + GRID / 2;
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
