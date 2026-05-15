import { useEffect, useRef, useState } from "react";
import type Phaser from "phaser";
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
  groundY: 768,
  bpm: 130,
  colors: {
    primary: "#7C4DFF",
    secondary: "#B388FF",
    background: "#0F0F1A",
    ground: "#1E1E36",
  },
  objects: [],
};

const TOOLS: { id: EditorTool; label: string; hint: string }[] = [
  { id: "block", label: "■", hint: "Блок" },
  { id: "spike", label: "▲", hint: "Шип" },
  { id: "jump_pad", label: "↥", hint: "Pad" },
  { id: "gravity_portal", label: "↕", hint: "Гравитация" },
  { id: "ship_portal", label: "▶", hint: "Ship" },
  { id: "cube_portal", label: "▢", hint: "Cube" },
  { id: "erase", label: "✕", hint: "Стереть" },
];

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

  // Local copy of the level that EditorScene mutates. We mirror its state so
  // metadata edits (name, length, colors, difficulty, bpm) re-render here.
  //
  // Source of truth on mount:
  //   1. editingLevelId  → load existing user level
  //   2. draftLevel      → resume in-flight session (e.g. after preview play)
  //   3. defaults        → new level
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

  // Mount Phaser editor once.
  useEffect(() => {
    if (!containerRef.current) return;
    const { game, getScene } = createEditorRunner({
      parent: containerRef.current,
      level,
      onChange: (l) => {
        // EditorScene reports object changes — sync object count only;
        // leave metadata to React-driven path. Also persist to draft so
        // navigating away (preview play, etc.) keeps in-flight work.
        setLevel((prev) => {
          const merged = { ...prev, objects: l.objects };
          setDraftLevel(merged);
          return merged;
        });
      },
    });
    gameRef.current = game;
    // Scene might not be ready immediately. Poll briefly until init runs.
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

  // Push tool changes to scene.
  useEffect(() => {
    sceneRef.current?.setTool(tool);
  }, [tool]);

  // Push metadata changes (name/length/bpm/colors/difficulty) to scene.
  // We DON'T include objects in deps — object changes flow scene→React, not
  // the other way, so re-pushing them would loop.
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

  // Persist draft on every level change (metadata + objects).
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
    flash("Сохранено в User Levels");
  };

  const onBack = () => {
    // Treat "back" as "abandon the unsaved part" — clear the draft.
    setEditingLevelId(null);
    setDraftLevel(null);
    setScreen("menu");
  };

  const pan = (delta: number) => sceneRef.current?.panBy(delta);

  return (
    <div className="absolute inset-0 flex flex-col bg-bg">
      {/* Top bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10 bg-bgSoft/60">
        <button
          className="text-glow text-sm uppercase tracking-widest px-2"
          onClick={onBack}
        >
          ←
        </button>
        <input
          className="flex-1 bg-transparent text-sm font-semibold text-white px-2 py-1 outline-none focus:bg-white/5 rounded"
          value={level.name}
          onChange={(e) => setLevel({ ...level, name: e.target.value })}
        />
        <button
          className="px-3 py-1 rounded text-xs bg-bgSoft/80 border border-glow/30 text-glow"
          onClick={() => setSettingsOpen(true)}
        >
          ⚙
        </button>
        <button
          className="px-3 py-1 rounded text-xs bg-success/20 border border-success/60 text-success"
          onClick={onSave}
        >
          SAVE
        </button>
        <button
          className="px-3 py-1 rounded text-xs bg-accent/80 border border-glow text-white shadow-glow"
          onClick={onPlay}
        >
          ▶ PLAY
        </button>
      </div>

      {/* Canvas + side controls */}
      <div className="flex-1 relative overflow-hidden">
        <div ref={containerRef} className="absolute inset-0" />

        {/* Pan buttons (mobile-friendly large taps) */}
        <button
          onClick={() => pan(-200)}
          className="absolute top-1/2 left-2 -translate-y-1/2 z-10 w-9 h-12 rounded bg-bgSoft/70 border border-white/15 text-white/70"
        >
          ◀
        </button>
        <button
          onClick={() => pan(200)}
          className="absolute top-1/2 right-2 -translate-y-1/2 z-10 w-9 h-12 rounded bg-bgSoft/70 border border-white/15 text-white/70"
        >
          ▶
        </button>

        {/* Undo / redo / clear (top-right corner) */}
        <div className="absolute top-2 right-2 z-10 flex gap-1.5">
          <button
            onClick={undo}
            className="w-9 h-9 rounded-full bg-bgSoft/70 border border-white/15 text-white/80"
            aria-label="Undo"
          >
            ↶
          </button>
          <button
            onClick={redo}
            className="w-9 h-9 rounded-full bg-bgSoft/70 border border-white/15 text-white/80"
            aria-label="Redo"
          >
            ↷
          </button>
          <button
            onClick={clearAll}
            className="w-9 h-9 rounded-full bg-bgSoft/70 border border-danger/40 text-danger"
            aria-label="Clear"
          >
            🗑
          </button>
        </div>

        {/* Object count (top-left) */}
        <div className="absolute top-2 left-2 z-10 text-[10px] uppercase tracking-widest text-white/50 bg-bgSoft/60 rounded px-2 py-1">
          {level.objects.length} obj · {level.length}px · {level.bpm ?? 130}bpm
        </div>
      </div>

      {/* Tool palette */}
      <div className="px-2 py-2 border-t border-white/10 bg-bgSoft/60 flex gap-1.5 overflow-x-auto">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              haptic("light");
              setTool(t.id);
            }}
            className={[
              "flex-1 min-w-[44px] py-2 rounded text-base font-bold border",
              tool === t.id
                ? "bg-accent/80 border-glow text-white shadow-glow"
                : "bg-bgSoft/80 border-white/10 text-white/70",
            ].join(" ")}
            title={t.hint}
          >
            <span className="block text-lg leading-none">{t.label}</span>
            <span className="block text-[9px] uppercase tracking-wider mt-0.5">
              {t.hint}
            </span>
          </button>
        ))}
      </div>

      {/* Settings sheet */}
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
    <div className="absolute inset-0 z-20 bg-black/60 flex items-end" onClick={onClose}>
      <div
        className="w-full bg-bgSoft border-t border-glow/30 rounded-t-2xl p-4 flex flex-col gap-3 max-h-[80%] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base uppercase tracking-widest text-glow">
            Настройки уровня
          </h3>
          <button onClick={onClose} className="text-white/60 px-2">
            ✕
          </button>
        </div>

        <Row label="Сложность">
          <select
            className="bg-bg border border-white/10 rounded px-2 py-1 text-sm"
            value={level.difficulty}
            onChange={(e) =>
              onChange({ ...level, difficulty: e.target.value as Difficulty })
            }
          >
            {(["Easy", "Normal", "Hard", "Extreme"] as Difficulty[]).map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </Row>

        <Row label={`Длина: ${level.length}px`}>
          <input
            type="range"
            min={1600}
            max={12000}
            step={160}
            value={level.length}
            onChange={(e) =>
              onChange({ ...level, length: Number(e.target.value) })
            }
            className="w-full"
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
            className="w-full"
          />
        </Row>

        <Row label="Primary color">
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

        <Row label="Background">
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

        <Row label="Ground">
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
    <div className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-widest text-white/60">
        {label}
      </span>
      {children}
    </div>
  );
}

const COLOR_PRESETS = [
  "#0F0F1A",
  "#0A1224",
  "#1A0F2E",
  "#1E1E36",
  "#7C4DFF",
  "#B388FF",
  "#4DD0E1",
  "#FF6A3D",
  "#4DFFB8",
  "#FF4D6D",
  "#FFFFFF",
  "#212135",
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
          className="w-6 h-6 rounded-full border"
          style={{
            background: c,
            borderColor: value.toUpperCase() === c.toUpperCase() ? "#fff" : "rgba(255,255,255,0.2)",
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
    top: 56px;
    left: 50%;
    transform: translateX(-50%) translateY(-10px);
    background: rgba(124, 77, 255, 0.95);
    color: #fff;
    padding: 6px 14px;
    border-radius: 999px;
    font-size: 12px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    box-shadow: 0 0 24px rgba(179,136,255,0.6);
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
