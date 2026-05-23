// Level data format. Mirrors the schema from the TЗ:
//   { name, difficulty, objects: [...], music, colors }
// Object coordinates are world-space pixels (gridSize = 32).

export type ObjectKind =
  | "block"
  | "spike"
  // Pads — auto-trigger when the player overlaps them.
  //   purple = light bounce, yellow = normal bounce, blue = gravity flip.
  // `jump_pad` is kept as an alias for `pad_yellow` so existing levels and
  // older save files don't break.
  | "jump_pad"
  | "pad_purple"
  | "pad_yellow"
  | "pad_blue"
  // Orbs — same payloads as the pads, but the player must TAP while
  // overlapping. Each orb fires once per overlap.
  //   purple = light hop, yellow = normal hop, blue = gravity flip,
  //   black  = sharp dash DOWNWARD (along current gravity),
  //   green  = gravity flip + yellow-style hop in the NEW gravity direction.
  | "orb_purple"
  | "orb_yellow"
  | "orb_blue"
  | "orb_black"
  | "orb_green"
  | "gravity_portal"
  | "ship_portal"
  | "cube_portal"
  | "ufo_portal"
  | "wave_portal"
  | "ball_portal"
  | "robot_portal"
  | "spider_portal"
  | "swing_portal"
  // Size portals — mini shrinks the player to 0.6×, big restores to 1×.
  // Both visuals are short ring-style portals like the speed ones.
  | "mini_portal"
  | "big_portal"
  // Speed portals — change the player's horizontal run speed on x-crossing.
  //   slow → 0.7×, normal → 1×, fast → 1.3×, faster → 1.5×, fastest → 1.75×
  // (Labels match GD's "×0.5 / ×1 / ×2 / ×3 / ×4" convention; the actual
  // multipliers are tuned for playability — pure 4× would be unplayable.)
  | "speed_half"
  | "speed_1x"
  | "speed_2x"
  | "speed_3x"
  | "speed_4x";

export type Difficulty = "Easy" | "Normal" | "Hard" | "Extreme";

export interface LevelObject {
  id: ObjectKind;
  x: number;
  y: number;
  rotation?: number; // degrees
  scale?: number;
}

export interface LevelColors {
  primary?: string;
  secondary?: string;
  background?: string;
  ground?: string;
}

export interface LevelData {
  id: string;
  name: string;
  difficulty: Difficulty;
  author?: string;
  music?: string; // path under /assets/sounds/ — optional (we synth beats if missing)
  bpm?: number; // beats per minute for synth + sync effects (default 130)
  colors?: LevelColors;
  length: number; // total level length in pixels
  groundY: number; // y of the top of the ground
  objects: LevelObject[];
}

export type PlayerMode =
  | "cube"
  | "ship"
  | "ball"
  | "ufo"
  | "wave"
  | "robot"
  | "spider"
  | "swing";
