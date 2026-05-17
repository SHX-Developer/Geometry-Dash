import { useGameStore } from "../store/gameStore";
import { SKINS, getSkin, type SkinShape } from "../game/skins/skins";
import { haptic } from "../telegram/telegram";

export function SkinMenu() {
  const {
    selectedSkinId,
    setSelectedSkinId,
    primaryOverride,
    secondaryOverride,
    setPrimaryOverride,
    setSecondaryOverride,
    setScreen,
  } = useGameStore();
  const skin = getSkin(selectedSkinId);
  // Skin previews keep the original (colorful) palette so players can still
  // distinguish skins, even though the in-game cube is rendered monochrome
  // by the minimalist Phaser theme.
  const primary = primaryOverride ?? skin.primary;
  const secondary = secondaryOverride ?? skin.secondary;

  return (
    <div className="absolute inset-0 bg-bg overflow-hidden flex flex-col">
      <header className="flex items-center gap-3 px-4 py-3 bg-panel border-b-[1.5px] border-ink">
        <button
          onClick={() => setScreen("menu")}
          className="box rounded w-20 h-10 flex items-center justify-center text-xs font-bold tracking-wider"
        >
          ← BACK
        </button>
        <div className="w-px h-8 bg-divider" />
        <h2 className="font-bold italic tracking-wider text-ink text-lg">
          SKINS
        </h2>
        <div className="flex-1" />
        <div className="lbl">
          {SKINS.filter((s) => s.unlocked).length} / {SKINS.length} UNLOCKED
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
        {/* Preview */}
        <div className="panel flex flex-col items-center gap-3 py-6">
          <ShapePreview primary={primary} secondary={secondary} shape={skin.shape} />
          <div className="text-center">
            <div className="text-xl font-bold italic text-ink tracking-wide">
              {skin.name.toUpperCase()}
            </div>
            <div className="lbl mt-1">SHAPE · {skin.shape.toUpperCase()}</div>
            <div className="text-sm text-ink2 mt-2 max-w-[280px]">
              {skin.description}
            </div>
          </div>
        </div>

        {/* Color pickers */}
        <div className="panel grid grid-cols-2 gap-4">
          <ColorRow
            label="PRIMARY"
            value={primary}
            onChange={(c) => {
              haptic("light");
              setPrimaryOverride(c === skin.primary ? null : c);
            }}
            baseColor={skin.primary}
          />
          <ColorRow
            label="SECONDARY"
            value={secondary}
            onChange={(c) => {
              haptic("light");
              setSecondaryOverride(c === skin.secondary ? null : c);
            }}
            baseColor={skin.secondary}
          />
        </div>

        {/* Skin grid */}
        <div className="grid grid-cols-2 gap-3">
          {SKINS.map((s) => {
            const active = s.id === selectedSkinId;
            return (
              <button
                key={s.id}
                disabled={!s.unlocked}
                onClick={() => {
                  haptic("medium");
                  setSelectedSkinId(s.id);
                  setPrimaryOverride(null);
                  setSecondaryOverride(null);
                }}
                className={[
                  "relative rounded p-4 flex flex-col items-center gap-2 border-[1.5px]",
                  active
                    ? "border-ink bg-bgSoft"
                    : "border-divider bg-panel",
                  !s.unlocked ? "opacity-50" : "",
                ].join(" ")}
              >
                <ShapePreview
                  primary={s.primary}
                  secondary={s.secondary}
                  shape={s.shape}
                  small
                />
                <div
                  className="text-xs font-bold tracking-wider text-ink"
                  style={{ letterSpacing: "0.08em" }}
                >
                  {s.name.toUpperCase()}
                </div>
                {!s.unlocked && (
                  <span className="absolute top-2 right-2 lbl">🔒</span>
                )}
                {active && (
                  <span
                    className="absolute top-1.5 left-1.5"
                    style={{ font: "700 9px/1 ui-monospace, monospace", letterSpacing: "0.12em", color: "#1a1a1a" }}
                  >
                    ●
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ShapePreview({
  primary,
  secondary,
  shape,
  small = false,
}: {
  primary: string;
  secondary: string;
  shape: SkinShape;
  small?: boolean;
}) {
  const size = small ? 56 : 96;
  const wrap: React.CSSProperties = {
    width: size,
    height: size,
    position: "relative",
  };

  if (shape === "ball") {
    return (
      <div style={wrap}>
        <div
          style={{
            width: size,
            height: size,
            borderRadius: "50%",
            background: primary,
            border: "1.5px solid #1a1a1a",
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: size * 0.22,
              background: secondary,
              borderRadius: "50%",
            }}
          />
        </div>
      </div>
    );
  }

  if (shape === "ship") {
    return (
      <div style={wrap}>
        <svg width={size} height={size} viewBox="0 0 100 100">
          <polygon
            points="6,18 92,50 6,82"
            fill={primary}
            stroke="#1a1a1a"
            strokeWidth="2"
          />
          <circle cx="50" cy="50" r="10" fill={secondary} />
        </svg>
      </div>
    );
  }

  if (shape === "wave") {
    return (
      <div style={wrap}>
        <svg width={size} height={size} viewBox="0 0 100 100">
          <polygon
            points="50,4 96,50 50,96 4,50"
            fill={primary}
            stroke="#1a1a1a"
            strokeWidth="2"
          />
          <circle cx="50" cy="50" r="14" fill={secondary} />
        </svg>
      </div>
    );
  }

  // cube (default)
  return (
    <div
      style={{
        ...wrap,
        background: primary,
        border: "1.5px solid #1a1a1a",
      }}
    >
      <div
        className="absolute"
        style={{
          inset: size * 0.22,
          background: secondary,
        }}
      />
    </div>
  );
}

const PALETTE = [
  "#1a1a1a",
  "#ffffff",
  "#2D6BFF",
  "#c92a2a",
  "#6b6b6b",
  "#7C4DFF",
  "#FF6A3D",
  "#4DFFB8",
  "#FFD23F",
  "#4DD0E1",
];

function ColorRow({
  label,
  value,
  onChange,
  baseColor,
}: {
  label: string;
  value: string;
  onChange: (c: string) => void;
  baseColor: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="lbl lbl-dk">{label}</span>
        <span
          className="lbl cursor-pointer"
          onClick={() => onChange(baseColor)}
        >
          RESET
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {PALETTE.map((c) => (
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
    </div>
  );
}
