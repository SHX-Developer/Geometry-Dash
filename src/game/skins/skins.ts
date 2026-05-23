// Skin presets used both by the React UI (preview) and by Phaser (Player
// renders itself using these colors). For MVP, "icons" are programmatically
// drawn shapes — no external textures required.

export type SkinShape =
  | "cube"
  | "ball"
  | "ship"
  | "wave"
  | "ufo"
  | "robot"
  | "spider"
  | "swing";

export interface Skin {
  id: string;
  name: string;
  shape: SkinShape;
  primary: string; // main fill
  secondary: string; // accent / inner detail
  trail: string; // particle trail color
  glow: string; // halo color for shadow / glow
  unlocked: boolean;
  description: string;
}

export const SKINS: Skin[] = [
  {
    id: "neon_cube",
    name: "Neon Cube",
    shape: "cube",
    primary: "#7C4DFF",
    secondary: "#B388FF",
    trail: "#B388FF",
    glow: "#7C4DFF",
    unlocked: true,
    description: "Cyber starter — балансный куб для первых прыжков.",
  },
  {
    id: "fire_cube",
    name: "Fire Cube",
    shape: "cube",
    primary: "#FF6A3D",
    secondary: "#FFD23F",
    trail: "#FF6A3D",
    glow: "#FF3D00",
    unlocked: true,
    description: "Огненный куб. Шлейф пылает за спиной.",
  },
  {
    id: "ice_cube",
    name: "Ice Cube",
    shape: "cube",
    primary: "#4DD0E1",
    secondary: "#E0F7FA",
    trail: "#80DEEA",
    glow: "#00B8D4",
    unlocked: true,
    description: "Ледяной куб с морозным мерцанием.",
  },
  {
    id: "shadow_cube",
    name: "Shadow Cube",
    shape: "cube",
    primary: "#212135",
    secondary: "#5C5C8A",
    trail: "#9C9CC8",
    glow: "#3D3D7A",
    unlocked: false,
    description: "Открывается за прохождение Hard уровня.",
  },
  {
    id: "aqua_ball",
    name: "Aqua Ball",
    shape: "ball",
    primary: "#4DFFB8",
    secondary: "#A6FFE3",
    trail: "#4DFFB8",
    glow: "#1DE9B6",
    unlocked: true,
    description: "Форма-шар. Косметика — реальный ball-режим включается порталом.",
  },
  {
    id: "stealth_ship",
    name: "Stealth Ship",
    shape: "ship",
    primary: "#5C5CFF",
    secondary: "#9EA7FF",
    trail: "#5C5CFF",
    glow: "#3D5AFE",
    unlocked: true,
    description: "Форма-корабль. В ship-портале превращается в полёт.",
  },
];

export function getSkin(id: string): Skin {
  return SKINS.find((s) => s.id === id) ?? SKINS[0];
}
