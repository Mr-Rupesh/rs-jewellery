import type { Config } from "tailwindcss";
// Palette taken from the cover photo: warm black box, cream satin, pendant gold; logo gold for text on light backgrounds.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // "emerald" is kept as a token name so older classes pick up the warm black brand colour.
      colors: { ink: "#17120E", stone: "#FBF7F0", line: "#E6DCC8", emerald: "#17120E", gold: "#C9A24A", golddeep: "#8A6420", ivory: "#F3EBDD", muted: "#6B6258" },
      fontFamily: { display: ["var(--font-display)", "Georgia", "serif"], body: ["var(--font-body)", "system-ui", "sans-serif"] },
    },
  },
  plugins: [],
};
export default config;
