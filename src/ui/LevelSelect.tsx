import { useGameStore } from "../store/gameStore";
import { LEVELS } from "../game/levels/levels";
import type { Difficulty, LevelData } from "../game/levels/types";
import { haptic } from "../telegram/telegram";

// Difficulty rendered as a monospace badge — the minimalist palette keeps
// everything in ink; only the label text encodes the difficulty.
const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  Easy: "EASY",
  Normal: "NORMAL",
  Hard: "HARD",
  Extreme: "EXTREME",
};

export function LevelSelect() {
  const {
    setScreen,
    setCurrentLevelId,
    progress,
    userLevels,
    setEditingLevelId,
    deleteUserLevel,
    muted,
    toggleMuted,
  } = useGameStore();

  const start = (id: string) => {
    haptic("medium");
    setCurrentLevelId(id);
    useGameStore.setState({ previewLevel: null });
    setScreen("play");
  };

  const editUser = (id: string) => {
    haptic("light");
    setEditingLevelId(id);
    useGameStore.setState({ draftLevel: null });
    setScreen("editor");
  };

  return (
    <div className="absolute inset-0 bg-bg overflow-hidden flex flex-col">
      {/* Top bar */}
      <header className="flex items-center gap-3 px-4 py-3 bg-panel border-b-[1.5px] border-ink">
        <button
          onClick={() => setScreen("menu")}
          className="box rounded w-20 h-10 flex items-center justify-center text-xs font-bold tracking-wider"
        >
          ← BACK
        </button>
        <div className="w-px h-8 bg-divider" />
        <h2 className="font-bold italic tracking-wider text-ink text-lg">
          LEVELS
        </h2>
        <div className="flex-1" />
        <button
          onClick={() => {
            haptic("light");
            toggleMuted();
          }}
          className="box rounded w-10 h-10 flex items-center justify-center"
          aria-label="Mute toggle"
        >
          {muted ? "🔇" : "♪"}
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
        <SectionLabel>BUILT-IN</SectionLabel>
        {LEVELS.map((lvl) => (
          <LevelCard
            key={lvl.id}
            lvl={lvl}
            prog={progress[lvl.id]}
            onPlay={() => start(lvl.id)}
          />
        ))}

        <SectionLabel className="mt-3">
          USER LEVELS{" "}
          {userLevels.length > 0 && (
            <span className="text-ink"> · {userLevels.length}</span>
          )}
        </SectionLabel>
        {userLevels.length === 0 ? (
          <div className="panel text-center">
            <div className="lbl">EMPTY — CREATE ONE IN EDITOR</div>
          </div>
        ) : (
          userLevels.map((lvl) => (
            <LevelCard
              key={lvl.id}
              lvl={lvl}
              prog={progress[lvl.id]}
              onPlay={() => start(lvl.id)}
              onEdit={() => editUser(lvl.id)}
              onDelete={() => {
                if (confirm(`Удалить "${lvl.name}"?`)) {
                  haptic("medium");
                  deleteUserLevel(lvl.id);
                }
              }}
            />
          ))
        )}
      </div>
    </div>
  );
}

function SectionLabel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`lbl ${className}`}>{children}</div>;
}

function LevelCard({
  lvl,
  prog,
  onPlay,
  onEdit,
  onDelete,
}: {
  lvl: LevelData;
  prog?: { bestPercent: number; completed: boolean };
  onPlay: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const best = prog?.bestPercent ?? 0;
  const completed = prog?.completed ?? false;

  return (
    <div className="panel">
      <button
        onClick={onPlay}
        className="w-full text-left active:translate-y-px transition-transform"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-lg font-bold italic text-ink truncate">
              {lvl.name}
            </div>
            <div className="lbl mt-1">
              BY {(lvl.author ?? "system").toUpperCase()} · {lvl.objects.length} OBJ ·{" "}
              {lvl.bpm ?? 130} BPM
            </div>
          </div>
          <span
            className="box rounded-full px-2.5 py-1"
            style={{
              font: "700 10px/1 ui-monospace, monospace",
              letterSpacing: "0.12em",
              color: "#1a1a1a",
            }}
          >
            {DIFFICULTY_LABEL[lvl.difficulty]}
          </span>
        </div>

        <div className="mt-3 box rounded-full h-2 overflow-hidden p-0">
          <div
            className="h-full bg-ink"
            style={{ width: `${best}%` }}
          />
        </div>
        <div className="flex items-center justify-between mt-2">
          <span className="lbl lbl-dk">BEST {best}%</span>
          {completed && <span className="lbl lbl-dk">✓ COMPLETED</span>}
        </div>
      </button>

      {(onEdit || onDelete) && (
        <div className="mt-3 flex gap-2 border-t-[1.5px] border-divider pt-3">
          {onEdit && (
            <button
              onClick={onEdit}
              className="box rounded flex-1 py-2 text-xs font-bold tracking-wider text-ink"
            >
              ✎ EDIT
            </button>
          )}
          {onDelete && (
            <button
              onClick={onDelete}
              className="rounded px-3 py-2 text-xs font-bold tracking-wider border-[1.5px]"
              style={{ borderColor: "#c92a2a", color: "#c92a2a" }}
            >
              DELETE
            </button>
          )}
        </div>
      )}
    </div>
  );
}
