import type { LevelData, LevelObject, ObjectKind } from "./types";
import { DEFAULT_GROUND_Y, CEILING_Y } from "../constants";

// Helpers to author levels concisely. Landscape (960×540): ground top at
// y=432, ceiling band at y=60, so the play area is ~11.6 cells tall.
const GROUND_Y = DEFAULT_GROUND_Y;
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
/** Spike hanging from the ceiling, pointing down. Use for flipped-gravity. */
function ceilSpike(cellX: number): LevelObject {
  // y placed near the ceiling band, pointing down (rotation 180°)
  return {
    id: "spike",
    x: cellX * G + G / 2,
    y: CEILING_Y + G / 2,
    rotation: 180,
  };
}
// Center portal vertically in the play area so it's visually consistent.
const PORTAL_Y = (CEILING_Y + GROUND_Y) / 2;
function gravP(cellX: number): LevelObject {
  return { id: "gravity_portal", x: cellX * G + G / 2, y: PORTAL_Y };
}
function shipP(cellX: number): LevelObject {
  return { id: "ship_portal", x: cellX * G + G / 2, y: PORTAL_Y };
}
function cubeP(cellX: number): LevelObject {
  return { id: "cube_portal", x: cellX * G + G / 2, y: PORTAL_Y };
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
    pad(82),
    spike(88),
    spike(89),
    spike(90),
    spike(91),
    block(115),
    block(115, 1),
    block(115, 2),
  ],
};

// ─── Level 3: Gravity Rush (Hard) ──────────────────────────────────────────
// Gravity portal flips player to the ceiling — use ceilSpike() up there.
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
    gravP(34),
    // Ceiling spikes (pointing down)
    ceilSpike(46),
    ceilSpike(48),
    ceilSpike(52),
    // Flip back to floor
    gravP(60),
    // Ground run with blocks
    block(70),
    block(71),
    block(71, 1),
    spike(76),
    spike(77),
    // Flip again, longer ceiling segment
    gravP(85),
    ceilSpike(96),
    ceilSpike(102),
    ceilSpike(103),
    // Back to floor for the finish
    gravP(118),
    block(130),
    block(130, 1),
    block(130, 2),
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
    shipP(42),
    // Ship corridor: spikes on floor and ceiling — must fly through middle
    spike(54),
    spike(56),
    spike(58),
    ceilSpike(64),
    ceilSpike(66),
    ceilSpike(68),
    block(72, 5), // floating block in middle of ship corridor
    spike(78),
    ceilSpike(82),
    // Back to cube mode
    cubeP(95),
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
  ],
};

export const LEVELS: LevelData[] = [level1, level2, level3, level4];

export function getLevel(id: string): LevelData | undefined {
  return LEVELS.find((l) => l.id === id);
}
