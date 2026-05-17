/** @type {import('tailwindcss').Config} */
// Minimalist "wireframe" palette — warm off-white page, black ink, single
// blue accent. Token names match the previous dark palette so existing
// className strings (bg-bg, text-glow, border-accent…) keep working; only
// the colours behind them change.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx,html}"],
  theme: {
    extend: {
      colors: {
        // Surfaces
        bg: "#f0eee9",        // page background (warm off-white)
        bgSoft: "#fafaf7",    // subtle inset surface
        panel: "#ffffff",     // card / panel surface

        // Ink
        ink: "#1a1a1a",       // primary text / borders
        ink2: "#2a2a2a",      // slightly softer ink
        inkSoft: "#6b6b6b",   // labels, secondary text
        divider: "#d0cec8",   // subtle hairlines

        // Accents
        accent: "#2D6BFF",    // primary CTA blue (the only chromatic accent)
        glow: "#1a1a1a",      // re-mapped: "glow" is now ink, since the
                              // wireframe look uses black where the old
                              // theme used neon.
        danger: "#c92a2a",
        success: "#1a1a1a",   // checks render in ink, not green.
      },
      fontFamily: {
        ui: ["ui-sans-serif", "system-ui", "-apple-system", "sans-serif"],
        mono: ["ui-monospace", "SF Mono", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};
