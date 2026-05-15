import { useGameStore } from "../store/gameStore";
import { LEVELS } from "../game/levels/levels";
import type { Difficulty, LevelData } from "../game/levels/types";
import { haptic } from "../telegram/telegram";

const DIFFICULTY_COLOR: Record<Difficulty, string> = {
  Easy: "#4DFFB8",
  Normal: "#7C4DFF",
  Hard: "#FF6A3D",
  Extreme: "#FF4D6D",
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
    useGameStore.setState({ previewLevel: null }); // ensure fresh start
    setScreen("play");
  };

  const editUser = (id: string) => {
    haptic("light");
    setEditingLevelId(id);
    // Drop draft so the editor cleanly loads the chosen user level.
    useGameStore.setState({ draftLevel: null });
    setScreen("editor");
  };

  return (
    <div className="absolute inset-0 flex flex-col px-5 py-6 gap-4">
      <header className="flex items-center justify-between">
        <button
          onClick={() => setScreen("menu")}
          className="text-glow text-sm uppercase tracking-widest"
        >
          ← назад
        </button>
        <h2 className="text-glow text-base tracking-[0.3em] uppercase">
          Уровни
        </h2>
        <button
          onClick={() => {
            haptic("light");
            toggleMuted();
          }}
          className="text-glow text-sm w-12 text-right"
          aria-label="Mute toggle"
        >
          {muted ? "🔇" : "🔊"}
        </button>
      </header>

      <div className="flex-1 overflow-y-auto flex flex-col gap-3 pb-4">
        <SectionLabel>Встроенные</SectionLabel>
        {LEVELS.map((lvl) => (
          <LevelCard
            key={lvl.id}
            lvl={lvl}
            prog={progress[lvl.id]}
            onPlay={() => start(lvl.id)}
          />
        ))}

        <SectionLabel className="mt-2">
          User Levels {userLevels.length > 0 && `· ${userLevels.length}`}
        </SectionLabel>
        {userLevels.length === 0 ? (
          <div className="panel opacity-60 text-center text-xs uppercase tracking-widest text-white/50">
            пока пусто — сделай свой в Создать
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
  return (
    <div
      className={`text-[10px] uppercase tracking-[0.3em] text-white/40 ${className}`}
    >
      {children}
    </div>
  );
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
  const color = DIFFICULTY_COLOR[lvl.difficulty];
  return (
    <div
      className="panel relative"
      style={{ borderColor: `${color}55` }}
    >
      <button
        onClick={onPlay}
        className="w-full text-left active:scale-[0.99] transition-transform"
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="text-lg font-semibold">{lvl.name}</div>
            <div className="text-[11px] uppercase tracking-widest text-white/50 mt-0.5">
              by {lvl.author ?? "system"} · {lvl.objects.length} obj · {lvl.bpm ?? 130} BPM
            </div>
          </div>
          <span
            className="text-[11px] uppercase tracking-widest px-2 py-1 rounded-full border"
            style={{ color, borderColor: `${color}66` }}
          >
            {lvl.difficulty}
          </span>
        </div>

        <div className="mt-3 h-2 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full"
            style={{
              width: `${best}%`,
              background: color,
              boxShadow: `0 0 12px ${color}`,
            }}
          />
        </div>
        <div className="flex items-center justify-between mt-2 text-xs text-white/70">
          <span>Best {best}%</span>
          {completed && <span className="text-success">✓ пройдено</span>}
        </div>
      </button>

      {(onEdit || onDelete) && (
        <div className="mt-3 flex gap-2 border-t border-white/10 pt-3">
          {onEdit && (
            <button
              onClick={onEdit}
              className="flex-1 text-xs uppercase tracking-widest py-1.5 rounded bg-accent/30 border border-glow/40 text-glow"
            >
              ✎ редактировать
            </button>
          )}
          {onDelete && (
            <button
              onClick={onDelete}
              className="text-xs uppercase tracking-widest py-1.5 px-3 rounded bg-danger/20 border border-danger/40 text-danger"
            >
              удалить
            </button>
          )}
        </div>
      )}
    </div>
  );
}
