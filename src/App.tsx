import { useGameStore } from "./store/gameStore";
import { MainMenu } from "./ui/MainMenu";
import { SkinMenu } from "./ui/SkinMenu";
import { LevelSelect } from "./ui/LevelSelect";
import { GameView } from "./ui/GameView";
import { Editor } from "./ui/Editor";

export default function App() {
  const screen = useGameStore((s) => s.screen);

  // Canvas (Phaser, Scale.FIT) and editor fill the full viewport — no max
  // width cap. Menu screens use their own internal max-width for readability.
  return (
    <div className="absolute inset-0 overflow-hidden">
      {screen === "menu" && <MainMenu />}
      {screen === "skins" && <SkinMenu />}
      {screen === "levels" && <LevelSelect />}
      {screen === "play" && <GameView />}
      {screen === "editor" && <Editor />}
    </div>
  );
}
