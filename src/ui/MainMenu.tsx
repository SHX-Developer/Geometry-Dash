import { useGameStore } from "../store/gameStore";
import { haptic } from "../telegram/telegram";

export function MainMenu() {
  const { setScreen, setEditingLevelId, setDraftLevel, coins, muted, toggleMuted } =
    useGameStore();

  const go = (s: "play" | "skins" | "editor") => {
    haptic("light");
    if (s === "play") {
      setScreen("levels");
    } else if (s === "editor") {
      // Fresh editor session — drop any existing draft and editing id.
      setEditingLevelId(null);
      setDraftLevel(null);
      setScreen("editor");
    } else {
      setScreen(s);
    }
  };

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-between py-12 px-6">
      <div className="w-full flex justify-between items-center pl-1 pr-2">
        <button
          onClick={() => {
            haptic("light");
            toggleMuted();
          }}
          className="rounded-full bg-bgSoft/70 border border-glow/30 w-9 h-9 text-glow"
          aria-label="Mute toggle"
        >
          {muted ? "🔇" : "🔊"}
        </button>
        <div className="rounded-full bg-bgSoft/70 border border-glow/30 px-3 py-1 text-sm text-glow">
          ★ {coins}
        </div>
      </div>

      <div className="text-center">
        <h1
          className="text-4xl font-extrabold tracking-widest text-white animate-floaty"
          style={{
            textShadow:
              "0 0 12px rgba(179,136,255,0.85), 0 0 28px rgba(124,77,255,0.6)",
          }}
        >
          GEOMETRY
        </h1>
        <h1
          className="text-4xl font-extrabold tracking-widest text-glow"
          style={{
            textShadow:
              "0 0 12px rgba(179,136,255,0.85), 0 0 28px rgba(124,77,255,0.6)",
          }}
        >
          DASH
        </h1>
        <p className="mt-3 text-xs uppercase tracking-[0.4em] text-white/60">
          telegram · mini app
        </p>
      </div>

      <div className="w-full flex flex-col gap-4 max-w-xs">
        <button
          className="btn-neon"
          data-variant="ghost"
          onClick={() => go("skins")}
        >
          СКИНЫ
        </button>
        <button
          className="btn-neon"
          data-variant="primary"
          onClick={() => go("play")}
        >
          ИГРАТЬ
        </button>
        <button
          className="btn-neon"
          data-variant="ghost"
          onClick={() => go("editor")}
        >
          СОЗДАТЬ
        </button>
      </div>

      <p className="text-[10px] uppercase tracking-widest text-white/30">
        v0.2 · MVP
      </p>
    </div>
  );
}
