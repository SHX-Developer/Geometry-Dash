import { useEffect, useRef, useState } from "react";
import type Phaser from "phaser";
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

  // If previewLevel is set, we came from editor and should return there.
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

    return () => {
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
    <div className="absolute inset-0 bg-bg">
      <div ref={containerRef} className="w-full h-full" />

      {!result && (
        <button
          className="absolute top-3 left-3 z-10 rounded-full bg-bgSoft/80 border border-glow/40 px-3 py-1 text-xs uppercase tracking-widest text-glow"
          onClick={() => {
            gameRef.current?.destroy(true);
            gameRef.current = null;
            exitToWhereWeStartedFrom();
          }}
        >
          ← выйти
        </button>
      )}

      {result && (
        <div className="absolute inset-0 flex items-center justify-center bg-bg/90 backdrop-blur">
          <div className="panel max-w-[300px] w-full text-center">
            <h3
              className="text-2xl font-bold mb-2"
              style={{ color: result.completed ? "#4DFFB8" : "#FF4D6D" }}
            >
              {result.completed ? "ПРОЙДЕНО" : "ПОПРОБУЙ ЕЩЁ"}
            </h3>
            <p className="text-white/70 text-sm mb-4">
              Прогресс: {result.percent}% · Попытка #{result.attempts}
            </p>
            <div className="flex flex-col gap-2">
              <button
                className="btn-neon"
                data-variant="primary"
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
                Заново
              </button>
              <button
                className="btn-neon"
                data-variant="ghost"
                onClick={() => {
                  setResult(null);
                  exitToWhereWeStartedFrom();
                }}
              >
                {cameFromEditor ? "Назад в редактор" : "К уровням"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
