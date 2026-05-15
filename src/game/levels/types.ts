// Level data format. Mirrors the schema from the TЗ:
//   { name, difficulty, objects: [...], music, colors }
// Object coordinates are world-space pixels (gridSize = 32).

export type ObjectKind =
  | "block"
  | "spike"
  | "jump_pad"
  | "gravity_portal"
  | "ship_portal"
  | "cube_portal";

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

export type PlayerMode = "cube" | "ship" | "ball";
