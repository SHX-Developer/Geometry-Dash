import { useEffect, useRef, useState } from "react";
import type * as Phaser from "phaser";
import { useGameStore } from "../store/gameStore";
import { createEditorRunner } from "../game/EditorRunner";
import { EditorScene, type EditorTool } from "../game/scenes/EditorScene";
import type { Difficulty, LevelData } from "../game/levels/types";
import { haptic } from "../telegram/telegram";

const DEFAULT_LEVEL: LevelData = {
  id: "user_new",
  name: "New Level",
  difficulty: "Normal",
  author: "you",
  length: 4800,
  groundY: 432,
  bpm: 130,
  colors: {
    primary: "#7C4DFF",
    secondary: "#B388FF",
    background: "#0F0F1A",
    ground: "#1E1E36",
  },
  objects: [],
};

// Palette entries — tools mapped 1:1 to EditorTool ids. Optional `color`
// drives a coloured dot in the palette button so the three pad/orb variants
// are easy to tell apart at a glance.
interface ToolEntry {
  id: EditorTool;
  symbol: string;
  name: string;
  color?: string;
}

interface ToolCategory {
  id: string;
  name: string;
  tools: ToolEntry[];
}

// Grouped palette — each category is its own row in the bottom panel so the
// dozen-plus tools don't pile into one long scrollable strip. Order roughly
// follows "build flow": geometry → bounces → gravity tricks → mode switches
// → utility.
const CATEGORIES: ToolCategory[] = [
  {
    id: "blocks",
    name: "BLOCKS",
    tools: [
      { id: "block", symbol: "■", name: "BLOCK" },
      { id: "spike", symbol: "▲", name: "SPIKE" },
    ],
  },
  {
    id: "pads",
    name: "PADS",
    tools: [
      { id: "pad_purple", symbol: "━", name: "PAD-P", color: "#B388FF" },
      { id: "pad_yellow", symbol: "━", name: "PAD-Y", color: "#FFD23F" },
      { id: "pad_blue", symbol: "━", name: "PAD-B", color: "#2D6BFF" },
    ],
  },
  {
    id: "orbs",
    name: "ORBS",
    tools: [
      { id: "orb_purple", symbol: "◯", name: "ORB-P", color: "#B388FF" },
      { id: "orb_yellow", symbol: "◯", name: "ORB-Y", color: "#FFD23F" },
      { id: "orb_blue", symbol: "◯", name: "ORB-B", color: "#2D6BFF" },
    ],
  },
  {
    id: "portals",
    name: "PORTALS",
    tools: [
      { id: "gravity_portal", symbol: "↕", name: "GRAVITY" },
      { id: "ship_portal", symbol: "▶", name: "SHIP" },
      { id: "cube_portal", symbol: "▢", name: "CUBE" },
      { id: "ufo_portal", symbol: "◉", name: "UFO", color: "#00C9B7" },
    ],
  },
  {
    id: "speed",
    name: "SPEED",
    tools: [
      { id: "speed_half", symbol: "◀", name: "×0.5", color: "#FFD23F" },
      { id: "speed_1x", symbol: "▶", name: "×1", color: "#2D6BFF" },
      { id: "speed_2x", symbol: "▶▶", name: "×2", color: "#4DD99B" },
      { id: "speed_3x", symbol: "▶▶▶", name: "×3", color: "#FF6A3D" },
      { id: "speed_4x", symbol: "▶▶▶▶", name: "×4", color: "#FF4DC9" },
    ],
  },
  {
    id: "tools",
    name: "TOOLS",
    tools: [{ id: "erase", symbol: "✕", name: "ERASE" }],
  },
];

const ALL_TOOLS: ToolEntry[] = CATEGORIES.flatMap((c) => c.tools);

