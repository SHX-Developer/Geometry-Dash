// Logical canvas size — landscape 16:9.
// World coordinates: x = horizontal (player runs right), y = 0 at top.
//   - Ground top is at GROUND_Y (default 432, ~80% from top).
//   - Ceiling (for flipped gravity / ship-mode ceiling) at CEILING_Y.
//   - Playable band CEILING_Y..GROUND_Y is exactly 11 cells (352 px / 32).
//   - Grid edges align with both ground and ceiling so the editor cells
//     "stack from the ground up" cleanly.
export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 540;

export const DEFAULT_GROUND_Y = 432;
export const CEILING_Y = 80; // = 432 - 11*32 — aligned to grid
export const GRID = 32;
