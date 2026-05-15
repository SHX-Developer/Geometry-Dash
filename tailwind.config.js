/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx,html}"],
  theme: {
    extend: {
      colors: {
        bg: "#0F0F1A",
        bgSoft: "#161628",
        accent: "#7C4DFF",
        glow: "#B388FF",
        danger: "#FF4D6D",
        success: "#4DFFB8",
      },
      fontFamily: {
        display: ["'Press Start 2P'", "system-ui", "sans-serif"],
        ui: ["system-ui", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 24px rgba(179, 136, 255, 0.55)",
        glowStrong: "0 0 36px rgba(179, 136, 255, 0.85)",
      },
      keyframes: {
        pulseGlow: {
          "0%,100%": { boxShadow: "0 0 12px rgba(179,136,255,0.45)" },
          "50%": { boxShadow: "0 0 28px rgba(179,136,255,0.95)" },
        },
        floaty: {
          "0%,100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
      },
      animation: {
        pulseGlow: "pulseGlow 1.8s ease-in-out infinite",
        floaty: "floaty 3s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
