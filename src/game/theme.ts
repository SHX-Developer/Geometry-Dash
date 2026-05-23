// Shared visual theme — used by both EditorScene and GameplayScene so the
// editor and the actual game look consistent. "Wireframe" minimalist look:
// warm off-white background, near-black ink for obstacles and the player,
// a single blue accent reserved for primary interactive elements.

export const THEME = {
  // Backgrounds
  bgHex: "#f0eee9",
  bgNum: 0xf0eee9,
  groundHex: "#ffffff",
  groundNum: 0xffffff,

  // Obstacles (gameplay + editor) — solid ink fill, faint white inner edge
  // helps stacked blocks read as separate cells without being noisy.
  object: 0x1a1a1a,
  objectOutline: 0xffffff,

  // Grid lines (editor) — thin neutral hairlines.
  gridLight: 0xd0cec8,
  gridBright: 0x9e9e9e,

  // Accents — single blue used only for primary CTAs / portals.
  accent: 0x2d6bff,
  glow: 0x1a1a1a,
  flash: 0x1a1a1a,

  // Semantic colours for interactive objects. Three pads (purple/yellow/
  // blue) and three orbs share the colour-coding so the player can read at
  // a glance what each one does.
  pad: 0xffd23f,           // legacy alias = yellow pad
  padPurple: 0xb388ff,
  padYellow: 0xffd23f,
  padBlue: 0x2d6bff,
  orbPurple: 0xb388ff,
  orbYellow: 0xffd23f,
  orbBlue: 0x2d6bff,
  // Black orb — sharp downward dash. Dark grey rather than pure black so the
  // outline + halo still read on the warm off-white background.
  orbBlack: 0x2a2a2a,
  // Green orb — gravity flip + yellow-style hop. Bright lime so it can't be
  // confused with the mint ball-portal tint.
  orbGreen: 0x4caf50,

  portalGravity: 0x2d6bff,
  portalShip: 0x1a1a1a,
  portalCube: 0x6b6b6b,
  portalUfo: 0x00c9b7, // alien teal — distinguishes UFO portal from the rest
  portalWave: 0xe91e63, // hot pink — wave portal stands out from the others
  portalBall: 0x4dffb8, // mint — ball/circle mode
  portalRobot: 0xff8a00, // amber — variable-jump robot mode
  portalSpider: 0x7b1fa2, // deep violet — instant-snap spider mode
  portalSwing: 0xffeb3b, // bright yellow — swingcopter (hold = invert gravity)
  portalMini: 0x9c27b0, // purple — shrinks the player
  portalBig: 0x607d8b,  // slate — restores to normal size

  // Speed portal palette — five visually distinct hues so the player can
  // read the current speed at a glance, even at 60 FPS scroll.
  speedHalf: 0xffd23f, // yellow (×0.5 — slow)
  speed1x: 0x2d6bff,   // blue (×1 — normal)
  speed2x: 0x4dd99b,   // green (×2)
  speed3x: 0xff6a3d,   // orange (×3)
  speed4x: 0xff4dc9,   // magenta (×4 — fastest)
} as const;