export function Editor() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<EditorScene | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  const {
    editingLevelId,
    setEditingLevelId,
    setScreen,
    userLevels,
    saveUserLevel,
    setPreviewLevel,
    draftLevel,
    setDraftLevel,
  } = useGameStore();

  const [level, setLevel] = useState<LevelData>(() => {
    if (editingLevelId) {
      const existing = userLevels.find((l) => l.id === editingLevelId);
      if (existing) return existing;
    }
    if (draftLevel) return draftLevel;
    return {
      ...DEFAULT_LEVEL,
      id: "user_" + Date.now().toString(36),
    };
  });

  const [tool, setTool] = useState<EditorTool>("block");
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Which category tab is open in the bottom palette. Only ONE category's
  // tools are shown at a time so the palette is a single thin row instead of
  // a multi-row block that eats half the level canvas.
  const [activeCategoryId, setActiveCategoryId] = useState<string>("blocks");

  // Keep the active category in sync with the selected tool — e.g. if some
  // external code path switches tool to "spike", the BLOCKS tab should light
  // up automatically.
  useEffect(() => {
    const cat = CATEGORIES.find((c) => c.tools.some((t) => t.id === tool));
    if (cat && cat.id !== activeCategoryId) {
      setActiveCategoryId(cat.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool]);

  // Mount Phaser editor once.
  useEffect(() => {
    if (!containerRef.current) return;
    const { game, getScene } = createEditorRunner({
      parent: containerRef.current,
      level,
      onChange: (l) => {
        setLevel((prev) => {
          const merged = { ...prev, objects: l.objects };
          setDraftLevel(merged);
          return merged;
        });
      },
    });
    gameRef.current = game;
    const tryAttach = setInterval(() => {
      const s = getScene();
      if (s && s.scene.isActive()) {
        sceneRef.current = s;
        s.setTool(tool);
        clearInterval(tryAttach);
      }
    }, 50);

    return () => {
      clearInterval(tryAttach);
      game.destroy(true);
      gameRef.current = null;
      sceneRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    sceneRef.current?.setTool(tool);
  }, [tool]);

  useEffect(() => {
    sceneRef.current?.updateMeta({
      name: level.name,
      length: level.length,
      groundY: level.groundY,
      bpm: level.bpm,
      colors: level.colors,
      difficulty: level.difficulty,
    });
  }, [
    level.name,
    level.length,
    level.groundY,
    level.bpm,
    level.colors,
    level.difficulty,
  ]);

  useEffect(() => {
    setDraftLevel(level);
  }, [level, setDraftLevel]);

  const undo = () => {
    haptic("light");
    sceneRef.current?.undo();
  };
  const redo = () => {
    haptic("light");
    sceneRef.current?.redo();
  };
  const clearAll = () => {
    if (!confirm("Очистить все объекты?")) return;
    sceneRef.current?.clearAll();
  };

  const onPlay = () => {
    haptic("medium");
    const current = sceneRef.current?.getLevel() ?? level;
    setPreviewLevel(current);
    setEditingLevelId(current.id);
    setScreen("play");
  };

  const onSave = () => {
    haptic("success");
    const current = sceneRef.current?.getLevel() ?? level;
    saveUserLevel(current);
    setEditingLevelId(current.id);
    setDraftLevel(current);
    setLevel(current);
    flash("Сохранено");
  };

  const onBack = () => {
    setEditingLevelId(null);
    setDraftLevel(null);
    setScreen("menu");
  };

  const activeTool = ALL_TOOLS.find((t) => t.id === tool);

  return (
    <div className="absolute inset-0 bg-bg overflow-hidden">
      <div ref={containerRef} className="absolute inset-0" />

      {/* Top bar — minimalist wireframe */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center gap-2 px-3 h-14 bg-panel border-b-[1.5px] border-ink">
        <button
          className="box rounded h-9 px-3 flex items-center justify-center text-xs font-bold tracking-wider"
          onClick={onBack}
        >
          ← BACK
        </button>
        <div className="w-px h-7 bg-divider mx-1" />
        <input
          className="flex-1 min-w-0 bg-transparent text-sm font-bold italic text-ink px-2 py-1 outline-none focus:bg-bgSoft rounded"
          style={{ letterSpacing: "0.04em" }}
          value={level.name}
          onChange={(e) => setLevel({ ...level, name: e.target.value })}
        />
        <button
          className="box rounded h-9 w-9 flex items-center justify-center"
          onClick={() => setSettingsOpen(true)}
          aria-label="Settings"
        >
          ⚙
        </button>
        <button
          className="box rounded h-9 px-3 text-xs font-bold tracking-wider"
          onClick={onSave}
        >
          SAVE
        </button>
        <button
          className="btn-acc h-9 px-4 text-xs tracking-wider"
          onClick={onPlay}
        >
          ▶ TEST
        </button>
      </div>

      {/* Mode chip + object count */}
      <div className="absolute top-16 left-3 z-20 flex gap-2">
        <div
          className="box rounded-full px-3 py-1"
          style={{
            font: "700 11px/1 ui-monospace, monospace",
            letterSpacing: "0.15em",
            color: tool === "erase" ? "#c92a2a" : "#1a1a1a",
          }}
        >
          {(tool === "erase" ? "DELETE" : "BUILD").toString()} MODE
          <span className="lbl ml-2">
            · {activeTool?.name ?? ""}
          </span>
        </div>
        <div className="box rounded px-3 py-1 lbl lbl-dk">
          {level.objects.length} OBJ · {level.length}PX · {level.bpm ?? 130}BPM
        </div>
      </div>

      {/* Undo / redo / clear */}
      <div className="absolute top-16 right-3 z-20 flex gap-1.5">
        <button
          onClick={undo}
          className="box rounded w-9 h-9 flex items-center justify-center"
          aria-label="Undo"
        >
          ↶
        </button>
        <button
          onClick={redo}
          className="box rounded w-9 h-9 flex items-center justify-center"
          aria-label="Redo"
        >
          ↷
        </button>
        <button
          onClick={clearAll}
          className="rounded w-9 h-9 flex items-center justify-center border-[1.5px]"
          style={{ borderColor: "#c92a2a", color: "#c92a2a", background: "#fff" }}
          aria-label="Clear"
        >
          🗑
        </button>
      </div>

      {/* Bottom palette — single thin row. Left half: category tabs (only
          ONE active at a time). Right half: tools of the active category.
          Total height ~52 px so the level canvas stays uncovered. */}
      <div className="absolute bottom-0 left-0 right-0 z-20 bg-panel border-t-[1.5px] border-ink">
        <div className="flex items-stretch gap-2 px-3 py-2">
          {/* Category tabs */}
          <div className="flex gap-1 shrink-0">
            {CATEGORIES.map((c) => {
              const active = c.id === activeCategoryId;
              return (
                <button
                  key={c.id}
                  onClick={() => {
                    haptic("light");
                    setActiveCategoryId(c.id);
                  }}
                  className="rounded px-2.5 py-1.5 border-[1.5px]"
                  style={{
                    background: active ? "#1a1a1a" : "#fff",
                    color: active ? "#fff" : "#1a1a1a",
                    borderColor: "#1a1a1a",
                    font: "700 10px/1 ui-monospace, monospace",
                    letterSpacing: "0.10em",
                  }}
                >
                  {c.name}
                </button>
              );
            })}
          </div>
          <div className="w-px self-stretch bg-divider mx-1" />
          {/* Tools of active category */}
          <div className="flex gap-1.5 flex-1 flex-wrap items-center">
            {(
              CATEGORIES.find((c) => c.id === activeCategoryId) ?? CATEGORIES[0]
            ).tools.map((t) => {
              const active = tool === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => {
                    haptic("light");
                    setTool(t.id);
                  }}
                  className="rounded flex items-center gap-1.5 border-[1.5px] px-2.5 py-1.5"
                  style={{
                    background: active ? "#1a1a1a" : "#fff",
                    color: active ? "#fff" : "#1a1a1a",
                    borderColor: "#1a1a1a",
                  }}
                  title={t.name}
                >
                  <span
                    className="text-base leading-none"
                    style={t.color ? { color: t.color } : undefined}
                  >
                    {t.symbol}
                  </span>
                  <span
                    style={{
                      font: "600 10px/1 ui-monospace, monospace",
                      letterSpacing: "0.08em",
                    }}
                  >
                    {t.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {settingsOpen && (
        <SettingsSheet
          level={level}
          onChange={setLevel}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}

// ─── Settings sheet (modal) ──────────────────────────────────────────────

function SettingsSheet({
  level,
  onChange,
  onClose,
}: {
  level: LevelData;
  onChange: (l: LevelData) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="absolute inset-0 z-30 flex items-end"
      style={{ background: "rgba(26,26,26,0.45)" }}
      onClick={onClose}
    >
      <div
        className="w-full bg-panel border-t-[1.5px] border-ink rounded-t-md p-4 flex flex-col gap-3 max-h-[80%] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-bold italic tracking-wider text-ink text-lg">
            LEVEL SETTINGS
          </h3>
          <button
            onClick={onClose}
            className="box rounded w-9 h-9 flex items-center justify-center"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <Row label="DIFFICULTY">
          <select
            className="box rounded px-2 py-1 text-sm bg-panel text-ink"
            value={level.difficulty}
            onChange={(e) =>
              onChange({ ...level, difficulty: e.target.value as Difficulty })
            }
          >
            {(["Easy", "Normal", "Hard", "Extreme"] as Difficulty[]).map((d) => (
              <option key={d} value={d}>
                {d.toUpperCase()}
              </option>
            ))}
          </select>
        </Row>

        <Row label={`LENGTH: ${level.length}PX`}>
          <input
            type="range"
            min={2400}
            max={14000}
            step={160}
            value={level.length}
            onChange={(e) =>
              onChange({ ...level, length: Number(e.target.value) })
            }
            className="w-full accent-ink"
          />
        </Row>

        <Row label={`BPM: ${level.bpm ?? 130}`}>
          <input
            type="range"
            min={70}
            max={200}
            step={1}
            value={level.bpm ?? 130}
            onChange={(e) =>
              onChange({ ...level, bpm: Number(e.target.value) })
            }
            className="w-full accent-ink"
          />
        </Row>

        <Row label="PRIMARY COLOR">
          <ColorPicker
            value={level.colors?.primary ?? "#7C4DFF"}
            onChange={(c) =>
              onChange({
                ...level,
                colors: { ...level.colors, primary: c },
              })
            }
          />
        </Row>

        <Row label="BACKGROUND">
          <ColorPicker
            value={level.colors?.background ?? "#0F0F1A"}
            onChange={(c) =>
              onChange({
                ...level,
                colors: { ...level.colors, background: c },
              })
            }
          />
        </Row>

        <Row label="GROUND">
          <ColorPicker
            value={level.colors?.ground ?? "#1E1E36"}
            onChange={(c) =>
              onChange({
                ...level,
                colors: { ...level.colors, ground: c },
              })
            }
          />
        </Row>
      </div>
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="lbl lbl-dk">{label}</span>
      {children}
    </div>
  );
}

const COLOR_PRESETS = [
  "#ffffff",
  "#f0eee9",
  "#1a1a1a",
  "#2a2a2a",
  "#2D6BFF",
  "#c92a2a",
  "#7C4DFF",
  "#4DFFB8",
  "#FF6A3D",
  "#FFD23F",
];

function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (c: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {COLOR_PRESETS.map((c) => (
        <button
          key={c}
          onClick={() => onChange(c)}
          className="w-6 h-6 rounded-full"
          style={{
            background: c,
            border: `2px solid ${
              value.toUpperCase() === c.toUpperCase() ? "#1a1a1a" : "#d0cec8"
            }`,
          }}
          aria-label={c}
        />
      ))}
    </div>
  );
}

// Tiny floating toast for save feedback. Self-contained so we don't pull in
// a toast library.
function flash(msg: string) {
  const el = document.createElement("div");
  el.textContent = msg;
  el.style.cssText = `
    position: fixed;
    top: 64px;
    left: 50%;
    transform: translateX(-50%) translateY(-10px);
    background: #1a1a1a;
    color: #fff;
    padding: 6px 14px;
    border: 1.5px solid #1a1a1a;
    border-radius: 4px;
    font: 700 11px/1 ui-monospace, monospace;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    z-index: 9999;
    opacity: 0;
    transition: opacity 200ms, transform 200ms;
  `;
  document.body.appendChild(el);
  requestAnimationFrame(() => {
    el.style.opacity = "1";
    el.style.transform = "translateX(-50%) translateY(0)";
  });
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translateX(-50%) translateY(-10px)";
    setTimeout(() => el.remove(), 250);
  }, 1400);
}
