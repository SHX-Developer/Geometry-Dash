import type { LevelData, LevelObject, ObjectKind } from "./types";

// Helpers to author levels concisely. Ground top at y=768 by default.
const GROUND_Y = 768;
const G = 32; // grid

function obj(
  id: ObjectKind,
  cellX: number,
  cellsFromGround = 0
): LevelObject {
  return {
    id,
    x: cellX * G + G / 2,
    y: GROUND_Y - cellsFromGround * G - G / 2,
  };
}

function spike(cellX: number, cellsFromGround = 0): LevelObject {
  return obj("spike", cellX, cellsFromGround);
}
function block(cellX: number, cellsFromGround = 0): LevelObject {
  return obj("block", cellX, cellsFromGround);
}
function pad(cellX: number, cellsFromGround = 0): LevelObject {
  return obj("jump_pad", cellX, cellsFromGround);
}
function gravP(cellX: number, cellsFromGround = 8): LevelObject {
  // portals are tall — center them in the play area
  return obj("gravity_portal", cellX, cellsFromGround);
}
function shipP(cellX: number, cellsFromGround = 8): LevelObject {
  return obj("ship_portal", cellX, cellsFromGround);
}
function cubeP(cellX: number, cellsFromGround = 8): LevelObject {
  return obj("cube_portal", cellX, cellsFromGround);
}

// ─── Level 1: First Jump (Easy) ────────────────────────────────────────────
const level1: LevelData = {
  id: "first_jump",
  name: "First Jump",
  difficulty: "Easy",
  author: "system",
  length: 5200,
  groundY: GROUND_Y,
  bpm: 120,
  colors: {
    primary: "#7C4DFF",
    secondary: "#B388FF",
    background: "#0F0F1A",
    ground: "#1E1E36",
  },
  objects: [
    spike(20),
    spike(30),
    spike(31),
    block(42),
    block(43),
    block(43, 1),
    pad(54),
    spike(58),
    spike(59),
    spike(60),
    spike(75),
    spike(86),
    spike(87),
    block(95),
    block(95, 1),
    block(95, 2),
  ],
};

// ─── Level 2: Neon Path (Normal) ───────────────────────────────────────────
const level2: LevelData = {
  id: "neon_path",
  name: "Neon Path",
  difficulty: "Normal",
  author: "system",
  length: 7000,
  groundY: GROUND_Y,
  bpm: 130,
  colors: {
    primary: "#4DD0E1",
    secondary: "#80DEEA",
    background: "#0A1224",
    ground: "#102040",
  },
  objects: [
    spike(15),
    spike(18),
    spike(21),
    block(28),
    block(29),
    block(29, 1),
    block(30),
    block(30, 1),
    block(30, 2),
    pad(34),
    block(46),
    spike(46, 1),
    spike(55),
    spike(56),
    spike(57),
    block(70),
    block(70, 1),
    block(70, 2),
    block(70, 3),
    pad(82),
    spike(88),
    spike(89),
    spike(90),
    spike(91),
    block(115),
    block(115, 1),
    block(115, 2),
    block(115, 3),
  ],
};

// ─── Level 3: Gravity Rush (Hard) ──────────────────────────────────────────
// Introduces gravity_portal. After the first flip the player runs on the
// ceiling; spikes need to be placed at the top now (cellsFromGround ≈ 20).
const level3: LevelData = {
  id: "gravity_rush",
  name: "Gravity Rush",
  difficulty: "Hard",
  author: "system",
  length: 7600,
  groundY: GROUND_Y,
  bpm: 145,
  colors: {
    primary: "#FF6A3D",
    secondary: "#FFD23F",
    background: "#1A0A14",
    ground: "#3A1A20",
  },
  objects: [
    // Easy intro
    spike(16),
    spike(22),
    spike(23),
    // First gravity flip → now running on ceiling
    gravP(34, 8),
    // Spikes ON the ceiling (hanging down) — cellsFromGround big = near top
    spike(46, 19),
    spike(48, 19),
    spike(52, 19),
    // Flip back to floor
    gravP(60, 8),
    // Ground run with blocks
    block(70),
    block(71),
    block(71, 1),
    spike(76),
    spike(77),
    // Flip again, longer ceiling segment
    gravP(85, 8),
    spike(96, 19),
    spike(102, 19),
    spike(103, 19),
    pad(108, 20), // upward-from-ceiling = bounces down? In our model pad is generic
    // Back to floor for the finish
    gravP(118, 8),
    block(130),
    block(130, 1),
    block(130, 2),
    block(130, 3),
  ],
};

// ─── Level 4: Dark Pulse (Hard) ────────────────────────────────────────────
// Showcases ship_portal — player flies for a while, then back to cube.
const level4: LevelData = {
  id: "dark_pulse",
  name: "Dark Pulse",
  difficulty: "Hard",
  author: "system",
  length: 8000,
  groundY: GROUND_Y,
  bpm: 150,
  colors: {
    primary: "#5C5CFF",
    secondary: "#9EA7FF",
    background: "#0A0A24",
    ground: "#14143A",
  },
  objects: [
    spike(15),
    block(24),
    block(25),
    spike(32),
    spike(33),
    // Switch to ship — hold to fly, release to fall
    shipP(42, 8),
    // Ship corridor: spikes on floor and ceiling — must fly through middle
    spike(54),
    spike(56),
    spike(58),
    spike(64, 18),
    spike(66, 18),
    spike(68, 18),
    block(72, 10), // floating block in middle of ship corridor
    spike(78),
    spike(82, 18),
    // Back to cube mode
    cubeP(95, 8),
    // Normal cube finish
    spike(108),
    block(118),
    block(118, 1),
    pad(128),
    spike(134),
    spike(135),
    block(150),
    block(150, 1),
    block(150, 2),
    block(150, 3),
  ],
};

export const LEVELS: LevelData[] = [level1, level2, level3, level4];

export function getLevel(id: string): LevelData | undefined {
  return LEVELS.find((l) => l.id === id);
}
