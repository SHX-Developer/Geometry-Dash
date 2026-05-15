import type { LevelData } from "./types";
import { LEVELS, getLevel } from "./levels";
import { useGameStore } from "../../store/gameStore";

// Level loader. Sources, in order of priority:
//   1. user-generated levels in the zustand store (localStorage-backed)
//   2. built-in LEVELS array
//   3. external JSON under /public/assets/levels/<id>.json

export async function loadLevel(id: string): Promise<LevelData> {
  // 1. user level
  const userLevel = useGameStore.getState().userLevels.find((l) => l.id === id);
  if (userLevel) return userLevel;

  // 2. built-in
  const builtin = getLevel(id);
  if (builtin) return builtin;

  // 3. asset JSON
  const res = await fetch(`/assets/levels/${id}.json`);
  if (!res.ok) {
    throw new Error(`Level "${id}" not found (HTTP ${res.status})`);
  }
  const data = (await res.json()) as LevelData;
  validateLevel(data);
  return data;
}

/** All built-in levels. */
export function listBuiltinLevels(): LevelData[] {
  return LEVELS;
}

/** Returns built-in + user levels (in that order). */
export function listAllLevels(): LevelData[] {
  return [...LEVELS, ...useGameStore.getState().userLevels];
}

function validateLevel(l: LevelData): void {
  if (!l.id || !l.name || !Array.isArray(l.objects)) {
    throw new Error("Invalid level: missing id/name/objects");
  }
  if (typeof l.length !== "number" || typeof l.groundY !== "number") {
    throw new Error("Invalid level: missing length/groundY");
  }
}
