import { create } from "zustand";
import { persist } from "zustand/middleware";
import { SKINS } from "../game/skins/skins";
import type { LevelData } from "../game/levels/types";

export type Screen = "menu" | "skins" | "levels" | "play" | "editor";

export interface LevelProgress {
  bestPercent: number; // 0..100
  completed: boolean;
}

interface GameState {
  // Navigation
  screen: Screen;
  setScreen: (s: Screen) => void;

  // Selected level id (only meaningful when screen === "play")
  currentLevelId: string | null;
  setCurrentLevelId: (id: string | null) => void;

  // Selected level for editing (when screen === "editor" and not creating new)
  editingLevelId: string | null;
  setEditingLevelId: (id: string | null) => void;

  // Editor → Play preview. When set, GameView uses this level directly
  // instead of looking up currentLevelId, and on exit returns to editor.
  previewLevel: LevelData | null;
  setPreviewLevel: (l: LevelData | null) => void;

  // Editor draft — survives navigation (preview play, accidental back, etc.)
  // until the user explicitly saves or starts a new level from menu.
  draftLevel: LevelData | null;
  setDraftLevel: (l: LevelData | null) => void;

  // Skin selection
  selectedSkinId: string;
  setSelectedSkinId: (id: string) => void;

  // Per-skin color overrides (optional; null = use skin defaults)
  primaryOverride: string | null;
  secondaryOverride: string | null;
  setPrimaryOverride: (c: string | null) => void;
  setSecondaryOverride: (c: string | null) => void;

  // Progress per level
  progress: Record<string, LevelProgress>;
  recordAttempt: (levelId: string, percent: number, completed: boolean) => void;

  // Coins (for future unlocks)
  coins: number;
  addCoins: (n: number) => void;

  // Audio
  muted: boolean;
  toggleMuted: () => void;
  setMuted: (m: boolean) => void;

  // User-generated levels (created in the editor)
  userLevels: LevelData[];
  saveUserLevel: (level: LevelData) => void;
  deleteUserLevel: (id: string) => void;
}

export const useGameStore = create<GameState>()(
  persist(
    (set) => ({
      screen: "menu",
      setScreen: (screen) => set({ screen }),

      currentLevelId: null,
      setCurrentLevelId: (currentLevelId) => set({ currentLevelId }),

      editingLevelId: null,
      setEditingLevelId: (editingLevelId) => set({ editingLevelId }),

      previewLevel: null,
      setPreviewLevel: (previewLevel) => set({ previewLevel }),

      draftLevel: null,
      setDraftLevel: (draftLevel) => set({ draftLevel }),

      selectedSkinId: SKINS[0].id,
      setSelectedSkinId: (selectedSkinId) => set({ selectedSkinId }),

      primaryOverride: null,
      secondaryOverride: null,
      setPrimaryOverride: (primaryOverride) => set({ primaryOverride }),
      setSecondaryOverride: (secondaryOverride) => set({ secondaryOverride }),

      progress: {},
      recordAttempt: (levelId, percent, completed) =>
        set((state) => {
          const prev = state.progress[levelId] ?? {
            bestPercent: 0,
            completed: false,
          };
          return {
            progress: {
              ...state.progress,
              [levelId]: {
                bestPercent: Math.max(prev.bestPercent, percent),
                completed: prev.completed || completed,
              },
            },
          };
        }),

      coins: 0,
      addCoins: (n) => set((s) => ({ coins: s.coins + n })),

      muted: false,
      toggleMuted: () => set((s) => ({ muted: !s.muted })),
      setMuted: (m) => set({ muted: m }),

      userLevels: [],
      saveUserLevel: (level) =>
        set((state) => {
          const existing = state.userLevels.findIndex((l) => l.id === level.id);
          const next = state.userLevels.slice();
          if (existing >= 0) next[existing] = level;
          else next.push(level);
          return { userLevels: next };
        }),
      deleteUserLevel: (id) =>
        set((state) => ({
          userLevels: state.userLevels.filter((l) => l.id !== id),
        })),
    }),
    {
      name: "gd-tma-state-v1",
      partialize: (state) => ({
        selectedSkinId: state.selectedSkinId,
        primaryOverride: state.primaryOverride,
        secondaryOverride: state.secondaryOverride,
        progress: state.progress,
        coins: state.coins,
        muted: state.muted,
        userLevels: state.userLevels,
        draftLevel: state.draftLevel,
      }),
    }
  )
);
