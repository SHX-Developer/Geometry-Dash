import { useGameStore } from "./store/gameStore";
import { MainMenu } from "./ui/MainMenu";
import { SkinMenu } from "./ui/SkinMenu";
import { LevelSelect } from "./ui/LevelSelect";
import { GameView } from "./ui/GameView";
import { Editor } from "./ui/Editor";

export default function App() {
  const screen = useGameStore((s) => s.screen);

  return (
    <div className="h-full w-full overflow-hidden flex items-center justify-center">
      <div className="relative w-full h-full max-w-[540px] mx-auto">
        {screen === "menu" && <MainMenu />}
        {screen === "skins" && <SkinMenu />}
        {screen === "levels" && <LevelSelect />}
        {screen === "play" && <GameView />}
        {screen === "editor" && <Editor />}
      </div>
    </div>
  );
}
