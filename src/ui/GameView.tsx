import { useEffect, useRef, useState } from "react";
import type * as Phaser from "phaser";
import { useGameStore } from "../store/gameStore";
import { createGame } from "../game/PhaserGame";
import { haptic } from "../telegram/telegram";

export function GameView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const [result, setResult] = useState<{
    completed: boolean;
    percent: number;
    attempts: number;
  } | null>(null);
  // Mirrored from the Phaser scene's "run:progress" event so the HUD can
  // show a live progress bar / attempt count. Kept here in React rather than
  // in the scene's UIScene so the styling stays in one place.
  const [progress, setProgress] = useState<{ percent: number; attempts: number }>({
    percent: 0,
    attempts: 1,
  });
  const [levelName, setLevelName] = useState("");

  const {
    currentLevelId,
    previewLevel,
    selectedSkinId,
    primaryOverride,
    secondaryOverride,
    muted,
    setScreen,
    recordAttempt,
    addCoins,
    setPreviewLevel,
  } = useGameStore();

  const cameFromEditor = !!previewLevel;

  useEffect(() => {
    if (!containerRef.current) return;
    if (!currentLevelId && !previewLevel) return;

    const game = createGame({
      parent: containerRef.current,
      levelId: previewLevel ? undefined : currentLevelId ?? undefined,
      levelData: previewLevel ?? undefined,
      skinId: selectedSkinId,
      primary: primaryOverride,
      secondary: secondaryOverride,
      muted,
      onExit: (r) => {
        haptic(r.completed ? "success" : "error");
        const levelId = previewLevel?.id ?? currentLevelId;
        if (levelId) recordAttempt(levelId, r.percent, r.completed);
        if (r.completed) addCoins(50);
        setResult(r);
      },
    });
    gameRef.current = game;

    // Subscribe to GameplayScene events for the HUD. The scene emits
    // "run:start" (name + attempts) and "run:progress" (percent + attempts).
    let onStart: ((d: { levelName: string; attempts: number }) => void) | undefined;
    let onProgress: ((d: { percent: number; attempts: number }) => void) | undefined;
    const attach = setInterval(() => {
      const scene = game.scene.getScene("GameplayScene");
      if (!scene) return;
      onStart = (d) => {
        setLevelName(d.levelName);
        setProgress({ percent: 0, attempts: d.attempts });
      };
      onProgress = (d) => {
        setProgress(d);
      };
      scene.events.on("run:start", onStart);
      scene.events.on("run:progress", onProgress);
      clearInterval(attach);
    }, 50);

    return () => {
      clearInterval(attach);
      const scene = game.scene.getScene("GameplayScene");
      if (scene && onStart) scene.events.off("run:start", onStart);
      if (scene && onProgress) scene.events.off("run:progress", onProgress);
      game.destroy(true);
      gameRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLevelId, previewLevel]);

  const exitToWhereWeStartedFrom = () => {
    if (cameFromEditor) {
      setPreviewLevel(null);
      setScreen("editor");
    } else {
      setScreen("levels");
    }
  };

  return (
    <div className="absolute inset-0 bg-bg overflow-hidden">
      <div ref={containerRef} className="w-full h-full" />

      {!result && (
        <>
          {/* TOP HUD — back · level name + progress · pause-ish */}
          <div className="absolute top-3 left-3 right-3 z-10 flex items-center gap-3">
            <button
              className="box rounded w-12 h-12 flex items-center justify-center text-xs font-bold tracking-wider bg-panel"
              onClick={() => {
                gameRef.current?.destroy(true);
                gameRef.current = null;
                exitToWhereWeStartedFrom();
              }}
              aria-label="Back"
            >
              ←
            </button>
            <div className="flex-1 flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <div
                  className="truncate"
                  style={{
                    font: "700 11px/1 ui-monospace, monospace",
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    color: "#2a2a2a",
                  }}
                >
                  {levelName || "LEVEL"}
                </div>
                <div
                  style={{
                    font: "700 11px/1 ui-monospace, monospace",
                    letterSpacing: "0.1em",
                    color: "#2a2a2a",
                  }}
                >
                  {progress.percent}%
                </div>
              </div>
              <div className="box rounded-full h-3 p-0.5 bg-panel">
                <div
                  className="h-full rounded-full bg-ink"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
            </div>
            <div className="box rounded w-12 h-12 flex items-center justify-center bg-panel">
              <span
                style={{
                  font: "700 12px/1 ui-monospace, monospace",
                  letterSpacing: "0.1em",
                  color: "#1a1a1a",
                }}
              >
                #{progress.attempts}
              </span>
            </div>
          </div>

          {/* BOTTOM HINT */}
          <div className="absolute bottom-3 left-3 right-3 z-10 flex justify-between">
            <div className="lbl">TAP TO JUMP</div>
            <div className="lbl">{cameFromEditor ? "PREVIEW" : "LEVEL"}</div>
          </div>
        </>
      )}

      {result && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ background: "rgba(240,238,233,0.92)" }}
        >
          <div className="panel max-w-[340px] w-[88%] text-center flex flex-col gap-3">
            <div
              className="font-extrabold italic text-ink"
              style={{
                fontSize: 36,
                letterSpacing: "0.04em",
                lineHeight: 1,
              }}
            >
              {result.completed ? "COMPLETED" : "TRY AGAIN"}
            </div>
            <div className="lbl lbl-dk">
              {result.percent}% · ATTEMPT #{result.attempts}
            </div>
            <div className="box rounded-full h-2 mt-1 p-0">
              <div
                className="h-full bg-ink rounded-full"
                style={{ width: `${result.percent}%` }}
              />
            </div>
            <div className="flex flex-col gap-2 mt-2">
              <button
                className="btn-acc h-12 rounded text-sm"
                onClick={() => {
                  setResult(null);
                  // Force a fresh mount by nulling-and-restoring the source.
                  if (cameFromEditor) {
                    const p = previewLevel;
                    useGameStore.setState({ previewLevel: null });
                    setTimeout(
                      () => useGameStore.setState({ previewLevel: p }),
                      0
                    );
                  } else {
                    const id = currentLevelId;
                    useGameStore.setState({ currentLevelId: null });
                    setTimeout(
                      () => useGameStore.setState({ currentLevelId: id }),
                      0
                    );
                  }
                }}
              >
                RETRY
              </button>
              <button
                className="btn-sec h-11 rounded text-sm"
                onClick={() => {
                  setResult(null);
                  exitToWhereWeStartedFrom();
                }}
              >
                {cameFromEditor ? "BACK TO EDITOR" : "LEVELS"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
