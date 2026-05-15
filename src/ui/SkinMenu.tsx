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
  const primary = primaryOverride ?? skin.primary;
  const secondary = secondaryOverride ?? skin.secondary;

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
          Скины
        </h2>
        <div className="w-12" />
      </header>

      {/* Preview */}
      <div className="panel flex flex-col items-center gap-3 py-6">
        <ShapePreview primary={primary} secondary={secondary} shape={skin.shape} />
        <div className="text-center">
          <div className="text-lg font-semibold">{skin.name}</div>
          <div className="text-[10px] uppercase tracking-widest text-white/40 mt-0.5">
            shape · {skin.shape}
          </div>
          <div className="text-xs text-white/60 mt-1 max-w-[260px]">
            {skin.description}
          </div>
        </div>
      </div>

      {/* Color pickers */}
      <div className="panel grid grid-cols-2 gap-3">
        <ColorRow
          label="Primary"
          value={primary}
          onChange={(c) => {
            haptic("light");
            setPrimaryOverride(c === skin.primary ? null : c);
          }}
          baseColor={skin.primary}
        />
        <ColorRow
          label="Secondary"
          value={secondary}
          onChange={(c) => {
            haptic("light");
            setSecondaryOverride(c === skin.secondary ? null : c);
          }}
          baseColor={skin.secondary}
        />
      </div>

      {/* Skin grid */}
      <div className="grid grid-cols-2 gap-3 mt-1">
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
                "relative rounded-2xl border p-4 flex flex-col items-center gap-2",
                "transition-transform active:scale-[0.97]",
                active
                  ? "border-glow shadow-glow"
                  : "border-white/10 bg-bgSoft/60",
                !s.unlocked ? "opacity-50" : "",
              ].join(" ")}
            >
              <ShapePreview
                primary={s.primary}
                secondary={s.secondary}
                shape={s.shape}
                small
              />
              <div className="text-xs">{s.name}</div>
              {!s.unlocked && (
                <span className="absolute top-2 right-2 text-[10px] text-white/60">
                  🔒
                </span>
              )}
            </button>
          );
        })}
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
    filter: `drop-shadow(0 0 14px ${primary}80)`,
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
          <div
            style={{
              position: "absolute",
              left: size * 0.18,
              top: size * 0.18,
              width: size * 0.12,
              height: size * 0.12,
              background: "rgba(255,255,255,0.45)",
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
            stroke="rgba(255,255,255,0.2)"
            strokeWidth="1.5"
          />
          <circle cx="50" cy="50" r="10" fill={secondary} />
          <polygon points="6,82 30,90 30,72" fill={secondary} opacity="0.85" />
        </svg>
      </div>
    );
  }

  if (shape === "wave") {
    return (
      <div style={wrap}>
        <svg width={size} height={size} viewBox="0 0 100 100">
          <polygon points="50,4 96,50 50,96 4,50" fill={primary} />
          <circle cx="50" cy="50" r="14" fill={secondary} />
        </svg>
      </div>
    );
  }

  // cube (default)
  return (
    <div
      className="rounded-xl"
      style={{
        ...wrap,
        background: primary,
      }}
    >
      <div
        className="absolute rounded-md"
        style={{
          inset: size * 0.22,
          background: secondary,
        }}
      />
      <div
        className="absolute"
        style={{
          left: size * 0.1,
          right: size * 0.1,
          top: size * 0.1,
          height: size * 0.1,
          background: "rgba(255,255,255,0.18)",
          borderRadius: 3,
        }}
      />
    </div>
  );
}

const PALETTE = [
  "#7C4DFF",
  "#B388FF",
  "#FF6A3D",
  "#FFD23F",
  "#4DD0E1",
  "#80DEEA",
  "#4DFFB8",
  "#FF4D6D",
  "#FFFFFF",
  "#212135",
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
        <span className="text-xs uppercase tracking-widest text-white/70">
          {label}
        </span>
        <span
          className="text-[10px] text-white/40 cursor-pointer"
          onClick={() => onChange(baseColor)}
        >
          сброс
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {PALETTE.map((c) => (
          <button
            key={c}
            onClick={() => onChange(c)}
            className="w-6 h-6 rounded-full border"
            style={{
              background: c,
              borderColor:
                value.toUpperCase() === c.toUpperCase()
                  ? "#fff"
                  : "rgba(255,255,255,0.18)",
              boxShadow:
                value.toUpperCase() === c.toUpperCase()
                  ? "0 0 10px rgba(255,255,255,0.6)"
                  : undefined,
            }}
            aria-label={c}
          />
        ))}
      </div>
    </div>
  );
}
