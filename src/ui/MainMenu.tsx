import { useGameStore } from "../store/gameStore";
import { haptic } from "../telegram/telegram";

// MainMenu — minimalist wireframe layout matching screens.jsx · 01 MAIN MENU.
// Same routing behaviour as before: PLAY → levels, EDITOR → editor (fresh
// draft), SKINS → skins.
export function MainMenu() {
  const { setScreen, setEditingLevelId, setDraftLevel, coins, muted, toggleMuted } =
    useGameStore();

  const go = (s: "play" | "skins" | "editor") => {
    haptic("light");
    if (s === "play") {
      setScreen("levels");
    } else if (s === "editor") {
      setEditingLevelId(null);
      setDraftLevel(null);
      setScreen("editor");
    } else {
      setScreen(s);
    }
  };

  return (
    <div className="absolute inset-0 bg-bg overflow-hidden">
      {/* Top tray */}
      <div className="absolute top-4 left-4 right-4 flex justify-between items-center">
        <div className="lbl">v0.4 · MVP</div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              haptic("light");
              toggleMuted();
            }}
            className="box w-9 h-9 rounded text-ink flex items-center justify-center"
            aria-label="Mute toggle"
          >
            {muted ? "🔇" : "♪"}
          </button>
          <div className="box rounded px-3 py-1 lbl lbl-dk">★ {coins}</div>
        </div>
      </div>

      {/* Logo / wordmark */}
      <div className="absolute top-[18%] left-0 right-0 text-center">
        <h1
          className="text-ink font-extrabold italic"
          style={{ fontSize: "clamp(48px, 14vw, 110px)", letterSpacing: "0.04em", lineHeight: 1 }}
        >
          GEOMETRY
        </h1>
        <h1
          className="text-ink font-extrabold italic"
          style={{ fontSize: "clamp(48px, 14vw, 110px)", letterSpacing: "0.04em", lineHeight: 1, marginTop: 4 }}
        >
          DASH
        </h1>
        <div className="lbl mt-4">TELEGRAM · MINI APP</div>
      </div>

      {/* Three primary buttons */}
      <div className="absolute left-1/2 -translate-x-1/2 bottom-[28%] w-full max-w-md px-6">
        <div className="flex flex-col gap-3">
          <button
            className="btn-acc h-16 rounded text-base"
            onClick={() => go("play")}
          >
            PLAY
          </button>
          <button
            className="btn-sec h-14 rounded text-sm"
            onClick={() => go("editor")}
          >
            EDITOR
          </button>
          <button
            className="btn-sec h-14 rounded text-sm"
            onClick={() => go("skins")}
          >
            SKINS
          </button>
        </div>
      </div>

      {/* Secondary row */}
      <div className="absolute left-1/2 -translate-x-1/2 bottom-[14%] flex gap-3">
        <SecondaryTile label="SETTINGS" />
        <SecondaryTile
          label={muted ? "SOUND · OFF" : "SOUND · ON"}
          onClick={() => {
            haptic("light");
            toggleMuted();
          }}
        />
        <SecondaryTile label="ACCOUNT" />
      </div>

      {/* Bottom info */}
      <div className="absolute bottom-4 left-4 right-4 flex justify-between">
        <div className="lbl">BUILD INFO</div>
        <div className="lbl">DAILY · LEADERBOARD</div>
      </div>
    </div>
  );
}

function SecondaryTile({
  label,
  onClick,
}: {
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="box rounded w-20 h-20 flex items-center justify-center text-center"
      style={{ font: "700 10px/1.2 ui-monospace, monospace", letterSpacing: "0.1em", color: "#1a1a1a" }}
    >
      {label}
    </button>
  );
}
